/*
 * 忌み言葉 3D
 * ゲームの仕組みと物語は 2D 版（imikotoba.html）と同じ処理をそのまま使い、描画だけを 3D にしている。
 * 台詞・言葉・難易度は config3d.js で変えられる（2D 版の旧ストーリー）。
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = id => document.getElementById(id);
const CFG = window.GAME_CONFIG;
if (!CFG) {
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error').textContent = '設定ファイル config3d.js を読み込めませんでした。imikotoba3d.html と同じフォルダに config3d.js を置いてください。';
  throw new Error('config3d.js が読み込めません');
}
const TX = CFG.text, UI = CFG.text.ui, ST = CFG.stalker;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const END = Symbol('end');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hsh(x, y, s) { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }

/* ---------- 言葉 ---------- */
const WORD = Object.fromEntries(CFG.words.map(w => [w.sato, w]));
// {y:火} → 山言葉、{l:火} → 語源
function fill(s) {
  return s.replace(/\{([yl]):([^}]+)\}/g, (m, k, w) => {
    const o = WORD[w]; if (!o) return m;
    return (k === 'y' ? o.yama : o.latin) || m;
  });
}
// 喰われた言葉を ■ にする
function T(s) {
  if (!s) return '';
  s = fill(s);
  for (const w of S.eaten) for (const p of WORD[w].eat) s = s.split(p).join('■'.repeat(p.length));
  return s;
}
function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmt(s) { return esc(s).replace(/■+/g, m => `<span class="eaten">${m}</span>`); }

/* ---------- マップ ---------- */
function grid(w, h, ch) { return Array.from({ length: h }, () => Array(w).fill(ch)); }

function buildVillage() {
  const W = 30, H = 19, g = grid(W, H, '.');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, W - 1 - x, y, H - 1 - y);
    if (e === 0 || (e === 1 && hsh(x, y, 1) < .7) || (e === 2 && hsh(x, y, 2) < .3)) g[y][x] = '#';
  }
  for (let x = 0; x < W; x++) { g[0][x] = '#'; g[1][x] = '#'; }
  for (const [x, y] of [[3, 15], [10, 16], [20, 16], [26, 3], [11, 11], [19, 12], [3, 9], [27, 7], [17, 11], [12, 3], [9, 15]]) g[y][x] = '#';
  const path = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ','; };
  path(14, 0, 15, 17); path(7, 8, 21, 8); path(15, 15, 25, 15); path(6, 13, 14, 13);
  path(7, 7, 7, 8); path(21, 7, 21, 8); path(25, 13, 25, 15); path(5, 12, 5, 13);
  g[1][14] = 'G'; g[1][15] = 'G';
  const house = (x, y, w, doorX, wins) => {
    for (let i = 0; i < w; i++) { g[y][x + i] = 'T'; g[y + 1][x + i] = wins.includes(i) ? 'W' : 'H'; g[y + 2][x + i] = 'H'; }
    g[y + 2][doorX] = 'D';
  };
  house(5, 4, 5, 7, [1, 3]);    // 源造の家
  house(19, 4, 4, 21, [1]);     // 空き家
  house(23, 10, 5, 25, [1, 3]); // 民宿
  g[11][5] = 'S';               // 祠
  for (const [x, y] of [[27, 13], [26, 13], [27, 14], [26, 14], [8, 7], [7, 12], [6, 12]]) g[y][x] = '.';
  return g;
}

function carve(g, pts, rad, seed) {
  const W = g[0].length, H = g.length;
  const walk = fn => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
      for (let s = 0; s <= n; s++) fn(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n);
    }
  };
  walk((cx, cy) => {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++)
      for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 2); x++) {
        if (y < 0 || y >= H || x < 0 || x >= W) continue;
        const d = Math.hypot(x + .5 - (cx + 1), y - cy);
        if (d <= rad + (hsh(x, y, seed) - .5) * 1.2 && g[y][x] === '#') g[y][x] = '.';
      }
  });
  walk((cx, cy) => {
    const px = Math.round(cx), py = Math.round(cy);
    if (py >= 0 && py < H) { g[py][px] = ','; g[py][px + 1] = ','; }
  });
}

function buildMountain() {
  const W = 26, H = 40, g = grid(W, H, '#');
  carve(g, [[12, 39], [12, 34], [9, 30], [12, 25], [16, 21], [14, 17], [8, 14], [11, 10], [12, 7], [12, 0]], 2.6, 7);
  for (const [x, y, c] of [[7, 30, 'R'], [17, 22, 'R'], [10, 15, 'R'], [7, 26, '~'], [8, 26, '~'], [8, 27, '~']]) if (g[y][x] === '.') g[y][x] = c;
  for (let y = 4; y <= 6; y++) for (let x = 8; x <= 11; x++) g[y][x] = 'K';
  g[6][10] = 'D';
  g[7][10] = '.';
  return g;
}

function buildOku() {
  const W = 30, H = 30, g = grid(W, H, '.');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x - 14.5) / 13.5, ny = (y - 15) / 14.5;
    const r = nx * nx + ny * ny + (hsh(x, y, 3) - .5) * .25;
    if (r > 1 || hsh(x, y, 4) < .11) g[y][x] = '#';
  }
  const clear = (cx, cy, r) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - cx, y - cy) <= r) g[y][x] = '.'; };
  clear(14.5, 27, 2); clear(14.5, 3, 3); clear(5, 12, 1.6); clear(24, 10, 1.6);
  for (let y = 26; y < H; y++) { g[y][14] = ','; g[y][15] = ','; }
  g[2][14] = 'A'; g[2][15] = 'A'; g[12][5] = 'B'; g[10][24] = 'X';
  return g;
}

const BUILDERS = { village: buildVillage, mountain: buildMountain, oku: buildOku };
const MAPS = {};
for (const [id, conf] of Object.entries(CFG.maps)) {
  const M = Object.assign({}, conf, { g: BUILDERS[id]() });
  M.h = M.g.length; M.w = M.g[0].length; M.lights = [];
  M.g.forEach((row, y) => row.forEach((c, x) => { if (c === 'W') M.lights.push([x * 16 + 8, y * 16 + 10]); }));
  MAPS[id] = M;
}
const ACTORS = CFG.actors;
const SOLID = new Set(['#', 'H', 'T', 'W', 'D', 'S', 'K', 'A', 'B', 'X', '~', 'R']);
const visibleActors = () => ACTORS[S.map].filter(a => !(a.night === 'hide' && S.flags.night));

/* ---------- 状態 ---------- */
let S;
function newState() {
  return {
    map: 'village', x: 0, y: 0, dir: 0, step: 0, moving: false,
    // known: 里の言葉 → true（意味がわかる）／'unknown'（山言葉だけ聞いた）
    flags: {}, eaten: [], known: {}, clues: {}, goal: '',
    presence: 0, possess: 0, breath: 100, holding: false, gasp: false, detect: 0, hbT: 0,
    busy: false, over: false, started: false, nearId: null, shake: 0,
    dog: { active: false, away: false, x: 0, y: 0, face: 1 }, ent: null, t: 0,
  };
}

/* ---------- 3D: 描画の土台 ---------- */
// 2D 版の座標（1 マス 16px）をそのまま使い、1px = 0.125m として 3D に置く
const U = 1 / 8, TILE = 2, PAD = 9;
const QKEY = 'imikotoba3d.quality';
let quality = 'high';
try { quality = localStorage.getItem(QKEY) || (matchMedia('(pointer: coarse)').matches ? 'low' : 'high'); } catch (e) {}

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.setSize(innerWidth, innerHeight);
$('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
scene.fog = new THREE.FogExp2(0x06080d, 0.05);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 140);

const hemi = new THREE.HemisphereLight(0x4a5674, 0x0b0b10, 0.4);
const moon = new THREE.DirectionalLight(0xa8b8d8, 0.3);
moon.position.set(-30, 50, -20);
const lantern = new THREE.PointLight(0xffb066, 30, 14, 1.7);
lantern.shadow.camera.near = 0.2; lantern.shadow.camera.far = 18;
lantern.shadow.bias = -0.002; lantern.shadow.normalBias = 0.03;
const entLight = new THREE.PointLight(0xff2a2a, 0, 5, 2);
const winLights = Array.from({ length: 4 }, () => new THREE.PointLight(0xffa860, 0, 9, 1.8));
scene.add(hemi, moon, moon.target, lantern, entLight, ...winLights);

/* ---------- 3D: 画面効果（フィルム調） ---------- */
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.075 }, sepia: { value: 0.34 },
    vig: { value: 1.0 }, danger: { value: 0 }, hold: { value: 0 }, cold: { value: 0 }, aberr: { value: 0.0016 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, grain, sepia, vig, danger, hold, cold, aberr; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 13.17) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5; float d = length(c);
      float ab = aberr * (1.0 + danger * 3.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + c * ab).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * ab).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l * 1.08, l * 0.97, l * 0.82), sepia);
      col = mix(col, col * vec3(0.72, 0.88, 1.18), cold * 0.6);
      col += (rnd(uv * vec2(1.3, 0.7)) - 0.5) * grain;
      col *= 0.975 + 0.025 * sin(time * 50.0 + uv.y * 4.0);
      col *= 1.0 - vig * smoothstep(0.32, 0.85, d);
      col = mix(col, vec3(0.42, 0.0, 0.0), clamp(danger, 0.0, 0.85) * smoothstep(0.22, 0.8, d));
      col *= 1.0 - hold * 0.6 * smoothstep(0.12, 0.7, d);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const film = new ShaderPass(FilmShader);
composer.addPass(film);

function applyQuality(q) {
  quality = q;
  try { localStorage.setItem(QKEY, q); } catch (e) {}
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 1.5 : q === 'mid' ? 1 : 0.75));
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  const sh = q !== 'low';
  renderer.shadowMap.enabled = sh;
  lantern.castShadow = sh;
  lantern.shadow.mapSize.set(q === 'high' ? 1024 : 512, q === 'high' ? 1024 : 512);
  if (lantern.shadow.map) { lantern.shadow.map.dispose(); lantern.shadow.map = null; }
  bloom.enabled = q !== 'low';
  scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

