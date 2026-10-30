// Liga as regras (sim.js) à tela, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { Game, DT, HANDS, GROUND_Y, KIND, allMask, countMask } from './sim.js';
import { LEVELS, WORLDS } from './levels.js';
import { makeRobot } from './robot.js';
import { buildWorld, MeteorView, BlastView, ShotView, Particles, buildCursor, buildLauncher, KIND_COLOR, GUN_COLORS } from './scene.js';
import { Panel, Label, C as UI } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave, qualifies, addRecord } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SIDES = ['left', 'right'];
const GUN_NAME = ['esquerdo', 'direito'];
const tag = (lv) => `${Math.floor(lv / 4) + 1}-${lv % 4 + 1}`;

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld();
const { scene } = world;
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.02, 800);
const rig = new THREE.Group();          // VR: referência do óculos (recentralizar põe a cabeça no centro da praça)
scene.add(rig);
rig.add(camera);

const meteorView = new MeteorView(scene);
const blastView = new BlastView(scene);
const shotView = new ShotView(scene);
const particles = new Particles(scene);
const launchers = [buildLauncher(GUN_COLORS[0]), buildLauncher(GUN_COLORS[1])];
const cursors = [buildCursor(GUN_COLORS[0]), buildCursor(GUN_COLORS[1])];
const pcCursor = buildCursor('#ffffff');
for (const c of [...cursors, pcCursor]) { c.visible = false; scene.add(c); }

// menus e placas
const panel = new Panel(0.9);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const statusLabel = new Label(0.5, 768, 192);       // placar (VR), embaixo da visão
const msgLabel = new Label(0.9, 1024, 128);          // avisos (VR), seguem a cabeça devagar
const bossLabel = new Label(0.6, 768, 96);
scene.add(statusLabel.mesh, msgLabel.mesh, bossLabel.mesh);
statusLabel.mesh.visible = msgLabel.mesh.visible = bossLabel.mesh.visible = false;
// pontos que sobem de cada meteoro estourado
const pops = [];
for (let i = 0; i < 8; i++) { const L = new Label(0.32, 256, 64, { bg: false }); L.mesh.visible = false; L.mesh.renderOrder = 12; scene.add(L.mesh); pops.push({ L, t: 0, p: new THREE.Vector3() }); }
let popNext = 0;

// setas e anéis de aviso (presos à câmera)
const warnGroup = new THREE.Group();
camera.add(warnGroup);
const arrowShape = new THREE.Shape();
arrowShape.moveTo(0, 0.022); arrowShape.lineTo(-0.014, -0.01); arrowShape.lineTo(0, -0.002); arrowShape.lineTo(0.014, -0.01); arrowShape.closePath();
const arrowGeo = new THREE.ShapeGeometry(arrowShape);
const ringGeo = new THREE.RingGeometry(0.016, 0.021, 28);
const warnMarks = [];
for (let i = 0; i < 12; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const arrow = new THREE.Mesh(arrowGeo, mat), ring = new THREE.Mesh(ringGeo, mat);
  arrow.renderOrder = ring.renderOrder = 30;
  arrow.visible = ring.visible = false;
  warnGroup.add(arrow, ring);
  warnMarks.push({ arrow, ring, mat });
}

// ---------- Estado ----------
let app = 'menu';            // 'menu' | 'playing' | 'paused' | 'done' | 'initials'
let level = 0;
let game = null;
let robot = makeRobot();
let demo = true;             // no menu o robô joga sozinho, ao fundo, sem som
let msg = null;
let doneTimer = 0;
let lastResult = null, newBest = false, lastRunScore = 0;
let run = null;              // partida: fases seguidas com "Próxima fase" ({ score, reached })
const later = [];
let emberT = 0;

const unlocked = (i) => i === 0 || !!save.done[i - 1];
const nextLevel = () => { let n = 0; while (n < LEVELS.length - 1 && save.done[n]) n++; return n; };
// casas de pé no começo da fase: as que sobraram no fim da fase anterior do mesmo mundo
function startMask(lv) {
  const w = Math.floor(lv / 4);
  if (lv % 4 === 0) return allMask(w);
  return save.masks[lv - 1] ?? allMask(w);
}

function newGame(lv, opts = {}) {
  level = clamp(lv, 0, LEVELS.length - 1);
  const w = Math.floor(level / 4);
  world.setWorld(w, WORLDS[w].theme);
  blastView.setTheme(world.theme);
  sfx.setWorld(WORLDS[w].theme);
  game = new Game(level, opts);
  robot.reset();
  acc = 0;
  later.length = 0;
  syncHouses();
}
const syncHouses = () => world.setHouses(game.buildings.map(b => b.alive));

function startLevel(lv, cont = false) {
  demo = false;
  const houses = cont && lastResult && Math.floor(lv / 4) === Math.floor(level / 4) ? lastResult.mask : startMask(lv);
  if (!cont || !run) run = { score: 0, reached: tag(lv) };
  newGame(lv, { houses, seed: Math.floor(Math.random() * 1e6) });
  run.reached = tag(level);
  app = 'playing';
  doneTimer = 0;
  panel.hide();
  const L = LEVELS[level];
  const missing = 10 - game.standing;
  showMsg(`Fase ${tag(level)}: ${L.name}. ${L.hint}${missing ? ` (${missing} construç${missing === 1 ? 'ão' : 'ões'} já em ruína)` : ''}`, 7, '#fff2dc');
  updateHint();
}

