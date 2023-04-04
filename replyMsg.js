function lineReplyMessage(body) {
  let {replyMessage, replyToken} = body;
  let token = '{LineBot Token}';
  let url = 'https://api.line.me/v2/bot/message/reply';
  // 將回應放入 payload 中
  var payload = {
    'replyToken': replyToken,
    'messages': [{
      'type': 'text',
      'text': replyMessage
    }]
  };

  // 定義要傳送的選項
  var options = {
    'payload' : JSON.stringify(payload),
    'method'  : 'POST',
    'headers' : {"Authorization" : "Bearer " + token},
    'contentType' : 'application/json'
  };

  // 呼叫 API 並傳送資料
  UrlFetchApp.fetch(url, options);
}
