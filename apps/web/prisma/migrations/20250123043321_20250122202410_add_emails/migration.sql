-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "bodyType" VARCHAR(10) NOT NULL,
    "body" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "fromDomain" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "toDomain" TEXT NOT NULL,
    "subject" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "unsubscribeLink" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "inbox" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLabel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "EmailLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "attachmentId" TEXT NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Email_gmailMessageId_key" ON "Email"("gmailMessageId");

-- CreateIndex
CREATE INDEX "Email_bodyType_idx" ON "Email"("bodyType");

-- CreateIndex
CREATE INDEX "Email_fromDomain_idx" ON "Email"("fromDomain");

-- CreateIndex
CREATE INDEX "Email_toDomain_idx" ON "Email"("toDomain");

-- CreateIndex
CREATE INDEX "Email_read_idx" ON "Email"("read");

-- CreateIndex
CREATE INDEX "Email_sent_idx" ON "Email"("sent");

-- CreateIndex
CREATE INDEX "Email_draft_idx" ON "Email"("draft");

-- CreateIndex
CREATE INDEX "Email_inbox_idx" ON "Email"("inbox");

-- CreateIndex
CREATE INDEX "Email_timestamp_idx" ON "Email"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLabel_emailId_labelId_key" ON "EmailLabel"("emailId", "labelId");

-- CreateIndex
CREATE INDEX "Attachment_filename_idx" ON "Attachment"("filename");

-- CreateIndex
CREATE INDEX "Attachment_mimeType_idx" ON "Attachment"("mimeType");

-- AddForeignKey
ALTER TABLE "EmailLabel" ADD CONSTRAINT "EmailLabel_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLabel" ADD CONSTRAINT "EmailLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