function togglePause() {
  if (app === 'playing') { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused') { app = 'playing'; panel.hide(); }
  updateHint();
}

function goMenu() {
  app = 'menu';
  demo = true;
  newGame(nextLevel(), { seed: Math.floor(Math.random() * 1e6) });
  showScreen('main');
  updateHint();
}

// Fim da partida: se os pontos entram nos recordes, pede as 3 letras antes de seguir.
function endRun(then) {
  const r = run;
  run = null;
  if (r && qualifies(save, r.score)) { initials = { score: r.score, reached: r.reached, letters: save.initials.split(''), then }; app = 'initials'; showScreen('initials'); return; }
  then();
}
let initials = null;

function showMsg(text, t = 2, color = '#ffd25a') { msg = { text, t, color }; }

// ---------- Menus ----------
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  if (document.pointerLockElement) { ignoreUnlock = true; document.exitPointerLock(); }
  placePanel();
  panel.show((p) => {
    if (name === 'main') {
      p.title('CÉU DE FOGO', 76, 66);
      p.text('Meteoros caem de todo lado sobre a vila em volta de você.', 512, 134, { size: 26, color: UI.dim });
      p.text('Estoure no ar: a explosão pega os vizinhos em cadeia.', 512, 168, { size: 26, color: UI.dim });
      const next = nextLevel();
      p.button(save.done[0] ? `Continuar: fase ${tag(next)}` : 'Começar', () => startLevel(next), 262, 205, 500, 90, { size: 38 });
      p.button('Escolher fase', () => showScreen('levels'), 262, 309, 245, 76, { size: 30 });
      p.button('Recordes', () => showScreen('records'), 517, 309, 245, 76, { size: 30 });
      p.button('Como jogar', () => showScreen('help'), 262, 399, 500, 72);
      const opt = (label, key, x, after) => p.button(`${label}: ${save[key] ? 'sim' : 'não'}`, () => { save[key] = !save[key]; storeSave(save); after?.(); showScreen('main'); }, x, 489, 220, 62, { size: 25 });
      opt('Som', 'sound', 152, () => sfx.setOn(save.sound));
      opt('Setas', 'arrows', 402);
      opt('FPS', 'fps', 652);
      const total = Object.values(save.done).reduce((s, d) => s + (d.stars || 0), 0);
      const top = save.records[0];
      p.text(`Estrelas: ${total} de ${LEVELS.length * 3}${top ? `   ·   Recorde: ${top.name} ${top.score}` : ''}`, 512, 596, { size: 26, color: UI.star });
      p.text(vr ? 'Aponte e aperte o gatilho para escolher' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 650, { size: 22, color: UI.dim });
    } else if (name === 'levels') {
      p.title('Escolher fase', 58, 50);
      WORLDS.forEach((W, w) => {
        const y = 118 + w * 160;
        p.text(`${w + 1}. ${W.name}`, 102, y, { size: 24, color: UI.dim, align: 'left', bold: true });
        for (let k = 0; k < 4; k++) {
          const i = w * 4 + k, d = save.done[i];
          p.tile(102 + k * 210, y + 16, 190, 120, { num: tag(i), name: LEVELS[i].name, stars: d?.stars || 0, done: !!d, locked: !unlocked(i), master: k === 3, action: () => endRunThen(() => startLevel(i)) });
        }
      });
      p.text('Fases 2, 3 e 4 começam com as casas que sobraram na fase anterior', 512, 600, { size: 21, color: UI.dim });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : app === 'done' ? 'done' : 'main'), 362, 626, 300, 66, { size: 30 });
    } else if (name === 'records') {
      p.title('Recordes', 64);
      if (!save.records.length) p.text('Nenhum recorde ainda. Jogue uma partida!', 512, 300, { size: 30, color: UI.dim });
      save.records.forEach((r, i) => {
        const y = 140 + i * 54;
        const hl = initials?.idx === i;
        p.text(`${i + 1}.`, 250, y, { size: 32, color: hl ? UI.edge : UI.dim, align: 'right', bold: true });
        p.text(r.name, 290, y, { size: 34, color: hl ? UI.edge : UI.text, align: 'left', bold: true });
        p.text(String(r.score).padStart(7, ' '), 640, y, { size: 34, color: hl ? UI.edge : UI.star, align: 'right', bold: true });
        p.text(`fase ${r.reached}`, 700, y, { size: 24, color: UI.dim, align: 'left' });
      });
      p.button(recordsThen ? 'Continuar' : 'Voltar', () => { initials = null; const then = recordsThen; recordsThen = null; then ? then() : showScreen('main'); }, 362, 600, 300, 76, { size: 30 });
    } else if (name === 'initials') {
      const I = initials;
      p.title('NOVO RECORDE!', 70, 56);
      p.text(`${I.score} pontos (até a fase ${I.reached})`, 512, 132, { size: 32, color: UI.star, bold: true });
      p.text('Suas iniciais:', 512, 186, { size: 26, color: UI.dim });
      for (let k = 0; k < 3; k++) {
        const x = 512 + (k - 1) * 150;
        const bump = (d) => () => { const c = I.letters[k].charCodeAt(0) - 65; I.letters[k] = String.fromCharCode(65 + (c + d + 26) % 26); sfx.click(); showScreen('initials'); };
        p.button('▲', bump(1), x - 55, 220, 110, 70, { size: 34 });
        p.text(I.letters[k], x, 352, { size: 96, color: UI.edge, bold: true });
        p.button('▼', bump(-1), x - 55, 414, 110, 70, { size: 34 });
      }
      p.button('Gravar', () => {
        const name = I.letters.join('');
        save.initials = name;
        const idx = addRecord(save, { name, score: I.score, reached: I.reached });
        storeSave(save);
        const then = I.then;
        initials = { idx };
        recordsThen = then;   // depois de mostrar a tabela, segue para onde a pessoa ia
        sfx.won();
        showScreen('records');
      }, 262, 530, 500, 90, { size: 38 });
    } else if (name === 'help') {
      p.title('Como jogar', 56);
      const rows = vr ? [
        'Um lançador em cada mão: aponte e aperte o gatilho.',
        'O projétil voa até o cursor e explode; o cursor gruda no meteoro.',
        'Mire à frente do meteoro: o projétil leva um tempinho para chegar.',
        'Meteoro na explosão explode também: cadeia vale ×2, ×3, ×4...',
        'Cada lançador tem munição própria; recarrega entre as ondas.',
        'Ouça: o assobio vem do lado de onde o meteoro vai aparecer.',
        'Laranja se parte em 3; azul é rápido; verde muda de alvo.',
        'Casa destruída só volta no próximo mundo.  B/Y: pausa.',
      ] : [
        'Clique na tela para travar o mouse; o mouse olha em volta e mira.',
        'Clique esquerdo: lançador esquerdo. Clique direito: o direito.',
        'O projétil voa até o cursor e explode; o cursor gruda no meteoro.',
        'Meteoro na explosão explode também: cadeia vale ×2, ×3, ×4...',
        'Cada lançador tem munição própria; recarrega entre as ondas.',
        'Ouça: o assobio vem do lado de onde o meteoro vai aparecer.',
        'Laranja se parte em 3; azul é rápido; verde muda de alvo.',
        'Casa destruída só volta no próximo mundo.  Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 50, 116 + i * 58, { size: 25, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 64);
      p.text(`Fase ${tag(level)}: ${LEVELS[level].name}, onda ${game.wave + 1} de ${game.waves}`, 512, 122, { size: 28, color: UI.dim });
      p.button('Continuar', () => togglePause(), 262, 160, 500, 84);
      p.button('Recomeçar a fase', () => endRunThen(() => startLevel(level)), 262, 258, 500, 80);
      p.button('Recentralizar', () => { recenter(); togglePause(); }, 262, 352, 245, 80, { size: 28, locked: !vr });
      p.button('Como jogar', () => showScreen('help'), 517, 352, 245, 80, { size: 28 });
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; storeSave(save); sfx.setOn(save.sound); showScreen('pause'); }, 262, 446, 245, 72, { size: 26 });
      p.button(`Setas: ${save.arrows ? 'sim' : 'não'}`, () => { save.arrows = !save.arrows; storeSave(save); showScreen('pause'); }, 517, 446, 245, 72, { size: 26 });
      p.button('Menu principal', () => endRunThen(goMenu), 262, 560, 500, 80);
    } else if (name === 'done') {
      const r = lastResult, d = save.done[level];
      if (r.won) {
        p.title(newBest ? 'Vila salva! Melhor marca!' : 'Vila salva!', 62, 50);
        p.stars(r.stars, 512, 132, 70);
        p.text(`Construções perdidas: ${r.lost}  ·  de pé: ${r.standing} de 10`, 512, 200, { size: 30, bold: true, color: UI.text });
      } else {
        p.title('A vila caiu', 62);
        p.text(`Na onda ${game.wave + 1} de ${game.waves}`, 512, 136, { size: 32, color: UI.red });
        p.text('Dica: estoure os meteoros no alto, onde passam juntos, e use as duas mãos.', 512, 196, { size: 24 });
      }
      p.text(`Pontos ${r.score}  ·  estourados ${r.kills}  ·  maior cadeia ×${r.bestChain + 1}`, 512, 250, { size: 27, color: UI.star });
      p.text(`Partida: ${run ? run.score : lastRunScore} pontos`, 512, 290, { size: 25, color: UI.dim });
      const L = LEVELS[level];
      p.text(`3 estrelas perdendo até ${L.stars[0]} · 2 até ${L.stars[1]} · 1 salvando alguma`, 512, 326, { size: 21, color: UI.dim });
      if (d) p.text(`Melhor: ${d.stars} estrela${d.stars === 1 ? '' : 's'}, ${d.score} pontos`, 512, 356, { size: 22, color: UI.dim });
      if (r.won && level < LEVELS.length - 1) {
        const nw = Math.floor((level + 1) / 4) !== Math.floor(level / 4);
        p.button(nw ? `Próximo mundo: ${WORLDS[Math.floor((level + 1) / 4)].name}` : 'Próxima fase', () => startLevel(level + 1, true), 212, 380, 600, 90, { size: 32 });
      } else if (r.won) p.text('Você salvou os três mundos!', 512, 424, { size: 34, bold: true, color: UI.edge });
      p.button(r.won ? 'Repetir' : 'Tentar de novo', () => endRunThen(() => startLevel(level)), 262, 486, 245, 80);
      p.button('Fases', () => endRunThen(() => showScreen('levels')), 517, 486, 245, 80);
      p.button('Menu principal', () => endRunThen(goMenu), 262, 584, 500, 76);
    }
  });
}
let recordsThen = null;
// sair da partida (o que não for "Próxima fase") passa pelos recordes
function endRunThen(fn) {
  endRun(() => fn());
}

