import { createHash } from "node:crypto";
import type { BotUser, UserState } from "../domain/types.js";
import type { Logger } from "../shared/logger.js";
import type { GoogleSheetsService } from "./google-sheets.service.js";

export class UserService {
  constructor(
    private readonly sheets: GoogleSheetsService,
    private readonly searchTimeoutMinutes: number,
    private readonly logger: Logger
  ) {}

  hashLineUserId(lineUserId: string): string {
    return createHash("sha256").update(lineUserId).digest("hex");
  }

  async findOrCreateUser(lineUserId: string): Promise<BotUser> {
    const userId = this.hashLineUserId(lineUserId);
    const existing = await this.sheets.findUser(userId);
    if (existing) return existing;

    const user: BotUser = {
      userId,
      state: "talk",
      searchState: "",
      time: new Date().toISOString(),
      admin: "N",
      login: "N"
    };
    await this.sheets.createUser(user);
    this.logger.info({ userKeyPrefix: userId.slice(0, 10) }, "User created");
    return user;
  }

  async updateState(user: BotUser, state: UserState, searchState = ""): Promise<BotUser> {
    const updated = await this.sheets.updateUser(user.userId, {
      state,
      searchState,
      time: new Date().toISOString()
    });
    this.logger.info({ userKeyPrefix: user.userId.slice(0, 10), state, searchState }, "State changed");
    return updated;
  }

  async touch(user: BotUser): Promise<BotUser> {
    return this.sheets.updateUser(user.userId, { time: new Date().toISOString() });
  }

  isSearchTimedOut(user: BotUser, now = new Date()): boolean {
    if (user.state !== "search") return false;
    const lastActive = Date.parse(user.time);
    if (!Number.isFinite(lastActive)) return true;
    return now.getTime() - lastActive > this.searchTimeoutMinutes * 60_000;
  }

  resetSearchState(user: BotUser): Promise<BotUser> {
    return this.updateState(user, "talk", "");
  }
}
