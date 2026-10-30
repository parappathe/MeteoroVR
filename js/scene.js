// Tudo que se desenha: céu de cada mundo, chão e paisagem (campo, mar, serra), a vila em miniatura
// (cada construção com a sua ruína), meteoros, cometa, projéteis e explosões instanciados,
// partículas, cursores de mira e os lançadores das mãos.
import * as THREE from '../vendor/three/three.module.js';
import { GROUND_Y, BUILD, KIND, buildingsOf, BLAST } from './sim.js';

// ---------- Temas dos mundos ----------
export const THEMES = {
  campo: {
    sky: ['#140a2e', '#5a2a6a', '#ff8a4a'], fog: '#5a3050', fogNear: 14, fogFar: 70,
    sun: { dir: [-0.4, 0.12, -0.9], color: '#ffc080', size: 90 }, hemi: ['#ffc8a0', '#3a2a40', 1.2], key: ['#ffd0a0', 1.4],
    ground: '#4f7a3a', ground2: '#6b8f3e', plaza: '#b8a07a', walls: ['#f2e8d8', '#f7d9a8', '#e8d0c8', '#fff4e0'], roof: ['#c0442e', '#a8502e', '#d06a3a'],
    blast: ['#fff3a0', '#ffb030', '#ff4a6a', '#c060ff'],
  },
  porto: {
    sky: ['#040a22', '#0e2a5a', '#2a6a9a'], fog: '#0e2440', fogNear: 14, fogFar: 80,
    sun: { dir: [0.5, 0.35, 0.8], color: '#e8f0ff', size: 50, moon: true }, hemi: ['#9ab8ff', '#2a3a60', 1.35], key: ['#c8d8ff', 1.3],
    ground: '#7a8a5a', ground2: '#a89a6a', plaza: '#9a9488', walls: ['#ffd25a', '#5ad0c8', '#ff8a7a', '#f2f2f2', '#8ab8ff'], roof: ['#3a4a6a', '#c0442e', '#2a6a6a'],
    blast: ['#e0ffff', '#5ff2ff', '#ffe060', '#ff60c0'], water: '#1d4f78',
  },
  serra: {
    sky: ['#0a0618', '#2a1a4a', '#7a6a9a'], fog: '#3a3058', fogNear: 18, fogFar: 110,
    sun: { dir: [0.7, 0.18, -0.6], color: '#d8f0ff', size: 70 }, hemi: ['#c8d8ff', '#2a2440', 1.15], key: ['#e8f0ff', 1.2],
    ground: '#4a5a48', ground2: '#5e6a52', plaza: '#8a8a90', walls: ['#d8d8e0', '#c8b8a8', '#a8b8c8', '#e8e0d0'], roof: ['#4a4a5a', '#7a3a3a', '#3a5a5a'],
    blast: ['#ffffff', '#a0ffd0', '#ff9a40', '#ff4080'], mountains: true,
  },
};

