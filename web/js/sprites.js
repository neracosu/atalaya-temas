// Pixel art definido como codigo: cada sprite es una matriz de caracteres
// que se pinta en un canvas y se convierte en textura de PixiJS (escalado nearest).
import { Texture } from '/vendor/pixi.csp.mjs';

// ---- robot 14x17: cuerpo, cabeza con visor, antena ----
const HEAD = [
  '......a.......',
  '......g.......',
  '...oooooooo...',
  '..oBBBBBBBBo..',
  '..oBvvvvvvBo..',
  '..oBveevveBo..',
  '..oBvvvvvvBo..',
  '..obBBBBBBbo..',
  '...oooooooo...',
];
const HEAD_BLINK = HEAD.map((r, i) => i === 5 ? '..oBvvvvvvBo..' : r);
const BODY = [
  '..oBBhhhhBBo..',
  '.goBBhBBhBBog.',
  '.goBBBBBBBBog.',
  '..obbbbbbbbo..',
  '...oooooooo...',
];
const BODY_WORK_A = [
  '..oBBhhhhBBo..',
  '..oBBhBBhBBogg',
  '.goBBBBBBBBo..',
  '..obbbbbbbbo..',
  '...oooooooo...',
];
const BODY_WORK_B = [
  '..oBBhhhhBBo..',
  'ggoBBhBBhBBo..',
  '..oBBBBBBBBog.',
  '..obbbbbbbbo..',
  '...oooooooo...',
];
const BODY_WAVE = [
  '..oBBhhhhBBo.g',
  '.goBBhBBhBBog.',
  '..oBBBBBBBBo..',
  '..obbbbbbbbo..',
  '...oooooooo...',
];
const LEGS = ['...og....go...', '...oo....oo...', '..............'];
const LEGS_W1 = ['...og.....go..', '..oo......oo..', '..............'];
const LEGS_W2 = ['..og....go....', '..oo....oo....', '..............'];
const LEGS_SIT = ['..oggggggggo..', '..............', '..............'];

export const ROBOT_FRAMES = {
  idle: [[...HEAD, ...BODY, ...LEGS], [...HEAD_BLINK, ...BODY, ...LEGS]],
  walk: [[...HEAD, ...BODY, ...LEGS_W1], [...HEAD, ...BODY, ...LEGS_W2]],
  work: [[...HEAD, ...BODY_WORK_A, ...LEGS], [...HEAD, ...BODY_WORK_B, ...LEGS]],
  wave: [[...HEAD, ...BODY_WAVE, ...LEGS], [...HEAD, ...BODY, ...LEGS]],
  sit: [[...HEAD, ...BODY, ...LEGS_SIT], [...HEAD_BLINK, ...BODY, ...LEGS_SIT]],
};

// ---- invasor 11x8 (ataques SSH) ----
export const INVADER = [
  ['..x.....x..', '...x...x...', '..xxxxxxx..', '.xx.xxx.xx.', 'xxxxxxxxxxx', 'x.xxxxxxx.x', 'x.x.....x.x', '...xx.xx...'],
  ['..x.....x..', 'x..x...x..x', 'x.xxxxxxx.x', 'xxx.xxx.xxx', 'xxxxxxxxxxx', '.xxxxxxxxx.', '..x.....x..', '.x.......x.'],
];

// ---- sobre 9x7 (correo) ----
export const ENVELOPE = ['xxxxxxxxx', 'xx.....xx', 'x.x...x.x', 'x..x.x..x', 'x...x...x', 'x.......x', 'xxxxxxxxx'];

