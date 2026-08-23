import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_SYSTEM_PROMPT: z.string().min(1).default("你是小優，一位溫暖、簡潔且誠實的聊天夥伴。請使用繁體中文回答。"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  GOOGLE_SPREADSHEET_ID: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_CREDENTIALS: z.string().min(1),
  CONTACT_EMAIL: z.string().email("CONTACT_EMAIL 必須是有效的 Email"),
  CONTACT_SUBJECT: z.string().min(1).default("LINE小優-聯繫開發者"),
  SEARCH_TIMEOUT_MINUTES: z.coerce.number().positive().default(30),
  LOG_LEVEL: z.string().default("info")
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  lineChannelSecret: string;
  lineChannelAccessToken: string;
  openAiApiKey: string;
  openAiModel: string;
  openAiSystemPrompt: string;
  openAiTimeoutMs: number;
  googleSpreadsheetId: string;
  googleCredentials: { client_email: string; private_key: string };
  contactEmail: string;
  contactSubject: string;
  searchTimeoutMinutes: number;
  logLevel: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(env);
  let credentials: { client_email: string; private_key: string };

  try {
    const raw = JSON.parse(parsed.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) as Record<string, unknown>;
    if (typeof raw.client_email !== "string" || typeof raw.private_key !== "string") throw new Error();
    credentials = {
      client_email: raw.client_email,
      private_key: raw.private_key.replace(/\\n/g, "\n")
    };
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS 必須是有效的 service account JSON");
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    lineChannelSecret: parsed.LINE_CHANNEL_SECRET,
    lineChannelAccessToken: parsed.LINE_CHANNEL_ACCESS_TOKEN,
    openAiApiKey: parsed.OPENAI_API_KEY,
    openAiModel: parsed.OPENAI_MODEL,
    openAiSystemPrompt: parsed.OPENAI_SYSTEM_PROMPT,
    openAiTimeoutMs: parsed.OPENAI_TIMEOUT_MS,
    googleSpreadsheetId: parsed.GOOGLE_SPREADSHEET_ID,
    googleCredentials: credentials,
    contactEmail: parsed.CONTACT_EMAIL,
    contactSubject: parsed.CONTACT_SUBJECT,
    searchTimeoutMinutes: parsed.SEARCH_TIMEOUT_MINUTES,
    logLevel: parsed.LOG_LEVEL
  };
}