/* ---------- 3D: テクスチャ ---------- */
function canvasTex(w, h, draw, opt = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (opt.color !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opt.repeat[0], opt.repeat[1]); }
  t.anisotropy = 8;
  return t;
}
// 継ぎ目のない値ノイズ
function tileNoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a, b) => hsh(((a % p) + p) % p, ((b % p) + p) % p, s);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function normalTex(size, amp, seed) {
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, a = 0.5, f = 8;
    for (let o = 0; o < 4; o++) { s += a * tileNoise(x / size * f, y / size * f, f, seed + o); a *= 0.5; f *= 2; }
    hgt[y * size + x] = s;
  }
  return canvasTex(size, size, (g) => {
    const img = g.createImageData(size, size);
    const H = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let nx = (H(x - 1, y) - H(x + 1, y)) * amp, ny = (H(x, y - 1) - H(x, y + 1)) * amp, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { color: false, repeat: [1, 1] });
}
const strokes = (g, w, h, n, colors, len, wid, vertical = true) => {
  for (let i = 0; i < n; i++) {
    g.strokeStyle = colors[i % colors.length]; g.lineWidth = wid * (0.5 + Math.random());
    const x = Math.random() * w, y = Math.random() * h, l = len * (0.5 + Math.random());
    g.beginPath(); g.moveTo(x, y);
    if (vertical) g.lineTo(x + (Math.random() - 0.5) * 3, y + l); else g.lineTo(x + l, y + (Math.random() - 0.5) * 3);
    g.stroke();
  }
};
const TEX = {};
function initTextures() {
  TEX.snowN = normalTex(256, 3.2, 11);
  TEX.wood = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3a2c21'; g.fillRect(0, 0, w, h);
    strokes(g, w, h, 500, ['#2c2119', '#46372a', '#33271d'], 60, 1.2);
    g.fillStyle = '#1b130e'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
  }, { repeat: [1, 1] });
  TEX.logs = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3b3027'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      const gr = g.createLinearGradient(0, y, 0, y + 32);
      gr.addColorStop(0, '#2a211a'); gr.addColorStop(0.5, '#4a3c30'); gr.addColorStop(1, '#1e1712');
      g.fillStyle = gr; g.fillRect(0, y, w, 32);
    }
    strokes(g, w, h, 300, ['rgba(20,14,10,.5)', 'rgba(90,70,55,.3)'], 70, 1, false);
  }, { repeat: [1, 1] });
  TEX.thatch = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3c3022'; g.fillRect(0, 0, w, h);
    strokes(g, w, h, 2600, ['#2a2117', '#55452f', '#463826', '#1d1710'], 22, 1.4);
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < h; y += 28) g.fillRect(0, y, w, 3);
  }, { repeat: [3, 2] });
  TEX.shoji = canvasTex(128, 96, (g, w, h) => {
    g.fillStyle = '#efe2c4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a1e14';
    for (let x = 0; x <= w; x += 21) g.fillRect(Math.min(x, w - 3), 0, 3, h);
    for (let y = 0; y <= h; y += 24) g.fillRect(0, Math.min(y, h - 3), w, 3);
  });
  TEX.door = canvasTex(128, 192, (g, w, h) => {
    g.fillStyle = '#1a120d'; g.fillRect(0, 0, w, h);
    strokes(g, w, h, 120, ['#24190f', '#120c08'], 50, 1);
    g.strokeStyle = '#3a2a1c'; g.lineWidth = 3;
    for (let x = 16; x < w; x += 24) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, h - 8); g.stroke(); }
    g.strokeRect(4, 4, w - 8, h - 8);
  });
  TEX.stone = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5c5f66'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '30,32,36' : '140,144,150'},${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, { repeat: [1, 1] });
  TEX.carved = canvasTex(160, 480, (g, w, h) => {
    g.fillStyle = '#5f6268'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '30,32,36' : '150,154,160'},${Math.random() * 0.2})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = 'rgba(25,26,30,.85)'; g.font = '34px "Zen Antique","Shippori Mincho",serif'; g.textAlign = 'center';
    const cols = ['寛永十三年', '此処ニ■夜ヲ封ズ'];
    cols.forEach((t, ci) => { [...t].forEach((ch, i) => g.fillText(ch, w * (ci === 0 ? 0.68 : 0.36), 60 + i * 44)); });
  });
  TEX.ice = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#121b26'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160,185,210,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 14; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
  });
  TEX.flake = canvasTex(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  });
  TEX.hair = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w; if (Math.random() < 0.18) continue;
      g.strokeStyle = `rgba(5,5,7,${0.6 + Math.random() * 0.4})`; g.lineWidth = 1 + Math.random() * 2.5;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (Math.random() - 0.5) * 20, h * 0.4, x + (Math.random() - 0.5) * 30, h * 0.7, x + (Math.random() - 0.5) * 24, h * (0.75 + Math.random() * 0.25)); g.stroke();
    }
  }, { repeat: [3, 1] });
  TEX.fringe = canvasTex(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w; if (x > w * 0.3 && x < w * 0.7 && Math.random() < 0.55) continue;
      g.strokeStyle = `rgba(4,4,6,${0.7 + Math.random() * 0.3})`; g.lineWidth = 1 + Math.random() * 2;
      g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (Math.random() - 0.5) * 14, h * 0.5, x + (Math.random() - 0.5) * 18, h * (0.6 + Math.random() * 0.4)); g.stroke();
    }
  });
  const eyes = (g, w, h, bg) => {
    for (const ey of [0.34, 0.45, 0.56]) for (const ex of [0.22, 0.41, 0.59, 0.78]) {
      const x = ex * w + (Math.random() - 0.5) * 4, y = ey * h + (Math.random() - 0.5) * 4;
      if (bg) { g.fillStyle = 'rgba(40,20,20,.9)'; g.beginPath(); g.ellipse(x, y, 7, 5, 0, 0, Math.PI * 2); g.fill(); }
      const gr = g.createRadialGradient(x, y, 0, x, y, 5); gr.addColorStop(0, '#ff6a5a'); gr.addColorStop(0.5, '#e01818'); gr.addColorStop(1, 'rgba(120,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    }
  };
  TEX.face = canvasTex(128, 160, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.5, w * 0.7);
    gr.addColorStop(0, '#d8d0c6'); gr.addColorStop(1, '#8a8278');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    eyes(g, w, h, true);
    g.fillStyle = '#1a0c0c'; g.beginPath(); g.ellipse(w / 2, h * 0.8, 16, 4, 0, 0, Math.PI * 2); g.fill();
  });
  TEX.eyes = canvasTex(128, 160, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); eyes(g, w, h, false); });
}

