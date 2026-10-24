// 画面・操作・演出。ルールは logic.js にある

import { Game, COLS, ROWS, HIDDEN, TNT, shapeCells } from './logic.js';
import { makeTexture, TEXTURE_NAMES, TYPE_COLORS } from './textures.js';
import { icon, iconURL } from './icons.js';
import { Sound } from './audio.js';
import * as ranking from './ranking.js';

const VERSION = '1.2.0';

const PANEL = 5;                       // 右パネルの幅（マス数）
const DAS = 170, ARR = 50, SOFT_MS = 45;
const FUSE_MS = 900, SHAKE_MS = 380, FALL_MS_PER_ROW = 45;

const $ = s => document.querySelector(s);
const stage = $('#stage'), wrap = $('#wrap'), canvas = $('#game');
const ctx = canvas.getContext('2d');
const flintBtn = $('#flint'), flintBadge = flintBtn.querySelector('.badge');

const game = new Game();
const sound = new Sound();

let phase = 'title';                  // title / play / fuse / fall / paused / over
let pausedFrom = null;
let cell = 24, dpr = 1, boardW = 0, W = 0, H = 0;
let tiles = {}, boardBg = null;
let particles = [], shake = 0, flash = 0, fuseT = 0, fall = null;
let best = loadBest();
let playMs = 0;
let afterName = null;
const held = new Map();

// ---------- 画像の準備 ----------

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.w;
  c.height = img.h;
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}

function scaled(src, w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, w, h);
  return c;
}

const texSrc = Object.fromEntries(TEXTURE_NAMES.map(n => [n, toCanvas(makeTexture(n))]));

function setupStatic() {
  const dirt = scaled(texSrc.D, 64);
  const g = dirt.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 64, 64);
  document.documentElement.style.setProperty('--dirt', `url(${dirt.toDataURL()})`);

  document.querySelectorAll('img[data-icon]').forEach(img => { img.src = iconURL(img.dataset.icon); });
  const row = $('#blockRow');
  for (const n of ['S', 'I', 'O', 'X', 'T', 'Z', 'J', 'L']) {
    const img = new Image();
    img.src = scaled(texSrc[n], 64).toDataURL();
    img.alt = '';
    row.append(img);
  }
  $('#ver').textContent = 'v' + VERSION;
  updateSoundIcon();
  updateMusicIcon();
}

// ---------- レイアウト ----------

function resize() {
  const r = stage.getBoundingClientRect();
  cell = Math.max(10, Math.floor(Math.min(r.width / (COLS + PANEL), r.height / ROWS)));
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  boardW = cell * COLS;
  W = cell * (COLS + PANEL);
  H = cell * ROWS;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  wrap.style.setProperty('--cell', cell + 'px');

  const px = Math.round(cell * dpr);
  tiles = {};
  for (const n of TEXTURE_NAMES) tiles[n] = scaled(texSrc[n], px);

  boardBg = document.createElement('canvas');
  boardBg.width = boardW * dpr;
  boardBg.height = H * dpr;
  const g = boardBg.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) g.drawImage(tiles.B, x * px, y * px);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, boardBg.width, boardBg.height);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 1; x < COLS; x++) g.fillRect(x * px, 0, Math.max(1, dpr), boardBg.height);
  for (let y = 1; y < ROWS; y++) g.fillRect(0, y * px, boardBg.width, Math.max(1, dpr));
}

// ---------- 描画 ----------

const FONT = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '###', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '..#', '..#'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
};

function drawNumber(g, n, x, y, s, color, align = 'left', shadow = '#3f3f3f') {
  const str = String(n);
  const w = (str.length * 4 - 1) * s;
  let sx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  sx = Math.round(sx);
  y = Math.round(y);
  const off = Math.max(1, Math.round(s / 2));
  for (const [col, o] of [[shadow, off], [color, 0]]) {
    g.fillStyle = col;
    [...str].forEach((ch, i) => FONT[ch].forEach((row, ry) => [...row].forEach((v, rx) => {
      if (v === '#') g.fillRect(sx + (i * 4 + rx) * s + o, y + ry * s + o, s, s);
    })));
  }
}