// ---- iconos de estaciones 12x12 ----
export const ICONS = {
  library: [ // libros
    '............', '.rr.bb.gg...', '.rr.bb.gg.yy', '.rr.bb.gg.yy', '.rw.bw.gw.yy', '.rr.bb.gg.yy',
    '.rr.bb.gg.yy', '.rr.bb.gg.yy', '.rr.bb.gg.yy', 'kkkkkkkkkkkk', 'k..........k', '............'],
  workshop: [ // llave y martillo
    '............', '.kk......ss.', 'kkkk....s..s', '.kk.....s..s', '..k......ss.', '..k......s..',
    '..k.....s...', '..k....s....', '..k...s.....', '..k..s......', '..k.........', '............'],
  terminal: [ // monitor con prompt
    '............', 'kkkkkkkkkkkk', 'k..........k', 'k.g........k', 'k..g.......k', 'k.g..ggg...k',
    'k..........k', 'k..........k', 'kkkkkkkkkkkk', '....kkkk....', '..kkkkkkkk..', '............'],
  antenna: [ // antena parabolica
    '.........y..', '........y...', '..kkkk.y....', '.k....ky....', 'k......k....', 'k.....k.....',
    'k....k......', '.k.kk.......', '..kk........', '...k........', '..kkk.......', '.kkkkk......'],
  portal: [ // portal de subagentes
    '....pppp....', '..pp....pp..', '.p..wwww..p.', '.p.w....w.p.', 'p.w......w.p', 'p.w......w.p',
    'p.w......w.p', 'p.w......w.p', '.p.w....w.p.', '.p..wwww..p.', '..pp....pp..', '....pppp....'],
  desk: [ // mesa con taza
    '............', '............', '.........yy.', '........y..y', '.........yy.', 'kkkkkkkkkkkk',
    'k..........k', '.k........k.', '.k........k.', '.k........k.', '.k........k.', '............'],
};
// ---- letreros de edificios 10x10, uno por categoria de servicio ----
export const SIGNS = {
  trophy:   ['yyyyyyyyyy', 'y.yyyyyy.y', 'y.yyyyyy.y', '.yyyyyyyy.', '..yyyyyy..', '...yyyy...', '....yy....', '....yy....', '..yyyyyy..', '..kkkkkk..'],
  shop:     ['...kkkk...', '..k....k..', '..k....k..', 'bbbbbbbbbb', 'bwbbbbbbbb', 'bbbbbbbbbb', 'bbbbbbbbbb', 'bbbbbbbbbb', 'bbbbbbbbbb', '.bbbbbbbb.'],
  hotel:    ['..........', 'k.........', 'k.ww......', 'k.wwrrrrrr', 'kkkkkkkkkk', 'krrrrrrrrk', 'kkkkkkkkkk', 'k........k', 'k........k', '..........'],
  ship:     ['....w.....', '....ww....', '....www...', '....wwww..', '....w.....', 'kkkkkkkkkk', '.kkkkkkkk.', '..kkkkkk..', 'bb.bb.bb.b', '.bb.bb.bb.'],
  chart:    ['..........', '........g.', '.......gg.', '....g..gg.', '...gg..gg.', '...gg.ggg.', '.g.gg.ggg.', '.g.ggggggg', '.ggggggggg', 'kkkkkkkkkk'],
  dice:     ['wwwwwwwwww', 'wkwwwwwwww', 'wwwwwwwwww', 'wwwwwwwwkw', 'wwwwkwwwww', 'wwwwwwwwww', 'wkwwwwwwww', 'wwwwwwwwww', 'wwwwwwwwkw', 'wwwwwwwwww'],
  gear:     ['....kk....', '.k.kkkk.k.', '..kkkkkk..', '.kkk..kkk.', 'kkk....kkk', 'kkk....kkk', '.kkk..kkk.', '..kkkkkk..', '.k.kkkk.k.', '....kk....'],
  heart:    ['..........', '.rr...rr..', 'rrrr.rrrr.', 'rwrrrrrrr.', 'rrrrrrrrr.', '.rrrrrrr..', '..rrrrr...', '...rrr....', '....r.....', '..........'],
  game:     ['..........', '..........', '.kkkkkkkk.', 'kkwkkkkrkk', 'kwwwkkrkrk', 'kkwkkkkrkk', 'kkkkkkkkkk', '.kk....kk.', '..........', '..........'],
  calendar: ['.k......k.', 'rrrrrrrrrr', 'rrrrrrrrrr', 'wwwwwwwwww', 'wkwkwkwkww', 'wwwwwwwwww', 'wkwkwrrkww', 'wwwwwrrwww', 'wkwkwkwkww', 'wwwwwwwwww'],
  bowling:  ['...ww.....', '..wwww....', '..wrrw....', '..wwww....', '...ww.....', '..wwww.kk.', '.wwwwwkkkk', '.wwwwwkkkk', '.wwwww.kk.', '..www.....'],
  clock:    ['...kkkk...', '.kkwwwwkk.', '.kwwwkwwk.', 'kwwwwkwwwk', 'kwwwwkwwwk', 'kwwwwkkkwk', 'kwwwwwwwwk', '.kwwwwwwk.', '.kkwwwwkk.', '...kkkk...'],
  support:  ['...kkkk...', '..k....k..', '.k......k.', '.k......k.', 'bb......bb', 'bb......bb', 'bb......bb', '.......k..', '.....kk...', '..........'],
  chat:     ['..........', '.gggggggg.', 'gggggggggg', 'ggwwgwwggg', 'gggggggggg', 'gggggggggg', '.gggggggg.', '.gg.......', '.g........', '..........'],
  card:     ['..........', 'yyyyyyyyyy', 'yyyyyyyyyy', 'kkkkkkkkkk', 'yyyyyyyyyy', 'ywwwyyyyyy', 'yyyyyyywwy', 'yyyyyyyyyy', '..........', '..........'],
  mail:     ['..........', 'wwwwwwwwww', 'wkwwwwwwkw', 'wwkwwwwkww', 'wwwkwwkwww', 'wwwwkkwwww', 'wwwwwwwwww', 'wwwwwwwwww', 'wwwwwwwwww', '..........'],
  glass:    ['yyyyyyy...', 'wwwwwww.k.', 'yyyyyyykk.', 'yyyyyyy.k.', 'yyyyyyy.k.', 'yyyyyyykk.', 'yyyyyyy...', 'yyyyyyy...', 'yyyyyyy...', '.yyyyy....'],
  wp:       ['...bbbb...', '.bbwwwwbb.', '.bwwwwwwb.', 'bwbwwwwbwb', 'bwbwbbwbwb', 'bwbwbbwbwb', 'bwwbwwbwwb', '.bwwwwwwb.', '.bbwwwwbb.', '...bbbb...'],
  php:      ['..........', '.pppppppp.', 'pppppppppp', 'pwpwpwwpwp', 'pwwwpwpwwp', 'pwppppwppp', 'pwppppwppp', 'pppppppppp', '.pppppppp.', '..........'],
  page:     ['.wwwwww...', '.wkkkkwww.', '.wwwwwwwww', '.wkkkkkkkw', '.wwwwwwwww', '.wkkkkkkkw', '.wwwwwwwww', '.wkkkkkkkw', '.wwwwwwwww', '.wwwwwwwww'],
  wip:      ['..........', 'yyyyyyyyyy', 'ykkyykkyyk', 'kkyykkyykk', 'yyyyyyyyyy', '.k......k.', '.k......k.', '.k......k.', 'kkk....kkk', '..........'],
  db:       ['..kkkkkk..', '.kwwwwwwk.', 'kkwwwwwwkk', 'kbkkkkkkbk', 'kbbbbbbbbk', 'kkbbbbbbkk', 'kbkkkkkkbk', 'kbbbbbbbbk', '.kbbbbbbk.', '..kkkkkk..'],
  cache:    ['.....yy...', '....yy....', '...yy.....', '..yyyyyy..', '.yyyyyyy..', '....yy....', '...yy.....', '..yy......', '.yy.......', '..........'],
  box:      ['..........', 'bbbbbbbbbb', 'bkbkbkbkbb', 'bkbkbkbkbb', 'bkbkbkbkbb', 'bkbkbkbkbb', 'bkbkbkbkbb', 'bbbbbbbbbb', '.k......k.', '..........'],
  web:      ['...bbbb...', '.bbwbbwbb.', '.bwbbbbwb.', 'bwwwwwwwwb', 'bbbwbbwbbb', 'bbbwbbwbbb', 'bwwwwwwwwb', '.bwbbbbwb.', '.bbwbbwbb.', '...bbbb...'],
};