/* ---------- 3D: 素材 ---------- */
// カメラと主人公のあいだに入った木や家を、点描で抜いて主人公を見せる
const CUT = { uCam: { value: new THREE.Vector3() }, uTgt: { value: new THREE.Vector3() } };
function cutaway(m) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uCam = CUT.uCam; sh.uniforms.uTgt = CUT.uTgt;
    sh.vertexShader = 'varying vec3 vCutW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 cutW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cutW = instanceMatrix * cutW;
      #endif
      vCutW = (modelMatrix * cutW).xyz;`);
    sh.fragmentShader = 'uniform vec3 uCam; uniform vec3 uTgt; varying vec3 vCutW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      {
        vec3 ab = uTgt - uCam; float t = clamp(dot(vCutW - uCam, ab) / dot(ab, ab), 0.0, 1.0);
        float dd = length(vCutW - (uCam + ab * t));
        float k = max(smoothstep(3.4, 1.4, dd) * smoothstep(0.93, 0.7, t), smoothstep(5.5, 2.5, distance(vCutW, uCam)));
        float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        if (n < k) discard;
      }`);
  };
  m.customProgramCacheKey = () => 'cutaway';
  return m;
}
const MAT = {};
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.88 }, o));
function initMaterials() {
  MAT.tree = cutaway(std(0xffffff, { vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  MAT.vc = cutaway(std(0xffffff, { vertexColors: true, roughness: 0.9 }));
  MAT.thatch = cutaway(std(0xffffff, { map: TEX.thatch, roughness: 1 }));
  MAT.snowCap = cutaway(std(0xdfe4ec, { roughness: 0.9, normalMap: TEX.snowN }));
  MAT.darkWood = cutaway(std(0x24190f, { roughness: 0.9 }));
  MAT.stone = cutaway(std(0x8a8d94, { map: TEX.stone, roughness: 0.95 }));
  MAT.door = std(0xffffff, { map: TEX.door, roughness: 0.9 });
  MAT.shojiLit = std(0x40362a, { map: TEX.shoji, emissive: 0xffa860, emissiveMap: TEX.shoji, emissiveIntensity: 1.7 });
  MAT.shojiDark = std(0x1c1813, { map: TEX.shoji, roughness: 0.95 });
  MAT.rope = cutaway(std(0xb39a6a, { roughness: 1 }));
  MAT.paper = std(0xf0eee6, { side: THREE.DoubleSide, roughness: 0.8 });
  MAT.redCloth = std(0x7a1717, { roughness: 1 });
  MAT.ice = std(0xffffff, { map: TEX.ice, roughness: 0.12, metalness: 0.3 });
  MAT.carved = std(0xffffff, { map: TEX.carved, roughness: 0.95 });
}

/* ---------- 3D: 形 ---------- */
function paint(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const col = fn(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
let TREE_GEO;
function treeGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.27, 6.5, 7, 1, true); trunk.translate(0, 3.25, 0);
  parts.push(paint(trunk, () => [0.12, 0.085, 0.065]));
  for (let i = 0; i < 6; i++) {
    const r = 1.95 - i * 0.28, h = 2.3, y = 2.0 + i * 1.08;
    const cone = new THREE.ConeGeometry(r, h, 9, 2, true); cone.translate(0, y + h / 2, 0);
    const p = cone.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) < y + 0.05) {
      const s = 0.85 + Math.random() * 0.3; p.setX(k, p.getX(k) * s); p.setZ(k, p.getZ(k) * s); p.setY(k, p.getY(k) - Math.random() * 0.4);
    }
    parts.push(paint(cone, (x, yy) => {
      const t = (yy - y) / h, s = Math.max(0, Math.min(1, (t - 0.3) * 1.5)) * 0.5 + Math.random() * 0.12;
      return [0.04 + 0.74 * s, 0.07 + 0.73 * s, 0.05 + 0.79 * s];
    }));
  }
  const geo = mergeGeometries(parts); geo.computeVertexNormals();
  return geo;
}
function rockGeometry(r, seed, snowY = 0.35) {
  const geo = new THREE.IcosahedronGeometry(r, 2);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 0.78 + 0.35 * tileNoise(v.x * 1.7 + 5, v.z * 1.7 + v.y, 64, seed);
    v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const nr = geo.attributes.normal;
  return paint(geo, (x, y, z, i) => nr.getY(i) > snowY ? [0.8, 0.82, 0.86] : [0.3, 0.31, 0.33]);
}

/* ---------- 3D: 人物 ---------- */
const LOOK3 = {
  player: { coat: 0x262c3d, acc: 0x9a2426, hair: 0x121216, skin: 0xe2cfb9, leg: 0x15171f, scarf: true },
  fumi: { coat: 0x4a2b40, acc: 0xb9b2a2, hair: 0x141010, skin: 0xd9c4ad, leg: 0x2a1a26, kimono: true, bun: true, scale: 0.95 },
  genzo: { coat: 0x5a4a36, acc: 0x3a2f22, hair: 0xcfcfcf, skin: 0xc9ad8f, leg: 0x2a231b, hunch: 0.22, scale: 0.94 },
  yuki: { coat: 0xd8d8de, acc: 0x8a2222, hair: 0x08080a, skin: 0xe8ded3, leg: 0xc9c9d0, kimono: true, long: true, scale: 0.8 },
};
function makePerson(look) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const m = { coat: std(look.coat), acc: std(look.acc), hair: std(look.hair, { roughness: 0.6 }), skin: std(look.skin, { roughness: 0.7 }), leg: std(look.leg) };
  const add = (geo, mat, x, y, z, parent = body) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const limb = (x, y, len, r, mat) => { const p = new THREE.Group(); p.position.set(x, y, 0); add(new THREE.CylinderGeometry(r, r * 0.85, len, 8), mat, 0, -len / 2, 0, p); body.add(p); return p; };
  const legL = limb(-0.1, 0.8, 0.8, 0.075, m.leg), legR = limb(0.1, 0.8, 0.8, 0.075, m.leg);
  if (look.kimono) add(new THREE.CylinderGeometry(0.19, 0.29, 1.25, 14), m.coat, 0, 0.72, 0);
  add(new THREE.CylinderGeometry(0.2, look.kimono ? 0.25 : 0.31, look.kimono ? 0.68 : 1.0, 14), m.coat, 0, look.kimono ? 1.13 : 0.97, 0);
  add(new THREE.CylinderGeometry(0.215, 0.215, look.kimono ? 0.16 : 0.1, 14), m.acc, 0, look.kimono ? 0.98 : 1.42, 0);
  if (look.scarf) { const s = add(new THREE.BoxGeometry(0.1, 0.42, 0.04), m.acc, 0.09, 1.25, 0.2); s.rotation.z = 0.1; }
  const armL = limb(-0.27, 1.42, 0.62, 0.06, m.coat), armR = limb(0.27, 1.42, 0.62, 0.06, m.coat);
  add(new THREE.SphereGeometry(0.13, 16, 12), m.skin, 0, 1.6, 0);
  add(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m.hair, 0, 1.62, -0.01);
  if (look.bun) add(new THREE.SphereGeometry(0.08, 10, 8), m.hair, 0, 1.68, -0.13);
  if (look.long) { const h = add(new THREE.CylinderGeometry(0.15, 0.17, 0.45, 14, 1, true, Math.PI * 0.2, Math.PI * 1.6), m.hair, 0, 1.45, -0.01); h.rotation.y = Math.PI; h.material = std(look.hair, { roughness: 0.6, side: THREE.DoubleSide }); }
  for (const x of [-0.045, 0.045]) add(new THREE.SphereGeometry(0.014, 6, 6), std(0x0a0a0a), x, 1.61, 0.12);
  if (look.hunch) body.rotation.x = look.hunch;
  g.scale.setScalar(look.scale || 1);
  return { g, legL, legR, armL, armR };
}
function makeDog() {
  const g = new THREE.Group(), k = std(0x0c0c0e, { roughness: 0.7 });
  const add = (geo, x, y, z) => { const o = new THREE.Mesh(geo, k); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.55, 0.24, 0.22), 0, 0.42, 0);
  add(new THREE.BoxGeometry(0.2, 0.18, 0.17), 0.32, 0.56, 0);
  add(new THREE.BoxGeometry(0.12, 0.08, 0.1), 0.45, 0.52, 0);
  for (const z of [-0.05, 0.05]) { const e = add(new THREE.ConeGeometry(0.035, 0.09, 4), 0.3, 0.69, z); e.rotation.z = -0.2; }
  const legs = [];
  for (const [x, z] of [[-0.2, -0.07], [-0.2, 0.07], [0.2, -0.07], [0.2, 0.07]]) legs.push(add(new THREE.BoxGeometry(0.06, 0.32, 0.06), x, 0.16, z));
  const tail = add(new THREE.BoxGeometry(0.22, 0.05, 0.05), -0.36, 0.55, 0); tail.rotation.z = 0.6;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), std(0xc9a24a, { emissive: 0x6a4a10 }));
  eye.position.set(0.42, 0.6, 0.06); g.add(eye);
  return { g, legs, tail };
}
function makeEnt() {
  const g = new THREE.Group(), mats = [];
  const M = (color, o = {}) => { const mm = std(color, Object.assign({ transparent: true }, o)); mats.push(mm); return mm; };
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  const prof = [[0.52, 0], [0.43, 0.3], [0.35, 0.85], [0.29, 1.3], [0.26, 1.6], [0.19, 1.74], [0.08, 1.82], [0.0, 1.84]].map(([r, y]) => new THREE.Vector2(r, y));
  const robe = new THREE.LatheGeometry(prof, 22);
  const p = robe.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.05) p.setY(i, p.getY(i) + Math.random() * 0.22);
  robe.computeVertexNormals();
  add(robe, M(0xd6d4cf, { emissive: 0x2a303c, side: THREE.DoubleSide }), 0, 0, 0);
  add(new THREE.SphereGeometry(0.13, 16, 12), M(0xcfc7be), 0, 1.98, 0);
  add(new THREE.PlaneGeometry(0.22, 0.28), M(0xffffff, { map: TEX.face, emissiveMap: TEX.eyes, emissive: 0xff2020, emissiveIntensity: 2.2, roughness: 0.6 }), 0, 1.96, 0.125);
  add(new THREE.SphereGeometry(0.145, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), M(0x050506, { roughness: 0.5 }), 0, 1.99, -0.012);
  add(new THREE.CylinderGeometry(0.135, 0.34, 1.5, 26, 1, true), M(0x050506, { map: TEX.hair, alphaMap: null, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5 }), 0, 1.36, -0.02);
  add(new THREE.PlaneGeometry(0.32, 0.95), M(0x050506, { map: TEX.fringe, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5 }), 0, 1.62, 0.17);
  for (const s of [-1, 1]) {
    const sl = add(new THREE.CylinderGeometry(0.07, 0.15, 0.62, 10, 1, true), M(0xd6d4cf, { emissive: 0x1a1d24, side: THREE.DoubleSide }), s * 0.3, 1.36, 0.08);
    sl.rotation.x = -0.5; sl.rotation.z = s * 0.15;
    const hand = add(new THREE.BoxGeometry(0.06, 0.22, 0.04), M(0xc8c0b6), s * 0.31, 1.06, 0.3); hand.rotation.x = -0.6;
  }
  return { g, mats };
}
function makeJizo() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.3, 0.34, 0.2, 10), MAT.stone, 0, 0.1, 0);
  add(new THREE.CylinderGeometry(0.17, 0.24, 0.6, 10), MAT.stone, 0, 0.5, 0);
  const bib = add(new THREE.CylinderGeometry(0.2, 0.27, 0.26, 10, 1, true, -Math.PI * 0.45, Math.PI * 0.9), MAT.redCloth, 0, 0.62, 0);
  bib.material = std(0x7a1717, { roughness: 1, side: THREE.DoubleSide });
  const head = new THREE.Group(); head.position.set(0, 0.92, 0); g.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), MAT.stone); hm.castShadow = true; head.add(hm);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.35), MAT.snowCap); head.add(cap);
  return { g, head };
}
function makeLanternStone() {
  const g = new THREE.Group();
  const add = (geo, y) => { const o = new THREE.Mesh(geo, MAT.stone); o.position.y = y; o.castShadow = true; g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.32, 0.38, 0.2, 6), 0.1);
  add(new THREE.CylinderGeometry(0.09, 0.11, 0.8, 8), 0.6);
  add(new THREE.BoxGeometry(0.42, 0.34, 0.42), 1.15);
  add(new THREE.ConeGeometry(0.48, 0.3, 6), 1.47);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.16, 6), MAT.snowCap); cap.position.y = 1.58; g.add(cap);
  return g;
}