function placePanel() {
  if (renderer.xr.isPresenting) {
    if (panel.mesh.parent !== scene) scene.add(panel.mesh);
    panel.mesh.scale.setScalar(1);
    const e = new THREE.Euler().setFromQuaternion(xrHeadQuat(), 'YXZ');
    const head = xrHeadPos();
    panel.mesh.position.set(head.x - Math.sin(e.y) * 1.05, head.y + 0.02, head.z - Math.cos(e.y) * 1.05);
    panel.mesh.rotation.set(0, e.y, 0);
    return;
  }
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * camera.aspect;
  panel.mesh.position.set(0, 0, -0.8);
  panel.mesh.rotation.set(0, 0, 0);
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.9, visH * 0.92 / 0.633));
}

function finishLevel() {
  const r = game.result;
  lastResult = r;
  if (run) run.score += r.score;
  lastRunScore = run ? run.score : r.score;
  const prev = save.done[level];
  newBest = false;
  if (r.won) {
    newBest = !prev || r.stars > prev.stars || r.score > prev.score;
    save.done[level] = { stars: Math.max(r.stars, prev?.stars || 0), score: Math.max(r.score, prev?.score || 0), lost: Math.min(r.lost, prev?.lost ?? 99) };
    const pm = save.masks[level];
    if (pm === undefined || countMask(r.mask) > countMask(pm)) save.masks[level] = r.mask;
    storeSave(save);
  }
  app = 'done';
  const last = r.won && level === LEVELS.length - 1;
  if (!r.won || last) endRun(() => { app = 'done'; showScreen('done'); });
  else showScreen('done');
  for (let k = 0; k < r.stars; k++) setTimeout(() => sfx.star(k), 300 + k * 220);
  updateHint();
}