function numberCanvas(n, s, color) {
  const str = String(n);
  const c = document.createElement('canvas');
  c.width = (str.length * 4 - 1) * s + s;
  c.height = 6 * s;
  drawNumber(c.getContext('2d'), n, 0, 0, s, color);
  return c;
}

function drawBlock(type, x, y, size) {
  ctx.drawImage(tiles[type], x, y, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

function drawBoard() {
  ctx.drawImage(boardBg, 0, 0, boardW, H);
  const skip = fall ? fall.skip : null;
  const tnts = [];
  for (let y = HIDDEN; y < game.board.length; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = game.board[y][x];
      if (!c || (skip && skip.has(y * COLS + x))) continue;
      if (c === TNT && phase === 'fuse') tnts.push([x, y]);
      else drawBlock(c, x * cell, (y - HIDDEN) * cell, cell);
    }
  }
  // 着火中の TNT は白く点滅しながらふくらむ
  const on = Math.floor(fuseT / 110) % 2 === 0;
  const sz = cell * (1 + 0.18 * (fuseT / FUSE_MS)), o = (sz - cell) / 2;
  for (const [x, y] of tnts) {
    drawBlock(TNT, x * cell - o, (y - HIDDEN) * cell - o, sz);
    if (on) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x * cell - o, (y - HIDDEN) * cell - o, sz, sz);
    }
  }
  if (fall) {
    const p = Math.max(0, Math.min(1, fall.t / fall.dur)), e = p * p;
    for (const f of fall.falls) {
      const yy = f.fromY + (f.toY - f.fromY) * e;
      if (yy > HIDDEN - 1) drawBlock(f.type, f.x * cell, (yy - HIDDEN) * cell, cell);
    }
  }
}

function drawActive() {
  const a = game.active;
  if (!a || game.over) return;
  const cells = shapeCells(a.type, a.rot);
  const gy = game.ghostY();
  if (gy !== a.y) {
    for (const [cx, cy] of cells) {
      const y = gy + cy;
      if (y < HIDDEN) continue;
      const px = (a.x + cx) * cell, py = (y - HIDDEN) * cell;
      ctx.globalAlpha = 0.25;
      ctx.drawImage(tiles[a.type], px, py, cell, cell);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
    }
  }
  for (const [cx, cy] of cells) {
    const y = a.y + cy;
    if (y >= HIDDEN) drawBlock(a.type, (a.x + cx) * cell, (y - HIDDEN) * cell, cell);
  }
}

function slot(x, y, w, h) {
  const b = Math.max(2, Math.round(cell / 10));
  ctx.fillStyle = '#8b8b8b';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#373737';
  ctx.fillRect(x, y, w, b);
  ctx.fillRect(x, y, b, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y + h - b, w, b);
  ctx.fillRect(x + w - b, y, b, h);
}

function drawMini(type, x, y, w, h, maxSize) {
  const cells = shapeCells(type, 0);
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const cw = Math.max(...xs) - minX + 1, ch = Math.max(...ys) - minY + 1;
  const m = Math.floor(Math.min(maxSize, (w - 8) / cw, (h - 8) / ch));
  const ox = Math.round(x + (w - cw * m) / 2), oy = Math.round(y + (h - ch * m) / 2);
  for (const [cx, cy] of cells) drawBlock(type, ox + (cx - minX) * m, oy + (cy - minY) * m, m);
}

function digitScale(len, maxW, maxH) {
  return Math.max(1, Math.min(Math.floor(maxW / (len * 4)), Math.floor(maxH / 5)));
}

