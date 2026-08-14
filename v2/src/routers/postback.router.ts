import type { BotUser, LineMessage, PostbackEvent } from "../domain/types.js";
import { ConfigurationError } from "../shared/errors.js";
import type { Logger } from "../shared/logger.js";
import type { GuideService } from "../services/guide.service.js";
import type { LineService } from "../services/line.service.js";
import type { UserService } from "../services/user.service.js";

export class PostbackRouter {
  constructor(
    private readonly users: UserService,
    private readonly guides: GuideService,
    private readonly line: LineService,
    private readonly logger: Logger
  ) {}

  async route(event: PostbackEvent, user: BotUser): Promise<LineMessage[]> {
    const data = new URLSearchParams(event.postback.data);
    const action = data.get("action");

    switch (action) {
      case "start_search": {
        await this.users.updateState(user, "search", "");
        const games = await this.guides.getGames();
        this.logger.info({ userKeyPrefix: user.userId.slice(0, 10) }, "Search started");
        return [this.line.createGamesMessage(games)];
      }
      case "select_game": {
        const gameId = required(data, "gameId");
        const options = await this.guides.getGuideOptions(gameId);
        await this.users.updateState(user, "search", "");
        this.logger.info({ userKeyPrefix: user.userId.slice(0, 10), gameId }, "Game selected");
        return [this.line.createGuideOptionsMessage(options)];
      }
      case "select_sheet": {
        const sheetId = required(data, "sheetId");
        const node = await this.guides.startSheetSearch(sheetId);
        await this.users.updateState(user, "search", sheetId);
        this.logger.info({ userKeyPrefix: user.userId.slice(0, 10), sheetId }, "Sheet selected");
        return [this.line.text(node.prompt || "請輸入攻略關鍵字。")];
      }
      case "select_result": {
        const sheetId = required(data, "sheetId");
        const key = required(data, "key");
        if (user.state !== "search" || user.searchState !== sheetId) {
          throw new ConfigurationError("搜尋結果已失效，請重新開始查詢");
        }
        const result = await this.guides.selectResult(sheetId, key);
        await this.users.resetSearchState(user);
        return [this.line.createGuideResultMessage(result.row, result.node.searchColumn)];
      }
      case "exit_search":
        await this.users.resetSearchState(user);
        return [this.line.text("已回到聊天模式，想聊什麼都可以喔！")];
      default:
        throw new ConfigurationError("不支援的 Postback action");
    }
  }
}

function required(data: URLSearchParams, key: string): string {
  const value = data.get(key)?.trim();
  if (!value) throw new ConfigurationError(`Postback 缺少 ${key}`);
  return value;
}
