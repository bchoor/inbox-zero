import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import type { Category } from "@prisma/client";
import { formatCategoriesForPrompt } from "@/utils/ai/categorize-sender/format-categories";

const categorizeSenderSchema = z.object({
  rationale: z.string().describe("Keep it short. 1-2 sentences max."),
  category: z.string(),
  // possibleCategories: z
  //   .array(z.string())
  //   .describe("Possible categories when the main category is unknown"),
});

export async function aiCategorizeSender({
  user,
  sender,
  previousEmails,
  categories,
}: {
  user: UserEmailWithAI;
  sender: string;
  previousEmails: string[];
  categories: Pick<Category, "name" | "description">[];
}) {
  console.log("aiCategorizeSender");

  const system = `You are an AI assistant specializing in email management and organization.
Your task is to categorize an email accounts based on their name, email address, and content from previous emails.
Provide an accurate categorization to help users efficiently manage their inbox.`;

  const prompt = `Categorize the following email account:
${sender}

Previous emails from them:
${previousEmails
  .slice(0, 3)
  .map((email) => `* ${email}`)
  .join("\n")}
${previousEmails.length === 0 ? "No previous emails found" : ""}

Categories:
${formatCategoriesForPrompt(categories)}

Instructions:
1. Analyze the sender's name and email address for clues about their category.
2. Review the content of previous emails to gain more context about the account's relationship with us.
3. If the category is clear, assign it.
4. If you're not certain, respond with "Unknown".
5. If multiple categories are possible, respond with "Unknown".`;

  const aiResponse = await chatCompletionObject({
    userAi: user,
    system,
    prompt,
    schema: categorizeSenderSchema,
    userEmail: user.email || "",
    usageLabel: "Categorize sender",
  });

  if (!categories.find((c) => c.name === aiResponse.object.category))
    return null;

  return aiResponse.object;
}