// ---------- Ajudantes de geometria (malhas mescladas com cor por vértice) ----------
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function part(geo, color, m) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new THREE.Color(color), arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
// telhado de duas águas: prisma deitado ao longo de z
const roofGeo = (w, h, d) => { const g = new THREE.CylinderGeometry(1, 1, d, 3); g.rotateX(-Math.PI / 2); g.scale(w / 1.732, h / 1.5, 1); g.translate(0, h / 3, 0); return g; };
const HALF = Math.PI / 2;

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// ---------- Construções ----------
// Cada uma devolve { body: [partes com cor], glow: [janelas e luzes] } com o chão em y = 0.
function buildingParts(kind, T, r) {
  const wall = T.walls[Math.floor(r() * T.walls.length)], roof = T.roof[Math.floor(r() * T.roof.length)];
  const win = '#ffd890', dark = '#3a2a24';
  const body = [], glow = [];
  const windows = (w, h, d, y0, rows, cols) => {
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const x = -w / 2 + (j + 0.5) * w / cols, y = y0 + (i + 0.5) * h / rows;
      if (r() < 0.25) continue;
      glow.push(part(box(w / cols * 0.45, h / rows * 0.45, 0.004), win, M(x, y, d / 2 + 0.002)));
      glow.push(part(box(w / cols * 0.45, h / rows * 0.45, 0.004), win, M(x, y, -d / 2 - 0.002)));
    }
  };
  switch (kind) {
    case 'casa':
      body.push(part(box(0.13, 0.075, 0.11), wall, M(0, 0.0375, 0)));
      body.push(part(roofGeo(0.15, 0.05, 0.125), roof, M(0, 0.075, 0)));
      body.push(part(box(0.025, 0.04, 0.004), dark, M(0.03, 0.02, 0.056)));
      windows(0.13, 0.05, 0.11, 0.015, 1, 2);
      body.push(part(box(0.018, 0.04, 0.018), '#6a5048', M(-0.035, 0.115, -0.02)));
      break;
    case 'sobrado':
      body.push(part(box(0.12, 0.13, 0.11), wall, M(0, 0.065, 0)));
      body.push(part(roofGeo(0.14, 0.055, 0.125), roof, M(0, 0.13, 0)));
      body.push(part(box(0.13, 0.006, 0.03), '#e8e0d0', M(0, 0.07, 0.065)));
      windows(0.12, 0.11, 0.11, 0.01, 2, 2);
      break;
    case 'igreja':
      body.push(part(box(0.11, 0.11, 0.19), wall, M(0, 0.055, 0.02)));
      body.push(part(roofGeo(0.13, 0.06, 0.2), roof, M(0, 0.11, 0.02)));
      body.push(part(box(0.07, 0.22, 0.07), wall, M(0, 0.11, -0.1)));
      body.push(part(cone(0.055, 0.08, 4), roof, M(0, 0.26, -0.1, 0, Math.PI / 4)));
      body.push(part(box(0.006, 0.04, 0.006), '#ffe8a0', M(0, 0.32, -0.1)));
      body.push(part(box(0.024, 0.006, 0.006), '#ffe8a0', M(0, 0.325, -0.1)));
      glow.push(part(cyl(0.018, 0.018, 0.004, 12), '#ffe080', M(0, 0.17, -0.064, HALF)));
      glow.push(part(box(0.03, 0.05, 0.004), '#ffc860', M(0, 0.045, 0.117)));
      break;
    case 'caixa':
      for (const [x, z] of [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]]) body.push(part(cyl(0.006, 0.008, 0.22, 5), '#6a6a72', M(x, 0.11, z)));
      body.push(part(box(0.09, 0.006, 0.006), '#6a6a72', M(0, 0.1, 0.04))); body.push(part(box(0.09, 0.006, 0.006), '#6a6a72', M(0, 0.1, -0.04)));
      body.push(part(cyl(0.065, 0.065, 0.075, 14), '#c8d8e0', M(0, 0.255, 0)));
      body.push(part(cone(0.07, 0.035, 14), '#8a9aa8', M(0, 0.31, 0)));
      body.push(part(cyl(0.066, 0.066, 0.012, 14), '#e05a4a', M(0, 0.25, 0)));
      glow.push(part(sph(0.008, 6, 4), '#ff4040', M(0, 0.33, 0)));
      break;
    case 'celeiro':
      body.push(part(box(0.2, 0.1, 0.14), '#b03a2a', M(0, 0.05, 0)));
      body.push(part(roofGeo(0.22, 0.06, 0.15), '#5a3a2a', M(0, 0.1, 0)));
      body.push(part(box(0.06, 0.07, 0.004), '#f2e8d8', M(0, 0.035, 0.071)));
      body.push(part(cyl(0.03, 0.03, 0.16, 10), '#c8c8c0', M(0.13, 0.08, -0.03)));
      body.push(part(sph(0.03, 10, 6), '#a8a8a0', M(0.13, 0.16, -0.03)));
      glow.push(part(box(0.025, 0.02, 0.004), win, M(0, 0.085, 0.072)));
      break;
    case 'farol': {
      const n = 6;
      for (let i = 0; i < n; i++) { const a = 0.05 - i * 0.003, b = 0.05 - (i + 1) * 0.003; body.push(part(cyl(b, a, 0.05, 12), i % 2 ? '#f2f2f2' : '#d03a3a', M(0, 0.025 + i * 0.05, 0))); }
      body.push(part(cyl(0.05, 0.05, 0.008, 12), '#2a2a34', M(0, 0.3, 0)));
      glow.push(part(cyl(0.028, 0.028, 0.04, 10), '#fff8c0', M(0, 0.325, 0)));
      body.push(part(cone(0.036, 0.035, 10), '#2a2a34', M(0, 0.362, 0)));
      body.push(part(box(0.09, 0.03, 0.07), '#f2f2f2', M(0.06, 0.015, 0.03)));
      break;
    }
    case 'armazem':
      body.push(part(box(0.24, 0.09, 0.14), wall, M(0, 0.045, 0)));
      body.push(part(roofGeo(0.25, 0.04, 0.15), '#5a6a7a', M(0, 0.09, 0)));
      body.push(part(box(0.07, 0.07, 0.004), '#5a4038', M(-0.05, 0.035, 0.071)));
      body.push(part(box(0.07, 0.07, 0.004), '#5a4038', M(0.05, 0.035, 0.071)));
      for (let i = 0; i < 3; i++) body.push(part(box(0.04, 0.04, 0.04), ['#c06a3a', '#3a7aa8', '#7aa83a'][i], M(-0.09 + i * 0.05, 0.02, 0.1)));
      glow.push(part(box(0.03, 0.015, 0.004), win, M(0, 0.075, 0.072)));
      break;
    case 'predio':
      body.push(part(box(0.12, 0.3, 0.12), wall, M(0, 0.15, 0)));
      body.push(part(box(0.13, 0.012, 0.13), '#5a5a6a', M(0, 0.306, 0)));
      body.push(part(box(0.04, 0.03, 0.04), '#6a6a7a', M(0.02, 0.325, -0.02)));
      windows(0.12, 0.26, 0.12, 0.03, 6, 3);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) if (r() > 0.3) {
        glow.push(part(box(0.004, 0.022, 0.018), win, M(0.062, 0.05 + i * 0.043, -0.04 + j * 0.04)));
        glow.push(part(box(0.004, 0.022, 0.018), win, M(-0.062, 0.05 + i * 0.043, -0.04 + j * 0.04)));
      }
      break;
    case 'torre':
      for (const [x, z] of [[-0.035, -0.035], [0.035, -0.035], [-0.035, 0.035], [0.035, 0.035]]) body.push(part(cyl(0.004, 0.006, 0.3, 4), '#c8c8d0', M(x * 0.6, 0.15, z * 0.6, z * 0.12, 0, -x * 0.12)));
      for (let i = 0; i < 4; i++) body.push(part(box(0.06 - i * 0.008, 0.005, 0.06 - i * 0.008), '#d05a4a', M(0, 0.06 + i * 0.07, 0)));
      body.push(part(cyl(0.002, 0.003, 0.08, 4), '#e0e0e8', M(0, 0.32, 0)));
      glow.push(part(sph(0.01, 6, 4), '#ff3030', M(0, 0.362, 0)));
      body.push(part(box(0.1, 0.04, 0.08), wall, M(0.07, 0.02, 0.05)));
      break;
  }
  return { body, glow };
}
function ruinParts(r) {
  const body = [];
  for (let i = 0; i < 6; i++) {
    const s = 0.02 + r() * 0.035;
    body.push(part(box(s, s * 0.7, s * 0.9), r() < 0.5 ? '#3a3230' : '#5a4a40', M((r() - 0.5) * 0.12, s * 0.3, (r() - 0.5) * 0.12, r(), r(), r())));
  }
  body.push(part(cyl(0.08, 0.09, 0.006, 12), '#2a2220', M(0, 0.003, 0)));
  return body;
}

