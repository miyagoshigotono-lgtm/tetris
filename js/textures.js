// マイクラ風 16×16 ドット絵を RGBA 配列で生成する（DOM 非依存：ゲーム本体とアイコン生成で共用）

export const TEX = 16;

// 破片パーティクルの色
export const TYPE_COLORS = {
  I: '#4aedd9', J: '#3159c4', L: '#b8945f', O: '#f8d94a',
  S: '#6cae3e', T: '#a77ce3', Z: '#c41e10', X: '#db3b26',
};

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function blank() {
  return { w: TEX, h: TEX, data: new Uint8ClampedArray(TEX * TEX * 4) };
}

function put(img, x, y, hex) {
  const [r, g, b] = rgb(hex);
  img.data.set([r, g, b, 255], (y * img.w + x) * 4);
}

function pick(rand, colors) {
  return colors[Math.floor(rand() * colors.length)];
}

function noise(img, rand, colors) {
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) put(img, x, y, pick(rand, colors));
}

function shade(img, x, y, f) {
  const i = (y * img.w + x) * 4;
  for (let k = 0; k < 3; k++) img.data[i + k] = img.data[i + k] * f;
}

function bevel(img, light, dark) {
  for (let i = 0; i < TEX; i++) {
    shade(img, i, 0, light);
    shade(img, 0, i, light);
    shade(img, i, TEX - 1, dark);
    shade(img, TEX - 1, i, dark);
  }
}

function sprinkle(img, rand, n, color) {
  for (let i = 0; i < n; i++) put(img, 1 + Math.floor(rand() * 14), 1 + Math.floor(rand() * 14), color);
}

const STONE = ['#8a8a8a', '#7f7f7f', '#757575', '#949494', '#7f7f7f'];
const DIRT = ['#866043', '#6c4b32', '#9a7050', '#7a5538', '#5d3f29'];
const GRASS = ['#6cae3e', '#5e9b34', '#7fc24b', '#64a538'];

const BUILDERS = {
  // ダイヤ鉱石
  I(r) {
    const img = blank();
    noise(img, r, STONE);
    const blob = [[0, 0, '#c9fff4'], [1, 0, '#4aedd9'], [0, 1, '#4aedd9'], [1, 1, '#2bb7b0'], [2, 1, '#1d8c8c'], [1, 2, '#1d8c8c']];
    for (const [bx, by] of [[2, 2], [9, 2], [5, 8], [11, 10], [1, 12], [12, 5]]) {
      for (const [dx, dy, c] of blob) {
        const x = bx + dx, y = by + dy;
        if (x < TEX && y < TEX) put(img, x, y, c);
      }
    }
    return img;
  },
  // ラピスラズリブロック
  J(r) {
    const img = blank();
    noise(img, r, ['#2547a3', '#1f3d8f', '#2b52b8', '#22439b']);
    sprinkle(img, r, 14, '#6a8ff0');
    sprinkle(img, r, 10, '#16306e');
    bevel(img, 1.25, 0.7);
    return img;
  },
  // オークの板材
  L(r) {
    const img = blank();
    const seams = [11, 4, 13, 7];
    for (let y = 0; y < TEX; y++) {
      for (let x = 0; x < TEX; x++) {
        let c;
        if (y % 4 === 3) c = '#6f5532';
        else if (x === seams[y >> 2]) c = '#7d6038';
        else c = pick(r, ['#b8945f', '#ad8a55', '#c29e66', '#b08c58']);
        put(img, x, y, c);
      }
    }
    return img;
  },
  // 金ブロック
  O(r) {
    const img = blank();
    noise(img, r, ['#f8d94a', '#fbe26a', '#f5cf3b', '#efc534']);
    bevel(img, 1.2, 0.72);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [4, 2], [2, 4]]) put(img, x, y, '#fff6b0');
    return img;
  },
  // 草ブロック（側面）
  S(r) {
    const img = blank();
    for (let y = 0; y < TEX; y++) {
      for (let x = 0; x < TEX; x++) {
        const green = y < 3 || (y === 3 && r() < 0.6) || (y === 4 && r() < 0.25);
        put(img, x, y, pick(r, green ? GRASS : DIRT));
      }
    }
    return img;
  },
  // アメジストブロック
  T(r) {
    const img = blank();
    noise(img, r, ['#8b5fc6', '#9b6fd6', '#7a52b5', '#a77ce3']);
    sprinkle(img, r, 12, '#e2c6ff');
    sprinkle(img, r, 10, '#5c3d91');
    bevel(img, 1.15, 0.75);
    return img;
  },
  // レッドストーンブロック
  Z(r) {
    const img = blank();
    noise(img, r, ['#a3160b', '#b81a0d', '#8f1308', '#c41e10']);
    sprinkle(img, r, 14, '#ec4a2f');
    sprinkle(img, r, 10, '#6b0d05');
    bevel(img, 1.2, 0.7);
    return img;
  },
  // TNT（側面）
  X(r) {
    const img = blank();
    const letters = ['###.#..#.###', '.#..##.#..#.', '.#..#.##..#.', '.#..#..#..#.'];
    for (let y = 0; y < TEX; y++) {
      for (let x = 0; x < TEX; x++) {
        let c;
        if (y < 4 || y > 11) c = x % 4 === 3 ? '#9e1f10' : pick(r, ['#db3b26', '#c9301c', '#e85a40']);
        else if (y === 4 || y === 11) c = '#b5b5b5';
        else {
          c = r() < 0.2 ? '#dedede' : '#f2f2f2';
          const ly = y - 6, lx = x - 2;
          if (ly >= 0 && ly < 4 && lx >= 0 && lx < 12 && letters[ly][lx] === '#') c = '#1c1c1c';
        }
        put(img, x, y, c);
      }
    }
    return img;
  },
  // 土（背景）
  D(r) {
    const img = blank();
    noise(img, r, DIRT);
    return img;
  },
  // 深層岩（盤面の背景）
  B(r) {
    const img = blank();
    noise(img, r, ['#2f2f35', '#29292e', '#34343b', '#2c2c31']);
    return img;
  },
};

export const TEXTURE_NAMES = Object.keys(BUILDERS);

export function makeTexture(name) {
  const seed = [...name].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) * 9973;
  return BUILDERS[name](mulberry32(seed));
}