/* ---------- 3D: 世界を組み立てる ---------- */
const HOUSE_T = new Set(['T', 'H', 'W', 'D', 'K']);
function components(M, set) {
  const seen = new Set(), out = [];
  for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
    if (!set.has(M.g[y][x]) || seen.has(x + ',' + y)) continue;
    const c = { x0: x, x1: x, y0: y, y1: y, tiles: [] }, q = [[x, y]]; seen.add(x + ',' + y);
    while (q.length) {
      const [cx, cy] = q.pop(); c.tiles.push([cx, cy, M.g[cy][cx]]);
      c.x0 = Math.min(c.x0, cx); c.x1 = Math.max(c.x1, cx); c.y0 = Math.min(c.y0, cy); c.y1 = Math.max(c.y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= M.w || ny >= M.h || seen.has(nx + ',' + ny) || !set.has(M.g[ny][nx])) continue;
        seen.add(nx + ',' + ny); q.push([nx, ny]);
      }
    }
    out.push(c);
  }
  return out;
}
const groundCache = {};
function groundTexture(id, M) {
  if (groundCache[id]) return groundCache[id];
  const W = M.w + PAD * 2, H = M.h + PAD * 2;
  const small = document.createElement('canvas'); small.width = W; small.height = H;
  const sg = small.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = (M.g[y - PAD] || [])[x - PAD];
    sg.fillStyle = ch === undefined || ch === '#' ? '#c4c9d2' : ch === ',' || ch === 'G' ? '#8b9099' : HOUSE_T.has(ch) ? '#4a4038' : ch === '~' ? '#1d2530' : '#d6dbe4';
    sg.fillRect(x, y, 1, 1);
  }
  const tex = canvasTex(W * 32, H * 32, (g, w, h) => {
    g.imageSmoothingEnabled = true;
    g.filter = 'blur(10px)';
    g.drawImage(small, -1, -1, w + 2, h + 2);
    g.filter = 'none';
    for (let i = 0; i < w * h / 40; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(60,70,90,.12)';
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  });
  groundCache[id] = tex;
  return tex;
}
function disposeTree(o) {
  o.traverse(c => {
    if (c.geometry && c.geometry !== TREE_GEO && !c.geometry.userData.keep) c.geometry.dispose();
  });
}
const ENV = {
  village: { fog: 0.042, hemi: 0.42, moon: 0.32, exposure: 1.0, cam: [0.6, 3.6, 6.2], snow: true },
  mountain: { fog: 0.058, hemi: 0.26, moon: 0.18, exposure: 0.95, cam: [0.6, 3.8, 6.0], snow: true },
  oku: { fog: 0.075, hemi: 0.14, moon: 0.06, exposure: 0.95, cam: [0.5, 3.4, 5.2], snow: false },
};
let world = null, npcMeshes = [], jizos = [];
function buildMapCanvas() { buildWorld(); }   // 2D 版から呼ばれる名前のまま、3D の世界を組み直す
function buildWorld() {
  if (world) { scene.remove(world); disposeTree(world); }
  world = new THREE.Group(); scene.add(world);
  npcMeshes = []; jizos = [];
  const id = S.map, M = MAPS[id], night = id === 'village' && S.flags.night;
  const W = M.w, H = M.h, cx = W * TILE / 2, cz = H * TILE / 2;
  const tc = (tx) => (tx + 0.5) * TILE;
  const put = (o, x, z, ry = 0) => { o.position.set(x, o.position.y, z); o.rotation.y = ry; world.add(o); return o; };
  const mesh = (geo, mat, cast = true) => { const o = new THREE.Mesh(geo, mat); o.castShadow = cast; o.receiveShadow = true; return o; };

  // 地面
  const gw = (W + PAD * 2) * TILE, gh = (H + PAD * 2) * TILE;
  const gN = TEX.snowN.clone(); gN.needsUpdate = true; gN.repeat.set(gw / 3, gh / 3);
  const ground = mesh(new THREE.PlaneGeometry(gw, gh), std(0xffffff, { map: groundTexture(id, M), normalMap: gN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.93 }), false);
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz); world.add(ground);

  // 飾り（歩けないマスにだけ置く）
  const decor = new Map();
  const walk = (x, y) => { const ch = (M.g[y] || [])[x]; return ch === '.' || ch === ','; };
  const edge = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (M.g[y][x] === '#' && (walk(x + 1, y) || walk(x - 1, y) || walk(x, y + 1) || walk(x, y - 1))) edge.push([x, y]);
  edge.sort((a, b) => hsh(a[0], a[1], 91) - hsh(b[0], b[1], 91));
  const pick = (n, kind, minD) => {
    for (const [x, y] of edge) {
      if ([...decor.values()].filter(v => v.kind === kind).length >= n) break;
      if ([...decor.keys()].some(k => { const [a, b] = k.split(',').map(Number); return Math.hypot(a - x, b - y) < minD; })) continue;
      decor.set(x + ',' + y, { kind, x, y });
    }
  };
  if (id === 'oku') pick(12, 'jizo', 3);
  if (id === 'mountain') pick(5, 'jizo', 6);
  if (id === 'village') pick(5, 'toro', 4);
  for (const d of decor.values()) {
    if (d.kind === 'jizo') {
      const j = makeJizo(); const tx = tc(d.x), tz = tc(d.y);
      put(j.g, tx, tz, Math.atan2(S.x * U - tx, S.y * U - tz)); jizos.push(j);
    } else put(makeLanternStone(), tc(d.x), tc(d.y), hsh(d.x, d.y, 3) * Math.PI);
  }

  // 杉林
  const pts = [];
  for (let y = -PAD; y < H + PAD; y++) for (let x = -PAD; x < W + PAD; x++) {
    const inside = x >= 0 && y >= 0 && x < W && y < H;
    if (inside && (M.g[y][x] !== '#' || decor.has(x + ',' + y))) continue;
    if (!inside && hsh(x, y, 7) < 0.08) continue;
    pts.push({ x: tc(x) + (hsh(x, y, 1) - 0.5) * 1.1, z: tc(y) + (hsh(x, y, 2) - 0.5) * 1.1, s: 0.72 + hsh(x, y, 4) * 0.55, r: hsh(x, y, 5) * Math.PI * 2, h: 0.9 + hsh(x, y, 6) * 0.35 });
  }
  const chunks = new Map();
  for (const p of pts) { const k = Math.floor(p.x / 16) + ',' + Math.floor(p.z / 16); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(p); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const arr of chunks.values()) {
    const im = new THREE.InstancedMesh(TREE_GEO, MAT.tree, arr.length);
    arr.forEach((p, i) => { q.setFromEuler(e.set(0, p.r, 0)); im.setMatrixAt(i, m4.compose(v.set(p.x, 0, p.z), q, sc.set(p.s, p.s * p.h, p.s))); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    world.add(im);
  }

  // 家と山小屋
  const lights = [];
  for (const c of components(M, HOUSE_T)) {
    const cabin = c.tiles.some(t => t[2] === 'K');
    const x0 = c.x0 * TILE, x1 = (c.x1 + 1) * TILE, z0 = c.y0 * TILE, z1 = (c.y1 + 1) * TILE;
    const w = x1 - x0, d = z1 - z0, hx = (x0 + x1) / 2, hz = (z0 + z1) / 2;
    const wallH = cabin ? 2.3 : 2.6, roofH = cabin ? 1.5 : 2.3, over = 0.75;
    const wt = (cabin ? TEX.logs : TEX.wood).clone(); wt.needsUpdate = true; wt.repeat.set(w / 2.5, wallH / 2.5);
    const walls = mesh(new THREE.BoxGeometry(w - 0.3, wallH, d - 0.3), cutaway(std(0xffffff, { map: wt })));
    walls.position.set(hx, wallH / 2, hz); world.add(walls);
    const base = mesh(new THREE.BoxGeometry(w - 0.1, 0.28, d - 0.1), MAT.stone); base.position.set(hx, 0.14, hz); world.add(base);
    const run = d / 2 + over, len = Math.hypot(run, roofH), ang = Math.atan2(roofH, run);
    for (const s of [-1, 1]) {
      const slab = mesh(new THREE.BoxGeometry(w + over * 2, 0.5, len), MAT.thatch);
      slab.position.set(hx, wallH + roofH / 2, hz + s * run / 2); slab.rotation.x = s * ang; world.add(slab);
      const snow = mesh(new THREE.BoxGeometry(w + over * 2 - 0.25, 0.14, len - 0.35), MAT.snowCap, false);
      snow.position.set(hx, wallH + roofH / 2 + Math.cos(ang) * 0.3, hz + s * run / 2 + s * Math.sin(ang) * 0.3); snow.rotation.x = s * ang; world.add(snow);
    }
    const ridge = mesh(new THREE.BoxGeometry(w + over * 2, 0.34, 0.5), MAT.darkWood); ridge.position.set(hx, wallH + roofH + 0.05, hz); world.add(ridge);
    for (const gx of [x0 + 0.16, x1 - 0.16]) {
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([gx, wallH, z0 + 0.15, gx, wallH, z1 - 0.15, gx, wallH + roofH, hz], 3));
      tri.computeVertexNormals();
      const gm = mesh(tri, cutaway(std(0x24190f, { side: THREE.DoubleSide }))); world.add(gm);
    }
    for (const [tx, ty, ch] of c.tiles) {
      if (ch === 'D') {
        const door = mesh(new THREE.PlaneGeometry(1.15, 1.95), MAT.door, false); door.position.set(tc(tx), 0.28 + 0.975, z1 - 0.14); world.add(door);
      } else if (ch === 'W') {
        const lit = !night;
        const win = mesh(new THREE.PlaneGeometry(1.35, 0.95), lit ? MAT.shojiLit : MAT.shojiDark, false); win.position.set(tc(tx), 1.5, z1 - 0.14); world.add(win);
        if (lit) lights.push([tc(tx), 1.6, z1 + 0.9]);
      }
    }
  }
  winLights.forEach((l, i) => {
    const p = lights[i];
    l.intensity = p ? 6 : 0;
    if (p) l.position.set(p[0], p[1], p[2]);
  });

  // 小物
  const gTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = M.g[y][x], X = tc(x), Z = tc(y);
    if (ch === 'G') gTiles.push([x, y]);
    else if (ch === 'S') {
      const s = new THREE.Group();
      const add = (geo, mat, px, py, pz) => { const o = mesh(geo, mat); o.position.set(px, py, pz); s.add(o); return o; };
      add(new THREE.BoxGeometry(1.25, 0.36, 1.05), MAT.stone, 0, 0.18, 0);
      add(new THREE.BoxGeometry(0.8, 0.78, 0.72), cutaway(std(0x5a2b22)), 0, 0.75, 0);
      add(new THREE.PlaneGeometry(0.46, 0.56), MAT.door, 0, 0.74, 0.37);
      const r1 = add(new THREE.BoxGeometry(1.2, 0.12, 0.7), MAT.darkWood, 0, 1.28, 0.2); r1.rotation.x = 0.5;
      const r2 = add(new THREE.BoxGeometry(1.2, 0.12, 0.7), MAT.darkWood, 0, 1.28, -0.2); r2.rotation.x = -0.5;
      const s1 = add(new THREE.BoxGeometry(1.1, 0.08, 0.6), MAT.snowCap, 0, 1.37, 0.18); s1.rotation.x = 0.5;
      const s2 = add(new THREE.BoxGeometry(1.1, 0.08, 0.6), MAT.snowCap, 0, 1.37, -0.18); s2.rotation.x = -0.5;
      for (const sx of [-0.25, 0.25]) add(new THREE.PlaneGeometry(0.08, 0.22), MAT.paper, sx, 1.08, 0.4);
      put(s, X, Z);
    } else if (ch === '~') {
      const wtr = mesh(new THREE.PlaneGeometry(TILE, TILE), MAT.ice, false); wtr.rotation.x = -Math.PI / 2; wtr.position.set(X, 0.03, Z); world.add(wtr);
    } else if (ch === 'R') {
      const r = mesh(rockGeometry(0.85, x * 7 + y), MAT.vc); r.scale.set(1.1, 0.75, 1); r.position.set(X, 0.3, Z); world.add(r);
    } else if (ch === 'B') {
      const slab = mesh(new THREE.BoxGeometry(0.8, 2.4, 0.35), [MAT.stone, MAT.stone, MAT.snowCap, MAT.stone, MAT.carved, MAT.stone]);
      slab.position.set(X, 1.2, Z); world.add(slab);
    } else if (ch === 'X') {
      const gr = mesh(new THREE.DodecahedronGeometry(0.55, 0), MAT.stone); gr.scale.set(1, 1.45, 0.7); gr.position.set(X, 0.75, Z); world.add(gr);
      const cr = new THREE.Group();
      const a = mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), std(0x222327), false); const b = mesh(new THREE.BoxGeometry(0.24, 0.06, 0.02), std(0x222327), false);
      b.position.y = 0.08; cr.add(a, b); cr.position.set(X, 0.95, Z + 0.37); world.add(cr);
    }
  }
  // 岩座
  for (const c of components(M, new Set(['A']))) {
    const ax = ((c.x0 + c.x1 + 1) / 2) * TILE, az = tc(c.y0);
    const rock = mesh(rockGeometry(1.45, 77, 0.45), MAT.vc); rock.scale.set(1.55, 1.05, 1.0); rock.position.set(ax, 0.9, az); world.add(rock);
    const curve = new THREE.EllipseCurve(0, 0, 2.15, 1.45, 0, Math.PI * 2);
    const pts3 = curve.getPoints(48).map((p, i) => new THREE.Vector3(ax + p.x, 1.25 + Math.sin(i * 0.9) * 0.05, az + p.y));
    const rope = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3, true), 96, 0.11, 8, true), MAT.rope); world.add(rope);
    for (let i = 0; i < 7; i++) {
      const t = i / 7 * Math.PI * 2, sx = ax + Math.cos(t) * 2.15, sz = az + Math.sin(t) * 1.45;
      const sh = mesh(new THREE.PlaneGeometry(0.14, 0.42), MAT.paper, false); sh.position.set(sx, 0.98, sz); sh.lookAt(ax, 0.98, az); world.add(sh);
    }
  }
  // 注連縄の門
  if (gTiles.length) {
    const xs = gTiles.map(t => t[0]), gy = gTiles[0][1];
    const lx = Math.min(...xs) * TILE - 0.2, rx = (Math.max(...xs) + 1) * TILE + 0.2, gz = tc(gy);
    for (const px of [lx, rx]) { const post = mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.8, 10), MAT.darkWood); post.position.set(px, 1.4, gz); world.add(post); }
    if (!S.flags.learned) {
      const pr = [new THREE.Vector3(lx, 2.35, gz), new THREE.Vector3((lx + rx) / 2, 1.95, gz), new THREE.Vector3(rx, 2.35, gz)];
      world.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pr), 32, 0.09, 8), MAT.rope));
      for (let i = 1; i < 5; i++) {
        const t = i / 5, sx = lx + (rx - lx) * t, sy = 2.35 - Math.sin(t * Math.PI) * 0.4 - 0.25;
        const sh = mesh(new THREE.PlaneGeometry(0.13, 0.38), MAT.paper, false); sh.position.set(sx, sy, gz); world.add(sh);
      }
    }
  }

  // 人物
  for (const a of visibleActors()) if (a.kind) {
    const p = makePerson(LOOK3[a.kind]);
    p.g.position.set((a.tx * 16 + 8) * U, 0, (a.ty * 16 + 12) * U);
    world.add(p.g); npcMeshes.push(p);
  }

  // 空気
  const env = ENV[id];
  scene.fog.density = env.fog * (night ? 1.25 : 1);
  hemi.intensity = env.hemi * (night ? 0.6 : 1);
  moon.intensity = env.moon * (night ? 0.5 : 1);
  renderer.toneMappingExposure = env.exposure;
  snow.visible = env.snow;
  moon.position.set(cx - 30, 50, cz - 20); moon.target.position.set(cx, 0, cz);
}

