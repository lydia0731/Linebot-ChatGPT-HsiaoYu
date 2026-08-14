# 小優 LINE Bot V2

第一階段實作兩項功能：LINE 一般文字的 OpenAI 單輪聊天，以及由 Google Spreadsheet 驅動的遊戲攻略查詢。專案不保存聊天紀錄，也不包含 Twitter、PostgreSQL、Redis、攻略網站或管理後台。

## 執行需求

- Node.js 20+
- LINE Messaging API channel
- OpenAI API key
- 已建立的 Google Spreadsheet
- 可讀寫該 Spreadsheet 的 Google service account

## 本機啟動

```bash
npm install
copy .env.example .env
npm run dev
```

服務提供：

- `GET /health`：健康檢查
- `POST /webhook`：LINE Webhook（驗證 `x-line-signature`）

請將 LINE Developers Console 的 Webhook URL 設為公開 HTTPS 網址加上 `/webhook`，並在 Rich Menu 的「查詢攻略」使用 Postback action，data 設為 `action=start_search`。

## 環境變數

複製 `.env.example` 後填入：

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS`：完整 service account JSON 的單行字串
- `SEARCH_TIMEOUT_MINUTES`：預設 30

不要 Commit `.env`。請把既有 Spreadsheet 分享給 service account 的 `client_email`，並給予編輯者權限，讓 Bot 能新增及更新 `Users`。

## 既有試算表契約

程式不會建立試算表或分頁，只會讀寫你現有的資料。

### Users

```text
USER_ID | STATE | SEARCH_STATE | TIME | ADMIN | LOGIN
```

`USER_ID` 是 LINE User ID 的 SHA-256，不保存原始 ID。新 User 預設為 `talk / 空 / ISO 時間 / N / N`。

### Games

```text
GAME_ID | NAME | SORT | ENABLE
```

只顯示 `ENABLE=Y`，並依 `SORT` 升冪排列。

### GuideNode

```text
GAME_ID | SHEET_ID | SEARCH_COLUMN | TITLE_BTN | PROMPT | SORT | ENABLE
```

`SHEET_ID` 必須直接等於攻略分頁名稱；不使用 `SHEET_NAME` mapping。若 `SHEET_ID` 空白且 `PROMPT` 是 HTTP(S) URL，會產生 URI button。一般節點的 `SEARCH_COLUMN` 必須存在於攻略分頁第一列。

## 攻略流程

```text
start_search
→ select_game&gameId=...
→ select_sheet&sheetId=...
→ 使用者輸入 keyword
→ 0 筆：重試
→ 1 筆：顯示動態欄位並回 talk
→ 2–5 筆：select_result 候選按鈕
→ 超過 5 筆：要求更精確的關鍵字
```

搜尋先做不分英文大小寫的 Exact Match，沒有完全符合才做 Contains；結果會依 Header 動態顯示並略過空值。

## 驗證指令

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
