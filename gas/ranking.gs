// ブロックおとし ランキング（Google Apps Script・スプレッドシートに紐づけて使う）
// ・歴代（ranking シート）：1 人（端末）1 行で自己ベスト
// ・今週（weekly シート）：1 人 1 週 1 行で、その週の自己ベスト。月曜 0 時（日本時間）で新しい週になる
// 記録は消さないので、過去の週もシートに残る。シートは必要になった時に自動で作られる。
// 設定のしかたは README の「ランキング」を参照。

const SHEET_NAME = 'ranking';
const WEEKLY_SHEET = 'weekly';
const TOP_N = 10;
const NAME_MAX = 8;
const NG_WORDS = ['しね', '死ね', 'ころす', '殺す', 'ころせ', 'きえろ', '消えろ'];
const HEADER = ['id', 'name', 'score', 'lines', 'level', 'seconds', 'updated'];
const WEEKLY_HEADER = ['id', 'week', 'name', 'score', 'lines', 'level', 'seconds', 'updated'];
const JST_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

// 承認用：スクリプト エディタでこの関数を 1 回実行すると承認画面が出る（シートも作られる）
function setup() {
  sheet_();
  weeklySheet_();
}

function doGet(e) {
  const id = String((e && e.parameter && e.parameter.id) || '');
  return json_(Object.assign({ ok: true }, boards_(id)));
}

function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'json' });
  }
  const v = validate_(d);
  if (v.error) return json_({ ok: false, error: v.error });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = now_();
    upsertBest_(sheet_(), v, null, now);
    upsertBest_(weeklySheet_(), v, weekOf_(now).key, now);
  } finally {
    lock.releaseLock();
  }
  return json_(Object.assign({ ok: true }, boards_(v.id)));
}

// 同じ人（今週分なら同じ週）の行があれば、点数が上回った時だけ書き換える。名前だけの変更も反映する。
// 歴代：id, name, score, …  今週：id, week, name, score, …（week の 1 列だけ右にずれる）
function upsertBest_(sh, v, week, now) {
  const head = week === null ? [] : [week];
  const nameCol = head.length + 1;   // 0 始まりの列番号
  const values = head.concat([v.name, v.score, v.lines, v.level, v.seconds, now]);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== v.id || (week !== null && String(rows[i][1]) !== week)) continue;
    if (v.score > Number(rows[i][nameCol + 1])) {
      sh.getRange(i + 1, 2, 1, values.length).setValues([values]);
    } else if (String(rows[i][nameCol]) !== v.name) {
      sh.getRange(i + 1, nameCol + 1).setValue(v.name);
    }
    return;
  }
  sh.appendRow([v.id].concat(values));
}

// ありえない記録をはじく（完全には防げないので、最後はシートの行を消す）
function validate_(d) {
  if (!d || typeof d !== 'object') return { error: 'data' };
  const id = String(d.id || '');
  if (!/^[0-9a-f]{16,64}$/.test(id)) return { error: 'id' };
  const [score, lines, level, seconds] = [d.score, d.lines, d.level, d.seconds].map(x => Math.floor(Number(x)));
  if (![score, lines, level, seconds].every(Number.isFinite)) return { error: 'number' };
  if (score <= 0 || lines < 0 || seconds < 1) return { error: 'range' };
  if (level !== 1 + Math.floor(lines / 10)) return { error: 'level' };
  if (lines > seconds * 3) return { error: 'speed' };
  if (score > (lines + 20) * 800 * level) return { error: 'score' };
  return { id, name: cleanName_(d.name), score, lines, level, seconds };
}

function cleanName_(raw) {
  let n = String(raw == null ? '' : raw).normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  n = n.replace(/^[=+\-@']+/, '');   // シートの数式として解釈されないように
  n = Array.from(n).slice(0, NAME_MAX).join('').trim();
  const hira = n.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  if (!n || NG_WORDS.some(w => hira.includes(w))) n = 'ななし';
  return n;
}

function now_() {
  return new Date();
}

// 日本時間の月曜 0 時から始まる週。key は日付として変換されないよう W を付けた文字列
function weekOf_(date) {
  const jst = new Date(date.getTime() + JST_MS);
  const sinceMon = (jst.getUTCDay() + 6) % 7;
  const start = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - sinceMon) - JST_MS;
  const key = 'W' + new Date(start + JST_MS).toISOString().slice(0, 10);
  return { key, start, end: start + 7 * DAY_MS };
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('@');   // 名前は文字列のまま
  }
  return sh;
}

// 初めて作る時は、歴代の記録のうち今週更新されたものを今週分として写す
function weeklySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(WEEKLY_SHEET);
  if (!sh) {
    try {
      sh = ss.insertSheet(WEEKLY_SHEET);
    } catch (err) {
      return ss.getSheetByName(WEEKLY_SHEET);   // 同時に作られた
    }
    sh.appendRow(WEEKLY_HEADER);
    sh.setFrozenRows(1);
    sh.getRange('B:C').setNumberFormat('@');
    const w = weekOf_(now_());
    sheet_().getDataRange().getValues().slice(1)
      .filter(r => r[0] !== '' && new Date(r[6]).getTime() >= w.start)
      .forEach(r => sh.appendRow([r[0], w.key, r[1], r[2], r[3], r[4], r[5], r[6]]));
  }
  return sh;
}

function readAll_() {
  return sort_(sheet_().getDataRange().getValues().slice(1)
    .filter(r => r[0] !== '' && r[0] != null)
    .map(r => ({ id: String(r[0]), name: String(r[1]), score: Number(r[2]) || 0, level: Number(r[4]) || 1, updated: r[6] })));
}

function readWeek_(key) {
  return sort_(weeklySheet_().getDataRange().getValues().slice(1)
    .filter(r => r[0] !== '' && r[0] != null && String(r[1]) === key)
    .map(r => ({ id: String(r[0]), name: String(r[2]), score: Number(r[3]) || 0, level: Number(r[5]) || 1, updated: r[7] })));
}

function sort_(rows) {
  rows.forEach(r => { r.updated = new Date(r.updated).getTime() || 0; });
  return rows.sort((a, b) => b.score - a.score || a.updated - b.updated);
}

// id はほかの人に見せない
function board_(rows, id) {
  const rank = id ? rows.findIndex(r => r.id === id) + 1 : 0;
  return {
    top: rows.slice(0, TOP_N).map(r => ({ name: r.name, score: r.score, level: r.level })),
    rank,
    total: rows.length,
  };
}

// top / rank / total は今週分（v1.3.0 までのゲームはここだけを読む）
function boards_(id) {
  const w = weekOf_(now_());
  const week = board_(readWeek_(w.key), id);
  return Object.assign({}, week, {
    week: Object.assign({ key: w.key, endsAt: w.end }, week),
    all: board_(readAll_(), id),
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