// ---------- Controles do VR ----------
const ctrls = [];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl, grip);
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffb020 }));
  laser.visible = false;
  ctrl.add(laser);
  const entry = { ctrl, grip, laser, source: null, side: null, prevButtons: [], hoverIndex: -1, trigger: false };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
  ctrl.addEventListener('disconnected', () => { entry.source = null; entry.side = null; entry.trigger = false; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
  ctrl.addEventListener('selectend', () => { entry.trigger = false; });
  ctrl.addEventListener('squeezestart', () => sfx.unlock());
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) {
  try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ }
}
const both = (v, ms) => { pulse('left', v, ms); pulse('right', v, ms); };

function onSelect(entry) {
  sfx.unlock();
  if (panel.visible) {
    if (entry.hoverIndex >= 0) { const a = panel.actionAt(entry.hoverIndex); if (a) { sfx.click(); a(); } }
    return;
  }
  entry.trigger = true;
}
function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5] && (app === 'playing' || app === 'paused')) togglePause();   // B ou Y
    e.prevButtons = b;
  }
}

// ---------- VR: sessão e recentralizar ----------
let recenterIn = 0;
function xrHeadPos() { return renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()) : camera.getWorldPosition(new THREE.Vector3()); }
function xrHeadQuat() { return renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldQuaternion(new THREE.Quaternion()) : camera.getWorldQuaternion(new THREE.Quaternion()); }
function recenter() {
  if (!renderer.xr.isPresenting) return;
  // põe a cabeça no centro da praça, olhando para a frente (a vila fica na cintura, sentado ou em pé)
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(-head.x, -head.y, -head.z);
  if (panel.visible) placePanel();
}
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 6;
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  if (panel.visible) setTimeout(placePanel, 150);
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  for (const e of ctrls) e.trigger = false;
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  if (panel.visible) placePanel();
  onResize();
  updateHint();
});

// ---------- Mouse e teclado (PC) ----------
const look = { yaw: 0, pitch: 0.45 };
const mouse = { ndc: new THREE.Vector2(0, 0) };
const pc = [false, false];
const raycaster = new THREE.Raycaster();
let ignoreUnlock = false;
const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (app !== 'playing') return;
  if (document.pointerLockElement !== canvas) {
    if (canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); r?.catch?.(() => {}); } catch { /* sem trava */ } }
    return;   // o primeiro clique só trava o mouse
  }
  if (e.button === 0) pc[0] = true;
  if (e.button === 2) pc[1] = true;
});
window.addEventListener('pointerup', (e) => {
  if (e.button === 0) pc[0] = false;
  if (e.button === 2) pc[1] = false;
});
canvas.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (document.pointerLockElement === canvas && app === 'playing' && !dev.autoplay) {
    look.yaw -= e.movementX * 0.0022;
    look.pitch = clamp(look.pitch - e.movementY * 0.0022, -1.45, 1.5);
  }
});
let lockPauseAt = 0;
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && app === 'playing' && !ignoreUnlock) { togglePause(); lockPauseAt = performance.now(); }
  ignoreUnlock = false;
  updateHint();
});
window.addEventListener('blur', () => { pc[0] = pc[1] = false; });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  if (e.repeat) return;
  if (k === 'escape' || k === 'p') {
    if (k === 'escape' && performance.now() - lockPauseAt < 400) return;   // o Esc que soltou o mouse já pausou
    if (app === 'playing' || app === 'paused') togglePause();
    return;
  }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
  if (app !== 'playing') return;
  if (k === 'q') pc[0] = true;
  if (k === 'e') pc[1] = true;
});
window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === 'q') pc[0] = false; if (k === 'e') pc[1] = false; });
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (panel.visible) placePanel();
}
window.addEventListener('resize', onResize);

// ---------- Entrada para o jogo ----------
const camAim = { p: null, snap: null };
function buildInput() {
  const vr = renderer.xr.isPresenting;
  if (dev.autoplay || demo) {
    const r = robot.step(game);
    if (demo && vr) for (const g of r.guns) g.fire = false;   // menu no VR: o robô não atira
    return r;
  }
  const guns = [];
  if (vr) {
    for (let i = 0; i < 2; i++) {
      const e = entryFor(SIDES[i]);
      const m = launchers[i].muzzle;
      m.getWorldPosition(_v);
      m.getWorldQuaternion(_q);
      _v2.set(0, 0, -1).applyQuaternion(_q);
      guns.push({ o: [_v.x, _v.y, _v.z], d: [_v2.x, _v2.y, _v2.z], fire: !!e && e.trigger && app === 'playing' });
    }
    return { guns };
  }
  // PC: o centro da tela mira; os dois lançadores mandam o projétil para o mesmo ponto
  const aim = camAim.p;
  for (let i = 0; i < 2; i++) {
    launchers[i].muzzle.getWorldPosition(_v);
    const d = aim ? _v2.set(...aim).sub(_v).normalize() : _v2.set(0, 0, -1);
    guns.push({ o: [_v.x, _v.y, _v.z], d: [d.x, d.y, d.z], fire: app === 'playing' && pc[i] });
  }
  return { guns };
}
function updatePcAim() {
  camera.getWorldPosition(_v);
  _v2.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_q));
  const a = game.aimPoint([_v.x, _v.y, _v.z], [_v2.x, _v2.y, _v2.z]);
  camAim.p = a.p; camAim.snap = a.snap;
}