const ICON_COLORS = { r: '#f87171', b: '#60a5fa', g: '#4ade80', y: '#fbbf24', w: '#f8fafc', k: '#cbd5e1', s: '#94a3b8', p: '#c084fc' };

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const m = f < 0 ? 0 : 255, t = Math.abs(f);
  return `rgb(${Math.round(r + (m - r) * t)},${Math.round(g + (m - g) * t)},${Math.round(b + (m - b) * t)})`;
}

// Version DOM (para el panel de detalle): canvas escalado sin suavizado
function paintCanvas(rows, colors, scale) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w * scale; cv.height = h * scale;
  const cx = cv.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = colors[rows[y][x]];
    if (c) { cx.fillStyle = c; cx.fillRect(x * scale, y * scale, scale, scale); }
  }
  return cv;
}
export function signCanvas(name, scale = 4) { return paintCanvas(SIGNS[name] || SIGNS.web, ICON_COLORS, scale); }
export function robotCanvas(color, scale = 4) {
  const colors = { o: '#050814', B: color, b: shade(color, -0.35), h: shade(color, 0.45), v: '#0b1020', e: '#e0f7ff', g: '#94a3b8', a: '#fbbf24' };
  return paintCanvas(ROBOT_FRAMES.idle[0], colors, scale);
}
export function iconCanvas(name, scale = 3) { return paintCanvas(ICONS[name] || ICONS.desk, ICON_COLORS, scale); }

function paint(rows, colors) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = colors[rows[y][x]];
    if (!c) continue;
    cx.fillStyle = c; cx.fillRect(x, y, 1, 1);
  }
  const tex = Texture.from(cv);
  tex.source.scaleMode = 'nearest';
  return tex;
}

const cache = new Map();
export function robotTextures(color) {
  if (cache.has('r' + color)) return cache.get('r' + color);
  const colors = { o: '#050814', B: color, b: shade(color, -0.35), h: shade(color, 0.45), v: '#0b1020', e: '#e0f7ff', g: '#94a3b8', a: '#fbbf24' };
  const out = {};
  for (const [k, frames] of Object.entries(ROBOT_FRAMES)) out[k] = frames.map(f => paint(f, colors));
  cache.set('r' + color, out);
  return out;
}

export function monoTextures(frames, color) {
  const key = 'm' + color + frames[0].join('');
  if (!cache.has(key)) cache.set(key, frames.map(f => paint(f, { x: color })));
  return cache.get(key);
}

export function iconTexture(name) {
  const key = 'i' + name;
  if (!cache.has(key)) cache.set(key, paint(ICONS[name], ICON_COLORS));
  return cache.get(key);
}

export function signTexture(name) {
  const key = 's' + name;
  if (!cache.has(key)) cache.set(key, paint(SIGNS[name] || SIGNS.web, ICON_COLORS));
  return cache.get(key);
}
