// =================================================
// WebApp_Dashboard.gs（エンケイ） v8
//
// 【v8変更点】
// ・getDeptList() を追加
//   - 権限管理タブの部署選択メニュー用
//   - 除外シート以外のシート名を動的に返す
// =================================================

// ------------------------------------------------
// 初期シード（PropertiesServiceが空の場合だけ使われる）
// ------------------------------------------------
const DASHBOARD_ACCESS_SEED = {
  'bauhause6@gmail.com'       : { name: '飯田利男',   depts: ['MASTER'] },
  //'kosuke_aihara@enkei.co.jp' : { name: '相原康介',   depts: ['本部'] },
  //'machi_takeda@enkei.co.jp'  : { name: '武田眞知',   depts: ['グループBW'] },
  //'momoko_suzuki@enkei.co.jp' : { name: '鈴木萌々子', depts: ['ALL'] },
  //'wonderwall.tiida@gmail.com': { name: '飯田悠登',   depts: ['グループAW'] },
};

function doGet(e) {
  try {
    const email    = Session.getActiveUser().getEmail();
    const entry    = getDashboardAccessEntry_(email);
    const depts    = entry.depts;
    const isMaster = depts.indexOf('MASTER') !== -1;

    // 権限管理タブに未登録（depts が空）の場合は、無制限ではなくアクセス拒否とする
    if (depts.length === 0) {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:sans-serif;padding:3rem;text-align:center;color:#604c3f">' +
        '<h2 style="margin-bottom:0.5rem">アクセス権限がありません</h2>' +
        '<p>このダッシュボードを利用するには、管理者による権限登録が必要です。</p>' +
        '<p style="color:#999;font-size:0.85rem;margin-top:1rem">' + (email || '(メールアドレス取得不可)') + '</p>' +
        '</div>'
      ).setTitle('VoiceLog — アクセス権限がありません');
    }

    const html = HtmlService.createTemplateFromFile('Dashboard');
    html.clientName  = CLIENT_CONFIG[THIS_CLIENT_ID]
      ? CLIENT_CONFIG[THIS_CLIENT_ID].name
      : 'ダッシュボード';
    html.allowedDept = depts.join(',');
    html.isMaster    = isMaster;
    return html.evaluate()
      .setTitle('VoiceLog — ' + html.clientName)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch(err) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;padding:2rem;color:red">エラー: ' + err.message + '</p>'
    );
  }
}

// ------------------------------------------------
// 各エントリを { name: string, depts: string[] } の形に正規化する
// ------------------------------------------------
function _normalizeEntry_(raw) {
  if (!raw) return { name: '', depts: [] };

  if (typeof raw === 'string') {
    return {
      name: '',
      depts: raw ? raw.split(',').map(d => d.trim()).filter(Boolean) : []
    };
  }

  if (Array.isArray(raw)) {
    return { name: '', depts: raw.map(d => String(d).trim()).filter(Boolean) };
  }

  if (typeof raw === 'object') {
    const name  = typeof raw.name === 'string' ? raw.name : '';
    let   depts = raw.depts;
    if (typeof depts === 'string') {
      depts = depts.split(',').map(d => d.trim()).filter(Boolean);
    } else if (!Array.isArray(depts)) {
      depts = [];
    } else {
      depts = depts.map(d => String(d).trim()).filter(Boolean);
    }
    return { name, depts };
  }

  return { name: '', depts: [] };
}

// ------------------------------------------------
// PropertiesServiceからマップを取得
// ------------------------------------------------
function getDashboardAccessMap_() {
  const props = PropertiesService.getScriptProperties();
  const json  = props.getProperty('dashboardAccessMap');

  let map;
  if (json) {
    map = JSON.parse(json);
  } else {
    map = JSON.parse(JSON.stringify(DASHBOARD_ACCESS_SEED));
  }

  const normalized = {};
  let changed = !json;
  Object.keys(map).forEach(key => {
    const before = JSON.stringify(map[key]);
    const entry  = _normalizeEntry_(map[key]);
    normalized[key.toLowerCase()] = entry;
    if (JSON.stringify(entry) !== before) changed = true;
  });

  if (changed) saveDashboardAccessMap_(normalized);
  return normalized;
}

