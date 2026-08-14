import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { BotUser, MessageEvent } from "../src/domain/types.js";
import { MessageRouter } from "../src/routers/message.router.js";
import { createLogger } from "../src/shared/logger.js";
import { findMatchingRows, normalizeKeyword } from "../src/services/google-sheets.service.js";
import { LineService } from "../src/services/line.service.js";
import { UserService } from "../src/services/user.service.js";

describe("normalizeKeyword", () => {
  it("trims spaces and removes unnecessary newlines", () => {
    expect(normalizeKeyword("  德州\n\n扒雞  ")).toBe("德州 扒雞");
  });
});

describe("findMatchingRows", () => {
  const rows = [
    { 食魂名字: "德州扒雞", 品質: "御品" },
    { 食魂名字: "德州扒雞 SP", 品質: "御品" },
    { 食魂名字: "北京烤鴨", 品質: "御品" }
  ];

  it("returns only an exact match before considering contains", () => {
    expect(findMatchingRows(rows, "食魂名字", "  德州扒雞 ")).toEqual([rows[0]]);
  });

  it("returns contains matches when there is no exact match", () => {
    expect(findMatchingRows(rows, "食魂名字", "德州")).toEqual([rows[0], rows[1]]);
  });

  it("rejects an empty normalized keyword", () => {
    expect(findMatchingRows(rows, "食魂名字", " \n ")).toEqual([]);
  });
});

describe("LineService", () => {
  it("validates the signature against the exact raw body", () => {
    const secret = "channel-secret";
    const rawBody = Buffer.from('{"events":[]}');
    const signature = createHmac("sha256", secret).update(rawBody).digest("base64");
    const service = new LineService(secret, "token", createLogger("silent"));

    expect(service.validateSignature(rawBody, signature)).toBe(true);
    expect(service.validateSignature(Buffer.from("changed"), signature)).toBe(false);
    expect(service.validateSignature(rawBody, undefined)).toBe(false);
  });

  it("URL-encodes candidate postback values", () => {
    const service = new LineService("secret", "token", createLogger("silent"));
    const message = service.createCandidatesMessage("TTOF_SOUL", "食魂名字", [{ 食魂名字: "德州扒雞 SP" }]);
    const payload = JSON.stringify(message.contents);

    expect(payload).toContain("%E5%BE%B7%E5%B7%9E%E6%89%92%E9%9B%9E+SP");
  });

  it("uses a carousel instead of dropping large dynamic menus", () => {
    const service = new LineService("secret", "token", createLogger("silent"));
    const games = Array.from({ length: 11 }, (_, index) => ({
      gameId: `G${index}`,
      name: `遊戲 ${index}`,
      sort: index,
      enable: "Y"
    }));

    const message = service.createGamesMessage(games);
    expect(message.contents.type).toBe("carousel");
    expect((message.contents.contents as unknown[])).toHaveLength(2);
  });

  it("creates retry and exit actions when a sheet search has no match", () => {
    const service = new LineService("secret", "token", createLogger("silent"));
    const message = service.createSearchNotFoundMessage("不存在");
    const payload = JSON.stringify(message.contents);

    expect(payload).toContain("action=start_search");
    expect(payload).toContain("action=exit_search");
  });
});

describe("MessageRouter search guards", () => {
  const selectionUser: BotUser = {
    userId: "key",
    state: "search",
    searchState: "",
    time: "2026-08-14T01:00:00.000Z",
    admin: "N",
    login: "N"
  };
  const event = { type: "message", message: { type: "text", text: "手動輸入" } } as MessageEvent;

  it("keeps search mode and redraws game buttons for manual text during button selection", async () => {
    const users = {
      touch: vi.fn(async (user: BotUser) => user),
      isSearchTimedOut: vi.fn(() => false),
      resetSearchState: vi.fn()
    };
    const chat = { handleChatMessage: vi.fn() };
    const guides = {
      getGames: vi.fn(async () => [{ gameId: "TTOF", name: "食物語", sort: 1, enable: "Y" }]),
      search: vi.fn()
    };
    const line = new LineService("secret", "token", createLogger("silent"));
    const router = new MessageRouter(users as never, chat as never, guides as never, line, createLogger("silent"));

    const messages = await router.route(event, selectionUser);

    expect(messages).toHaveLength(2);
    expect(users.touch).toHaveBeenCalledOnce();
    expect(users.resetSearchState).not.toHaveBeenCalled();
    expect(chat.handleChatMessage).not.toHaveBeenCalled();
    expect(guides.getGames).toHaveBeenCalledOnce();
  });

  it("keeps the selected sheet when no matching row is found", async () => {
    const user = { ...selectionUser, searchState: "TTOF_SOUL" };
    const users = {
      touch: vi.fn(async (value: BotUser) => value),
      isSearchTimedOut: vi.fn(() => false),
      resetSearchState: vi.fn()
    };
    const guides = {
      search: vi.fn(async () => ({ kind: "empty", keyword: "不存在" }))
    };
    const line = new LineService("secret", "token", createLogger("silent"));
    const router = new MessageRouter(users as never, { handleChatMessage: vi.fn() } as never, guides as never, line, createLogger("silent"));

    const messages = await router.route(event, user);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe("flex");
    expect(users.touch).toHaveBeenCalledOnce();
    expect(users.resetSearchState).not.toHaveBeenCalled();
  });
});