// ---------- Mundo ----------
export function buildWorld() {
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight('#ffc8a0', '#3a2a40', 1.2);
  const key = new THREE.DirectionalLight('#ffd0a0', 1.4);
  scene.add(hemi, key, key.target);
  scene.fog = new THREE.Fog('#5a3050', 14, 70);

  const mats = {
    vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }),
  };

  // céu: degradê de três cores com estrelas e um brilho do sol/lua
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() }, sun: { value: new THREE.Vector3(0, 0.2, -1) }, sunC: { value: new THREE.Color() }, uT: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, mid, low, sun, sunC; uniform float uT; varying vec3 vD;
      float h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        float y = vD.y;
        vec3 c = y > 0.12 ? mix(mid, top, smoothstep(0.12, 0.75, y)) : mix(low, mid, smoothstep(-0.05, 0.12, y));
        float s = max(0.0, dot(vD, normalize(sun)));
        c += sunC * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6);
        vec3 q = floor(vD * 260.0);
        float st = step(0.9965, h(q)) * smoothstep(0.08, 0.4, y);
        c += vec3(st) * (0.6 + 0.4 * sin(uT * 2.0 + h(q + 3.0) * 30.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 40, 20), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  scene.add(sunSprite);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#f4f0e0', fog: false, toneMapped: false }));
  scene.add(moon);

  // paisagem e vila (refeitas a cada mundo)
  const land = new THREE.Group(), village = new THREE.Group();
  scene.add(land, village);
  let houses = [];
  const smoke = [];   // pontos das ruínas que soltam fumaça

  let cur = -1, T = THEMES.campo;
  function setWorld(w, theme) {
    if (cur === w) return;
    cur = w;
    T = THEMES[theme];
    const sd = new THREE.Vector3(...T.sun.dir).normalize();
    skyMat.uniforms.top.value.set(T.sky[0]); skyMat.uniforms.mid.value.set(T.sky[1]); skyMat.uniforms.low.value.set(T.sky[2]);
    skyMat.uniforms.sun.value.copy(sd); skyMat.uniforms.sunC.value.set(T.sun.color);
    scene.background = new THREE.Color(T.sky[0]);
    scene.fog.color.set(T.fog); scene.fog.near = T.fogNear; scene.fog.far = T.fogFar;
    hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2];
    key.color.set(T.key[0]); key.intensity = T.key[1];
    key.position.copy(sd).multiplyScalar(10).setY(Math.max(4, sd.y * 10));
    sunSprite.position.copy(sd).multiplyScalar(300);
    sunSprite.scale.setScalar(T.sun.size * (T.sun.moon ? 1.6 : 1));
    sunSprite.material.color.set(T.sun.color);
    moon.visible = !!T.sun.moon;
    moon.position.copy(sd).multiplyScalar(300); moon.scale.setScalar(9); moon.lookAt(0, 0, 0);
    for (const g of [land, village]) while (g.children.length) { const c = g.children.pop(); c.traverse(o => o.geometry?.dispose()); }
    buildLand(land, T, mats, w);
    houses = buildVillage(village, T, mats, w);
  }
  function setHouses(alive) {
    houses.forEach((h, i) => { h.intact.visible = alive[i]; h.ruin.visible = !alive[i]; });
  }

  function update(dt, time) { skyMat.uniforms.uT.value = time; }

  return { scene, mats, setWorld, setHouses, update, get theme() { return T; }, get houses() { return houses; } };
}