function saveDashboardAccessMap_(map) {
  PropertiesService.getScriptProperties().setProperty('dashboardAccessMap', JSON.stringify(map));
}

// ------------------------------------------------
// ログインユーザーのメールアドレスから { name, depts } を取得
// ------------------------------------------------
function getDashboardAccessEntry_(email) {
  if (!email) return { name: '', depts: [] };
  const map = getDashboardAccessMap_();
  const entry = map[email.toLowerCase()];
  return entry ? entry : { name: '', depts: [] };
}

// 互換用：部署配列だけを返す
function getDashboardAccess_(email) {
  return getDashboardAccessEntry_(email).depts;
}

// ------------------------------------------------
// 権限管理タブ用：一覧取得・追加・削除
// ------------------------------------------------
function getDashboardAccessList() {
  _requireMaster_();
  const map = getDashboardAccessMap_();
  const list = Object.keys(map).map(email => ({
    email,
    name: map[email].name || '',
    dept: (map[email].depts || []).join(',')
  }));

  list.sort((a, b) => {
    const deptA = (a.dept || '').split(',')[0] || '';
    const deptB = (b.dept || '').split(',')[0] || '';
    const deptCmp = deptA.localeCompare(deptB, 'ja');
    if (deptCmp !== 0) return deptCmp;
    return (a.name || '').localeCompare(b.name || '', 'ja');
  });

  return list;
}

