import type { Game, GuideNode, SheetRow } from "../domain/types.js";
import { ConfigurationError } from "../shared/errors.js";
import type { GoogleSheetsService } from "./google-sheets.service.js";
import { normalizeKeyword } from "./google-sheets.service.js";

export type SearchResult =
  | { kind: "empty"; keyword: string }
  | { kind: "single"; node: GuideNode; row: SheetRow }
  | { kind: "multiple"; node: GuideNode; rows: SheetRow[] }
  | { kind: "too_many"; count: number };

export class GuideService {
  constructor(private readonly sheets: GoogleSheetsService) {}

  getGames(): Promise<Game[]> {
    return this.sheets.getEnabledGames();
  }

  async getGuideOptions(gameId: string): Promise<GuideNode[]> {
    const game = (await this.sheets.getEnabledGames()).find((candidate) => candidate.gameId === gameId);
    if (!game) throw new ConfigurationError("遊戲不存在或未啟用");
    const nodes = await this.sheets.getGuideNodesByGame(gameId);
    const invalid = nodes.find((node) => !node.sheetId && !isHttpUrl(node.prompt));
    if (invalid) throw new ConfigurationError(`GuideNode「${invalid.title || "未命名"}」缺少 SHEET_ID`);
    return nodes;
  }

  async startSheetSearch(sheetId: string): Promise<GuideNode> {
    const node = await this.sheets.getGuideNodeBySheetId(sheetId);
    if (!node) throw new ConfigurationError("攻略項目不存在或未啟用");
    const headers = await this.sheets.getSheetHeaders(sheetId);
    if (!node.searchColumn || !headers.includes(node.searchColumn)) {
      throw new ConfigurationError(`攻略 Sheet ${sheetId} 找不到 SEARCH_COLUMN ${node.searchColumn}`);
    }
    return node;
  }

  async search(sheetId: string, keywordInput: string): Promise<SearchResult> {
    const keyword = normalizeKeyword(keywordInput);
    if (!keyword) return { kind: "empty", keyword };
    const node = await this.startSheetSearch(sheetId);
    const rows = await this.sheets.searchRows(sheetId, node.searchColumn, keyword);
    if (rows.length === 0) return { kind: "empty", keyword };
    if (rows.length === 1) return { kind: "single", node, row: rows[0]! };
    if (rows.length <= 5) return { kind: "multiple", node, rows };
    return { kind: "too_many", count: rows.length };
  }

  async selectResult(sheetId: string, key: string): Promise<{ node: GuideNode; row: SheetRow }> {
    const node = await this.startSheetSearch(sheetId);
    const row = await this.sheets.findExactRow(sheetId, node.searchColumn, key);
    if (!row) throw new ConfigurationError("選擇的攻略結果不存在");
    return { node, row };
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
