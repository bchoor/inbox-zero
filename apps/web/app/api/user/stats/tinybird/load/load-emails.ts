import type { gmail_v1 } from "@googleapis/gmail";
import type { LoadTinybirdEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";
import { getLastEmail } from "@inboxzero/tinybird";
import { sleep } from "@/utils/sleep";
import { getMessagesBatch } from "@/utils/gmail/message";
import { isDefined } from "@/utils/types";
import { extractDomainFromEmail } from "@/utils/email";
import { type TinybirdEmail, publishEmail } from "@inboxzero/tinybird";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { env } from "@/env";
import { GmailLabel } from "@/utils/gmail/label";
import { createScopedLogger } from "@/utils/logger";
import { prisma } from "@/utils/prisma";

const PAGE_SIZE = 20; // avoid setting too high because it will hit the rate limit
const PAUSE_AFTER_RATE_LIMIT = 10_000;
const MAX_PAGES = 50;

const logger = createScopedLogger("Tinybird Load Emails");

export async function loadTinybirdEmails(
  options: {
    ownerEmail: string;
    gmail: gmail_v1.Gmail;
    accessToken: string;
  },
  body: LoadTinybirdEmailsBody,
) {
  if (!env.TINYBIRD_TOKEN) return { pages: 0 };

  const { ownerEmail, gmail, accessToken } = options;

  let nextPageToken: string | undefined = undefined;
  let pages = 0;

  const [oldestEmailSaved, newestEmailSaved] = await Promise.all([
    getLastEmail({ ownerEmail, direction: "oldest" }),
    getLastEmail({ ownerEmail, direction: "newest" }),
  ]);

  const after = newestEmailSaved.data?.[0]?.timestamp;
  logger.info("Loading emails after", { after });

  while (pages < MAX_PAGES) {
    logger.info("After Page", { pages });
    let res: Awaited<ReturnType<typeof saveBatch>>;
    try {
      res = await saveBatch({
        ownerEmail,
        gmail,
        accessToken,
        nextPageToken,
        after,
        before: undefined,
      });
    } catch (error) {
      // TODO save batch won't throw a rate limit error anymore. Just logs: `Error fetching message 429 Resource has been exhausted (e.g. check quota).`
      logger.info(`Rate limited. Waiting ${PAUSE_AFTER_RATE_LIMIT} seconds...`);
      await sleep(PAUSE_AFTER_RATE_LIMIT);
      res = await saveBatch({
        ownerEmail,
        gmail,
        accessToken,
        nextPageToken,
        after,
        before: undefined,
      });
    }

    nextPageToken = res.data.nextPageToken ?? undefined;

    if (!res.data.messages || res.data.messages.length < PAGE_SIZE) break;
    pages++;
  }

  logger.info("Completed emails after", { after });

  if (!body.loadBefore) return { pages };

  const before = oldestEmailSaved.data?.[0]?.timestamp;
  logger.info("Loading emails before", { before });

  while (pages < MAX_PAGES) {
    logger.info("Before Page", { pages });
    let res: Awaited<ReturnType<typeof saveBatch>>;
    try {
      res = await saveBatch({
        ownerEmail,
        gmail,
        accessToken,
        nextPageToken,
        before,
        after: undefined,
      });
    } catch (error) {
      logger.info("Rate limited. Waiting 10 seconds...");
      await sleep(PAUSE_AFTER_RATE_LIMIT);
      res = await saveBatch({
        ownerEmail,
        gmail,
        accessToken,
        nextPageToken,
        before,
        after: undefined,
      });
    }

    nextPageToken = res.data.nextPageToken ?? undefined;

    if (!res.data.messages || res.data.messages.length < PAGE_SIZE) break;
    pages++;
  }

  logger.info("Completed emails before", { before });

  return { pages };
}

async function saveBatch(
  options: {
    ownerEmail: string;
    gmail: gmail_v1.Gmail;
    accessToken: string;
    nextPageToken?: string;
  } & (
    | { before: number; after: undefined }
    | { before: undefined; after: number }
  ),
) {
  const { ownerEmail, gmail, accessToken, nextPageToken, before, after } =
    options;

  // 1. find all emails since the last time we ran this function
  let q: string | undefined;

  if (before) {
    q = `before:${before / 1000 + 1}`;
  } else if (after) {
    q = `after:${after / 1000 - 1}`;
  }

  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: PAGE_SIZE,
    pageToken: nextPageToken,
    q,
  });

  // 2. fetch each email and publish it to tinybird
  const messages = await getMessagesBatch(
    res.data.messages?.map((m) => m.id!) || [],
    accessToken,
  );

  const emailsToPublish: TinybirdEmail[] = messages
    .map((m) => {
      if (!m.id || !m.threadId) return;

      const unsubscribeLink =
        findUnsubscribeLink(m.textHtml) || m.headers["list-unsubscribe"];
      
      const attachments = m.attachments?.map(part => [
          part.filename,
          part.mimeType,
          part.size,
          part.attachmentId
        ].join(',')) || [];

      const tinybirdEmail: TinybirdEmail = {
        ownerEmail,
        threadId: m.threadId,
        gmailMessageId: m.id,
        labels: m.labelIds || [],
        bodyType: m.textPlain ? "text/plain" : "text/html",
        body: m.textPlain ?? m.textHtml ?? "No Body",
        from: m.headers.from,
        fromDomain: extractDomainFromEmail(m.headers.from),
        to: m.headers.to || "Missing",
        toDomain: m.headers.to
          ? extractDomainFromEmail(m.headers.to)
          : "Missing",
        subject: m.headers.subject,
        timestamp: +new Date(m.headers.date),
        unsubscribeLink,
        read: !m.labelIds?.includes(GmailLabel.UNREAD),
        sent: !!m.labelIds?.includes(GmailLabel.SENT),
        draft: !!m.labelIds?.includes(GmailLabel.DRAFT),
        inbox: !!m.labelIds?.includes(GmailLabel.INBOX),
        attachments: attachments ?? []
        // sizeEstimate: m.sizeEstimate ?? 0,
      };

      if (!tinybirdEmail.timestamp) {
        logger.error("No timestamp for email", {
          ownerEmail: tinybirdEmail.ownerEmail,
          gmailMessageId: tinybirdEmail.gmailMessageId,
          date: m.headers.date,
        });
        return;
      }

      return tinybirdEmail;
    })
    .filter(isDefined);

  logger.info("Publishing", { count: emailsToPublish.length });

  // Publish to Tinybird
  await publishEmail(emailsToPublish);

  // Save to Prisma DB
  try {
    await prisma.$transaction(async (tx) => {
      for (const email of emailsToPublish) {
        // Create or get existing labels
        const labelPromises = email.labels.map((labelName) =>
          tx.label.upsert({
            where: { name: labelName },
            create: { name: labelName },
            update: {},
          })
        );
        const labels = await Promise.all(labelPromises);

        // Create email with attachments
        const createdEmail = await tx.email.create({
          data: {
            ownerEmail: email.ownerEmail,
            threadId: email.threadId,
            gmailMessageId: email.gmailMessageId,
            bodyType: email.bodyType,
            body: email.body,
            from: email.from,
            fromDomain: email.fromDomain,
            to: email.to,
            toDomain: email.toDomain,
            subject: email.subject || "",
            timestamp: new Date(email.timestamp),
            unsubscribeLink: email.unsubscribeLink,
            read: email.read,
            sent: email.sent,
            draft: email.draft,
            inbox: email.inbox,
            // Create attachments
            attachments: {
              create: email.attachments.map((att) => {
                const [filename, mimeType, size, attachmentId] = att.split(",");
                return {
                  filename,
                  mimeType,
                  size: parseInt(size, 10),
                  attachmentId,
                };
              }),
            },
            // Link labels
            labels: {
              create: labels.map((label) => ({
                labelId: label.id,
              })),
            },
          },
        });
      }
    });

    logger.info("Saved batch to Prisma DB", { count: emailsToPublish.length });
  } catch (error) {
    logger.error("Error saving to Prisma DB", { error });
  }

  return res;
}
