// このスプシのシートID（自動取得）
const SS_ID              = SpreadsheetApp.getActiveSpreadsheet().getId();

//起算曜日の設定　 実行したい曜日を指定（0:日 1:月 2:火 3:水 4:木 5:金 6:土）
const EXEC_DAY_OF_WEEK   = 1;

//１）AnalyzeNo2_Dairy_Person.gs
const DAILY_PERIOD_START = '2026-04-01';
const DAILY_PERIOD_END   = '2026-04-01';
const DAILY_START_HOUR   = 00;
const DAILY_START_MINUTE = 15;
const DAILY_INTERVAL     = 6;

//２）AnalyzeNo3_Weekly_All.gs
const WEEKLY_ALL_START_HOUR    = 00;
const WEEKLY_ALL_START_MINUTE  = 10;

//３）AnalyzeNo4_Weekly_Presonal.gs
const WEEKLY_ALL_INTERVAL      = 3;
const WEEKLY_PERSONAL_START_HOUR   = 00;
const WEEKLY_PERSONAL_START_MINUTE = 30;
const WEEKLY_PERSONAL_INTERVAL     = 6;

//４）Difyへナレッジデータの送信
const DIFY_BASE_URL           = 'https://dotsconnection.jp/v1';
const DIFY_API_KEY            = 'dataset-PT8uPXfWMByqoKyUbrhclMjX';
const DIFY_DATASET_ID         = '';  // ★ 要設定: MasterのCLIENTSシートから取得
const DIFY_PERSON_METADATA_ID = '0a59585e-8f3a-4b3a-94c4-60139a9b9479';
const DIFY_HOUR               = 01;
const DIFY_MINUTE             = 30;

//５）AnalyzeNo7_Weekly_Award.gs
const AWARD_HOUR   = 02;
const AWARD_MINUTE = 10;

//６）AnalyzeNo6_BackUp.gs
const BACKUP_HOUR      = 02;
const BACKUP_MINUTE    = 30;
const BACKUP_FOLDER_ID = '';  // ★ 要設定: MasterのCLIENTSシートから取得

//７）AnalyzeNo5_Weekly_Line.gs
const WEEKLY_LINE_START_HOUR   = 07;
const WEEKLY_LINE_START_MINUTE = 40;
const MONA_IMAGE_URL = 'https://i.imgur.com/YC8CvWw.jpeg';

// ８）AnalyzeNo9_PersonalCharactor.gs
const MONTHLY_CHANGE_EXEC_DAY       = 1;
const MONTHLY_CHANGE_START_HOUR     = 02;
const MONTHLY_CHANGE_START_MINUTE   = 30;
const MONTHLY_CHANGE_EXCLUDE_SHEETS = ['纏め', 'ログ', 'Award', 'LineID', '変化点'];
const MONTHLY_CHANGE_OUTPUT_SHEET   = '変化点';

// --------------------------------------------------
// ★ このスプシのクライアントID
// --------------------------------------------------
const THIS_CLIENT_ID = 'alex';

// --------------------------------------------------
// Claude API
// スクリプトプロパティに登録: CLAUDE_API_KEY = sk-ant-xxxxx
// --------------------------------------------------

// --------------------------------------------------
// クライアント別設定
// ★ スコア共通定義（全クライアント統一）
//   成長スコア    : 3=成長あり(緑) / 2=兆し(黄) / 1=変化なし(赤)
//   リスクスコア  : 5〜1（Masterの定義参照）
//   エンゲージスコア: 3=高い(緑)   / 2=普通(黄)    / 1=低下(赤)
// --------------------------------------------------
const CLIENT_CONFIG = {

  alex: {
    name        : 'アレックス（美容サロン）',
    systemPrompt: 'あなたは美容サロンのマネジメント支援AIです。必ずJSONのみを出力してください。',
    scoring: {
      成長スコア: [
        '3：指名獲得・タイム改善・後輩指導など具体的成果を伴う改善が複数ある',
        '2：改善の意識・気づきはあるが成果未達',
        '1：同じ課題の繰り返し・変化なし'
      ].join('\n'),
      リスクスコア: [
        '5：退職示唆ワード出現・強い不満や怒り・体調不良が複数回継続・即時対応必要',
        '4：疲弊・不満・孤立感が複数の記述にわたって継続・要注意',
        '3：軽い疲弊や体調懸念・やりがいへの疑問が出始めた・経過観察',
        '2：ごく軽微な懸念はあるが概ね問題なし',
        '1：ポジティブな記述が中心・特になし'
      ].join('\n'),
      エンゲージスコア: [
        '3：やりがい・指名・チームへの帰属意識が高い',
        '2：横ばい',
        '1：やりがい低下・孤立感・モチベーション低下'
      ].join('\n')
    }
  }

};

// --------------------------------------------------
// ヘルパー関数（AnalyzeNo9 から呼び出し）
// --------------------------------------------------
function getClientConfig(clientId) {
  return CLIENT_CONFIG[clientId] || null;
}
