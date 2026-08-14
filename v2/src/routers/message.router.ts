import type { BotUser, LineMessage, MessageEvent } from "../domain/types.js";
import type { Logger } from "../shared/logger.js";
import type { ChatService } from "../services/chat.service.js";
import type { GuideService } from "../services/guide.service.js";
import type { LineService } from "../services/line.service.js";
import type { UserService } from "../services/user.service.js";

export class MessageRouter {
  constructor(
    private readonly users: UserService,
    private readonly chat: ChatService,
    private readonly guides: GuideService,
    private readonly line: LineService,
    private readonly logger: Logger
  ) {}

  async route(event: MessageEvent, user: BotUser): Promise<LineMessage[]> {
    if (event.message.type !== "text" || typeof event.message.text !== "string") {
      await this.users.touch(user);
      return [this.line.text("目前小優只支援文字訊息喔。")];
    }

    const text = event.message.text;
    if (this.users.isSearchTimedOut(user)) {
      user = await this.users.resetSearchState(user);
      this.logger.info({ userKeyPrefix: user.userId.slice(0, 10) }, "Search timed out");
    }

    if (user.state === "talk") {
      await this.users.touch(user);
      try {
        return [this.line.text(await this.chat.handleChatMessage(text))];
      } catch {
        return [this.line.text("小優現在暫時沒辦法回答，請稍後再試一次。")];
      }
    }

    if (!user.searchState) {
      await this.users.touch(user);
      const games = await this.guides.getGames();
      this.logger.info({ userKeyPrefix: user.userId.slice(0, 10) }, "Manual text ignored during button selection");
      return [
        this.line.text("目前正在選擇攻略，請使用下方按鈕操作；手動輸入的文字不會送給 GPT 或當成攻略關鍵字。"),
        this.line.createGamesMessage(games)
      ];
    }

    const result = await this.guides.search(user.searchState, text);
    this.logger.info({ userKeyPrefix: user.userId.slice(0, 10), sheetId: user.searchState, result: result.kind }, "Keyword search");

    switch (result.kind) {
      case "empty":
        await this.users.touch(user);
        return [this.line.createSearchNotFoundMessage(result.keyword)];
      case "too_many":
        await this.users.touch(user);
        return [this.line.text("找到的資料太多，請輸入更完整的關鍵字。")];
      case "multiple":
        await this.users.touch(user);
        return [this.line.createCandidatesMessage(user.searchState, result.node.searchColumn, result.rows)];
      case "single":
        await this.users.resetSearchState(user);
        return [this.line.createGuideResultMessage(result.row, result.node.searchColumn)];
    }
  }
}