/* ---------- 3D: 雪 ---------- */
const SNOW_N = 2600, SNOW_BOX = [36, 14, 36];
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(SNOW_N * 3), snowVel = new Float32Array(SNOW_N);
for (let i = 0; i < SNOW_N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * SNOW_BOX[0]; snowPos[i * 3 + 1] = Math.random() * SNOW_BOX[1]; snowPos[i * 3 + 2] = (Math.random() - 0.5) * SNOW_BOX[2];
  snowVel[i] = 0.7 + Math.random() * 0.9;
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
let snow;

/* ---------- 3D: 初期化 ---------- */
initTextures();
initMaterials();
TREE_GEO = treeGeometry();
snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.075, map: TEX.flake, transparent: true, depthWrite: false, color: 0xdfe6f0, opacity: 0.85 }));
snow.frustumCulled = false;
scene.add(snow);
const P3 = makePerson(LOOK3.player);
const lanternMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.12), std(0x3a2a1a, { emissive: 0xffa040, emissiveIntensity: 2.2 }));
lanternMesh.position.set(0.33, 0.78, 0.12);
P3.g.add(lanternMesh);
const DOG3 = makeDog();
const ENT3 = makeEnt();
scene.add(P3.g, DOG3.g, ENT3.g);
applyQuality(quality);

/* ---------- 音 ---------- */
let AC = null, master, windG, droneG;
function audioInit() {
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = .7; master.connect(AC.destination);
    const len = AC.sampleRate * 2, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = AC.createBufferSource(); n.buffer = buf; n.loop = true;
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = .7;
    const lfo = AC.createOscillator(); lfo.frequency.value = .09;
    const lg = AC.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    windG = AC.createGain(); windG.gain.value = 0;
    n.connect(f); f.connect(windG); windG.connect(master); n.start();
    droneG = AC.createGain(); droneG.gain.value = 0; droneG.connect(master);
    for (const hz of [55, 58.3, 82.4]) { const o = AC.createOscillator(); o.frequency.value = hz; o.connect(droneG); o.start(); }
    AC.noise = buf;
    setAmb();
  } catch (e) { AC = null; }
}
function setAmb() {
  if (!AC) return;
  const m = S.map, t = AC.currentTime;
  windG.gain.setTargetAtTime(m === 'oku' ? .012 : m === 'mountain' ? .09 : .05, t, .8);
  droneG.gain.setTargetAtTime(m === 'oku' ? .045 : m === 'mountain' ? .018 : 0, t, 1);
}
function tone(type, f0, f1, dur, vol) {
  if (!AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
function noiseBurst(dur, vol, freq) {
  if (!AC) return;
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = AC.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}
const sfx = {
  tick: () => tone('square', 900, 880, .02, .012),
  thump: () => tone('sine', 70, 38, .18, .35),
  eat: () => { tone('sawtooth', 240, 30, 1.6, .1); tone('sawtooth', 247, 33, 1.6, .08); noiseBurst(.8, .25, 600); },
  caught: () => { noiseBurst(1.2, .5, 300); tone('sawtooth', 120, 25, 1.4, .15); },
};

/* ---------- 文字窓 ---------- */
const D = { who: $('who'), txt: $('txt'), ch: $('choices'), nx: $('next'), mode: null, res: null, full: [], idx: 0, timer: null, sel: 0, opts: [] };
function drawTxt() { D.txt.innerHTML = fmt(D.full.slice(0, D.idx).join('')); }
// 憑かれが進むと、覚えた里の言葉が山言葉に置き換わる
function yamaize(s) {
  for (const w of CFG.words) if (w.yama && S.known[w.sato] === true) s = s.split(w.sato).join(w.yama);
  return s;
}
function say(who, text, cls) {
  return new Promise(res => {
    clearInterval(D.timer);
    D.mode = 'say'; D.res = res; D.ch.innerHTML = '';
    D.who.innerHTML = fmt(T(who || '')); D.txt.className = cls || '';
    if (who === '透' && !S.rawSpeech && S.possess >= CFG.possession.speechAt) text = yamaize(fill(text));
    D.full = Array.from(T(text)); D.idx = 0; D.nx.hidden = true;
    if (reduceMotion) { D.idx = D.full.length; drawTxt(); D.nx.hidden = false; return; }
    D.timer = setInterval(() => {
      D.idx++; if (D.idx % 3 === 0) sfx.tick(); drawTxt();
      if (D.idx >= D.full.length) { clearInterval(D.timer); D.nx.hidden = false; }
    }, CFG.typeSpeedMs);
  });
}
function advance() {
  if (D.mode !== 'say') return;
  if (D.idx < D.full.length) { clearInterval(D.timer); D.idx = D.full.length; drawTxt(); D.nx.hidden = false; return; }
  D.mode = null; D.nx.hidden = true;
  const r = D.res; D.res = null; r && r();
}
function markSel() { [...D.ch.children].forEach((b, i) => b.classList.toggle('sel', i === D.sel)); }
function choose(opts, who, text) {
  return new Promise(res => {
    clearInterval(D.timer);
    D.mode = 'choice'; D.res = res; D.sel = 0; D.opts = opts; D.nx.hidden = true;
    if (who) D.who.innerHTML = fmt(T(who));
    if (text) { D.txt.className = ''; D.txt.innerHTML = fmt(T(text)); }
    D.ch.innerHTML = '';
    opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'choice' + i; b.innerHTML = fmt(T(o.label));
      if (o.yama) b.classList.add('yama');
      b.addEventListener('click', e => { e.stopPropagation(); pick(i); });
      b.addEventListener('mouseenter', () => { D.sel = i; markSel(); });
      D.ch.appendChild(b);
    });
    markSel();
  });
}
function pick(i) {
  if (D.mode !== 'choice') return;
  D.mode = null; D.ch.innerHTML = '';
  const r = D.res; D.res = null; r && r(i);
}
// 設定ファイルの台詞を順に流す
async function play(lines) {
  for (const l of lines) {
    if (l === '@restore') { S.eaten = []; updateHUD(); }
    else await say(l[0], l[1], l[2]);
  }
}
// 里の言葉を選んだ場面では、憑かれていても台詞を山言葉にしない
async function satoPlay(lines) { S.rawSpeech = true; try { await play(lines); } finally { S.rawSpeech = false; } }
// 選択肢を出し、選ばれた選択肢を返す。憑かれが強いと里の言葉の選択肢は山言葉に変わる
async function ask(q) {
  const opts = q.options.map((o, i) => {
    const w = o.word && WORD[o.word];
    if (o.kind === 'sato' && w && w.yama && S.known[o.word] === true && S.possess >= CFG.possession.forceAt)
      return { ...o, i, label: yamaize(fill(o.label)), kind: 'yama', yama: true };
    return { ...o, i, yama: o.yama || o.kind === 'yama' };
  });
  return opts[await choose(opts, ' ', q.prompt)];
}
function idlePanel() {
  if (D.mode || S.busy) return;
  clearInterval(D.timer);
  D.ch.innerHTML = ''; D.nx.hidden = true;
  D.who.textContent = S.goal ? UI.goalLabel : '';
  D.txt.className = 'idle';
  D.txt.innerHTML = fmt(T(S.goal)) + (S.nearId ? `<span class="hint">${esc(UI.interactHint)}</span>` : '');
}
function setGoal(key) { S.goal = TX.goals[key]; idlePanel(); }