// ---------- Câmera, lançadores e cursores ----------
function placeLaunchers(vr) {
  const auto = (dev.autoplay || demo) && !vr;
  for (let i = 0; i < 2; i++) {
    const c = launchers[i].group;
    if (vr) {
      const e = entryFor(SIDES[i]);
      c.visible = !!e;
      if (e && c.parent !== e.ctrl) { e.ctrl.add(c); c.position.set(0, 0, 0); c.quaternion.identity(); c.scale.setScalar(1); }
      continue;
    }
    c.visible = app !== 'menu';
    if (c.parent !== camera) camera.add(c);
    c.position.set(i ? 0.17 : -0.17, -0.15, -0.42);
    c.scale.setScalar(0.75);
    if (auto) {
      const d = robot.hands[i];
      camera.getWorldQuaternion(_q).invert();
      c.quaternion.setFromUnitVectors(_v.set(0, 0, -1), _v2.set(d[0], d[1], d[2]).applyQuaternion(_q));
    } else if (camAim.p) {
      camera.updateMatrixWorld(true);
      const local = camera.worldToLocal(_v2.set(...camAim.p));
      c.quaternion.setFromUnitVectors(_v.set(0, 0, -1), local.sub(c.position).normalize());
    }
  }
}
const _cp = new THREE.Vector3();
function placeCursor(cur, p, snapped, head) {
  cur.visible = true;
  cur.position.set(...p);
  const d = _cp.copy(cur.position).distanceTo(head);
  cur.scale.setScalar(clamp(d, 0.3, 10) * (snapped ? 0.03 : 0.022));
  cur.lookAt(head);
  const U = cur.userData;
  U.mat.opacity = snapped ? 1 : 0.6;
  for (const t of U.ticks) t.visible = !!snapped;
}
function updateCursors() {
  const vr = renderer.xr.isPresenting;
  const playing = app === 'playing' && !demo;
  const head = xrHeadPos();
  pcCursor.visible = false;
  for (const c of cursors) c.visible = false;
  if (!playing) return;
  if (vr) {
    for (let i = 0; i < 2; i++) {
      if (!entryFor(SIDES[i])) continue;
      const m = launchers[i].muzzle;
      m.getWorldPosition(_v); m.getWorldQuaternion(_q);
      _v2.set(0, 0, -1).applyQuaternion(_q);
      const a = game.aimPoint([_v.x, _v.y, _v.z], [_v2.x, _v2.y, _v2.z]);
      placeCursor(cursors[i], a.p, a.snap !== null, head);
    }
  } else if (!dev.autoplay && camAim.p) placeCursor(pcCursor, camAim.p, camAim.snap !== null, head);
}

function updatePcCamera(dt) {
  if (renderer.xr.isPresenting) return;
  camera.position.set(0, 0, 0);
  if (app === 'menu' || (app === 'initials' || (app === 'done' && demo))) {
    look.yaw += dt * 0.05;
    look.pitch += (0.12 + Math.sin(time * 0.1) * 0.15 - look.pitch) * Math.min(1, dt);
    camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    return;
  }
  if (dev.autoplay) {
    camLook.lerp(_v.set(...robot.head), Math.min(1, dt * 10)).normalize();
    look.yaw = Math.atan2(-camLook.x, -camLook.z);
    look.pitch = Math.asin(clamp(camLook.y, -1, 1));
  }
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
}
const camLook = new THREE.Vector3(0, 0.5, -0.87);