function buildLand(group, T, mats, w) {
  const r = rng(101 + w * 37);
  const parts = [];
  // chão: disco grande em anéis com duas cores (campos), a vila no meio
  const landR = T.water ? 2.75 : 60;
  const ring = (r0, r1, color, y = 0) => { const g = new THREE.RingGeometry(r0, r1, 64, 1); g.rotateX(-HALF); return part(g, color, M(0, y, 0)); };
  parts.push(ring(0, 0.62, T.plaza, 0.001));
  parts.push(ring(0.62, landR, T.ground));
  // caminhos da praça até as casas
  for (const b of buildingsOf(w)) {
    const d = Math.hypot(b.x, b.z), a = Math.atan2(b.x, b.z);
    parts.push(part(box(0.028, 0.002, d - 0.6), T.ground2, M(Math.sin(a) * (d + 0.6) / 2, 0.002, Math.cos(a) * (d + 0.6) / 2, 0, a)));
  }
  // fonte na praça (fica embaixo do jogador: dá para ver olhando para baixo)
  parts.push(part(cyl(0.3, 0.32, 0.03, 24), '#8a8478', M(0, 0.015, 0)));
  parts.push(part(cyl(0.26, 0.26, 0.032, 24), T.water || '#3a6a8a', M(0, 0.017, 0)));
  if (!T.water) {
    // remendos de plantação/campo em volta
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, d = 3 + r() * 30, s = 0.8 + r() * 3;
      parts.push(part(box(s, 0.003, s * (0.5 + r())), r() < 0.5 ? T.ground2 : T.ground, M(Math.sin(a) * d, 0.003 + i * 0.0001, Math.cos(a) * d, 0, r() * Math.PI)));
    }
  } else {
    // cais e barquinhos
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      parts.push(part(box(0.06, 0.012, 0.5), '#7a5a3a', M(Math.sin(a) * 2.95, 0.006, Math.cos(a) * 2.95, 0, a)));
    }
  }
  // árvores (pinheiros na serra), fora do caminho das casas
  const B = buildingsOf(w);
  const free = (x, z) => Math.hypot(x, z) > 0.75 && B.every(b => Math.hypot(b.x - x, b.z - z) > b.r + 0.08);
  const nTrees = T.water ? 18 : 110;
  for (let i = 0, made = 0; i < 600 && made < nTrees; i++) {
    const a = r() * Math.PI * 2, d = T.water ? 0.8 + r() * 1.8 : 0.8 + Math.pow(r(), 1.6) * 14;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (!free(x, z)) continue;
    made++;
    const s = (0.6 + r() * 0.7) * (d > 3 ? 1.6 : 1);
    if (T.mountains) {
      parts.push(part(cyl(0.006 * s, 0.008 * s, 0.03 * s, 5), '#5a4030', M(x, 0.015 * s, z)));
      parts.push(part(cone(0.035 * s, 0.1 * s, 6), '#2a4a3a', M(x, 0.075 * s, z)));
    } else {
      parts.push(part(cyl(0.006 * s, 0.008 * s, 0.04 * s, 5), '#6a4a30', M(x, 0.02 * s, z)));
      parts.push(part(sph(0.035 * s, 7, 5), r() < 0.5 ? '#3a6a2a' : '#4a7a30', M(x, 0.065 * s, z)));
    }
  }
  const g = new THREE.Mesh(merge(parts), mats.vc);
  g.position.y = GROUND_Y;
  group.add(g);
  // água até o horizonte
  if (T.water) {
    const wg = new THREE.Mesh(new THREE.RingGeometry(2.75, 300, 64, 1).rotateX(-HALF), new THREE.MeshLambertMaterial({ color: T.water }));
    wg.position.y = GROUND_Y - 0.02;
    group.add(wg);
    const boats = [];
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = 3.3 + r() * 4;
      const m = M(Math.sin(a) * d, 0.01, Math.cos(a) * d, 0, r() * 6);
      boats.push(part(box(0.1, 0.02, 0.035), '#e8e0d0', m.clone().multiply(M(0, 0, 0))));
      boats.push(part(box(0.004, 0.08, 0.004), '#5a4a3a', m.clone().multiply(M(0, 0.05, 0))));
      boats.push(part(new THREE.ConeGeometry(0.03, 0.07, 3), '#f2f2f2', m.clone().multiply(M(0.015, 0.05, 0, 0, 0, 0, 0.6, 1, 0.2))));
    }
    const bm = new THREE.Mesh(merge(boats), mats.vc);
    bm.position.y = GROUND_Y - 0.02;
    group.add(bm);
    // farol de luz na água: luzinhas das boias
    const lights = [];
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = 4 + r() * 20; lights.push(part(sph(0.03, 5, 3), r() < 0.5 ? '#ff5050' : '#50ff80', M(Math.sin(a) * d, 0.03, Math.cos(a) * d))); }
    const lm = new THREE.Mesh(merge(lights), mats.glow);
    lm.position.y = GROUND_Y;
    group.add(lm);
  }
  // morros (campo) ou montanhas com neve (serra) ao longe
  const far = [];
  const nM = T.mountains ? 26 : 16;
  for (let i = 0; i < nM; i++) {
    const a = (i / nM) * Math.PI * 2 + r() * 0.2, d = T.mountains ? 30 + r() * 30 : 40 + r() * 20;
    if (T.water && (a > 1 && a < 4)) continue;
    if (T.mountains) {
      const h = 8 + r() * 14, rr = 6 + r() * 7;
      far.push(part(cone(rr, h, 7), r() < 0.5 ? '#3a3a52' : '#4a4660', M(Math.sin(a) * d, h / 2 - 0.5, Math.cos(a) * d, 0, r())));
      far.push(part(cone(rr * 0.32, h * 0.32, 7), '#e8eef8', M(Math.sin(a) * d, h * 0.84 - 0.5, Math.cos(a) * d, 0, r())));
    } else {
      far.push(part(sph(10 + r() * 8, 12, 6), T.water ? '#2a3a4a' : '#3a4a3a', M(Math.sin(a) * d, -3, Math.cos(a) * d, 0, 0, 0, 1.4, 0.45 + r() * 0.2, 1)));
    }
  }
  if (far.length) { const fm = new THREE.Mesh(merge(far), mats.vc); fm.position.y = GROUND_Y; group.add(fm); }
  // luzes de casas ao longe (vilas vizinhas)
  const lights = [];
  for (let i = 0; i < 60; i++) { const a = r() * Math.PI * 2, d = 12 + r() * 40; lights.push(part(box(0.12, 0.08, 0.12), '#ffd080', M(Math.sin(a) * d, 0.05, Math.cos(a) * d))); }
  if (!T.water) { const lm = new THREE.Mesh(merge(lights), mats.glow); lm.position.y = GROUND_Y; group.add(lm); }
}