describe("MessageRouter rich-menu text commands", () => {
  const user: BotUser = {
    userId: "key",
    state: "talk",
    searchState: "",
    time: "2026-08-14T01:00:00.000Z",
    admin: "N",
    login: "N"
  };

  it("starts guide search when the rich menu sends 遊戲攻略 as text", async () => {
    const users = {
      updateState: vi.fn(async (value: BotUser) => ({ ...value, state: "search", searchState: "" })),
      isSearchTimedOut: vi.fn(() => false)
    };
    const chat = { handleChatMessage: vi.fn() };
    const guides = {
      getGames: vi.fn(async () => [{ gameId: "TTOF", name: "食物語", sort: 1, enable: "Y" }])
    };
    const line = new LineService("secret", "token", createLogger("silent"));
    const router = new MessageRouter(users as never, chat as never, guides as never, line, createLogger("silent"));
    const event = { type: "message", message: { type: "text", text: "遊戲攻略" } } as MessageEvent;

    const messages = await router.route(event, user);

    expect(users.updateState).toHaveBeenCalledWith(user, "search", "");
    expect(guides.getGames).toHaveBeenCalledOnce();
    expect(chat.handleChatMessage).not.toHaveBeenCalled();
    expect(messages[0]?.type).toBe("flex");
  });

  it("returns to talk mode when the rich menu sends 聊天模式 as text", async () => {
    const searchUser = { ...user, state: "search" as const, searchState: "TTOF_SOUL" };
    const users = {
      updateState: vi.fn(async (value: BotUser) => ({ ...value, state: "talk", searchState: "" })),
      isSearchTimedOut: vi.fn(() => false)
    };
    const chat = { handleChatMessage: vi.fn() };
    const line = new LineService("secret", "token", createLogger("silent"));
    const router = new MessageRouter(users as never, chat as never, {} as never, line, createLogger("silent"));
    const event = { type: "message", message: { type: "text", text: "聊天模式" } } as MessageEvent;

    const messages = await router.route(event, searchUser);

    expect(users.updateState).toHaveBeenCalledWith(searchUser, "talk", "");
    expect(chat.handleChatMessage).not.toHaveBeenCalled();
    expect(messages[0]?.type).toBe("text");
  });
});

describe("UserService", () => {
  const existing: BotUser = {
    userId: "key",
    state: "search",
    searchState: "TTOF_SOUL",
    time: "2026-08-14T01:00:00.000Z",
    admin: "N",
    login: "N"
  };

  it("hashes a LINE user ID deterministically without preserving the original", () => {
    const sheets = { findUser: vi.fn(), createUser: vi.fn(), updateUser: vi.fn() };
    const service = new UserService(sheets as never, 30, createLogger("silent"));
    const first = service.hashLineUserId("U-original-user-id");

    expect(first).toBe(service.hashLineUserId("U-original-user-id"));
    expect(first).not.toContain("U-original-user-id");
    expect(first).toHaveLength(64);
  });

  it("detects an expired search state", () => {
    const sheets = { findUser: vi.fn(), createUser: vi.fn(), updateUser: vi.fn() };
    const service = new UserService(sheets as never, 30, createLogger("silent"));

    expect(service.isSearchTimedOut(existing, new Date("2026-08-14T01:31:00.000Z"))).toBe(true);
    expect(service.isSearchTimedOut(existing, new Date("2026-08-14T01:29:00.000Z"))).toBe(false);
  });
});