/* ---------- 演出 ---------- */
function flash() {
  const el = $('flash'); el.style.transition = 'none'; el.style.opacity = .7;
  setTimeout(() => { el.style.transition = 'opacity .9s'; el.style.opacity = 0; }, 40);
}
function eatFx(w) {
  return new Promise(res => {
    const el = $('eatfx'), we = el.querySelector('.w'), ce = el.querySelector('.c');
    we.textContent = '「' + w + '」'; ce.textContent = ''; el.hidden = false; el.classList.add('on');
    S.shake = reduceMotion ? 0 : .6;
    setTimeout(() => { we.textContent = '「' + '■'.repeat(w.length) + '」'; ce.textContent = UI.eaten; }, 900);
    setTimeout(() => { el.hidden = true; el.classList.remove('on'); res(); }, 2100);
  });
}
async function eat(w) {
  if (S.eaten.includes(w)) return;
  S.eaten.push(w);
  addPresence(CFG.rules.presencePerEat);
  if (w === '犬') S.dog.active = false;
  sfx.eat(); await eatFx(w); updateHUD();
  if (S.eaten.length >= CFG.rules.eatLimit) { await ending('D'); throw END; }
}
const eatRandom = () => { const pool = CFG.rules.eatPool.filter(w => !S.eaten.includes(w)); return eat(pool[Math.floor(Math.random() * pool.length)]); };
// 山言葉（魔の名）を口にした
async function possess() {
  const C = CFG.possession, before = S.possess;
  S.possess = Math.min(C.limit, S.possess + C.perWord);
  updateHUD();
  if (before < C.speechAt && S.possess >= C.speechAt) await play(TX.possession.speech);
  if (before < C.forceAt && S.possess >= C.forceAt) await play(TX.possession.force);
  for (const s of C.learn) if (S.possess >= s.at && S.known[s.word] !== true) { S.known[s.word] = true; await play(TX.possession.learned); }
  if (S.possess >= C.limit) { await ending('E'); throw END; }
}
const learn = (...ws) => { for (const w of ws) S.known[w] = true; };
const addPresence = n => { S.presence = Math.min(100, S.presence + n); };
const P = CFG.rules.presence;

/* ---------- 出来事 ---------- */
const EV = {
  async intro() { await play(TX.intro); setGoal('fumi'); },
  async fumi() {
    if (S.flags.night) await play(TX.fumi.night);
    else if (!S.flags.fumi) { await play(TX.fumi.first); S.flags.fumi = true; setGoal('genzo'); }
    else await play(S.flags.learned ? TX.fumi.learned : TX.fumi.repeat);
  },
  async genzo() {
    if (!S.flags.learned) {
      await play(TX.genzo.teach);
      learn('火', '灯り', '犬', '帰る', '水', '山');
      S.dog.active = true; S.dog.x = S.x + 12; S.dog.y = S.y;
      S.flags.learned = true; buildMapCanvas();
      await play(TX.genzo.teachEnd);
      setGoal('mountain');
    } else if (S.clues.grimoire && !S.flags.genzoGrim) {
      S.flags.genzoGrim = true;
      await play(TX.genzo.grimoire);
    } else await play(TX.genzo.repeat);
  },
  async yuki() {
    if (S.flags.night) {
      await play(TX.yuki.nightA); learn('雪');
      await play(TX.yuki.nightB);
      return;
    }
    await play(TX.yuki.a);
    if (S.known['帰る']) await play(TX.yuki.understand);
    await play(TX.yuki.b);
    if (!S.known['名前']) S.known['名前'] = 'unknown';
  },
  async hokora() {
    await play(TX.hokora.lines);
    learn('名前', '声'); S.clues.grimoire = true;
    await play(TX.hokora.after);
    if (S.clues.note) await play(TX.hokora.latinKnown);
  },
  async yado() {
    await play(TX.yado.intro);
    if (!S.flags.yadoAsked) {
      S.flags.yadoAsked = true;
      if ((await ask(TX.yado.ask)).i === 0) { S.flags.wroteName = true; await play(TX.yado.wrote); }
      else await play(TX.yado.notWrote);
    }
    await play(TX.yado.old);
    S.clues.yado = true;
  },
  async akiya() {
    if (S.clues.contract) return play(TX.akiya.after);
    if (!S.flags.key) return play(TX.akiya.locked);
    await play(TX.akiya.contract);
    S.clues.contract = true;
    setGoal('final');
  },
  async genzoya() { await play(S.flags.night ? TX.genzoya.night : TX.genzoya.day); },
  async gate() { await play(S.flags.learned ? TX.gate.open : TX.gate.closed); },
  async mIntro() { S.flags.mIntro = true; await play(TX.mIntro); setGoal('cabin'); },
  async dogEv() {
    const X = TX.dogEv;
    S.flags.dogEv = true;
    await play(X.before);
    S.dog.away = true;
    await play(X.run);
    const o = await ask(X.ask);
    if (o.kind === 'sato') { await satoPlay(X.sato); await eat(o.word); await play(X.satoAfter); return; }
    S.dog.away = false; S.dog.x = S.x - 10; S.dog.y = S.y + 4;
    if (o.kind === 'yama') { await play(X.yama); await possess(); }
    else { addPresence(P.silent); await play(X.silent); }
  },
  async waterEv() {
    const X = TX.waterEv;
    S.flags.waterEv = true;
    await play(X.before);
    const o = await ask(X.ask);
    if (o.kind === 'sato') { await satoPlay(X.sato); await eat(o.word); await play(X.satoAfter); }
    else if (o.kind === 'yama') { await play(X.yama); await possess(); }
    else { addPresence(P.silent); await play(X.silent); }
  },
  async voiceEv() {
    const X = TX.voiceEv;
    S.flags.voiceEv = true;
    await play(X.before);
    if ((await ask(X.ask)).i === 0) { await satoPlay(X.reply); await eat('先生'); await play(X.replyAfter); }
    else { addPresence(P.voiceSilent); await play(X.silent); }
  },
  async cabin() {
    const X = TX.cabin;
    if (S.flags.cabin) { await play(X.done); return; }
    await play(X.intro);
    S.clues.note = true; S.clues.forged = true;
    if (!S.known['雪']) S.known['雪'] = 'unknown';
    await play(X.dark);
    let o = await ask(X.askLight);
    if (o.kind === 'sato') { await satoPlay(X.lightSato); await eat(o.word); await play(X.lightSatoAfter); }
    else if (o.kind === 'yama') { await play(X.lightYama); await possess(); }
    else { addPresence(P.silent); await play(X.lightSilent); }
    await play(X.cold);
    o = await ask(X.askFire);
    if (o.kind === 'sato') { await satoPlay(X.fireSato); await eat(o.word); await play(X.fireSatoAfter); }
    else { await play(X.fireYama); await possess(); }
    S.flags.cabin = true;
    await play(X.end);
    setGoal('oku');
  },
  async okuIntro() { S.flags.okuIntro = true; await play(TX.okuIntro); setGoal('altar'); },
  async stone() {
    await play(TX.stone.lines);
    S.clues.stone = true;
    await play(S.clues.yado ? TX.stone.solved : TX.stone.unsolved);
  },
  async grave() {
    if (S.flags.key) return play(TX.grave.done);
    await play(TX.grave.lines);
    S.clues.grave = true; S.flags.key = true;
    if (!S.clues.contract) setGoal('key');
  },
  async nightIntro() {
    S.flags.night = true;
    buildMapCanvas(); updateHUD();
    await play(TX.nightIntro);
  },
  async caught() {
    flash(); sfx.caught();
    await play(TX.caught.before);
    await eatRandom();
    goto('oku', 14, 27, 0);
    await play(TX.caught.after);
  },
  async altar() {
    const X = TX.altar, O = X.options;
    if (!S.flags.altarSeen) { S.flags.altarSeen = true; await play(X.first); }
    await play(X.call);
    if (S.flags.wroteName) await play(X.wroteName);
    for (;;) {
      const opts = [{ ...O.A, v: 'A' }, { ...O.B, v: 'B' }, { ...O.kaeru, v: 'kaeru' }];
      if (S.clues.yado && S.clues.stone) opts.push({ ...(S.known['名前'] === true ? O.sayoYama : O.sayo), v: 'C' });
      if (S.clues.contract) opts.push({ ...O.village, v: 'T' });
      if (S.known['私'] === true) opts.push({ ...O.ego, v: 'E' });
      const v = opts[await choose(opts, X.speaker, X.prompt)].v;
      if (v === 'A' || v === 'C' || v === 'T' || v === 'E') return ending(v);
      if (v === 'B') {
        if (!S.eaten.includes('帰る')) return ending('B');
        addPresence(P.altarRetry); await play(X.bFail);
      } else if (v === 'kaeru') {
        if (S.eaten.includes('帰る')) { await play(X.kaeruMute); continue; }
        await satoPlay(X.kaeruSay); await eat('帰る');
      }
    }
  },
};

/* ---------- 結末 ---------- */
async function ending(code) {
  const E = TX.endings[code];
  S.over = true; S.busy = true;
  $('count').hidden = true;
  const ec = $('endcard'); ec.querySelector('.t').textContent = E.title; ec.hidden = false;
  await play(E.lines);
  const summary = UI.endSummary.replace('{code}', E.title).replace('{n}', S.eaten.length).replace('{p}', S.possess);
  await choose([{ label: UI.endPrompt }], ' ', summary);
  resetGame();
}

/* ---------- 進行 ---------- */
async function run(fn) {
  if (S.busy || S.over) return;
  S.busy = true; S.moving = false;
  try { await fn(); } catch (e) { if (e !== END) console.error(e); }
  finally { if (!S.over) { S.busy = false; idlePanel(); } }
}
function goto(map, tx, ty, dir) {
  S.map = map; S.x = tx * 16 + 8; S.y = ty * 16 + 12; S.dir = dir;
  S.dog.x = S.x; S.dog.y = S.y + 12;
  S.detect = 0; S.breath = 100; S.gasp = false;
  if (map === 'oku') S.ent = { x: 21 * 16 + 8, y: 13 * 16 + 12, wp: 2, cnt: 0, cntT: 0, lx: null, ly: null };
  buildMapCanvas(); updateHUD(); setAmb();
  $('count').hidden = true;
}
function resetGame() {
  S = newState();
  goto('village', 25, 14, 0);
  $('endcard').hidden = true; $('journal').hidden = true; $('title').hidden = false;
  D.mode = null; clearInterval(D.timer);
  D.who.textContent = ''; D.txt.className = ''; D.txt.textContent = ''; D.ch.innerHTML = '';
}
function start() {
  if (S.started) return;
  $('title').hidden = true; S.started = true;
  if (!AC) audioInit(); else AC.resume && AC.resume();
  run(EV.intro);
}

