function doPost(e) {
  // 定義變數
  let eventData = JSON.parse(e.postData.contents).events[0];
  let replyToken = eventData.replyToken;
  let messageText = eventData.message.text;
  let messageType = eventData.message.type;
  let replyMessage = '';
  let keyword = '小優 '; // 啟用OpenAI的指令

  // 如果訊息是'小優 '且訊息類型是'text'，則呼叫requestGPT3Api，並取得回傳值
  if (messageText.includes(keyword) && messageType == "text") {
    getMessage = requestGPT3Api(messageText.split(keyword)[1]);
    replyMessage = getMessage.slice(2).replace('\n\n\n','\n\n');
  }

  // 回傳訊息
  lineReplyMessage({replyMessage, replyToken});
}