function buildVillage(group, T, mats, w) {
  const r = rng(7 + w * 13);
  return buildingsOf(w).map(b => {
    const P = buildingParts(b.kind, T, r);
    const intact = new THREE.Group();
    intact.add(new THREE.Mesh(merge(P.body), mats.vc));
    if (P.glow.length) intact.add(new THREE.Mesh(merge(P.glow), mats.glow));
    const ruin = new THREE.Mesh(merge(ruinParts(r)), mats.vc);
    const g = new THREE.Group();
    g.position.set(b.x, GROUND_Y, b.z);
    g.rotation.y = Math.atan2(-b.x, -b.z) + (r() - 0.5) * 0.6;   // frente para a praça
    g.add(intact, ruin);
    ruin.visible = false;
    group.add(g);
    return { group: g, intact, ruin, b };
  });
}

// ---------- Texturas ----------
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Meteoros ----------
export const KIND_COLOR = { pedra: '#ff8a3a', rapido: '#5fd8ff', racha: '#ff4a2a', curva: '#8aff5a', caco: '#ffb060', comet: '#ffe0a0' };
export class MeteorView {
  constructor(scene) {
    const CAP = 160;
    this.CAP = CAP;
    const rock = new THREE.IcosahedronGeometry(1, 0);
    this.rock = new THREE.InstancedMesh(rock, new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#2a1008' }), CAP);
    const core = new THREE.IcosahedronGeometry(1, 1);
    this.core = new THREE.InstancedMesh(core, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), CAP);
    // rastro: cone deitado apontando para trás
    const tg = new THREE.ConeGeometry(1, 1, 8, 1, true);
    tg.translate(0, -0.5, 0); tg.rotateX(-HALF);   // base na origem, ponta em +z
    this.trail = new THREE.InstancedMesh(tg, new THREE.ShaderMaterial({
      vertexShader: 'varying float vZ; varying vec3 vC; void main(){ vZ = position.z; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vZ; varying vec3 vC; void main(){ float a = (1.0 - clamp(vZ, 0.0, 1.0)); gl_FragColor = vec4(vC * a * a, a * a); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }), CAP);
    for (const m of [this.rock, this.core, this.trail]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0;
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(m);
    }
    // farol: ponto colorido de tamanho fixo na tela, para ver o meteoro de longe
    this.bpos = new Float32Array(CAP * 3); this.bcol = new Float32Array(CAP * 3);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.bpos, 3).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute('bcolor', new THREE.BufferAttribute(this.bcol, 3).setUsage(THREE.DynamicDrawUsage));
    this.beacons = new THREE.Points(bg, new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 9 } },
      vertexShader: 'attribute vec3 bcolor; uniform float uPx; varying vec3 vC; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vC = bcolor; vA = smoothstep(2.5, 6.0, -mv.z); gl_PointSize = uPx; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = vA * (1.0 - smoothstep(0.15, 0.5, d)); gl_FragColor = vec4(vC * a, a); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.beacons.frustumCulled = false;
    scene.add(this.beacons);
    this.kc = {};
    for (const k in KIND_COLOR) this.kc[k] = new THREE.Color(KIND_COLOR[k]);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); this.c = new THREE.Color();
    this.z = new THREE.Vector3(0, 0, 1); this.d = new THREE.Vector3();
  }
  // lista: meteoros e o cometa (se houver), todos com p, v, r, kind, id
  update(list, time, ahead) {
    let n = 0;
    for (const e of list) {
      if (n >= this.CAP) break;
      this.p.set(e.p[0] + e.v[0] * ahead, e.p[1] + e.v[1] * ahead, e.p[2] + e.v[2] * ahead);
      const big = e.kind === 'comet';
      const kc = this.kc[e.kind] || this.kc.pedra;
      // pedra girando
      this.q.setFromEuler(new THREE.Euler(time * 1.3 + e.id, time * 0.9 + e.id * 2, 0));
      this.s.setScalar(e.r * (big ? 0.85 : 1.5));
      this.m.compose(this.p, this.q, this.s);
      this.rock.setMatrixAt(n, this.m);
      const hot = big && time - (e.hitT ?? -9) < 0.15;
      this.rock.setColorAt(n, hot ? this.c.setRGB(3, 3, 3) : this.c.copy(kc).multiplyScalar(0.55).addScalar(0.25));
      this.s.setScalar(e.r * (big ? 1.35 : 2.6) * (1 + 0.08 * Math.sin(time * 14 + e.id)));
      this.m.compose(this.p, this.q, this.s);
      this.core.setMatrixAt(n, this.m);
      this.core.setColorAt(n, kc);
      // rastro alinhado com a velocidade (para trás)
      const sp = Math.hypot(e.v[0], e.v[1], e.v[2]);
      if (sp > 1e-4) this.d.set(-e.v[0], -e.v[1], -e.v[2]).divideScalar(sp); else this.d.set(0, 1, 0);
      this.q.setFromUnitVectors(this.z, this.d);
      const L = big ? 2.4 : (0.7 + sp * 0.7);
      this.s.set(e.r * (big ? 1.05 : 1.8), e.r * (big ? 1.05 : 1.8), L);
      this.m.compose(this.p, this.q, this.s);
      this.trail.setMatrixAt(n, this.m);
      this.trail.setColorAt(n, kc);
      this.bpos[n * 3] = this.p.x; this.bpos[n * 3 + 1] = this.p.y; this.bpos[n * 3 + 2] = this.p.z;
      this.bcol[n * 3] = kc.r; this.bcol[n * 3 + 1] = kc.g; this.bcol[n * 3 + 2] = kc.b;
      n++;
    }
    for (const m of [this.rock, this.core, this.trail]) {
      m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.beacons.geometry.setDrawRange(0, n);
    this.beacons.geometry.attributes.position.needsUpdate = this.beacons.geometry.attributes.bcolor.needsUpdate = true;
  }
}

// ---------- Explosões ----------
// Bola brilhante com borda mais forte; a cor pisca como nos fliperamas e muda com o elo da cadeia.
export class BlastView {
  constructor(scene) {
    const CAP = 90;
    this.CAP = CAP;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz); vC = instanceColor; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vC; void main(){ float f = 1.0 - abs(dot(normalize(vN), vV)); float a = 0.45 + pow(f, 2.0) * 0.9; gl_FragColor = vec4(vC * a, a); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); this.c = new THREE.Color();
    this.cols = [];
  }
  setTheme(T) { this.cols = T.blast.map(c => new THREE.Color(c)); }
  update(blasts, time) {
    let n = 0;
    for (const b of blasts) {
      if (n >= this.CAP) break;
      this.p.set(...b.p);
      this.s.setScalar(Math.max(0.001, b.r));
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      // pisca entre as cores do tema; cada elo da cadeia começa numa cor diferente
      const k = Math.floor(time * 14 + b.level) % this.cols.length;
      const fade = b.R > 0 ? Math.min(1, b.r / b.R * 1.4) : 1;
      this.mesh.setColorAt(n, this.c.copy(this.cols[k] || this.c.setRGB(1, 1, 1)).multiplyScalar(fade * (b.level ? 1.15 : 1)));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- Projéteis ----------
export const GUN_COLORS = ['#5ff2ff', '#ffd25a'];
export class ShotView {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false }), 40);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
    // linha fina do lançador até o ponto de explosão (só enquanto o projétil voa)
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, toneMapped: false }));
    this.lpos = new Float32Array(40 * 6); this.lcol = new Float32Array(40 * 6);
    this.lines.geometry.setAttribute('position', new THREE.BufferAttribute(this.lpos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines.geometry.setAttribute('color', new THREE.BufferAttribute(this.lcol, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.m = new THREE.Matrix4(); this.c = [new THREE.Color(GUN_COLORS[0]), new THREE.Color(GUN_COLORS[1])];
  }
  update(shots) {
    let n = 0;
    for (const s of shots) {
      if (n >= 40) break;
      this.m.makeTranslation(s.p[0], s.p[1], s.p[2]);
      this.mesh.setMatrixAt(n, this.m);
      const c = this.c[s.gun];
      this.mesh.setColorAt(n, c);
      this.lpos.set([...s.p, ...s.to], n * 6);
      this.lcol.set([c.r, c.g, c.b, c.r * 0.3, c.g * 0.3, c.b * 0.3], n * 6);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, n * 2);
    this.lines.geometry.attributes.position.needsUpdate = this.lines.geometry.attributes.color.needsUpdate = true;
  }
}

// ---------- Partículas (faíscas, fumaça, poeira) num só Points ----------
export class Particles {
  constructor(scene, cap = 2400) {
    this.cap = cap;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.s0 = new Float32Array(cap); this.drag = new Float32Array(cap); this.grav = new Float32Array(cap);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: 'attribute vec3 pcolor; attribute float size; attribute float alpha; uniform float uScale; varying vec3 vC; varying float vA; void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(128.0, size * uScale / max(0.05, -mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = vA * (1.0 - d * 2.0); gl_FragColor = vec4(vC * a, a); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tmp = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, drag = 1.5, grav = 0) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.tmp.set(color);
    this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    this.life[i] = this.max[i] = life; this.s0[i] = size; this.size[i] = size; this.alpha[i] = 1; this.drag[i] = drag; this.grav[i] = grav;
  }
  burst(p, color, n, speed, life = 0.8, size = 0.03, grav = 0) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(p[0], p[1], p[2], Math.cos(a) * r * s, u * s, Math.sin(a) * r * s, life * (0.5 + Math.random() * 0.6), size * (0.5 + Math.random()), color, 1.5, grav);
    }
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3 + 1] -= this.grav[i] * dt;
      for (let j = 0; j < 3; j++) { this.v[i * 3 + j] *= k; this.p[i * 3 + j] += this.v[i * 3 + j] * dt; }
      const f = Math.max(0, this.life[i] / this.max[i]);
      this.alpha[i] = f;
      this.size[i] = this.s0[i] * (0.4 + 0.6 * f);
    }
    for (const a of ['position', 'size', 'alpha', 'pcolor']) this.geo.attributes[a].needsUpdate = true;
  }
}

