// gas/ranking.gs を Google のサービスの代わりの簡易モックで動かして確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../gas/ranking.gs', import.meta.url), 'utf8');

function fakeSheet() {
  const data = [];
  const sheet = {
    data,
    appendRow: row => data.push(row.slice()),
    setFrozenRows: () => {},
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange: (r, c, nr = 1, nc = 1) => {
      if (typeof r === 'string') return { setNumberFormat: () => {} };
      return {
        setValues: vals => vals.forEach((row, i) => row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; })),
        setValue: v => { data[r - 1][c - 1] = v; },
      };
    },
  };
  return sheet;
}

function load() {
  const sheets = {};
  const ctx = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => (sheets[n] = fakeSheet()),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  ctx.post = d => ctx.doPost({ postData: { contents: JSON.stringify(d) } });
  ctx.get = id => ctx.doGet({ parameter: { id } });
  ctx.sheets = sheets;
  ctx.at = iso => { ctx.now_ = () => new Date(iso); };
  return ctx;
}

const ID_A = 'a'.repeat(24), ID_B = 'b'.repeat(24);
const play = (id, name, score, lines = 30) =>
  ({ id, name, score, lines, level: 1 + Math.floor(lines / 10), seconds: 300 });

test('送った記録がランキングに入り、順位が返る', () => {
  const g = load();
  assert.equal(g.post(play(ID_A, 'たろう', 5000)).rank, 1);
  const res = g.post(play(ID_B, 'はなこ', 9000));
  assert.equal(res.ok, true);
  assert.equal(res.rank, 1);
  assert.deepEqual(res.top.map(r => r.name), ['はなこ', 'たろう']);
  assert.equal(g.get(ID_A).rank, 2);
  assert.ok(!('id' in res.top[0]));
});

test('1 人 1 行で自己ベストだけ残り、名前は変えられる', () => {
  const g = load();
  g.post(play(ID_A, 'たろう', 5000));
  g.post(play(ID_A, 'たろう', 3000));
  assert.equal(g.get(ID_A).top[0].score, 5000);
  g.post(play(ID_A, 'タロウ', 1000));
  const res = g.get(ID_A);
  assert.equal(res.total, 1);
  assert.equal(res.top[0].name, 'タロウ');
  assert.equal(res.top[0].score, 5000);
});

test('ありえない記録ははじく', () => {
  const g = load();
  assert.equal(g.post({ ...play(ID_A, 'x', 100), level: 5 }).error, 'level');
  assert.equal(g.post({ ...play(ID_A, 'x', 100, 100), seconds: 10 }).error, 'speed');
  assert.equal(g.post(play(ID_A, 'x', 99999999, 0)).error, 'score');
  assert.equal(g.post(play('xyz', 'x', 100)).error, 'id');
  assert.equal(g.doPost({ postData: { contents: '{' } }).error, 'json');
});

test('名前の掃除：長さ・数式・NG ワード', () => {
  const g = load();
  assert.equal(g.cleanName_('あいうえおかきくけこ'), 'あいうえおかきく');
  assert.equal(g.cleanName_('=HYPERLINK("x")'), 'HYPERLIN');
  assert.equal(g.cleanName_('シネ'), 'ななし');
  assert.equal(g.cleanName_('   '), 'ななし');
  assert.equal(g.cleanName_('ｽﾃｨｰﾌﾞ'), 'スティーブ');
});

test('21 万点・レベル 18 くらいの本物の記録は通る', () => {
  const g = load();
  const res = g.post({ id: ID_A, name: 'おじ', score: 210000, lines: 175, level: 18, seconds: 1500 });
  assert.equal(res.ok, true);
  assert.equal(res.rank, 1);
});

test('週は日本時間の月曜 0 時で切りかわる', () => {
  const g = load();
  assert.equal(g.weekOf_(new Date('2026-11-01T23:59:59+09:00')).key, 'W2026-10-26');
  assert.equal(g.weekOf_(new Date('2026-11-02T00:00:00+09:00')).key, 'W2026-11-02');
  assert.equal(g.weekOf_(new Date('2026-11-02T00:00:00+09:00')).start, Date.parse('2026-11-02T00:00:00+09:00'));
  assert.equal(g.weekOf_(new Date('2026-11-04T12:00:00+09:00')).end, Date.parse('2026-11-09T00:00:00+09:00'));
});

test('次の週になると今週は空になり、歴代は残る', () => {
  const g = load();
  g.at('2026-10-30T10:00:00+09:00');
  g.post(play(ID_A, 'たろう', 5000));
  g.at('2026-11-02T09:00:00+09:00');
  let res = g.get(ID_A);
  assert.equal(res.week.total, 0);
  assert.equal(res.all.top[0].score, 5000);
  assert.equal(res.all.rank, 1);
  res = g.post(play(ID_A, 'たろう', 800));
  assert.equal(res.week.top[0].score, 800);
  assert.equal(res.week.rank, 1);
  assert.equal(res.all.top[0].score, 5000);
  assert.deepEqual(res.top, res.week.top);   // 古いゲームは今週分を読む
  assert.equal(res.week.endsAt, Date.parse('2026-11-09T00:00:00+09:00'));
  assert.equal(g.sheets.weekly.data.length, 3);   // 見出し + 先週 + 今週（過去の週も残る）
});

test('今週の中では自己ベストだけ残る', () => {
  const g = load();
  g.at('2026-11-03T10:00:00+09:00');
  g.post(play(ID_A, 'たろう', 3000));
  g.post(play(ID_A, 'たろう', 2000));
  g.post(play(ID_B, 'はなこ', 4000));
  const res = g.get(ID_A);
  assert.deepEqual(res.week.top.map(r => r.score), [4000, 3000]);
  assert.equal(res.week.rank, 2);
});

test('今週のシートを初めて作る時は、歴代の今週分だけを写す', () => {
  const g = load();
  g.at('2026-10-20T10:00:00+09:00');
  g.post(play(ID_A, 'せんしゅう', 9000));
  delete g.sheets.weekly;
  g.at('2026-10-28T10:00:00+09:00');
  g.sheets.ranking.appendRow([ID_B, 'こんしゅう', 4000, 30, 4, 300, new Date('2026-10-27T10:00:00+09:00')]);
  const res = g.get(ID_B);
  assert.deepEqual(res.week.top.map(r => r.name), ['こんしゅう']);
  assert.deepEqual(res.all.top.map(r => r.name), ['せんしゅう', 'こんしゅう']);
});