// ---------- Raios do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = false;
    if (!vr || !e.source || !panel.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.visible = true;
    e.laser.scale.z = hit ? hit.distance : 1.2;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    canvas.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else if (!vr) canvas.style.cursor = 'none';
  if (panel.visible) panel.setHover(hover);
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const msgEl = document.getElementById('msg');
const fpsEl = document.getElementById('fps');
const bossEl = document.getElementById('boss'), bossNameEl = document.getElementById('bossName'), bossBarEl = document.getElementById('bossBar');
const ammoEl = document.getElementById('ammo'), crossEl = document.getElementById('cross');
const gunEls = [0, 1].map(i => document.getElementById('g' + i));
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  if (app === 'playing' && document.pointerLockElement !== canvas && !dev.autoplay) hintEl.innerHTML = '<span><b>Clique na tela para travar o mouse e mirar</b> · Esc: pausa</span>';
  else hintEl.innerHTML = app === 'playing'
    ? '<span>Mouse: olha e mira · clique esquerdo/direito (ou Q/E): lançador esquerdo/direito · Esc: pausa</span>'
    : '<span>Clique nas opções do painel</span>';
}
function phaseText() {
  if (game.phase === 'intro') return `Começa em ${Math.ceil(game.phaseT)} s`;
  if (game.phase === 'break') return `Recarregando: ${Math.ceil(game.phaseT)} s`;
  if (game.phase === 'won') return 'Vila salva!';
  if (game.phase === 'lost') return 'A vila caiu';
  return game.waveDef.boss ? `Chefe: ${game.waveDef.boss && WORLDS[game.world].comet.name}` : game.waveDef.name;
}
const houseIcons = () => game.buildings.map(b => b.alive ? '<i>■</i>' : '<s>■</s>').join('');
function updateHud(dt) {
  const vr = renderer.xr.isPresenting;
  const playing = (app === 'playing' || app === 'done' || app === 'paused') && !demo && !!game;
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  const boss = game.boss && !game.boss.dead ? game.boss : null;
  const total = (run?.score ?? 0) + game.score;
  if (!vr) {
    statusLabel.mesh.visible = msgLabel.mesh.visible = bossLabel.mesh.visible = false;
    hudEl.style.display = scoreEl.style.display = playing ? 'block' : 'none';
    ammoEl.style.display = playing ? 'flex' : 'none';
    crossEl.style.display = playing && app === 'playing' && !dev.autoplay ? 'block' : 'none';
    if (playing) {
      const html = `<b>Fase ${tag(level)}: ${LEVELS[level].name}</b><br>Onda ${game.wave + 1} de ${game.waves} · <em>${phaseText()}</em><div class="houses">${houseIcons()}</div>`;
      if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
      const sh = `${String(total).padStart(6, '0')}<small>fase ${game.score}${save.records[0] ? ` · recorde ${save.records[0].score}` : ''}</small>`;
      if (scoreEl.dataset.last !== sh) { scoreEl.innerHTML = sh; scoreEl.dataset.last = sh; }
      game.guns.forEach((G, i) => {
        const el = gunEls[i];
        el.querySelector('span').textContent = String(G.ammo).padStart(2, '0');
        el.classList.toggle('low', G.ammo > 0 && G.ammo <= 3);
        el.classList.toggle('out', G.ammo === 0);
      });
    }
    bossEl.style.display = playing && boss ? 'block' : 'none';
    if (boss) { bossNameEl.textContent = boss.name; bossBarEl.style.width = `${Math.round(boss.hpFrac * 100)}%`; }
    const mtxt = msg && playing ? msg.text : '';
    if (msgEl.dataset.last !== mtxt) { msgEl.textContent = mtxt; msgEl.style.color = msg?.color || '#fff'; msgEl.dataset.last = mtxt; }
    msgEl.style.display = mtxt ? 'block' : 'none';
    return;
  }
  hudEl.style.display = scoreEl.style.display = ammoEl.style.display = crossEl.style.display = bossEl.style.display = msgEl.style.display = 'none';
  statusLabel.mesh.visible = playing && app !== 'done';
  msgLabel.mesh.visible = playing && !!msg;
  bossLabel.mesh.visible = playing && !!boss;
  if (!playing) return;
  const blocks = (v) => '█'.repeat(Math.round(v / 10)) + '░'.repeat(10 - Math.round(v / 10));
  statusLabel.set([
    { text: `${String(total).padStart(6, '0')}`, size: 0.36, color: '#ffd25a' },
    { text: `Fase ${tag(level)} · onda ${game.wave + 1}/${game.waves} · ${phaseText()}`, size: 0.22, color: '#fff2dc' },
    { text: `CASAS ${game.buildings.map(b => b.alive ? '■' : '□').join('')}`, size: 0.24, color: '#ffd890' },
  ]);
  // placas seguem a cabeça devagar (sem ficar coladas no rosto); o placar fica embaixo da visão
  const hp = xrHeadPos(), hq = xrHeadQuat();
  const e = new THREE.Euler().setFromQuaternion(hq, 'YXZ');
  const fwd = _v.set(-Math.sin(e.y), 0, -Math.cos(e.y));
  const k = Math.min(1, dt * 2.5);
  const tgt = hp.clone().addScaledVector(fwd, 1.15).add(_v2.set(0, 0.3 + Math.sin(e.x) * 0.9, 0));
  msgLabel.mesh.position.lerp(tgt, msgLabel.mesh.visible ? k : 1);
  msgLabel.mesh.lookAt(hp);
  bossLabel.mesh.position.lerp(tgt.clone().add(_v2.set(0, 0.14, 0)), bossLabel.mesh.visible ? k : 1);
  bossLabel.mesh.lookAt(hp);
  const st = hp.clone().addScaledVector(fwd, 0.9).add(_v2.set(0, -0.42, 0));
  statusLabel.mesh.position.lerp(st, statusLabel.mesh.visible ? Math.min(1, dt * 1.5) : 1);
  statusLabel.mesh.lookAt(hp);
  if (msg) msgLabel.set([{ text: msg.text, size: 0.62, color: msg.color, bold: false }]);
  if (boss) bossLabel.set([{ text: `${boss.name}  ${blocks(boss.hpFrac * 100)}`, size: 0.6, color: '#ffe0a0' }]);
}

// setas na borda da visão e anéis onde o meteoro vai aparecer
const WARN_COLOR = { ...KIND_COLOR, comet: '#ffe0a0' };
const _wd = new THREE.Vector3(), _iq = new THREE.Quaternion();
function updateWarnings() {
  const show = save.arrows && game && !demo && (app === 'playing' || app === 'paused') && game.phase === 'wave';
  const list = show ? game.warnings.slice(-warnMarks.length) : [];
  camera.getWorldQuaternion(_iq).invert();
  const vr = renderer.xr.isPresenting;
  const ry = vr ? 0.26 : 0.5 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.8;
  const rx = vr ? 0.3 : Math.min(ry * camera.aspect * 0.9, ry * 2.2);
  warnMarks.forEach((m, i) => {
    const w = list[i];
    m.arrow.visible = m.ring.visible = false;
    if (!w) return;
    const age = game.t - w.t0, left = w.until - game.t;
    m.mat.color.set(WARN_COLOR[w.kind] || '#ffffff');
    m.mat.opacity = Math.min(1, age * 4, left * 2) * (0.65 + 0.35 * Math.sin(age * 14));
    _wd.set(...w.dir).applyQuaternion(_iq);
    const off = Math.acos(clamp(-_wd.z, -1, 1));
    if (_wd.z < 0 && off < THREE.MathUtils.degToRad(vr ? 24 : camera.fov * 0.4)) {
      m.ring.visible = true;
      m.ring.position.copy(_wd).multiplyScalar(0.5 / -_wd.z);
      m.ring.scale.setScalar((1 + Math.max(0, 1 - age) * 2) * (w.boss ? 2 : 1));
    } else {
      const a = Math.atan2(_wd.y, _wd.x);
      m.arrow.visible = true;
      m.arrow.position.set(Math.cos(a) * rx, Math.sin(a) * ry, -0.5);
      m.arrow.rotation.z = a - Math.PI / 2;
      m.arrow.scale.setScalar(w.boss ? 1.8 : 1);
    }
  });
}