function drawPanel() {
  const x0 = boardW, pw = W - boardW, p = Math.max(4, Math.round(cell * 0.3));
  const sw = pw - p * 2;
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(x0, 0, pw, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(x0, 0, Math.max(2, Math.round(cell / 10)), H);

  // つぎのブロック 2 つ
  let y = p;
  const h1 = Math.round(cell * 2.6), h2 = Math.round(cell * 2);
  slot(x0 + p, y, sw, h1);
  drawMini(game.queue[0], x0 + p, y, sw, h1, cell * 0.8);
  y += h1 + Math.round(p * 0.6);
  slot(x0 + p, y, sw, h2);
  drawMini(game.queue[1], x0 + p, y, sw, h2, cell * 0.55);
  y += h2 + p * 1.6;

  // スコア（エメラルド）
  const ic = Math.round(cell * 0.9);
  ctx.drawImage(icon('emerald'), x0 + p, y, ic, ic);
  const s1 = digitScale(String(game.score).length, sw - ic - p * 0.5, ic);
  drawNumber(ctx, game.score, x0 + pw - p, y + (ic - 5 * s1) / 2, s1, '#ffffff', 'right');
  y += ic + p * 1.4;

  // レベル（経験値バー風）
  const s2 = Math.max(2, Math.round(cell / 7));
  drawNumber(ctx, game.level, x0 + pw / 2, y, s2, '#80ff20', 'center', '#1a3d00');
  y += 5 * s2 + Math.round(p * 0.7);
  const bh = Math.max(5, Math.round(cell * 0.34));
  ctx.fillStyle = '#000';
  ctx.fillRect(x0 + p, y, sw, bh);
  ctx.fillStyle = '#2c4a14';
  ctx.fillRect(x0 + p + 1, y + 1, sw - 2, bh - 2);
  ctx.fillStyle = '#80ff20';
  ctx.fillRect(x0 + p + 1, y + 1, (sw - 2) * ((game.lines % 10) / 10), bh - 2);
  y += bh + p * 1.6;

  // ベスト（王冠）
  const crown = icon('crown');
  const iw = Math.round(cell * 0.75), ih = Math.round(iw * crown.height / crown.width);
  ctx.drawImage(crown, x0 + p, y, iw, ih);
  const shown = Math.max(best, game.score);
  const s3 = digitScale(String(shown).length, sw - iw - p * 0.5, ih);
  drawNumber(ctx, shown, x0 + pw - p, y + (ih - 5 * s3) / 2, s3, '#ffe066', 'right');
}

function drawParticles() {
  for (const q of particles) {
    ctx.globalAlpha = Math.max(0, q.life / q.max) * (q.alpha ?? 1);
    ctx.fillStyle = q.color;
    const w = q.w ?? q.size, h = q.h ?? q.size;
    ctx.fillRect(q.x - w / 2, q.y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, boardW, H);
  ctx.clip();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, boardW, H);
  if (shake > 0) {
    const m = cell * 0.35 * (shake / SHAKE_MS);
    ctx.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m);
  }
  drawBoard();
  if (phase !== 'title') drawActive();
  drawParticles();
  ctx.restore();
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`;
    ctx.fillRect(0, 0, boardW, H);
  }
  drawPanel();
}

// ---------- 演出 ----------

const rnd = (a, b) => a + Math.random() * (b - a);

function addParticle(q) {
  particles.push({ vx: 0, vy: 0, g: 0, grow: 0, max: q.life, ...q });
}

function updateParticles(dt) {
  const s = dt / 1000;
  for (const q of particles) {
    q.x += q.vx * s;
    q.y += q.vy * s;
    q.vy += q.g * s;
    if (q.size !== undefined) q.size += q.grow * s;
    q.life -= dt;
  }
  particles = particles.filter(q => q.life > 0);
}

const cx = x => (x + 0.5) * cell;
const cy = y => (y - HIDDEN + 0.5) * cell;

function debris(x, y, type, n) {
  for (let i = 0; i < n; i++) {
    addParticle({
      x: cx(x) + rnd(-0.3, 0.3) * cell, y: cy(y) + rnd(-0.3, 0.3) * cell,
      vx: rnd(-4, 4) * cell, vy: rnd(-9, -2) * cell, g: cell * 30,
      size: cell * rnd(0.15, 0.3), color: TYPE_COLORS[type] || '#888', life: rnd(450, 850),
    });
  }
}

function smoke(x, y) {
  for (let i = 0; i < 10; i++) {
    addParticle({
      x: cx(x) + rnd(-0.8, 0.8) * cell, y: cy(y) + rnd(-0.8, 0.8) * cell,
      vx: rnd(-2, 2) * cell, vy: rnd(-3, 1) * cell,
      size: cell * rnd(0.4, 0.8), grow: cell * 1.6,
      color: Math.random() < 0.5 ? '#ffffff' : '#bdbdbd', life: rnd(500, 1000), alpha: 0.85,
    });
  }
  for (let i = 0; i < 5; i++) {
    addParticle({
      x: cx(x), y: cy(y), vx: rnd(-6, 6) * cell, vy: rnd(-6, 6) * cell,
      size: cell * 0.35, color: '#ffb347', life: rnd(150, 300),
    });
  }
}

function clearFx(rows, bonus) {
  sound.play(bonus ? 'bonus' : 'clear');
  vibrate(30);
  for (const row of rows) {
    addParticle({ x: boardW / 2, y: cy(row.y), w: boardW, h: cell, color: '#ffffff', life: 260, alpha: 0.8 });
    row.cells.forEach((t, x) => { if (t !== TNT) debris(x, row.y, t, 2); });
  }
}

function landDust(piece) {
  const cells = game.cellsOf(piece);
  for (const [x, y] of cells) {
    if (cells.some(([x2, y2]) => x2 === x && y2 === y + 1)) continue;
    for (let i = 0; i < 2; i++) {
      addParticle({
        x: cx(x) + rnd(-0.4, 0.4) * cell, y: cy(y) + cell * 0.5,
        vx: rnd(-1.5, 1.5) * cell, vy: rnd(-1.5, -0.5) * cell,
        size: cell * 0.2, color: '#9a9a9a', life: 300,
      });
    }
  }
}

function vibrate(p) {
  try { navigator.vibrate?.(p); } catch { /* 未対応 */ }
}

// ---------- ゲームの進行 ----------

function onLock(ev, hard = false) {
  if (!ev) return;
  sound.play('lock');
  if (hard) landDust(ev.piece);
  if (ev.cleared.length) clearFx(ev.cleared, false);
  if (ev.levelUp) sound.play('level');
  if (ev.over) gameOver();
}

function ignite() {
  sound.play('flint');
  if (game.tntCount() === 0) return;
  phase = 'fuse';
  fuseT = 0;
  held.clear();
  sound.play('fuse');
}

function explode() {
  const res = game.detonate();
  if (!res) {
    phase = 'play';
    return;
  }
  sound.play('boom');
  vibrate([80, 40, 120]);
  shake = SHAKE_MS;
  flash = 1;
  for (const [x, y] of res.exploded) smoke(x, y);
  for (const d of res.destroyed) debris(d.x, d.y, d.type, 3);
  if (res.over) return gameOver();
  if (res.falls.length) {
    const maxD = Math.max(...res.falls.map(f => f.toY - f.fromY));
    fall = {
      t: -180, dur: Math.min(450, 120 + maxD * FALL_MS_PER_ROW), falls: res.falls,
      skip: new Set(res.falls.map(f => f.toY * COLS + f.x)),
    };
    phase = 'fall';
  } else {
    finishFall();
  }
}

function finishFall() {
  fall = null;
  const s = game.settle();
  if (s.cleared.length) clearFx(s.cleared, true);
  if (s.levelUp) sound.play('level');
  if (s.over) return gameOver();
  phase = 'play';
}

function repeatHeld(dt) {
  for (const [act, h] of held) {
    h.t += dt;
    const delay = act === 'down' ? SOFT_MS : DAS;
    const period = act === 'down' ? SOFT_MS : ARR;
    if (!h.rep && h.t >= delay) {
      h.rep = true;
      h.t -= delay;
      repeatAct(act);
    }
    while (h.rep && h.t >= period) {
      h.t -= period;
      repeatAct(act);
    }
  }
}

function repeatAct(act) {
  if (act === 'down') game.softDrop();
  else if (game.move(act === 'left' ? -1 : 1)) sound.play('move');
}

function step(dt) {
  updateParticles(dt);
  if (['play', 'fuse', 'fall'].includes(phase)) playMs += dt;
  shake = Math.max(0, shake - dt);
  flash = Math.max(0, flash - dt / 180);
  if (phase === 'play') {
    repeatHeld(dt);
    for (const ev of game.update(dt)) onLock(ev);
  } else if (phase === 'fuse') {
    fuseT += dt;
    if (fuseT >= FUSE_MS) explode();
  } else if (phase === 'fall') {
    fall.t += dt;
    if (fall.t >= fall.dur) finishFall();
  }
  updateFlint();
}

let flintState = '';
function updateFlint() {
  const n = game.tntCount();
  const ready = n > 0 && phase === 'play';
  const key = `${ready}:${n}`;
  if (key === flintState) return;
  flintState = key;
  flintBtn.classList.toggle('ready', ready);
  flintBadge.textContent = n;
  flintBadge.hidden = n === 0;
}

// ---------- 画面の切り替え ----------

function showOverlay(id) {
  for (const el of document.querySelectorAll('.overlay')) el.hidden = el.id !== id;
}

function startGame() {
  sound.unlock();
  game.reset();
  particles = [];
  fall = null;
  shake = flash = 0;
  held.clear();
  playMs = 0;
  phase = 'play';
  showOverlay(null);
  sound.play('start');
  sound.music.start();
}

function togglePause() {
  if (['play', 'fuse', 'fall'].includes(phase)) {
    pausedFrom = phase;
    phase = 'paused';
    held.clear();
    sound.music.stop();
    showOverlay('pause');
  } else if (phase === 'paused') {
    phase = pausedFrom;
    showOverlay(null);
    sound.music.start();
  }
}

function gameOver() {
  phase = 'over';
  held.clear();
  sound.music.stop();
  sound.play('over');
  const isNew = game.score > best;
  if (isNew) {
    best = game.score;
    saveBest(best);
  }
  $('#overScore').replaceChildren(numberCanvas(game.score, 6, '#ffffff'));
  $('#overBest').replaceChildren(numberCanvas(best, 4, '#ffe066'));
  $('#newBest').hidden = !isNew;
  sendScore();
  setTimeout(() => { if (phase === 'over') showOverlay('over'); }, 700);
}

function showTitle() {
  phase = 'title';
  $('#titleBest').replaceChildren(numberCanvas(best, 4, '#ffe066'));
  showOverlay('title');
  if (!ranking.enabled()) return;
  updateNameLabel();
  const el = $('#rankTitle');
  rankMessage(el, 'よみこみちゅう…');
  ranking.flushPending().catch(() => {})
    .then(() => ranking.fetchRanking())
    .then(data => renderRanking(el, data))
    .catch(() => rankMessage(el, 'ランキングに つながりません'));
}

// ---------- ランキング ----------

function sendScore() {
  const el = $('#overRank');
  if (!ranking.enabled() || !ranking.getName() || game.score <= 0) {
    el.hidden = true;
    return;
  }
  rankMessage(el, 'おくっています…');
  ranking.submitScore({
    score: game.score, lines: game.lines, level: game.level, seconds: Math.max(1, Math.round(playMs / 1000)),
  })
    .then(data => renderRanking(el, data))
    .catch(() => rankMessage(el, 'あとで おくります'));
}

function rankMessage(el, text) {
  const msg = document.createElement('div');
  msg.className = 'rank-msg';
  msg.textContent = text;
  el.replaceChildren(msg);
  el.hidden = false;
}

function renderRanking(el, data) {
  const head = document.createElement('div');
  head.className = 'rank-head';
  head.textContent = data.rank ? `ランキング  ${data.rank}い / ${data.total}にん` : 'ランキング';
  const rows = data.top.map((r, i) => {
    const row = document.createElement('div');
    row.className = 'rank-row' + (i + 1 === data.rank ? ' me' : '');
    for (const [cls, text] of [['no', i + 1], ['nm', r.name], ['sc', r.score.toLocaleString('ja-JP')]]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      row.append(span);
    }
    return row;
  });
  el.replaceChildren(head, ...rows);
  if (!rows.length) rankMessage(el, 'まだ だれも いません');
  el.hidden = false;
}

function updateNameLabel() {
  $('#nameBtn').hidden = false;
  $('#nameLabel').textContent = ranking.getName() || 'なまえを いれる';
}

function openName(then) {
  afterName = then;
  const input = $('#nameInput');
  input.value = ranking.getName();
  showOverlay('nameDlg');
  input.focus();
}

function closeName(ok) {
  if (ok) {
    const n = ranking.cleanName($('#nameInput').value);
    if (!n) return;
    ranking.setName(n);
  }
  $('#nameInput').blur();
  const then = afterName;
  afterName = null;
  if (then === 'start' && ok) startGame();
  else showTitle();
}

// 名前がまだなら最初に聞く（「あとで」を選べばランキングなしで遊べる）
function requestStart() {
  if (ranking.enabled() && !ranking.getName() && phase === 'title') openName('start');
  else startGame();
}

function toggleSound() {
  sound.setMuted(!sound.muted);
  updateSoundIcon();
}

function updateSoundIcon() {
  $('#soundIcon').src = iconURL(sound.muted ? 'soundOff' : 'soundOn');
}

function toggleMusic() {
  sound.music.setOn(!sound.music.on);
  if (sound.music.on && ['play', 'fuse', 'fall'].includes(phase)) sound.music.start();
  updateMusicIcon();
}

function updateMusicIcon() {
  $('#musicBtn').classList.toggle('off', !sound.music.on);
}

function loadBest() {
  try { return Number(localStorage.getItem('best')) || 0; } catch { return 0; }
}

function saveBest(v) {
  try { localStorage.setItem('best', String(v)); } catch { /* 保存できない環境 */ }
}

// ---------- 入力 ----------

function press(act) {
  sound.unlock();
  if (act === 'pause') return togglePause();
  if (act === 'sound') return toggleSound();
  if (act === 'music') return toggleMusic();
  if (phase !== 'play') return;
  switch (act) {
    case 'left':
    case 'right':
      if (game.move(act === 'left' ? -1 : 1)) sound.play('move');
      held.set(act, { t: 0, rep: false });
      break;
    case 'down':
      game.softDrop();
      held.set(act, { t: 0, rep: false });
      break;
    case 'rotate':
    case 'rotateL':
      if (game.rotate(act === 'rotate' ? 1 : -1)) sound.play('rotate');
      break;
    case 'drop':
      onLock(game.hardDrop(), true);
      break;
    case 'flint':
      ignite();
      break;
  }
}

function release(act) {
  held.delete(act);
}

for (const btn of document.querySelectorAll('[data-act]')) {
  const act = btn.dataset.act;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* 未対応 */ }
    btn.classList.add('down');
    press(act);
  });
  const up = () => {
    btn.classList.remove('down');
    release(act);
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, up);
}

const UI = {
  start: requestStart, resume: togglePause, restart: startGame,
  name: () => openName('title'), nameOk: () => closeName(true), nameSkip: () => closeName(false),
};
for (const btn of document.querySelectorAll('[data-ui]')) {
  btn.addEventListener('click', () => {
    sound.unlock();
    UI[btn.dataset.ui]();
  });
}

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate',
  x: 'rotate', X: 'rotate', z: 'rotateL', Z: 'rotateL', ' ': 'drop',
  f: 'flint', F: 'flint', Enter: 'flint', p: 'pause', P: 'pause', Escape: 'pause', m: 'music', M: 'music',
};

window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) {
    if (e.key === 'Enter' && !e.isComposing) closeName(true);
    return;
  }
  const menu = ['title', 'over'].find(id => !$('#' + id).hidden);
  if (menu && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    requestStart();
    return;
  }
  const act = KEYS[e.key];
  if (!act) return;
  e.preventDefault();
  if (!e.repeat) press(act);
});
window.addEventListener('keyup', e => {
  if (e.target instanceof HTMLInputElement) return;
  const act = KEYS[e.key];
  if (act) release(act);
});

window.addEventListener('blur', () => held.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ['play', 'fuse', 'fall'].includes(phase)) togglePause();
});
document.addEventListener('contextmenu', e => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

// ---------- 起動 ----------

setupStatic();
resize();
new ResizeObserver(resize).observe(stage);
showTitle();

let last = performance.now();
function frame(now) {
  let dt = now - last;
  last = now;
  if (dt > 100) dt = 16;
  step(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}