/* ---------- 当たり判定 ---------- */
function solidAt(px, py) {
  const M = MAPS[S.map], ch = (M.g[Math.floor(py / 16)] || [])[Math.floor(px / 16)];
  if (ch === undefined) return true;
  if (ch === 'G') return !S.flags.learned;
  return SOLID.has(ch);
}
function blocked(x, y) {
  if (solidAt(x - 4, y - 3) || solidAt(x + 4, y - 3) || solidAt(x - 4, y + 2) || solidAt(x + 4, y + 2)) return true;
  for (const a of visibleActors()) if (a.kind) {
    const ax = a.tx * 16 + 8, ay = a.ty * 16 + 12;
    if (Math.abs(x - ax) < 9 && Math.abs(y - ay) < 6) return true;
  }
  return false;
}
function nearest() {
  let best = null, bd = CFG.player.interactRange;
  for (const a of visibleActors()) {
    const d = Math.hypot(S.x - (a.tx * 16 + 8), S.y - (a.ty * 16 + 8));
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
function interact() { const a = nearest(); if (a) run(EV[a.id]); }

/* ---------- 更新 ---------- */
const keys = {};
const down = (...cs) => cs.some(c => keys[c]);
function update(dt) {
  const B = CFG.breath;
  let dx = (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0);
  let dy = (down('ArrowDown', 'KeyS') ? 1 : 0) - (down('ArrowUp', 'KeyW') ? 1 : 0);
  if (S.busy) { dx = 0; dy = 0; }
  const wantHold = !S.busy && down('KeyX', 'ShiftLeft', 'ShiftRight');
  S.holding = wantHold && !S.gasp && S.breath > 0;
  if (S.holding) {
    S.breath -= B.drain * dt;
    if (S.breath <= 0) {
      S.breath = 0; S.holding = false; S.gasp = true;
      if (S.map === 'oku' && S.ent && Math.hypot(S.x - S.ent.x, S.y - S.ent.y) < 140) S.detect = Math.min(100, S.detect + B.gaspAlert);
    }
  } else {
    S.breath = Math.min(100, S.breath + B.regen * dt);
    if (S.gasp && S.breath > B.recoverAt) S.gasp = false;
  }
  if (dx && dy) { dx *= .7071; dy *= .7071; }
  S.moving = !!(dx || dy);
  const sp = CFG.player.speed * (S.holding ? CFG.player.holdSpeedMul : 1);
  if (S.moving) {
    S.dir = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 0 : 2) : (dx < 0 ? 3 : 1);
    S.step += dt * 8;
    const nx = S.x + dx * sp * dt; if (!blocked(nx, S.y)) S.x = nx;
    const ny = S.y + dy * sp * dt; if (!blocked(S.x, ny)) S.y = ny;
  }
  // 犬
  const g = S.dog;
  if (g.active && !g.away) {
    const ox = S.x - g.x, oy = S.y + 6 - g.y, d = Math.hypot(ox, oy);
    if (d > 90) { g.x = S.x; g.y = S.y + 8; }
    else if (d > 18) {
      const mx = ox / d * 54 * dt, my = oy / d * 54 * dt;
      if (!solidAt(g.x + mx, g.y)) g.x += mx;
      if (!solidAt(g.x, g.y + my)) g.y += my;
      if (Math.abs(mx) > .01) g.face = mx < 0 ? -1 : 1;
    }
  }
  if (S.map === 'oku') updateEnt(dt);
  if (S.busy || S.over) return;
  // 出来事の起点
  const ty = Math.floor(S.y / 16);
  if (S.map === 'village') {
    if (ty <= 0) { goto('mountain', 12, 38, 0); if (!S.flags.mIntro) run(EV.mIntro); }
  } else if (S.map === 'mountain') {
    if (ty >= 39) { goto('village', 14, 2, 2); if (S.flags.key && !S.flags.night) run(EV.nightIntro); }
    else if (ty <= 0) {
      if (S.flags.cabin) { goto('oku', 14, 27, 0); if (!S.flags.okuIntro) run(EV.okuIntro); }
      else { S.y = 28; run(async () => { await say('', UI.notCabinYet); }); }
    }
    else if (ty <= 31 && !S.flags.dogEv && S.dog.active) run(EV.dogEv);
    else if (ty <= 26 && !S.flags.waterEv) run(EV.waterEv);
    else if (ty <= 20 && !S.flags.voiceEv) run(EV.voiceEv);
  } else if (S.map === 'oku') {
    if (ty >= 29) goto('mountain', 12, 1, 2);
  }
  const n = nearest(), id = n ? n.id : null;
  if (id !== S.nearId) { S.nearId = id; idlePanel(); }
}
function updateEnt(dt) {
  const e = S.ent; if (!e) return;
  const d = Math.hypot(S.x - e.x, S.y - e.y);
  const Rr = ST.radius + S.presence * ST.radiusPerPresence;
  let rate = 0;
  if (!S.busy && d < Rr) {
    const close = 1 - d / Rr;
    if (S.moving) rate = (S.holding ? ST.moveHoldRate : ST.moveRate) * (close + .35);
    else if (!S.holding && d < Rr * ST.stillRange) rate = ST.stillRate * close;
  }
  if (rate > 0) { S.detect = Math.min(100, S.detect + rate * dt); e.lx = S.x; e.ly = S.y; }
  else S.detect = Math.max(0, S.detect - ST.decay * dt);
  let tx, ty, sp;
  if (S.detect > ST.chaseAt && e.lx !== null) { tx = e.lx; ty = e.ly; sp = ST.chaseSpeed; }
  else if (e.lx !== null && S.detect > 5) { tx = e.lx; ty = e.ly; sp = ST.patrolSpeed; if (Math.hypot(tx - e.x, ty - e.y) < 4) e.lx = null; }
  else {
    e.lx = null;
    const w = ST.waypoints[e.wp]; tx = w[0] * 16 + 8; ty = w[1] * 16 + 12; sp = ST.patrolSpeed;
    if (Math.hypot(tx - e.x, ty - e.y) < 4) e.wp = (e.wp + 1) % ST.waypoints.length;
  }
  if (!S.busy) {
    const md = Math.hypot(tx - e.x, ty - e.y) || 1;
    e.x += (tx - e.x) / md * Math.min(sp * dt, md); e.y += (ty - e.y) / md * Math.min(sp * dt, md);
  }
  e.cntT += dt;
  if (e.cntT > ST.countInterval) { e.cntT = 0; e.cnt = (e.cnt + 1) % ST.counts.length; }
  S.hbT -= dt;
  if (d < Rr * 1.6 && S.hbT <= 0) { sfx.thump(); S.hbT = .32 + .9 * (d / (Rr * 1.6)); }
  if (!S.busy && (S.detect >= 100 || (d < ST.catchDistance && !S.holding))) run(EV.caught);
}

/* ---------- 描画（3D） ---------- */
const v3 = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const DIR_YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];   // 2D の向き（上・右・下・左）
let shadowTick = false, camReady = false, pYaw = 0, entJit = 0, entOff = [0, 0], dogPrev = [0, 0], dogStep = 0, holdF = 0;
function screenOf(x, y, z) {
  v3.set(x, y, z).project(camera);
  return [(v3.x * 0.5 + 0.5) * innerWidth, (-v3.y * 0.5 + 0.5) * innerHeight, v3.z < 1 && Math.abs(v3.x) < 1.15 && Math.abs(v3.y) < 1.15];
}
function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
function render(dt) {
  const M = MAPS[S.map], env = ENV[S.map];
  const px = S.x * U, pz = S.y * U;
  const k = (r) => 1 - Math.exp(-dt * r);

  // 主人公
  P3.g.visible = S.started;
  P3.g.position.set(px, 0, pz);
  pYaw = lerpAngle(pYaw, DIR_YAW[S.dir], k(12));
  P3.g.rotation.y = pYaw;
  const sw = S.moving ? Math.sin(S.step * 1.5) * (S.holding ? 0.3 : 0.55) : 0;
  P3.legL.rotation.x = sw; P3.legR.rotation.x = -sw;
  P3.armL.rotation.x = -sw * 0.8; P3.armR.rotation.x = sw * 0.4 - 0.2;
  P3.g.position.y = S.moving ? Math.abs(Math.sin(S.step * 1.5)) * 0.03 : 0;

  // クロ
  const g = S.dog;
  DOG3.g.visible = S.started && g.active && !g.away;
  if (DOG3.g.visible) {
    DOG3.g.position.set(g.x * U, 0, g.y * U);
    DOG3.g.rotation.y = g.face < 0 ? Math.PI : 0;
    const mv = Math.hypot(g.x - dogPrev[0], g.y - dogPrev[1]);
    dogStep += mv * 0.5;
    DOG3.legs.forEach((l, i) => { l.rotation.z = mv > 0.05 ? Math.sin(dogStep + (i % 2) * Math.PI) * 0.5 : 0; });
    DOG3.tail.rotation.z = 0.6 + Math.sin(S.t * 6) * 0.15;
  }
  dogPrev = [g.x, g.y];

  // 村人：近づくとこちらを向く
  for (const n of npcMeshes) {
    const dx = px - n.g.position.x, dz = pz - n.g.position.z;
    const want = Math.hypot(dx, dz) < 5 ? Math.atan2(dx, dz) : 0;
    n.g.rotation.y = lerpAngle(n.g.rotation.y, want, k(3));
    n.armL.rotation.x = Math.sin(S.t * 1.3) * 0.03;
  }

  // 灯り（2D と同じ明るさの計算）
  const lightR = M.light * (S.eaten.includes('灯り') ? 0.55 : 1) + Math.sin(S.t * 13) * 1.5 + Math.random();
  lanternMesh.getWorldPosition(v3);
  lantern.position.set(v3.x, v3.y + 0.75, v3.z + 0.1);
  lantern.distance = lightR * U * 1.35;
  lantern.intensity = (S.eaten.includes('灯り') ? 7 : 13) * (0.92 + Math.random() * 0.08);
  lantern.shadow.camera.far = lantern.distance + 2;
  lantern.visible = S.started;
  lanternMesh.material.emissiveIntensity = S.eaten.includes('灯り') ? 0.9 : 2.2;

  // 十二様
  const cnt = $('count');
  const showEnt = S.started && S.map === 'oku' && S.ent && !S.over;
  ENT3.g.visible = !!showEnt;
  entLight.intensity = 0;
  if (showEnt) {
    const e = S.ent, d = Math.hypot(S.x - e.x, S.y - e.y);
    entJit -= dt;
    if (entJit <= 0) { entJit = 0.08 + Math.random() * 0.25; entOff = [(Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12]; }
    const ex = e.x * U + entOff[0], ez = e.y * U + entOff[1];
    ENT3.g.position.set(ex, 0.1 + Math.sin(S.t * 1.7) * 0.06, ez);
    ENT3.g.rotation.y = Math.atan2(px - ex, pz - ez);
    ENT3.g.rotation.z = Math.sin(S.t * 0.9) * 0.05;
    const alpha = d < lightR ? 1 : clamp(1 - (d - lightR) / 140, 0.22, 1);
    for (const m of ENT3.mats) { m.opacity = alpha; m.depthWrite = alpha > 0.95; }
    entLight.position.set(ex + Math.sin(ENT3.g.rotation.y) * 1.2, 1.2, ez + Math.cos(ENT3.g.rotation.y) * 1.2);
    entLight.intensity = 0.9 * alpha;
    if (d < 170) {
      const [sx, sy, on] = screenOf(ex, 2.5, ez);
      cnt.hidden = !on;
      cnt.textContent = '……' + ST.counts[e.cnt];
      cnt.style.left = sx + 'px'; cnt.style.top = sy + 'px';
      cnt.style.opacity = clamp(1.2 - d / 170, 0, 1);
    } else cnt.hidden = true;
  } else cnt.hidden = true;

  // 地蔵：見ていないあいだに、こちらを向いている
  for (const j of jizos) {
    j.head.getWorldPosition(v3);
    const [, , on] = screenOf(v3.x, v3.y, v3.z);
    if (!on) j.head.rotation.y = Math.atan2(px - v3.x, pz - v3.z) - j.g.rotation.y;
  }

  // カメラ：零のように、少し後ろの高い位置から追う
  if (!S.started) {
    const a = S.t * 0.04, cx = 15 * TILE, cz = 8 * TILE;
    v3.set(cx + Math.cos(a) * 18, 9, cz + Math.sin(a) * 18);
    camPos.lerp(v3, camReady ? k(1.5) : 1);
    camLook.lerp(v3.set(cx, 1.5, cz), camReady ? k(1.5) : 1);
  } else {
    const o = env.cam;
    v3.set(px + o[0] + Math.sin(S.t * 0.37) * 0.12, o[1] + Math.sin(S.t * 0.53) * 0.06, pz + o[2]);
    camPos.lerp(v3, camReady ? k(3.2) : 1);
    camLook.lerp(v3.set(px, 1.35, pz - 2.6), camReady ? k(4) : 1);
  }
  camReady = true;
  camera.position.copy(camPos);
  if (S.shake > 0) camera.position.add(v3.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, 0));
  camera.lookAt(camLook);
  CUT.uCam.value.copy(camera.position);
  CUT.uTgt.value.set(px, 1.0, pz);
  if (!S.started) CUT.uTgt.value.copy(camera.position).add(v3.set(0, 0, 0.001));

  // 雪
  if (snow.visible) {
    snow.position.set(camLook.x, 0, camLook.z);
    for (let i = 0; i < SNOW_N; i++) {
      const j = i * 3;
      snowPos[j + 1] -= snowVel[i] * dt;
      snowPos[j] += (Math.sin(S.t * 0.7 + i) * 0.25 - 0.35) * dt;
      if (snowPos[j + 1] < 0) { snowPos[j + 1] = SNOW_BOX[1]; snowPos[j] = (Math.random() - 0.5) * SNOW_BOX[0]; snowPos[j + 2] = (Math.random() - 0.5) * SNOW_BOX[2]; }
      if (snowPos[j] < -SNOW_BOX[0] / 2) snowPos[j] += SNOW_BOX[0];
    }
    snowGeo.attributes.position.needsUpdate = true;
  }

  // 調べられるもの
  const mk = $('marker');
  const near = !S.busy && S.started && S.nearId ? visibleActors().find(o => o.id === S.nearId) : null;
  if (near && Math.floor(S.t * 3) % 2 === 0) {
    const [sx, sy, on] = screenOf((near.tx * 16 + 8) * U, near.kind ? 2.15 : 1.6, (near.ty * 16 + 8) * U);
    mk.hidden = !on; mk.style.left = sx + 'px'; mk.style.top = sy + 'px';
  } else mk.hidden = true;

  // 画面効果（2D と同じ計算の気配・発見の赤）
  const danger = S.presence / 100 * 0.35 + (S.map === 'oku' ? S.detect / 100 * (0.55 + 0.15 * Math.sin(S.t * 10)) : 0);
  holdF += ((S.holding ? 1 : 0) - holdF) * k(6);
  const u = film.uniforms;
  u.time.value = S.t % 100;
  u.danger.value = S.started ? danger : 0;
  u.hold.value = holdF;
  u.cold.value = S.eaten.includes('火') ? 1 : 0;

  $('hud').hidden = !S.started; $('eatenHud').hidden = !S.started; $('panel').hidden = !S.started;
  renderer.shadowMap.needsUpdate = (shadowTick = !shadowTick);
  composer.render(dt);
}
function updateHUD() {
  const M = MAPS[S.map];
  $('area').textContent = T(S.map === 'village' && S.flags.night ? M.nightName : M.name);
  const words = S.eaten.map(w => '■'.repeat(w.length)).join(' ');
  $('eatenHud').innerHTML = S.eaten.length ? esc(UI.eatenHud) + '<span>' + words + '</span>' : '';
  $('mBreath').hidden = S.map !== 'oku';
  $('mPres').hidden = S.map === 'village';
  $('mPoss').hidden = !S.flags.learned;
}
function tickHUD() {
  $('mPres').querySelector('b').style.width = S.presence + '%';
  $('mBreath').querySelector('b').style.width = S.breath + '%';
  $('mPoss').querySelector('b').style.width = S.possess + '%';
}

