// ゲームのルール本体（DOM 非依存）。main.js から使い、tests/ から直接テストする。

export const COLS = 10;
export const ROWS = 20;          // 見える行数
export const HIDDEN = 2;         // 画面の上にある見えない行（回転の逃げ場）
export const TOTAL_ROWS = ROWS + HIDDEN;
export const TNT = 'X';
export const TNT_CHANCE = 1 / 20;
export const BLAST_RADIUS = 1;   // 1 → 周囲 3×3
export const LOCK_DELAY = 500;
export const MAX_LOCK_RESETS = 15;
export const LINES_PER_LEVEL = 10;
export const BAG_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  X: [[1]],
};

function rotateCW(m) {
  const n = m.length;
  return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
}

function toCells(m) {
  const cells = [];
  m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
  return cells;
}

// ROT[type][rot] = [[x, y], ...]
const ROT = {};
for (const [type, m0] of Object.entries(SHAPES)) {
  const mats = [m0];
  for (let i = 1; i < 4; i++) mats.push(rotateCW(mats[i - 1]));
  ROT[type] = mats.map(toCells);
}

export function shapeCells(type, rot = 0) {
  return ROT[type][rot];
}

// SRS の壁蹴り表（y は上向き正。使う時に反転する）
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

export function linePoints(n) {
  if (n <= 0) return 0;
  if (n <= 4) return [0, 100, 300, 500, 800][n];
  return 800 + (n - 4) * 300;
}

// 7 種 1 セットの袋。たまに袋とは別に TNT を混ぜる
export class Randomizer {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.bag = [];
  }

  next() {
    if (this.rng() < TNT_CHANCE) return TNT;
    if (!this.bag.length) {
      const bag = BAG_TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.bag = bag;
    }
    return this.bag.pop();
  }
}

function emptyRow() {
  return Array(COLS).fill(null);
}