function addDashboardAccess(email, name, deptInput) {
  try {
    _requireMaster_();
    email = String(email || '').trim().toLowerCase();
    if (!email) return { success: false, error: 'メールアドレスは必須です' };

    const deptList = String(deptInput || '')
      .split(',')
      .map(d => d.trim())
      .filter(Boolean);

    const map = getDashboardAccessMap_();
    map[email] = { name: String(name || '').trim(), depts: deptList };
    saveDashboardAccessMap_(map);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function removeDashboardAccess(email) {
  try {
    _requireMaster_();
    email = String(email || '').trim().toLowerCase();
    const map = getDashboardAccessMap_();
    delete map[email];
    saveDashboardAccessMap_(map);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// マスター権限チェック
function _requireMaster_() {
  const depts = getDashboardAccess_(Session.getActiveUser().getEmail());
  if (depts.indexOf('MASTER') === -1) {
    throw new Error('マスター権限がありません');
  }
}

// ------------------------------------------------
// 【v8追加】部署一覧を取得（権限管理タブのメニュー用）
// 除外シート以外のシート名を動的に返す
// ------------------------------------------------
function getDeptList() {
  const excludeSheets = ['纏め','ログ','Award','LineID','変化点','MailAddress'];
  const ss = SpreadsheetApp.openById(SS_ID);
  return ss.getSheets()
    .map(s => s.getName())
    .filter(name => !excludeSheets.includes(name));
}

// ------------------------------------------------
// 部署（配列）でentriesを絞り込み
// ------------------------------------------------
function _filterByDept_(data, depts) {
  const entries = data.entries.filter(e => depts.indexOf(e.dept) !== -1);
  const result  = Object.assign({}, data, { entries: entries });
  if (data.depts)   result.depts   = data.depts.filter(d => depts.indexOf(d) !== -1);
  if (data.persons) result.persons = [...new Set(entries.map(e => e.person))].sort();
  return result;
}

function _isUnrestricted_(depts) {
  return !!depts && (depts.indexOf('ALL') !== -1 || depts.indexOf('MASTER') !== -1);
}

// ================================================
// 統合取得関数
// ================================================
function getAllData() {
  const ss    = SpreadsheetApp.openById(SS_ID);
  const tz    = Session.getScriptTimeZone();
  const depts = getDashboardAccess_(Session.getActiveUser().getEmail());

  let daily  = _getDailyData(ss, tz);
  let weekly = _getWeeklyData(ss, tz);
  let change = _getChangeData(ss);
  let award  = _getAwardData(ss);

  if (!_isUnrestricted_(depts)) {
    daily  = _filterByDept_(daily,  depts);
    weekly = _filterByDept_(weekly, depts);
    change = _filterByDept_(change, depts);
    award  = _filterByDept_(award,  depts);
  }

  return { daily, weekly, change, award };
}

// ------------------------------------------------
// 日報（直近MAX_ROWS行のみ読み込み・過去7日分）
// ------------------------------------------------
function _getDailyData(ss, tz) {
  const DAYS     = 7;
  const MAX_ROWS = 500;
  const excludeSheets = ['纏め','ログ','Award','LineID','MailAddress','変化点','_WAITING'];
  const sheets = ss.getSheets().filter(s => !excludeSheets.includes(s.getName()));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS);
  cutoff.setHours(0, 0, 0, 0);

  const entries    = [];
  const personsSet = new Set();
  const deptsSet   = new Set();

  sheets.forEach(sheet => {
    const deptName = sheet.getName();
    const lastRow  = sheet.getLastRow();
    if (lastRow < 2) return;

    const startRow = 2;
    const numRows  = Math.min(MAX_ROWS, lastRow - 1);
    const data     = sheet.getRange(startRow, 1, numRows, 8).getValues();

    for (let i = 0; i < data.length; i++) {
      const row  = data[i];
      const date = row[1];
      if (!date) continue;

      const d = (date instanceof Date) ? date : new Date(date);
      if (isNaN(d.getTime()) || d < cutoff) continue;

      const person = String(row[2] || '').trim();
      if (!person) continue;

      personsSet.add(person);
      deptsSet.add(deptName);

      entries.push({
        dept   : deptName,
        person : person,
        date   : Utilities.formatDate(d, tz, 'yyyy-MM-dd'),
        weather: extractWeatherScore(String(row[3] || '')),
        report : String(row[4] || '').trim(),
        issue  : String(row[6] || '').trim(),
      });
    }
  });

  entries.sort((a, b) => b.date.localeCompare(a.date));

  return {
    persons: [...personsSet].sort(),
    depts  : [...deptsSet].sort(),
    entries: entries
  };
}

// ------------------------------------------------
// 週次サマリー（纏めシート）
// ------------------------------------------------
function _getWeeklyData(ss, tz) {
  const WEEKS = 5; // 表示する直近の週数

  const sheet = ss.getSheetByName('纏め');
  if (!sheet) return { periods:[], persons:[], depts:[], entries:[] };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { periods:[], persons:[], depts:[], entries:[] };

  // 纏めは「担当者昇順→期間降順」で並ぶため、行スライスでは直近週を取り出せない。
  // 使う8列だけ読み、直近WEEKS週分に絞ってから返す。
  const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

  const periodsAll = new Set();
  for (let i = 0; i < data.length; i++) {
    const p = String(data[i][1] || '').trim();
    if (p) periodsAll.add(p);
  }
  const periods = [...periodsAll]
    .sort((a, b) => b.substring(0, 10).localeCompare(a.substring(0, 10)))
    .slice(0, WEEKS);
  const keepPeriods = new Set(periods);

  const entries    = [];
  const personsSet = new Set();
  const deptsSet   = new Set();

  for (let i = 0; i < data.length; i++) {
    const row    = data[i];
    const person = String(row[0] || '').trim();
    const period = String(row[1] || '').trim();
    if (!person || !period) continue;
    if (!keepPeriods.has(period)) continue;

    const isDept = !person.includes('｜');
    const dept   = isDept ? person : person.split('｜')[0].trim();
    const name   = isDept ? person : person.split('｜')[1].trim();

    deptsSet.add(dept);
    if (!isDept) personsSet.add(name);

    entries.push({
      rowType  : isDept ? 'dept' : 'person',
      dept     : dept,
      person   : name,
      period   : period,
      weather  : extractWeatherScore(String(row[2] || '')),
      status   : String(row[3] || '').trim(),
      issue    : String(row[4] || '').trim(),
      spotlight: String(row[7] || '').trim(),
    });
  }

  return {
    periods: periods,
    persons: [...personsSet].sort(),
    depts  : [...deptsSet].sort(),
    entries: entries
  };
}

// ------------------------------------------------
// 変化点
// ------------------------------------------------
function _getChangeData(ss) {
  const MONTHS = 3; // 表示する直近の月数

  const sheet = ss.getSheetByName('変化点');
  if (!sheet) return { persons:[], depts:[], entries:[] };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { persons:[], depts:[], entries:[] };

  const tz         = Session.getScriptTimeZone();
  const entries    = [];
  const personsSet = new Set();
  const deptsSet   = new Set();

  // Google Sheets が日本語日付を Date 型に変換するため、Date/文字列両対応
  function toMonthLabel(val) {
    if (val instanceof Date) return Utilities.formatDate(val, tz, 'yyyy年M月');
    return String(val || '').trim();
  }
  function toMonthNum(val) {
    if (val instanceof Date) return String(val.getMonth() + 1);
    const m = String(val || '').match(/(\d{1,2})月/);
    return m ? m[1] : null;
  }

  // 変化点は追記のみでソートされないため時系列順（最新が最下部）。
  // まず「当月」列だけ読んで直近MONTHSか月分の開始行を求め、長文列はその範囲しか読まない。
  const monthCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  const seen     = new Set();
  let   firstIdx = 0;
  for (let i = monthCol.length - 1; i >= 0; i--) {
    const label = toMonthLabel(monthCol[i][0]);
    if (!label) continue;
    if (!seen.has(label)) {
      if (seen.size >= MONTHS) break;
      seen.add(label);
    }
    firstIdx = i;
  }

  const startRow = 2 + firstIdx;
  const data     = sheet.getRange(startRow, 1, lastRow - startRow + 1, 13).getValues();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const raw = String(row[0] || '').trim();
    if (!raw) continue;

    const hasDept = raw.includes('｜');
    const dept    = hasDept ? raw.split('｜')[0].trim() : '';
    const person  = hasDept ? raw.split('｜')[1].trim() : raw;

    personsSet.add(person);
    if (dept) deptsSet.add(dept);

    const curLabel = toMonthLabel(row[1]);
    const prvLabel = toMonthLabel(row[2]);
    const curNum   = toMonthNum(row[1]);
    const prvNum   = toMonthNum(row[2]);
    let inputCount = String(row[3] || '');
    if (prvNum) inputCount = inputCount.replace(/前月/g, prvNum + '月');
    if (curNum) inputCount = inputCount.replace(/当月/g, curNum + '月');

    entries.push({
      dept        : dept,
      person      : person,
      currentMonth: curLabel,
      prevMonth   : prvLabel,
      inputCount  : inputCount || row[3] || 0,
      growth      : String(row[4] || '').trim(),
      change      : String(row[5] || '').trim(),
      problem     : String(row[6] || '').trim(),
      emotion     : String(row[7] || '').trim(),
      engagement  : String(row[8] || '').trim(),
      riskSign    : String(row[9] || '').trim(),
      scoreGrowth : Number(row[10]) || 0,
      scoreRisk   : Number(row[11]) || 0,
      scoreEngage : Number(row[12]) || 0,
    });
  }

  return { persons:[...personsSet].sort(), depts:[...deptsSet].sort(), entries:entries };
}

// ------------------------------------------------
// アワード（直近20件）
// ------------------------------------------------
function _getAwardData(ss) {
  const sheet = ss.getSheetByName('Award');
  if (!sheet) return { depts:[], entries:[] };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { depts:[], entries:[] };

  const startRow = Math.max(2, lastRow - 19);
  const numRows  = lastRow - startRow + 1;
  const data     = sheet.getRange(startRow, 1, numRows, 7).getValues();

  const entries  = [];
  const deptsSet = new Set();

  for (let i = 0; i < data.length; i++) {
    const row  = data[i];
    const dept = String(row[0] || '').trim();
    if (!dept) continue;

    deptsSet.add(dept);
    entries.push({
      dept   : dept,
      person : String(row[1] || '').trim(),
      period : String(row[2] || '').trim(),
      award1 : String(row[3] || '').trim(),
      award2 : String(row[4] || '').trim(),
      award3 : String(row[5] || '').trim(),
      award4 : String(row[6] || '').trim(),
    });
  }

  entries.sort((a, b) => b.period.localeCompare(a.period));
  return { depts:[...deptsSet].sort(), entries:entries };
}

// ------------------------------------------------
// ユーティリティ
// ------------------------------------------------
function extractWeatherScore(text) {
  if (!text) return '';
  const m = text.match(/([\d.]+)点/);
  if (!m) return text.slice(0, 20);
  const score = parseFloat(m[1]);
  let icon = '⛅';
  if (score >= 4.5) icon = '☀️';
  else if (score >= 3.5) icon = '🌤️';
  else if (score >= 2.5) icon = '🌥️';
  else icon = '🌧️';
  return icon + ' ' + m[1] + '点';
}

// ================================================
// CSV出力用：全レコード取得
// ================================================
function getAllDataForExport() {
  _requireMaster_();
  const ss    = SpreadsheetApp.openById(SS_ID);
  const tz    = Session.getScriptTimeZone();
  const depts = getDashboardAccess_(Session.getActiveUser().getEmail());

  const excludeSheets = ['纏め','ログ','Award','LineID','MailAddress','変化点','_WAITING'];
  const sheets = ss.getSheets().filter(s => !excludeSheets.includes(s.getName()));

  let dailyEntries = [];
  sheets.forEach(sheet => {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    data.forEach(row => {
      const date = row[1];
      if (!date) return;
      const d = (date instanceof Date) ? date : new Date(date);
      if (isNaN(d.getTime())) return;
      const person = String(row[2] || '').trim();
      if (!person) return;
      dailyEntries.push({
        dept   : sheet.getName(),
        person : person,
        date   : Utilities.formatDate(d, tz, 'yyyy-MM-dd'),
        weather: extractWeatherScore(String(row[3] || '')),
        report : String(row[4] || '').trim(),
        issue  : String(row[6] || '').trim(),
      });
    });
  });
  dailyEntries.sort((a, b) => b.date.localeCompare(a.date));

  const weeklySheet = ss.getSheetByName('纏め');
  let weeklyEntries = [];
  if (weeklySheet) {
    const data = weeklySheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const person = String(row[0] || '').trim();
      const period = String(row[1] || '').trim();
      if (!person || !period) continue;
      const isDept = !person.includes('｜');
      if (isDept) continue;
      const d    = person.split('｜')[0].trim();
      const name = person.split('｜')[1].trim();
      weeklyEntries.push({
        dept   : d,
        person : name,
        period : period,
        weather: extractWeatherScore(String(row[2] || '')),
        status : String(row[3] || '').trim(),
        issue  : String(row[4] || '').trim(),
      });
    }
  }

  const awardSheet = ss.getSheetByName('Award');
  let awardEntries = [];
  if (awardSheet && awardSheet.getLastRow() >= 2) {
    const data = awardSheet.getRange(2, 1, awardSheet.getLastRow() - 1, 7).getValues();
    data.forEach(row => {
      const d = String(row[0] || '').trim();
      if (!d) return;
      awardEntries.push({
        dept  : d,
        person: String(row[1] || '').trim(),
        period: String(row[2] || '').trim(),
        award1: String(row[3] || '').trim(),
        award2: String(row[4] || '').trim(),
        award3: String(row[5] || '').trim(),
        award4: String(row[6] || '').trim(),
      });
    });
    awardEntries.sort((a, b) => b.period.localeCompare(a.period));
  }

  if (!_isUnrestricted_(depts)) {
    dailyEntries  = dailyEntries.filter(e => depts.indexOf(e.dept) !== -1);
    weeklyEntries = weeklyEntries.filter(e => depts.indexOf(e.dept) !== -1);
    awardEntries  = awardEntries.filter(e => depts.indexOf(e.dept) !== -1);
  }

  return {
    daily : dailyEntries,
    weekly: weeklyEntries,
    award : awardEntries,
  };
}

// ------------------------------------------------
// デバッグ用
// ------------------------------------------------
function debugDashboardAccessMap() {
  const json = PropertiesService.getScriptProperties().getProperty('dashboardAccessMap');
  Logger.log('生データ: ' + json);
  const map = getDashboardAccessMap_();
  Logger.log('正規化後: ' + JSON.stringify(map, null, 2));
}

function addMasterForCoo() {
  const props = PropertiesService.getScriptProperties();
  const json  = props.getProperty('dashboardAccessMap');
  const map   = json ? JSON.parse(json) : {};
  map['bauhause6@gmail.com'] = { name: '飯田利男', depts: ['MASTER'] };
  props.setProperty('dashboardAccessMap', JSON.stringify(map));
  Logger.log('MASTER権限を追加しました');
}
