export type UserState = "talk" | "search";

export interface BotUser {
  userId: string;
  state: UserState;
  searchState: string;
  time: string;
  admin: string;
  login: string;
}

export interface Game {
  gameId: string;
  name: string;
  sort: number;
  enable: string;
}

export interface GuideNode {
  gameId: string;
  sheetId: string;
  searchColumn: string;
  title: string;
  prompt: string;
  sort: number;
  enable: string;
}

export type SheetRow = Record<string, string>;

export interface TextMessage { type: "text"; text: string }
export interface FlexMessage { type: "flex"; altText: string; contents: Record<string, unknown> }
export type LineMessage = TextMessage | FlexMessage;

export interface LineEventBase {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
}

export interface MessageEvent extends LineEventBase {
  type: "message";
  message: { type: string; text?: string };
}

export interface PostbackEvent extends LineEventBase {
  type: "postback";
  postback: { data: string };
}

export type LineEvent = MessageEvent | PostbackEvent | LineEventBase;
