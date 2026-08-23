import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { WebhookController } from "./controllers/webhook.controller.js";
import { MessageRouter } from "./routers/message.router.js";
import { PostbackRouter } from "./routers/postback.router.js";
import { createLogger } from "./shared/logger.js";
import { ChatService } from "./services/chat.service.js";
import { GoogleSheetsService } from "./services/google-sheets.service.js";
import { GuideService } from "./services/guide.service.js";
import { LineService } from "./services/line.service.js";
import { OpenAIService } from "./services/openai.service.js";
import { UserService } from "./services/user.service.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);

const sheets = new GoogleSheetsService(config.googleSpreadsheetId, config.googleCredentials, logger);
const users = new UserService(sheets, config.searchTimeoutMinutes, logger);
const line = new LineService(config.lineChannelSecret, config.lineChannelAccessToken, logger);
const openAi = new OpenAIService(
  config.openAiApiKey,
  config.openAiModel,
  config.openAiSystemPrompt,
  config.openAiTimeoutMs,
  logger
);
const chat = new ChatService(openAi);
const guides = new GuideService(sheets);
const messageRouter = new MessageRouter(users, chat, guides, line, logger);
const postbackRouter = new PostbackRouter(users, guides, line, logger);
const webhook = new WebhookController(line, users, messageRouter, postbackRouter, logger);

const app = createApp(webhook, {
  contactEmail: config.contactEmail,
  contactSubject: config.contactSubject
});
app.listen(config.port, () => logger.info({ port: config.port }, "HsiaoYu LINE Bot V2 started"));
