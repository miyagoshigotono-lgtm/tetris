// ボタンや表示に使うドット絵アイコン

const LEFT = [
  '............',
  '.....#......',
  '....##......',
  '...###......',
  '..##########',
  '.###########',
  '.###########',
  '..##########',
  '...###......',
  '....##......',
  '.....#......',
  '............',
];

const mirror = rows => rows.map(r => [...r].reverse().join(''));
const transpose = rows => [...rows[0]].map((_, x) => rows.map(r => r[x]).join(''));

const MAPS = {
  left: LEFT,
  right: mirror(LEFT),
  down: transpose(mirror(LEFT)),
  drop: [
    '....####....',
    '....####....',
    '....####....',
    '.##########.',
    '..########..',
    '...######...',
    '....####....',
    '.....##.....',
    '............',
    '.##########.',
    '.##########.',
    '............',
  ],
  pause: [
    '............',
    '..###..###..',
    '..###..###..',
    '..###..###..',
    '..###..###..',
    '..###..###..',
    '..###..###..',
    '..###..###..',
    '..###..###..',
    '..###..###..',
    '..###..###..',
    '............',
  ],
  play: [
    '............',
    '..#.........',
    '..###.......',
    '..#####.....',
    '..#######...',
    '..#########.',
    '..#########.',
    '..#######...',
    '..#####.....',
    '..###.......',
    '..#.........',
    '............',
  ],
  soundOn: [
    '............',
    '.....#......',
    '....##...#..',
    '...###....#.',
    '######.#...#',
    '######..#..#',
    '######..#..#',
    '######.#...#',
    '...###....#.',
    '....##...#..',
    '.....#......',
    '............',
  ],
  music: [
    '............',
    '....#######.',
    '....#######.',
    '....#.....#.',
    '....#.....#.',
    '....#.....#.',
    '....#.....#.',
    '..###...###.',
    '.####..####.',
    '.####..####.',
    '..##....##..',
    '............',
  ],
  soundOff: [
    '............',
    '.....#......',
    '....##......',
    '...###.#...#',
    '######..#.#.',
    '######...#..',
    '######..#.#.',
    '######.#...#',
    '...###......',
    '....##......',
    '.....#......',
    '............',
  ],
};

const ART = {
  flint: {
    // 右上が鋼（かぎ形）、左下が火打ち石のかけら
    pal: { a: '#4a4a4a', b: '#e6e6e6', s: '#9a9a9a', c: '#111111', d: '#2e2e2e', e: '#5a5a5a' },
    rows: [
      '................',
      '.......abbbbba..',
      '......absssssba.',
      '......bsa...asb.',
      '......ba.....sb.',
      '.......a.....sb.',
      '.............sb.',
      '............asb.',
      '....c......asba.',
      '...cec....abba..',
      '..ceedc...aaa...',
      '.ceeddc.........',
      '.cedddc.........',
      '..cdddc.........',
      '...cdc..........',
      '....c...........',
    ],
  },
  emerald: {
    pal: { k: '#064a1e', G: '#9dffb6', g: '#17dd62', d: '#0a9e3f' },
    rows: [
      '...kkk...',
      '..kGgdk..',
      '.kGGggdk.',
      'kGGgggddk',
      'kGggggddk',
      'kgggggddk',
      '.kgggddk.',
      '..kgddk..',
      '...kkk...',
    ],
  },
  crown: {
    pal: { y: '#ffd83d', r: '#e8312a', d: '#c99400' },
    rows: [
      'y...y...y',
      'yy.yyy.yy',
      'yyyyyyyyy',
      'yryyryyry',
      'yyyyyyyyy',
      'ddddddddd',
    ],
  },
};

export function pixelCanvas(rows, pal = { '#': '#ffffff' }) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!pal[ch]) return;
    g.fillStyle = pal[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return c;
}

// 時計回りの矢印。小さなキャンバスに線で描いてから二値化してドット絵にする
function rotateIcon() {
  const s = 14;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const cx = 7, cy = 7.5, r = 4.4, end = -0.75 * Math.PI;
  g.strokeStyle = g.fillStyle = '#fff';
  g.lineWidth = 2.4;
  g.beginPath();
  g.arc(cx, cy, r, -0.2 * Math.PI, end + 2 * Math.PI);
  g.stroke();
  const px = cx + r * Math.cos(end), py = cy + r * Math.sin(end);
  const dx = -Math.sin(end), dy = Math.cos(end);    // 進む向き
  const nx = Math.cos(end), ny = Math.sin(end);     // 外向き
  g.beginPath();
  g.moveTo(px + dx * 3.2, py + dy * 3.2);
  g.lineTo(px + nx * 3, py + ny * 3);
  g.lineTo(px - nx * 3, py - ny * 3);
  g.closePath();
  g.fill();
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const on = img.data[i + 3] > 110;
    img.data.set(on ? [255, 255, 255, 255] : [0, 0, 0, 0], i);
  }
  g.putImageData(img, 0, 0);
  return c;
}

const cache = {};

export function icon(name) {
  if (!cache[name]) {
    if (name === 'rotate' || name === 'retry') cache[name] = rotateIcon();
    else if (ART[name]) cache[name] = pixelCanvas(ART[name].rows, ART[name].pal);
    else cache[name] = pixelCanvas(MAPS[name]);
  }
  return cache[name];
}

export function iconURL(name) {
  return icon(name).toDataURL();
}