export class Game {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: TOTAL_ROWS }, emptyRow);
    this.random = new Randomizer(this.rng);
    this.queue = [this.random.next(), this.random.next()];
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.over = false;
    this.active = null;
    this.spawn();
  }

  get gravityInterval() {
    return Math.max(80, 900 * Math.pow(0.88, this.level - 1));
  }

  spawn() {
    const type = this.queue.shift();
    this.queue.push(this.random.next());
    const top = Math.min(...ROT[type][0].map(c => c[1]));
    const w = SHAPES[type].length;
    this.active = { type, rot: 0, x: Math.floor((COLS - w) / 2), y: HIDDEN - top };
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (this.collides(this.active)) this.over = true;
  }

  cellsOf(p) {
    return ROT[p.type][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]);
  }

  collides(p) {
    return this.cellsOf(p).some(([x, y]) =>
      x < 0 || x >= COLS || y < 0 || y >= TOTAL_ROWS || this.board[y][x]);
  }

  tryMove(dx, dy) {
    const p = { ...this.active, x: this.active.x + dx, y: this.active.y + dy };
    if (this.collides(p)) return false;
    this.active = p;
    return true;
  }

  isGrounded() {
    return this.collides({ ...this.active, y: this.active.y + 1 });
  }

  resetLock() {
    if (this.lockTimer > 0 && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    if (this.over || !this.tryMove(dx, 0)) return false;
    this.resetLock();
    return true;
  }

  rotate(dir = 1) {
    const a = this.active;
    if (this.over || a.type === 'O' || a.type === TNT) return false;
    const to = (a.rot + dir + 4) % 4;
    const table = a.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    for (const [kx, ky] of table[`${a.rot}>${to}`]) {
      const p = { ...a, rot: to, x: a.x + kx, y: a.y - ky };
      if (!this.collides(p)) {
        this.active = p;
        this.resetLock();
        return true;
      }
    }
    return false;
  }

  softDrop() {
    if (this.over || !this.tryMove(0, 1)) return false;
    this.score += 1;
    this.gravityAcc = 0;
    return true;
  }

  hardDrop() {
    if (this.over) return null;
    let d = 0;
    while (this.tryMove(0, 1)) d++;
    this.score += d * 2;
    return this.lock();
  }

  ghostY() {
    let y = this.active.y;
    while (!this.collides({ ...this.active, y: y + 1 })) y++;
    return y;
  }

  update(dt) {
    const events = [];
    if (this.over) return events;
    this.gravityAcc += dt;
    const iv = this.gravityInterval;
    while (this.gravityAcc >= iv) {
      this.gravityAcc -= iv;
      if (!this.tryMove(0, 1)) {
        this.gravityAcc = 0;
        break;
      }
    }
    if (this.isGrounded()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) events.push(this.lock());
    } else {
      this.lockTimer = 0;
    }
    return events;
  }

  lock() {
    const piece = this.active;
    for (const [x, y] of this.cellsOf(piece)) this.board[y][x] = piece.type;
    const prevLevel = this.level;
    const cleared = this.clearLines();
    const points = this.scoreLines(cleared.length, 1);
    this.spawn();
    return { piece, cleared, points, levelUp: this.level > prevLevel, over: this.over };
  }

  // そろった行を消す。TNT が混ざっていても爆発せずに消えるだけ
  clearLines() {
    const cleared = [];
    for (let y = 0; y < TOTAL_ROWS; y++) {
      if (this.board[y].every(Boolean)) cleared.push({ y, cells: this.board[y].slice() });
    }
    if (cleared.length) {
      const keep = this.board.filter(r => !r.every(Boolean));
      while (keep.length < TOTAL_ROWS) keep.unshift(emptyRow());
      this.board = keep;
    }
    return cleared;
  }

  scoreLines(n, mult) {
    if (!n) return 0;
    const pts = linePoints(n) * this.level * mult;
    this.score += pts;
    this.lines += n;
    this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);
    return pts;
  }

  tntCount() {
    let n = 0;
    for (const row of this.board) for (const c of row) if (c === TNT) n++;
    return n;
  }

  // 置いてある TNT を全部爆発 → 爆風が当たった列のブロックを下に落とす。
  // ライン消去は落下アニメの後に settle() で行う。
  detonate() {
    if (this.over) return null;
    const exploded = [];
    this.board.forEach((row, y) => row.forEach((c, x) => { if (c === TNT) exploded.push([x, y]); }));
    if (!exploded.length) return null;

    for (const [x, y] of exploded) this.board[y][x] = null;
    const destroyed = [];
    const cols = new Set();
    const R = BLAST_RADIUS;
    for (const [tx, ty] of exploded) {
      for (let x = tx - R; x <= tx + R; x++) {
        if (x < 0 || x >= COLS) continue;
        cols.add(x);
        for (let y = ty - R; y <= ty + R; y++) {
          if (y < 0 || y >= TOTAL_ROWS) continue;
          const c = this.board[y][x];
          if (c) {
            destroyed.push({ x, y, type: c });
            this.board[y][x] = null;
          }
        }
      }
    }

    const falls = [];
    for (const x of [...cols].sort((a, b) => a - b)) {
      let write = TOTAL_ROWS - 1;
      for (let y = TOTAL_ROWS - 1; y >= 0; y--) {
        const c = this.board[y][x];
        if (!c) continue;
        if (y !== write) {
          this.board[write][x] = c;
          this.board[y][x] = null;
          falls.push({ x, fromY: y, toY: write, type: c });
        }
        write--;
      }
    }

    const points = destroyed.length * 10 * this.level;
    this.score += points;
    this.unstick();
    return { exploded, destroyed, falls, points, over: this.over };
  }

  // 爆発後のライン消去。得点 2 倍
  settle() {
    const prevLevel = this.level;
    const cleared = this.clearLines();
    const points = this.scoreLines(cleared.length, 2);
    this.unstick();
    return { cleared, points, levelUp: this.level > prevLevel, over: this.over };
  }

  // 落ちてきたブロックが操作中のピースに重なったら、ピースを上に逃がす
  unstick() {
    if (!this.active || this.over) return;
    let n = 0;
    while (this.collides(this.active) && n < TOTAL_ROWS) {
      this.active = { ...this.active, y: this.active.y - 1 };
      n++;
    }
    if (this.collides(this.active)) this.over = true;
    this.lockTimer = 0;
  }
}