/* ---------- 言葉帳 ---------- */
const jEl = $('journal');
function toggleJ(open) {
  if (!open) { jEl.hidden = true; return; }
  let h = `<h2>${esc(UI.journalTitle)}</h2><p class="rule">${fmt(T(UI.journalRule))}</p>`;
  const ws = CFG.words.filter(w => w.yama && S.known[w.sato]);
  const total = CFG.words.filter(w => w.yama).length;
  h += `<h3>${esc(UI.journalNames)}　${ws.length}／${total}</h3>`;
  h += '<table><thead><tr><th>里の言葉</th><th>山言葉</th></tr></thead><tbody>';
  if (!ws.length) h += `<tr><td colspan="2">${esc(UI.journalEmpty)}</td></tr>`;
  for (const w of ws) {
    const sato = S.known[w.sato] === 'unknown' ? '？' : T(w.sato);
    h += `<tr class="${S.eaten.includes(w.sato) ? 'gone' : ''}"><td>${fmt(sato)}</td><td class="y">${esc(w.yama)}</td></tr>`;
  }
  h += `</tbody></table><h3>${esc(UI.journalClues)}</h3><ul>`;
  const found = ['yado', 'grimoire', 'note', 'forged', 'stone', 'grave', 'contract'].filter(k => S.clues[k]);
  if (S.clues.grimoire && S.clues.note) found.splice(found.indexOf('grimoire') + 1, 0, 'latin');
  for (const k of found) h += `<li>${fmt(T(UI.clues[k]))}</li>`;
  if (S.clues.yado && S.clues.stone) h += `<li class="name">${esc(UI.journalSayo)}</li>`;
  if (!found.length) h += `<li>${esc(UI.journalNoClues)}</li>`;
  h += `</ul><div class="close">${esc(UI.journalClose)}</div>`;
  jEl.innerHTML = h; jEl.hidden = false;
}
jEl.addEventListener('click', () => toggleJ(false));

/* ---------- 入力 ---------- */
function onPress(c) {
  const ok = c === 'KeyZ' || c === 'Enter' || c === 'Space';
  if (!S.started) { if (ok) start(); return; }
  if (!jEl.hidden) { if (c === 'KeyJ' || c === 'Escape' || ok) toggleJ(false); return; }
  if (D.mode === 'choice') {
    const n = D.opts.length;
    if (c === 'ArrowUp' || c === 'KeyW') { D.sel = (D.sel + n - 1) % n; markSel(); }
    else if (c === 'ArrowDown' || c === 'KeyS') { D.sel = (D.sel + 1) % n; markSel(); }
    else if (ok) pick(D.sel);
    else if (/^Digit[1-9]$/.test(c)) { const i = +c.slice(5) - 1; if (i < n) pick(i); }
    return;
  }
  if (D.mode === 'say') { if (ok) advance(); return; }
  if (c === 'KeyJ') { if (!S.over) toggleJ(true); return; }
  if (ok && !S.busy && !S.over) interact();
}
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (!e.repeat) onPress(e.code);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
$('title').addEventListener('click', start);
$('startBtn').addEventListener('click', e => { e.stopPropagation(); start(); });
$('panel').addEventListener('click', () => { if (D.mode === 'say') advance(); });
document.querySelectorAll('#touch [data-k]').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); keys[k] = true; if (D.mode === 'choice' && (k === 'ArrowUp' || k === 'ArrowDown')) onPress(k); };
  const off = e => { e.preventDefault(); keys[k] = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
$('tA').addEventListener('click', () => onPress('KeyZ'));
$('tJ').addEventListener('click', () => onPress('KeyJ'));

/* ---------- ループ ---------- */
let last = performance.now(), firstFrame = true;
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  S.t += dt;
  if (S.shake > 0) S.shake -= dt;
  if (S.started && !S.over && jEl.hidden) update(dt);
  render(dt); tickHUD();
  if (firstFrame) { firstFrame = false; $('loading').hidden = true; }
  requestAnimationFrame(loop);
}
const qSel = $('quality');
qSel.value = quality;
qSel.addEventListener('change', e => applyQuality(e.target.value));
qSel.closest('label').addEventListener('click', e => e.stopPropagation());
resetGame();
requestAnimationFrame(loop);

// 動作確認用：URL に ?debug を付けたときだけ、状態を外から触れるようにする
if (new URLSearchParams(location.search).has('debug')) window.__game = { get S() { return S; }, goto, run, EV, buildWorld };
