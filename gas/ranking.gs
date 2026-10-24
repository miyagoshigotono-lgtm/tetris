// ブロックおとし ランキング（Google Apps Script・スプレッドシートに紐づけて使う）
// 1 人（端末）1 行で自己ベストだけを残す。シートは初回に自動で作られる。
// 設定のしかたは README の「ランキング」を参照。

const SHEET_NAME = 'ranking';
const TOP_N = 10;
const NAME_MAX = 8;
const NG_WORDS = ['しね', '死ね', 'ころす', '殺す', 'ころせ', 'きえろ', '消えろ'];
const HEADER = ['id', 'name', 'score', 'lines', 'level', 'seconds', 'updated'];

function doGet(e) {
  const id = String((e && e.parameter && e.parameter.id) || '');
  return json_(Object.assign({ ok: true }, board_(readRows_(), id)));
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
    const sh = sheet_();
    const values = sh.getDataRange().getValues();
    let idx = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === v.id) {
        idx = i;
        break;
      }
    }
    const now = new Date();
    if (idx < 0) {
      sh.appendRow([v.id, v.name, v.score, v.lines, v.level, v.seconds, now]);
    } else if (v.score > Number(values[idx][2])) {
      sh.getRange(idx + 1, 2, 1, 6).setValues([[v.name, v.score, v.lines, v.level, v.seconds, now]]);
    } else if (String(values[idx][1]) !== v.name) {
      sh.getRange(idx + 1, 2).setValue(v.name);   // 名前だけ変えた
    }
  } finally {
    lock.releaseLock();
  }
  return json_(Object.assign({ ok: true }, board_(readRows_(), v.id)));
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

function readRows_() {
  return sheet_().getDataRange().getValues().slice(1)
    .filter(r => r[0] !== '' && r[0] != null)
    .map(r => ({
      id: String(r[0]),
      name: String(r[1]),
      score: Number(r[2]) || 0,
      level: Number(r[4]) || 1,
      updated: new Date(r[6]).getTime() || 0,
    }))
    .sort((a, b) => b.score - a.score || a.updated - b.updated);
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