// pontos que sobem
function popup(p, text, color) {
  const P = pops[popNext]; popNext = (popNext + 1) % pops.length;
  P.L.set([{ text, size: 0.8, color }]);
  P.p.set(...p); P.t = 1.1;
  P.L.mesh.visible = true;
}
function updatePops(dt) {
  const head = xrHeadPos();
  for (const P of pops) {
    if (P.t <= 0) { P.L.mesh.visible = false; continue; }
    P.t -= dt;
    P.p.y += dt * 0.25;
    P.L.mesh.position.copy(P.p);
    const d = P.p.distanceTo(head);
    P.L.mesh.scale.setScalar(clamp(d, 0.4, 8) * 0.5);
    P.L.mesh.lookAt(head);
    P.L.mesh.material.opacity = Math.min(1, P.t * 2);
  }
}

// ---------- Eventos do jogo -> som, vibração, avisos, efeitos ----------
let chainShown = 0;
function handleEvents(evs) {
  const quiet = demo;
  for (const ev of evs) {
    switch (ev.type) {
      case 'warn': if (!quiet) sfx.warn(ev.kind, ev.dir, ev.boss); break;
      case 'launch':
        launchers[ev.gun].fire();
        particles.burst(ev.o, GUN_COLORS[ev.gun], 6, 0.4, 0.25, 0.012);
        if (!quiet) { sfx.launch(ev.gun, ev.o); pulse(SIDES[ev.gun], 0.35, 30); }
        break;
      case 'empty':
        if (!quiet) { sfx.empty(); pulse(SIDES[ev.gun], 0.15, 20); showMsg(`Lançador ${GUN_NAME[ev.gun]} sem munição: use a outra mão`, 1.6, '#ffb040'); }
        break;
      case 'blast':
        particles.burst(ev.p, '#fff4d0', 10, 0.8, 0.35, 0.02);
        if (!quiet) sfx.blast(ev.p, 0);
        break;
      case 'kill': {
        const c = KIND_COLOR[ev.kind] || '#ffb060';
        particles.burst(ev.p, c, 22, 1.2, 0.8, 0.022, 0.6);
        particles.burst(ev.p, '#ffffff', 6, 0.5, 0.3, 0.03);
        if (!quiet) {
          sfx.kill(ev.p, ev.level); sfx.blast(ev.p, ev.level + 1);
          popup(ev.p, ev.mult > 1 ? `+${ev.pts} ×${ev.mult}` : `+${ev.pts}`, ev.mult > 1 ? '#ffd25a' : '#fff2dc');
          if (ev.level >= 2 && ev.level + 1 > chainShown) { chainShown = ev.level + 1; showMsg(`CADEIA ×${ev.level + 1}!`, 1.4, '#ffd25a'); sfx.chain(ev.level + 1); both(0.3, 40); }
        }
        break;
      }
      case 'house-down': {
        syncHouses();
        particles.burst(ev.p, '#ff8a3a', 40, 0.9, 1.0, 0.03, 0.8);
        particles.burst(ev.p, '#ffe0a0', 12, 0.5, 0.4, 0.05);
        if (!quiet) {
          sfx.houseDown(ev.p); both(0.8, 120);
          showMsg(ev.left ? `Construção destruída! Restam ${ev.left}` : 'A última construção caiu!', 2, '#ff6a5a');
          if (ev.left > 0 && ev.left <= 2) sfx.alarm();
        }
        break;
      }
      case 'crater': particles.burst(ev.p, '#c89060', 14, 0.5, 0.6, 0.02, 1); if (!quiet) sfx.crater(ev.p); break;
      case 'split': particles.burst(ev.p, KIND_COLOR.racha, 24, 0.9, 0.5, 0.02); if (!quiet) sfx.split(ev.p); break;
      case 'swerve': particles.burst(ev.p, KIND_COLOR.curva, 8, 0.4, 0.4, 0.015); if (!quiet) sfx.swerve(ev.p); break;
      case 'wave-start':
        chainShown = 0;
        if (!quiet) { sfx.waveStart(ev.boss); if (!ev.boss) showMsg(`Onda ${ev.wave + 1}: ${ev.name}`, 2.2, '#fff2dc'); }
        break;
      case 'wave-clear':
        if (!quiet) {
          sfx.waveClear();
          for (let k = 0; k < Math.min(10, ev.standing); k++) setTimeout(() => sfx.tick(k), 400 + k * 70);
          showMsg(`Onda vencida! Bônus ${ev.bonus}: ${ev.standing} de pé ×100 + ${ev.ammo} projéteis ×10`, 3, '#7ff5d0');
        }
        break;
      case 'boss': if (!quiet) showMsg(`${ev.name}! Cada explosão que encosta tira um pedaço`, 3.5, '#ffe0a0'); break;
      case 'comet-hit':
        particles.burst(ev.p, '#ffd890', 40, 1.6, 0.9, 0.04, 0.5);
        if (!quiet) { sfx.cometHit(ev.p); popup(ev.p, `${ev.hp} de ${game.boss?.max ?? ''}`, '#ffe0a0'); both(0.25, 40); }
        break;
      case 'shed': particles.burst(ev.p, '#ffb060', 14, 0.8, 0.5, 0.025); if (!quiet) sfx.shed(ev.p); break;
      case 'boss-down':
        for (let k = 0; k < 7; k++) later.push({ t: time + k * 0.18, fn: () => particles.burst(ev.p.map(v => v + (Math.random() - 0.5) * 0.8), world.theme.blast[k % 4], 50, 1.8, 1.0, 0.05, 0.3) });
        if (!quiet) { sfx.bossDown(ev.p); showMsg(`${ev.name} partido! Cuidado com os pedaços`, 3, '#ffd25a'); both(1, 250); }
        break;
      case 'comet-impact':
        particles.burst(ev.p, '#ff6a2a', 300, 3, 1.6, 0.08, 0.6);
        if (!quiet) { sfx.cometImpact(); both(1, 600); showMsg('O cometa arrasou a vila...', 3, '#ff5a6a'); }
        syncHouses();
        break;
      case 'won': if (!quiet) { sfx.won(); doneTimer = 2.5; } break;
      case 'lost': if (!quiet) { sfx.lost(); both(1, 400); doneTimer = 3; } break;
    }
  }
}

