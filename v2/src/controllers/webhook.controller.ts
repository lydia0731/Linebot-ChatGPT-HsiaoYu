import type { Request, Response } from "express";
import type { LineEvent, MessageEvent, PostbackEvent } from "../domain/types.js";
import { ConfigurationError } from "../shared/errors.js";
import type { Logger } from "../shared/logger.js";
import type { MessageRouter } from "../routers/message.router.js";
import type { PostbackRouter } from "../routers/postback.router.js";
import type { LineService } from "../services/line.service.js";
import type { UserService } from "../services/user.service.js";

export class WebhookController {
  constructor(
    private readonly line: LineService,
    private readonly users: UserService,
    private readonly messages: MessageRouter,
    private readonly postbacks: PostbackRouter,
    private readonly logger: Logger
  ) {}

  handle = async (request: Request, response: Response): Promise<void> => {
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");
    const signature = request.header("x-line-signature");
    if (!this.line.validateSignature(rawBody, signature)) {
      this.logger.warn("Invalid LINE webhook signature");
      response.status(401).json({ error: "invalid signature" });
      return;
    }

    let events: LineEvent[];
    try {
      const payload = JSON.parse(rawBody.toString("utf8")) as { events?: LineEvent[] };
      events = Array.isArray(payload.events) ? payload.events : [];
    } catch {
      response.status(400).json({ error: "invalid JSON" });
      return;
    }

    this.logger.info({ eventCount: events.length }, "Webhook received");
    const results = await Promise.allSettled(events.map((event) => this.handleEvent(event)));
    for (const result of results) {
      if (result.status === "rejected") this.logger.error({ err: result.reason }, "Webhook event failed");
    }
    response.status(200).json({ ok: true });
  };

  private async handleEvent(event: LineEvent): Promise<void> {
    const lineUserId = event.source?.userId;
    const replyToken = event.replyToken;
    if (!lineUserId || !replyToken) return;

    let replyMessages;
    try {
      const user = await this.users.findOrCreateUser(lineUserId);
      if (event.type === "message") {
        replyMessages = await this.messages.route(event as MessageEvent, user);
      } else if (event.type === "postback") {
        replyMessages = await this.postbacks.route(event as PostbackEvent, user);
      }
    } catch (error) {
      const text = error instanceof ConfigurationError
        ? error.message
        : "攻略資料目前暫時無法讀取，請稍後再試一次。";
      this.logger.error({ err: error, eventType: event.type }, "Event processing error");
      replyMessages = [this.line.text(text)];
    }
    if (replyMessages) await this.line.reply(replyToken, replyMessages);
  }
}
