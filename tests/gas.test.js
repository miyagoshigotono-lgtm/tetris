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
  let sheet = null;
  const ctx = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: () => sheet,
        insertSheet: () => (sheet = fakeSheet()),
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
  ctx.sheet = () => sheet;
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
