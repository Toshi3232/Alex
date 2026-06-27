// SS_IDはConfig.gsで宣言済み

// =================================================
// 0_ReciveData_Dify&WebHook.gs
// doPost：振り分けメイン
// LINEからのWebhook と Difyからのデータを1つで処理
// =================================================
function doPost(e) {
  Logger.log(JSON.stringify(e));
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.events) return handleLineWebhook(data);

    const person      = data.Person;
    const Feeling     = data.Feeling;
    const spreadsheet = SpreadsheetApp.openById(SS_ID);
    const sheet       = getOrCreateSheet(spreadsheet, data.arg4);

    if (data.summary !== undefined) {
      const previousDValue = sheet.getLastRow() >= 2 ? sheet.getRange(2, 5).getValue() : 'データなし';
      return ContentService.createTextOutput(
        JSON.stringify({ result: previousDValue })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (
      person    !== undefined &&
      Feeling   !== undefined &&
      data.arg1 !== undefined &&
      data.arg2 !== undefined &&
      data.arg3 !== undefined &&
      data.arg5 !== undefined
    ) {
      const response = ContentService.createTextOutput(
        JSON.stringify({ result: '登録完了' })
      ).setMimeType(ContentService.MimeType.JSON);
      Utilities.sleep(50);

      const lock = LockService.getScriptLock();
      try {
        if (lock.tryLock(10000)) {
          const currentDate   = new Date();
          const formattedDate = Utilities.formatDate(currentDate, 'Asia/Tokyo', 'yyyy/MM/dd');

          // ★修正：cleanTodayReport でクリーニング
          const tomorrowWork  = cleanTodayReport(data.arg5);
          const lastRow       = sheet.getLastRow() + 1;

          sheet.getRange(lastRow, 1, 1, 8).setValues([[
            data.arg4,
            formattedDate,
            person,
            Feeling,
            tomorrowWork,
            stripHtmlTags(data.arg1),
            stripHtmlTags(data.arg2),
            stripHtmlTags(data.arg3)
          ]]);

          sortSheetByDate(sheet);
          return response;
        } else {
          saveToWaitingSheet(spreadsheet, data, person, Feeling);
          return ContentService.createTextOutput(
            JSON.stringify({ result: '一時退避しました' })
          ).setMimeType(ContentService.MimeType.JSON);
        }
      } catch(err) {
        Logger.log('Lock error: ' + err);
        saveToWaitingSheet(spreadsheet, data, person, Feeling);
        return ContentService.createTextOutput(
          JSON.stringify({ result: '退避処理を実行しました' })
        ).setMimeType(ContentService.MimeType.JSON);
      } finally {
        lock.releaseLock();
      }
    }

    return ContentService.createTextOutput(
      JSON.stringify({ result: 'error', message: '無効なリクエストです。' })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch(error) {
    return ContentService.createTextOutput(
      JSON.stringify({ result: 'error', message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// =================================================
// handleLineWebhook：LINEからのUserID登録処理
// =================================================
function handleLineWebhook(json) {
  try {
    const events = json.events;
    if (!events || events.length === 0) return;

    const ss        = SpreadsheetApp.openById(SS_ID);
    const lineSheet = ss.getSheetByName('LineID');

    events.forEach(event => {
      if (event.type !== 'message' && event.type !== 'follow') return;
      const userId      = event.source.userId;
      const displayName = getUserDisplayName(userId);
      if (!userId) return;

      const data    = lineSheet.getDataRange().getValues();
      const userIds = data.map(row => String(row[1]).trim());

      if (userIds.includes(userId)) {
        logToSheet_Daily('[Webhook] 既登録済み: ' + displayName + ' / ' + userId);
        return;
      }
      lineSheet.appendRow([displayName, userId, '']);
      logToSheet_Daily('[Webhook] 新規登録: ' + displayName + ' / ' + userId);
    });
  } catch(e) {
    logToSheet_Daily('[Webhook] エラー: ' + e.message);
  }
}

// =================================================
// LINEユーザーの表示名を取得
// =================================================
function getUserDisplayName(userId) {
  try {
    const LINE_TOKEN = PropertiesService.getScriptProperties().getProperty('Line');
    const response   = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + userId, {
      method : 'get',
      headers: { 'Authorization': 'Bearer ' + LINE_TOKEN },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText()).displayName;
    }
  } catch(e) {
    logToSheet_Daily('[Webhook] 表示名取得エラー: ' + e.message);
  }
  return '不明';
}

// =================================================
// シート取得または作成
// =================================================
function getOrCreateSheet(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 3).setValue('担当者名');
    sheet.getRange(1, 4).setValue('心のお天気');
    sheet.getRange(1, 5).setValue('今日の報告');
    sheet.getRange(1, 6).setValue('現状分析');
    sheet.getRange(1, 7).setValue('課題＆懸念事項');
    sheet.getRange(1, 8).setValue('改善案');
  }
  return sheet;
}

// =================================================
// 日付でソート
// =================================================
function sortSheetByDate(sheet) {
  try {
    const numRows = sheet.getLastRow();
    if (numRows > 1) {
      sheet.getRange(2, 1, numRows - 1, sheet.getLastColumn())
        .sort([{ column: 2, ascending: false }, { column: 3, ascending: false }]);
    }
  } catch(error) {}
}

// =================================================
// ロック失敗時の退避
// =================================================
function saveToWaitingSheet(spreadsheet, data, person, Feeling) {
  const sheet         = getOrCreateSheet(spreadsheet, '_WAITING');
  const currentDate   = new Date();
  const formattedDate = Utilities.formatDate(currentDate, 'Asia/Tokyo', 'yyyy/MM/dd');

  // ★修正：cleanTodayReport でクリーニング
  const tomorrowWork  = cleanTodayReport(data.arg5 || '');
  const lastRow       = sheet.getLastRow() + 1;

  sheet.getRange(lastRow, 1, 1, 9).setValues([[
    data.arg4   || '',
    formattedDate,
    person      || '',
    Feeling     || '',
    tomorrowWork,
    stripHtmlTags(data.arg1 || ''),
    stripHtmlTags(data.arg2 || ''),
    stripHtmlTags(data.arg3 || ''),
    'LOCK_FAILED'
  ]]);
}

// =================================================
// 今日の報告テキストのクリーニング
// ・先頭の「【」を削除
// ・「★ちょっと雑談」以降の文章を全削除
// =================================================
function cleanTodayReport(text) {
  if (!text) return '';
  let cleaned = stripHtmlTags(text);

  // 先頭の「【」のみ削除（本文中の「【」は残す）
  cleaned = cleaned.replace(/^【/, '');

  // 「★ちょっと雑談」以降を全削除
  const idx = cleaned.indexOf('★ちょっと雑談');
  if (idx !== -1) cleaned = cleaned.substring(0, idx);

  return cleaned.trim();
}

// =================================================
// HTMLタグ除去
// =================================================
function stripHtmlTags(html) {
  if (!html) return '';
  return html
    .replace(/<\/?(h1|h2|h3|p|ul|ol)>/gi, '\n')
    .replace(/<li>/gi, '・')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// =================================================
// 既存データのHTMLタグを一括除去（一回だけ手動実行）
// 完了後はこの関数を削除してください
// =================================================
function cleanExistingHtmlTags() {
  const ss            = SpreadsheetApp.openById(SS_ID);
  const excludeSheets = ['纏め', 'Award', 'ログ', 'LineID', '_WAITING'];
  const targetCols    = [6, 7, 8];

  ss.getSheets().forEach(sheet => {
    const sheetName = sheet.getName();
    if (excludeSheets.includes(sheetName)) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    targetCols.forEach(col => {
      const range   = sheet.getRange(2, col, lastRow - 1, 1);
      const values  = range.getValues();
      const cleaned = values.map(row => [stripHtmlTags(row[0])]);
      range.setValues(cleaned);
    });
    Logger.log('クリーン完了: ' + sheetName);
  });
  Logger.log('全シートのHTMLタグ除去が完了しました');
}

// =================================================
// 既存データのE列（今日の報告）を一括クリーニング
// 「【」先頭削除＋「★ちょっと雑談」以降削除
// 一回だけ手動実行後、削除してください
// =================================================
function cleanExistingTodayReport() {
  const ss            = SpreadsheetApp.openById(SS_ID);
  const excludeSheets = ['纏め', 'Award', 'ログ', 'LineID', '_WAITING'];

  ss.getSheets().forEach(sheet => {
    const sheetName = sheet.getName();
    if (excludeSheets.includes(sheetName)) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const col   = 5; // E列
    const range = sheet.getRange(2, col, lastRow - 1, 1);
    const values = range.getValues();
    const cleaned = values.map(row => [cleanTodayReport(row[0])]);
    range.setValues(cleaned);
    Logger.log('E列クリーン完了: ' + sheetName);
  });
  Logger.log('全シートのE列クリーニングが完了しました');
}

// =================================================
// ログ
// =================================================
function logToSheet_Daily(message) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName('ログ');
  if (sheet) sheet.appendRow([new Date(), message]);
}