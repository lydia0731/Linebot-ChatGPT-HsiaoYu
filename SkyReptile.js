// 寫一半的twitter爬蟲
function reptile() {
  let url = 'https://twitter.com/sky_box0324';
  let response = UrlFetchApp.fetch(url);
  let $ = Cheerio.load(response.getContentText(),{ decodeEntities: false }); 

  console.log($.html());
}
