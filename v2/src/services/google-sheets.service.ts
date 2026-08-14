import { google, type sheets_v4 } from "googleapis";
import type { BotUser, Game, GuideNode, SheetRow } from "../domain/types.js";
import { ConfigurationError, ExternalServiceError } from "../shared/errors.js";
import type { Logger } from "../shared/logger.js";

const USERS_HEADERS = ["USER_ID", "STATE", "SEARCH_STATE", "TIME", "ADMIN", "LOGIN"] as const;

export class GoogleSheetsService {
  private readonly sheets: sheets_v4.Sheets;

  constructor(
    private readonly spreadsheetId: string,
    credentials: { client_email: string; private_key: string },
    private readonly logger: Logger
  ) {
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    this.sheets = google.sheets({ version: "v4", auth });
  }

  private async getValues(range: string): Promise<string[][]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range });
      return (response.data.values ?? []).map((row) => row.map((value) => String(value ?? "")));
    } catch (error) {
      this.logger.error({ err: error, range }, "Google Sheets read failed");
      throw new ExternalServiceError("Google Sheets 資料讀取失敗", error);
    }
  }

  private async getTable(sheetId: string): Promise<{ headers: string[]; rows: SheetRow[] }> {
    const values = await this.getValues(quoteSheet(sheetId));
    const headers = values[0]?.map((header) => header.trim()) ?? [];
    if (headers.length === 0) throw new ConfigurationError(`Sheet ${sheetId} 缺少 Header`);

    const rows = values.slice(1)
      .filter((row) => row.some((value) => value.trim() !== ""))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
    return { headers, rows };
  }

  async findUser(userId: string): Promise<BotUser | null> {
    const { rows } = await this.getTable("Users");
    const row = rows.find((candidate) => candidate.USER_ID === userId);
    return row ? toUser(row) : null;
  }

  async createUser(user: BotUser): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: "'Users'!A:F",
        valueInputOption: "RAW",
        requestBody: { values: [[user.userId, user.state, user.searchState, user.time, user.admin, user.login]] }
      });
    } catch (error) {
      this.logger.error({ err: error }, "Google Sheets user append failed");
      throw new ExternalServiceError("User 建立失敗", error);
    }
  }

  async updateUser(userId: string, updates: Partial<BotUser>): Promise<BotUser> {
    const values = await this.getValues("'Users'!A:F");
    const rowIndex = values.findIndex((row, index) => index > 0 && row[0] === userId);
    if (rowIndex < 0) throw new ConfigurationError("找不到要更新的 User");
    const current = toUser(Object.fromEntries(USERS_HEADERS.map((header, index) => [header, values[rowIndex]?.[index] ?? ""])));
    const updated = { ...current, ...updates, userId };

    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'Users'!A${rowIndex + 1}:F${rowIndex + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [[updated.userId, updated.state, updated.searchState, updated.time, updated.admin, updated.login]] }
      });
      return updated;
    } catch (error) {
      this.logger.error({ err: error }, "Google Sheets user update failed");
      throw new ExternalServiceError("User 狀態更新失敗", error);
    }
  }

  async getEnabledGames(): Promise<Game[]> {
    const { rows } = await this.getTable("Games");
    return rows.map((row) => ({
      gameId: row.GAME_ID?.trim() ?? "",
      name: row.NAME?.trim() ?? "",
      sort: Number(row.SORT || 0),
      enable: row.ENABLE?.trim().toUpperCase() ?? ""
    })).filter((game) => game.enable === "Y" && game.gameId !== "").sort((a, b) => a.sort - b.sort);
  }

  async getGuideNodesByGame(gameId: string): Promise<GuideNode[]> {
    const { rows } = await this.getTable("GuideNode");
    return rows.map(toGuideNode)
      .filter((node) => node.gameId === gameId && node.enable === "Y")
      .sort((a, b) => a.sort - b.sort);
  }

  async getGuideNodeBySheetId(sheetId: string): Promise<GuideNode | null> {
    const { rows } = await this.getTable("GuideNode");
    return rows.map(toGuideNode).find((node) => node.sheetId === sheetId && node.enable === "Y") ?? null;
  }

  async getSheetHeaders(sheetId: string): Promise<string[]> {
    return (await this.getTable(sheetId)).headers;
  }

  async searchRows(sheetId: string, searchColumn: string, keyword: string): Promise<SheetRow[]> {
    const { headers, rows } = await this.getTable(sheetId);
    ensureSearchColumn(headers, searchColumn);
    return findMatchingRows(rows, searchColumn, keyword);
  }

  async findExactRow(sheetId: string, searchColumn: string, key: string): Promise<SheetRow | null> {
    const { headers, rows } = await this.getTable(sheetId);
    ensureSearchColumn(headers, searchColumn);
    const normalized = normalizeKeyword(key).toLocaleLowerCase();
    return rows.find((row) => normalizeKeyword(row[searchColumn] ?? "").toLocaleLowerCase() === normalized) ?? null;
  }
}

export function normalizeKeyword(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export function findMatchingRows(rows: SheetRow[], searchColumn: string, keyword: string): SheetRow[] {
  const normalized = normalizeKeyword(keyword).toLocaleLowerCase();
  if (!normalized) return [];
  const exact = rows.filter((row) => normalizeKeyword(row[searchColumn] ?? "").toLocaleLowerCase() === normalized);
  if (exact.length > 0) return exact;
  return rows.filter((row) => normalizeKeyword(row[searchColumn] ?? "").toLocaleLowerCase().includes(normalized));
}

function ensureSearchColumn(headers: string[], searchColumn: string): void {
  if (!searchColumn || !headers.includes(searchColumn)) {
    throw new ConfigurationError(`找不到 SEARCH_COLUMN：${searchColumn || "(空白)"}`);
  }
}

function quoteSheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

function toUser(row: SheetRow): BotUser {
  return {
    userId: row.USER_ID ?? "",
    state: row.STATE === "search" ? "search" : "talk",
    searchState: row.SEARCH_STATE ?? "",
    time: row.TIME ?? "",
    admin: row.ADMIN || "N",
    login: row.LOGIN || "N"
  };
}

function toGuideNode(row: SheetRow): GuideNode {
  return {
    gameId: row.GAME_ID?.trim() ?? "",
    sheetId: row.SHEET_ID?.trim() ?? "",
    searchColumn: row.SEARCH_COLUMN?.trim() ?? "",
    title: row.TITLE_BTN?.trim() ?? "",
    prompt: row.PROMPT?.trim() ?? "",
    sort: Number(row.SORT || 0),
    enable: row.ENABLE?.trim().toUpperCase() ?? ""
  };
}