// ---------- Cursor de mira (um por lançador) ----------
export function buildCursor(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), mat);
  const ticks = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.45), mat);
    const a = i * HALF;
    t.position.set(Math.sin(a) * 1.25, Math.cos(a) * 1.25, 0); t.rotation.z = -a;
    ticks.push(t);
  }
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), mat);
  g.add(ring, dot, ...ticks);
  for (const o of g.children) o.renderOrder = 20;
  g.userData = { mat, ring, ticks };
  return g;
}

// ---------- Lançador (preso no controle, ou embaixo da câmera no PC) ----------
export function buildLauncher(color) {
  const group = new THREE.Group();
  const parts = [];
  parts.push(part(cyl(0.017, 0.022, 0.12, 12), '#3a3a4a', M(0, 0, -0.04, -HALF)));
  parts.push(part(cyl(0.021, 0.021, 0.02, 12), '#6a6a7a', M(0, 0, -0.1, -HALF)));
  parts.push(part(box(0.035, 0.03, 0.06), '#2a2a36', M(0, -0.015, 0.02)));
  parts.push(part(box(0.012, 0.04, 0.012), '#2a2a36', M(0.0, -0.04, 0.04, 0.3)));
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  const ring = new THREE.Mesh(cyl(0.0225, 0.0225, 0.008, 14), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  ring.rotation.x = -HALF; ring.position.z = -0.075;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.11);
  // contador de munição: plaquinha em cima
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.025), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  label.position.set(0, 0.032, -0.01); label.rotation.x = -0.6;
  group.add(mesh, ring, muzzle, label);
  let last = null;
  const setAmmo = (n, max) => {
    const key = n + '/' + max;
    if (key === last) return;
    last = key;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 128, 64);
    g.fillStyle = 'rgba(10,8,24,0.85)'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = n === 0 ? '#ff5a5a' : n <= 3 ? '#ffb040' : color;
    g.font = 'bold 44px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n).padStart(2, '0'), 64, 34);
    tex.needsUpdate = true;
  };
  let kick = 0;
  return {
    group, muzzle, setAmmo,
    fire() { kick = 1; },
    update(dt) { kick = Math.max(0, kick - dt * 6); mesh.position.z = kick * 0.02; ring.material.color.set(kick > 0.5 ? '#ffffff' : color); },
  };
}

export { glowTexture, BLAST };
