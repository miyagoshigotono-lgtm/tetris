import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, Randomizer, COLS, HIDDEN, TOTAL_ROWS, TNT, LOCK_DELAY } from '../js/logic.js';

// TNT が出ない決まった乱数
const noTnt = () => 0.5;

function fillRow(game, y, type = 'S', except = []) {
  for (let x = 0; x < COLS; x++) game.board[y][x] = except.includes(x) ? null : type;
}

test('最初のピースは見える一番上に出る', () => {
  const g = new Game({ rng: noTnt });
  assert.equal(g.over, false);
  const ys = g.cellsOf(g.active).map(c => c[1]);
  assert.equal(Math.min(...ys), HIDDEN);
});

test('壁より外には動かない', () => {
  const g = new Game({ rng: noTnt });
  for (let i = 0; i < 12; i++) g.move(-1);
  assert.equal(Math.min(...g.cellsOf(g.active).map(c => c[0])), 0);
  for (let i = 0; i < 12; i++) g.move(1);
  assert.equal(Math.max(...g.cellsOf(g.active).map(c => c[0])), COLS - 1);
});

test('左の壁際で I を回すと壁蹴りで回れる', () => {
  const g = new Game({ rng: noTnt });
  g.active = { type: 'I', rot: 1, x: -2, y: 10 };
  assert.equal(g.collides(g.active), false);
  assert.equal(g.rotate(1), true);
  assert.ok(g.cellsOf(g.active).every(([x]) => x >= 0));
});

test('1 ライン消すと 100 点', () => {
  const g = new Game({ rng: noTnt });
  fillRow(g, TOTAL_ROWS - 1, 'S', [3, 4, 5, 6]);
  g.active = { type: 'I', rot: 0, x: 3, y: 5 };
  const scoreBefore = g.score;
  const ev = g.hardDrop();
  assert.equal(ev.cleared.length, 1);
  assert.equal(ev.points, 100);
  assert.ok(g.score >= scoreBefore + 100);
  assert.ok(g.board[TOTAL_ROWS - 1].every(c => c === null));
});

test('ライン消去では TNT は消えずに残り、上のブロックを支える', () => {
  const g = new Game({ rng: noTnt });
  const b = TOTAL_ROWS - 1;
  fillRow(g, b, 'S', [6, 7, 8, 9]);
  g.board[b][0] = TNT;
  g.board[b - 1][0] = 'L';   // TNT の上
  g.board[b - 1][2] = 'J';   // ふつうの列の上
  g.active = { type: 'I', rot: 0, x: 6, y: 5 };
  const ev = g.hardDrop();
  assert.equal(ev.cleared.length, 1);
  assert.equal(g.tntCount(), 1);
  assert.equal(g.board[b][0], TNT);
  assert.equal(g.board[b - 1][0], 'L');
  assert.equal(g.board[b][2], 'J');
  assert.equal(g.board[b][1], null);
});

test('TNT だけでうまった行は消えない', () => {
  const g = new Game({ rng: noTnt });
  const b = TOTAL_ROWS - 1;
  fillRow(g, b, TNT);
  assert.deepEqual(g.clearLines(), []);
  assert.equal(g.tntCount(), COLS);
});

test('下がってまたそろった行は続けて消える', () => {
  const g = new Game({ rng: noTnt });
  const b = TOTAL_ROWS - 1;
  fillRow(g, b, 'S');
  g.board[b][0] = TNT;
  fillRow(g, b - 1, 'T', [0]);
  const cleared = g.clearLines();
  assert.equal(cleared.length, 2);
  assert.deepEqual(g.board[b], [TNT, ...Array(COLS - 1).fill(null)]);
  assert.ok(g.board[b - 1].every(c => c === null));
});

test('乱数が小さいと TNT が出る', () => {
  const r = new Randomizer(() => 0.01);
  assert.equal(r.next(), TNT);
  const r2 = new Randomizer(noTnt);
  assert.notEqual(r2.next(), TNT);
});

test('TNT がない時は爆発しない', () => {
  const g = new Game({ rng: noTnt });
  assert.equal(g.detonate(), null);
});

test('TNT は周り 3×3 を壊し、上のブロックが落ちる', () => {
  const g = new Game({ rng: noTnt });
  const b = TOTAL_ROWS - 1;
  for (const x of [4, 5, 6]) for (const y of [b - 1, b]) g.board[y][x] = 'S';
  g.board[b][5] = TNT;
  g.board[10][5] = 'L';   // 浮いているブロック
  g.board[8][4] = 'J';
  g.board[b][8] = 'O';    // 爆風の外
  g.active = { type: 'O', rot: 0, x: 0, y: 2 };

  const res = g.detonate();
  assert.equal(res.exploded.length, 1);
  assert.equal(res.destroyed.length, 5);
  assert.equal(res.points, 50);
  assert.equal(g.board[b][5], 'L');
  assert.equal(g.board[b][4], 'J');
  assert.equal(g.board[10][5], null);
  assert.equal(g.board[b][8], 'O');
  assert.equal(g.tntCount(), 0);
});

test('爆発で落ちたブロックで行がそろうと 2 倍で消える', () => {
  const g = new Game({ rng: noTnt });
  const b = TOTAL_ROWS - 1;
  fillRow(g, b, 'S', [4, 5, 6]);
  g.board[17][5] = TNT;
  for (const x of [4, 5, 6]) g.board[8][x] = 'T';
  g.active = { type: 'O', rot: 0, x: 0, y: 2 };

  const res = g.detonate();
  assert.equal(res.destroyed.length, 0);
  assert.equal(res.falls.length, 3);
  const s = g.settle();
  assert.equal(s.cleared.length, 1);
  assert.equal(s.points, 200);
  assert.ok(g.board[b].every(c => c === null));
});

test('落ちてきたブロックと重なったピースは上に逃げる', () => {
  const g = new Game({ rng: noTnt });
  const b = TOTAL_ROWS - 1;
  g.board[b][6] = TNT;
  g.board[5][5] = 'L';                                // 爆風の列 5〜7 にある浮きブロック
  g.active = { type: 'O', rot: 0, x: 4, y: b - 1 };  // 列 4〜5 の一番下
  g.detonate();
  assert.equal(g.board[b][5], 'L');
  assert.equal(g.collides(g.active), false);
  assert.equal(g.active.y, b - 2);
  assert.equal(g.over, false);
});

test('接地してしばらくすると固定される', () => {
  const g = new Game({ rng: noTnt });
  g.active = { type: 'O', rot: 0, x: 4, y: TOTAL_ROWS - 2 };
  assert.deepEqual(g.update(LOCK_DELAY - 1), []);
  const ev = g.update(2);
  assert.equal(ev.length, 1);
  assert.equal(g.board[TOTAL_ROWS - 1][4], 'O');
});

test('出てくる場所がふさがるとゲームオーバー', () => {
  const g = new Game({ rng: noTnt });
  for (let y = HIDDEN; y < TOTAL_ROWS; y++) fillRow(g, y, 'S', [y % COLS]);
  g.spawn();
  assert.equal(g.over, true);
});
