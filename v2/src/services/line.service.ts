import { createHmac, timingSafeEqual } from "node:crypto";
import type { FlexMessage, Game, GuideNode, LineMessage, SheetRow } from "../domain/types.js";
import { ConfigurationError, ExternalServiceError } from "../shared/errors.js";
import type { Logger } from "../shared/logger.js";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const MAX_REPLY_MESSAGES = 5;
const FLEX_HEADER_COLOR = "#3D73AF";
const FLEX_PRIMARY_BUTTON_COLOR = "#76A0D0";

export class LineService {
  constructor(
    private readonly channelSecret: string,
    private readonly accessToken: string,
    private readonly logger: Logger
  ) {}

  validateSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const digest = createHmac("sha256", this.channelSecret).update(rawBody).digest("base64");
    const expected = Buffer.from(digest);
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async reply(replyToken: string, messages: LineMessage[]): Promise<void> {
    try {
      const response = await fetch(LINE_REPLY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ replyToken, messages: messages.slice(0, MAX_REPLY_MESSAGES) })
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`LINE Reply API ${response.status}: ${detail}`);
      }
    } catch (error) {
      this.logger.error({ err: error }, "LINE API error");
      throw new ExternalServiceError("LINE 回覆失敗", error);
    }
  }

  text(text: string): LineMessage {
    return { type: "text", text: truncate(text, 5_000) };
  }

  createGamesMessage(games: Game[]): FlexMessage {
    return menuMessage(
      "選擇遊戲",
      "您好，想查詢哪個遊戲攻略呢？",
      games.map((game) => postbackButton(game.name, params({ action: "select_game", gameId: game.gameId }))),
      "目前沒有可查詢的遊戲。"
    );
  }

  createGuideOptionsMessage(nodes: GuideNode[]): FlexMessage {
    const buttons = nodes.map((node) => {
      if (!node.sheetId && isHttpUrl(node.prompt)) return uriButton(node.title, node.prompt);
      return postbackButton(node.title, params({ action: "select_sheet", sheetId: node.sheetId }));
    });
    buttons.push(postbackButton("回到聊天", "action=exit_search", "secondary"));
    return menuMessage("攻略分類", "想查詢什麼攻略呢？", buttons, "這個遊戲目前沒有可用的攻略項目。" );
  }

  createCandidatesMessage(sheetId: string, searchColumn: string, rows: SheetRow[]): FlexMessage {
    const buttons = rows.map((row) => {
      const key = row[searchColumn] ?? "";
      return postbackButton(key, params({ action: "select_result", sheetId, key }));
    });
    buttons.push(postbackButton("取消搜尋", "action=exit_search", "secondary"));
    return menuMessage("搜尋結果", "找到多筆符合資料，請選擇：", buttons, "找不到候選資料。" );
  }

  createSearchNotFoundMessage(keyword: string): FlexMessage {
    const prompt = keyword
      ? `找不到符合「${keyword}」的攻略。你可以直接輸入新的關鍵字，或使用下方按鈕重新選擇攻略。`
      : "搜尋關鍵字不能是空白。請重新輸入，或使用下方按鈕重新選擇攻略。";
    return menuMessage(
      "查無攻略資料",
      prompt,
      [
        postbackButton("重新選攻略", "action=start_search"),
        postbackButton("回到聊天", "action=exit_search", "secondary")
      ],
      prompt
    );
  }

  createGuideResultMessage(row: SheetRow, titleColumn: string): FlexMessage {
    const fields = Object.entries(row).filter(([, value]) => value.trim() !== "");
    const title = row[titleColumn]?.trim() || "攻略結果";
    const body = fields.slice(0, 20).map(([label, value]) => ({
      type: "box",
      layout: "vertical",
      margin: "md",
      contents: [
        { type: "text", text: label, size: "xs", color: "#888888", weight: "bold", wrap: true },
        { type: "text", text: truncate(value, 1_500), size: "sm", color: "#333333", wrap: true, margin: "xs" }
      ]
    }));

    return {
      type: "flex",
      altText: truncate(`${title}攻略結果`, 400),
      contents: {
        type: "bubble",
        header: { type: "box", layout: "vertical", backgroundColor: FLEX_HEADER_COLOR, contents: [{ type: "text", text: truncate(title, 120), color: "#FFFFFF", weight: "bold", size: "xl", wrap: true }] },
        body: { type: "box", layout: "vertical", contents: body.length > 0 ? body : [{ type: "text", text: "這筆資料沒有可顯示的內容。", wrap: true }] },
        footer: {
          type: "box", layout: "vertical", spacing: "sm", contents: [
            postbackButton("繼續查攻略", "action=start_search"),
            postbackButton("回到聊天", "action=exit_search", "secondary")
          ]
        }
      }
    };
  }
}

function menuMessage(title: string, prompt: string, buttons: Record<string, unknown>[], emptyText: string): FlexMessage {
  if (buttons.length === 0) {
    return { type: "flex", altText: title, contents: menuBubble(title, emptyText, [postbackButton("回到聊天", "action=exit_search", "secondary")]) };
  }
  const pages = chunk(buttons, 10);
  if (pages.length > 12) throw new ConfigurationError(`${title}選項超過 LINE Flex carousel 可顯示上限`);
  return {
    type: "flex",
    altText: title,
    contents: pages.length === 1
      ? menuBubble(title, prompt, pages[0]!)
      : { type: "carousel", contents: pages.map((page, index) => menuBubble(`${title} ${index + 1}/${pages.length}`, prompt, page)) }
  };
}

function menuBubble(title: string, prompt: string, buttons: Record<string, unknown>[]): Record<string, unknown> {
  return {
    type: "bubble",
    header: { type: "box", layout: "vertical", backgroundColor: FLEX_HEADER_COLOR, contents: [{ type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "xl" }] },
    body: { type: "box", layout: "vertical", contents: [{ type: "text", text: prompt, wrap: true }] },
    footer: { type: "box", layout: "vertical", spacing: "sm", contents: buttons }
  };
}

function postbackButton(label: string, data: string, style: "primary" | "secondary" = "primary"): Record<string, unknown> {
  return {
    type: "button",
    style,
    ...(style === "primary" ? { color: FLEX_PRIMARY_BUTTON_COLOR } : {}),
    height: "sm",
    action: { type: "postback", label: truncate(label || "未命名", 40), data, displayText: truncate(label || "未命名", 300) }
  };
}

function uriButton(label: string, uri: string): Record<string, unknown> {
  return { type: "button", style: "primary", color: FLEX_PRIMARY_BUTTON_COLOR, height: "sm", action: { type: "uri", label: truncate(label || "開啟連結", 40), uri } };
}

function params(values: Record<string, string>): string {
  const encoded = new URLSearchParams(values).toString();
  if (Buffer.byteLength(encoded, "utf8") > 300) throw new Error("LINE postback data 超過 300 bytes");
  return encoded;
}

function truncate(value: string, max: number): string {
  return [...value].slice(0, max).join("");
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}