// brasas subindo das ruínas
function updateEmbers(dt) {
  emberT -= dt;
  if (emberT > 0 || !game) return;
  emberT = 0.12;
  for (const h of world.houses) {
    if (h.intact.visible || Math.random() < 0.5) continue;
    const p = h.group.position;
    particles.spawn(p.x + (Math.random() - 0.5) * 0.08, p.y + 0.03, p.z + (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.03, 0.12 + Math.random() * 0.1, (Math.random() - 0.5) * 0.03, 1.4, 0.012, Math.random() < 0.5 ? '#ff7a30' : '#ffc060', 0.3);
  }
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const okXR = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!okXR) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now(), time = 0;
let fpsFrames = 0, fpsTime = 0;
const _lf = new THREE.Vector3(), _lu = new THREE.Vector3();
const allTargets = [];

function tick(dt) {
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  pollButtons();
  rig.updateMatrixWorld(true);
  updatePcCamera(dt);
  camera.updateMatrixWorld(true);
  if (!vr) updatePcAim();
  placeLaunchers(vr);
  camera.updateMatrixWorld(true);

  const running = app === 'playing' || app === 'done' || app === 'menu' || (app === 'initials' && demo);
  if (running) {
    acc += dt;
    const n = Math.min(10, Math.floor(acc / DT));
    for (let i = 0; i < n; i++) {
      game.step(buildInput());
      handleEvents(game.events);
    }
    acc -= n * DT;
    if (demo && game.over) newGame(Math.floor(Math.random() * LEVELS.length), { seed: Math.floor(Math.random() * 1e6) });
  } else acc = 0;
  if (app === 'playing' && doneTimer > 0) { doneTimer -= dt; if (doneTimer <= 0) finishLevel(); }
  for (let i = later.length - 1; i >= 0; i--) if (time >= later[i].t) { later[i].fn(); later.splice(i, 1); }

  // visual
  const ahead = app === 'paused' ? 0 : acc;
  allTargets.length = 0;
  for (const m of game.meteors) allTargets.push(m);
  if (game.boss && !game.boss.dead) allTargets.push(game.boss);
  meteorView.update(allTargets, time, ahead);
  blastView.update(game.blasts, time);
  shotView.update(game.shots);
  if (app !== 'paused') { particles.update(dt); updateEmbers(dt); }
  particles.mat.uniforms.uScale.value = vr ? 800 : renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  world.update(app === 'paused' ? 0 : dt, time);
  game.guns.forEach((G, i) => { launchers[i].setAmmo(G.ammo, game.ammoMax); launchers[i].update(dt); });
  updateCursors();
  updateHud(dt);
  updateWarnings();
  updatePops(dt);
  updateMenuRays();

  // ouvinte do áudio 3D = cabeça
  if (sfx.ctx) {
    const hq = xrHeadQuat();
    sfx.setListener(xrHeadPos(), _lf.set(0, 0, -1).applyQuaternion(hq), _lu.set(0, 1, 0).applyQuaternion(hq));
  }

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.loadLevel(5)         abre a fase 5 (1 a 12) com todas as casas; dev.loadLevel(4, 2) abre na onda 2
// dev.autoplay = true      o robô joga (cabeça e mãos com limites humanos)
// dev.advance(20)          avança 20 s de jogo na hora, sem esperar a animação
// dev.state()              resumo: tela, fase, onda, casas, munição, pontos, cometa
// dev.look(az, el)         aponta a câmera do PC (graus)
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; robot.reset(); updateHint(); },
  loadLevel(n, wave = 1) {
    startLevel(clamp(n, 1, 12) - 1);
    if (wave > 1) { newGame(level, { startWave: wave - 1 }); }
    return this.state();
  },
  advance(sec, step = 1 / 72) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  look(az, el = 0) { look.yaw = -THREE.MathUtils.degToRad(az); look.pitch = THREE.MathUtils.degToRad(el); camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ'); return { az, el }; },
  state() {
    const B = game.boss && !game.boss.dead ? game.boss : null;
    return {
      tela: app, fase: tag(level), nome: LEVELS[level].name, mundo: WORLDS[game.world].name, onda: game.wave + 1, etapa: game.phase, tempo: +game.t.toFixed(1),
      casas: game.standing, perdidas: game.lostHere, municao: game.guns.map(G => G.ammo), pontos: game.score, partida: run?.score ?? null,
      meteoros: game.meteors.length, explosoes: game.blasts.length, avisos: game.warnings.length,
      cometa: B ? { nome: B.name, vida: B.hp, de: B.max } : null,
      resultado: game.result, salvo: save.done[level] || null,
    };
  },
  snapshot(w = 960) {
    renderer.render(scene, camera);
    const src = renderer.domElement, c = document.createElement('canvas');
    c.width = w; c.height = Math.round(w * src.height / src.width);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  },
  resetSave() { save.done = {}; save.masks = {}; save.records = []; storeSave(save); },
};
window.dev = dev;
window.meteoro = { dev, get game() { return game; }, save, sfx, robot, startLevel, goMenu, camera, scene, renderer };

goMenu();
renderer.setAnimationLoop(frame);
