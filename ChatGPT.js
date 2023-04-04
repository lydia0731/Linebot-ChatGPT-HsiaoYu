function requestGPT3Api(text) {
  let root = 'https://api.openai.com/v1/completions';
 
  let params = {
    'headers': {'Authorization': 'Bearer {ChatGPT API Key}'},
    "muteHttpExceptions": true,
    'payload': JSON.stringify({"model": "text-davinci-003","prompt": text,"max_tokens": 4000}),
    'contentType': 'application/json',
    'method': 'post',
  };
  let response = UrlFetchApp.fetch(root, params);
  let data = response.getContentText();
  let json = JSON.parse(data);
  Logger.log(json);
  return json.choices[0].text
}