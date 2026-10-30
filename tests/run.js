// Testes automáticos: node tests/run.js (ou npm test). Não tocam som nem usam navegador.
import { dirFrom, azElOf, norm, len, sub, madd, mul, dist, angle, DEG } from '../js/vec.js';
import { Game, DT, KIND, BLAST, LAUNCH, HANDS, WARN_T, GROUND_Y, DOME_R, BONUS, COMET_INVULN, ammoFor, Comet, starsFor, allMask, countMask, buildingsOf } from '../js/sim.js';
import { LEVELS, WORLDS } from '../js/levels.js';
import { makeRobot, HUMAN } from '../js/robot.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU:', msg); }
}
const near = (a, b, e) => Math.abs(a - b) <= e;
const idle = { guns: [{ o: HANDS[0], d: [0, 0, -1], fire: false }, { o: HANDS[1], d: [0, 0, -1], fire: false }] };
const shoot = (i, p) => { const g = [idle.guns[0], idle.guns[1]]; g[i] = { o: HANDS[i], d: norm(sub(p, HANDS[i])), fire: true }; return { guns: g }; };
const run = (g, sec, inp = idle) => { const evs = []; for (let i = 0; i < Math.round(sec / DT); i++) { g.step(typeof inp === 'function' ? inp(g) : inp); evs.push(...g.events); } return evs; };
// jogo parado numa onda, sem a fila de meteoros (para montar cenas de teste)
function quiet(level = 0, opts = {}) {
  const g = new Game(level, opts);
  g.phase = 'wave'; g.waveT = 0; g.pending = [{ at: 1e9, kind: 'pedra', p: [0, 5, -5], warned: true }];
  return g;
}
const still = (m) => { m.speed = 0; m.v = [0, 0, 0]; return m; };

console.log('Vetores');
{
  for (const [az, el] of [[0, 0], [90, 10], [-135, -60], [170, 80]]) {
    const r = azElOf(dirFrom(az, el));
    ok(near(r.az, az, 1e-6) && near(r.el, el, 1e-6), `azimute/elevação ida e volta (${az}, ${el})`);
  }
}

console.log('Mundos e fases');
{
  ok(LEVELS.length === 12 && WORLDS.length === 3, '12 fases em 3 mundos');
  LEVELS.forEach((L, i) => {
    const boss = L.waves.filter(w => w.boss).length;
    ok(i % 4 === 3 ? boss === 1 && L.waves[L.waves.length - 1].boss : boss === 0, `fase ${i + 1}: ${i % 4 === 3 ? 'chefe na última onda' : 'sem chefe'}`);
    ok(L.stars[0] < L.stars[1], `fase ${i + 1}: limites de estrela em ordem`);
    for (const W of L.waves) for (const gr of W.groups) ok(!!KIND[gr[1]], `fase ${i + 1}: tipo de meteoro conhecido (${gr[1]})`);
  });
  for (const [w, W] of WORLDS.entries()) {
    const B = buildingsOf(w);
    ok(B.length === 10, `mundo ${w + 1}: 10 construções`);
    let minGap = 9;
    for (const a of B) for (const b of B) if (a !== b) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r);
    ok(minGap > 0.1, `mundo ${w + 1}: construções separadas (folga mínima ${minGap.toFixed(2)} m)`);
    ok(B.every(b => Math.hypot(b.x, b.z) > 0.9), `mundo ${w + 1}: nada em cima do jogador`);
  }
  ok(new Set(WORLDS.map(w => w.comet.boss)).size === 3, 'cada mundo tem um cometa diferente');
  ok(starsFor(LEVELS[0], 0) === 3 && starsFor(LEVELS[0], LEVELS[0].stars[1]) === 2 && starsFor(LEVELS[0], 9) === 1, 'estrelas pelas casas perdidas');
}

console.log('Mira e lançadores');
{
  const g = quiet();
  // sem meteoro perto: cursor na cúpula
  let a = g.aimPoint([0, 0, 0], [0, 0.6, -0.8]);
  ok(near(len(a.p), DOME_R, 1e-6) && a.snap === null, 'sem meteoro perto, o cursor fica na cúpula');
  a = g.aimPoint([0, 0, 0], norm([0, -1, -0.5]));
  ok(near(a.p[1], GROUND_Y + 0.04, 1e-6), 'apontando para baixo, o cursor para no chão');
  // meteoro longe: cursor gruda na profundidade dele (também mirando um pouco à frente)
  const m = g.spawnMeteor('pedra', [1, 3, -5], g.buildings[0]);
  a = g.aimPoint([0, 0, 0], norm(m.p));
  ok(a.snap === m.id && dist(a.p, m.p) < 0.05, `cursor gruda no meteoro apontado (${dist(a.p, m.p).toFixed(3)} m)`);
  a = g.aimPoint([0, 0, 0], norm(madd(m.p, m.v, 1)));
  ok(a.snap === m.id && dist(a.p, madd(m.p, m.v, 1)) < 0.2, 'mirando à frente do meteoro, o cursor vai para o caminho dele');
  // gatilho: um projétil por aperto, munição conta, sem munição não sai
  const g2 = quiet();
  const ammo0 = g2.guns[0].ammo;
  const evs = run(g2, 1, shoot(0, [0, 2, -3]));
  ok(evs.filter(e => e.type === 'launch').length === 1 && g2.guns[0].ammo === ammo0 - 1, 'segurar o gatilho dispara um projétil só');
  let n = 0;
  for (let k = 0; k < ammo0 + 3; k++) { g2.step(shoot(0, [0, 2, -3])); n += g2.events.filter(e => e.type === 'launch').length; run(g2, 0.3); }
  ok(g2.guns[0].ammo === 0 && n === ammo0 - 1, `munição acaba (${n} tiros a mais com ${ammo0 - 1} sobrando)`);
  ok(g2.guns[1].ammo === ammo0, 'cada lançador tem a própria munição');
  // projétil voa até o ponto e explode lá
  const g3 = quiet();
  const tgt = [0, 2, -3];
  const ev3 = run(g3, 2, (gg) => gg.t < DT * 1.5 ? shoot(1, tgt) : idle);
  const bl = ev3.find(e => e.type === 'blast');
  const exp = g3.aimPoint(HANDS[1], norm(sub(tgt, HANDS[1]))).p;
  ok(bl && dist(bl.p, exp) < 1e-6, 'explosão nasce no ponto do cursor');
  ok(bl && near(ev3.indexOf(bl) >= 0 ? 1 : 0, 1, 0), 'projétil chega');
}

console.log('Explosões e cadeia');
{
  const g = quiet();
  const a = still(g.spawnMeteor('pedra', [0.3, 2, -3], g.buildings[0]));
  const b = still(g.spawnMeteor('pedra', [0.62, 2, -3], g.buildings[0]));
  const c = still(g.spawnMeteor('pedra', [0.94, 2, -3], g.buildings[0]));
  const far = still(g.spawnMeteor('pedra', [3, 2, -3], g.buildings[0]));
  g.blasts.push({ p: [0, 2, -3], t: 0, level: 0, R: BLAST.r, r: 0, hitComet: false });
  const evs = run(g, 4);
  const kills = evs.filter(e => e.type === 'kill');
  ok(kills.length === 3, `explosão derruba o meteoro e a cadeia pega os vizinhos (${kills.length})`);
  ok(kills.map(k => k.mult).join(',') === '1,2,3', `pontos progressivos na cadeia: ×1, ×2, ×3 (${kills.map(k => k.mult)})`);
  ok(g.meteors.includes(far), 'meteoro longe fica');
  ok(g.score === KIND.pedra.pts * (1 + 2 + 3), `pontos da cadeia (${g.score})`);
  ok(g.bestChain === 2, 'maior cadeia registrada');
  // a explosão cresce e some
  const g2 = quiet();
  g2.blasts.push({ p: [0, 2, -3], t: 0, level: 0, R: BLAST.r, r: 0, hitComet: false });
  let maxR = 0, steps = 0;
  while (g2.blasts.length && steps < 400) { g2.step(idle); maxR = Math.max(maxR, g2.blasts[0]?.r || 0); steps++; }
  ok(near(maxR, BLAST.r, 1e-6) && near(steps * DT, BLAST.grow + BLAST.hold + BLAST.fade, 0.05), 'explosão cresce até o raio máximo e some em ~1,2 s');
}

console.log('Meteoros');
{
  const g = quiet();
  const b = g.buildings[3];
  const m = g.spawnMeteor('pedra', mul(dirFrom(b.az, 45), 7.5), b);
  const evs = run(g, 30);
  ok(evs.some(e => e.type === 'house-down' && e.id === b.id) && !b.alive, 'meteoro que chega derruba a construção');
  const m2 = g.spawnMeteor('pedra', [0, 5, -5], b);
  const ev2 = run(g, 30);
  ok(ev2.some(e => e.type === 'crater' && e.id === m2.id) && g.lostHere === 1, 'em cima de ruína só abre cratera');
  // rachador se parte em 3 cacos para construções diferentes
  const g2 = quiet();
  const r = g2.spawnMeteor('racha', mul(dirFrom(0, 45), 7.5), g2.buildings[0]);
  const ev3 = run(g2, 20, (gg) => idle);
  const sp = ev3.find(e => e.type === 'split' && e.id === r.id);
  ok(!!sp, 'rachador se parte');
  ok(sp && dist(sp.p, [g2.buildings[0].x, GROUND_Y, g2.buildings[0].z]) > 1.8, 'parte antes de chegar na vila');
  const spawns = ev3.filter(e => e.type === 'spawn' && e.kind === 'caco');
  ok(spawns.length === KIND.racha.pieces, `${KIND.racha.pieces} cacos`);
  // curvo muda de alvo
  const g3 = quiet();
  const cv = g3.spawnMeteor('curva', mul(dirFrom(0, 45), 7.5), g3.buildings[0]);
  const first = cv.target;
  const ev4 = run(g3, cv.turnAt + 0.1);
  ok(ev4.some(e => e.type === 'swerve' && e.id === cv.id) && cv.target !== first, 'curvo muda de alvo no meio do caminho');
  // rápido é mais rápido
  const g4 = quiet();
  const p1 = g4.spawnMeteor('pedra', [0, 5, -5], g4.buildings[0]), p2 = g4.spawnMeteor('rapido', [0, 5, -5], g4.buildings[0]);
  ok(p2.speed > p1.speed * 1.5, 'rápido é bem mais rápido');
  // perde quando todas caem
  const g5 = quiet();
  for (const bb of g5.buildings.slice(1)) g5.destroyHouse(bb);
  g5.spawnMeteor('pedra', [0, 3, -3], g5.buildings[0]);
  run(g5, 20);
  ok(g5.over && g5.result && !g5.result.won, 'vila inteira destruída perde a fase');
}

console.log('Ondas, avisos e bônus');
{
  const g = new Game(0, { seed: 5 });
  const evs = [];
  const seen = new Map();
  let warnOk = true, nWarn = 0;
  for (let i = 0; i < 60 * 40 && g.wave === 0 && !g.over; i++) {
    g.step(idle);
    for (const e of g.events) {
      if (e.type === 'warn') { nWarn++; seen.set(nWarn, { dir: e.dir, t: g.t }); }
      if (e.type === 'spawn') {
        const w = [...seen.values()].find(w => angle(w.dir, e.p) < 1e-3);
        if (!w || !near(g.t - w.t, WARN_T, 0.05)) warnOk = false;
      }
      evs.push(e);
    }
  }
  ok(nWarn > 0 && warnOk, `todo meteoro tem aviso da mesma direção ${WARN_T} s antes (${nWarn} avisos)`);
  // vencer uma onda dá bônus e recarrega
  const g2 = new Game(0, { seed: 5 });
  let clear = null;
  const rb = makeRobot();
  for (let i = 0; i < 60 * 90 && !clear; i++) { g2.step(rb.step(g2)); clear = g2.events.find(e => e.type === 'wave-clear'); }
  ok(!!clear && clear.bonus === clear.standing * BONUS.house + clear.ammo * BONUS.ammo, 'fim da onda: bônus por casa de pé e munição que sobrou');
  ok(g2.guns[0].ammo === ammoFor(LEVELS[0].waves[1]) && g2.guns[1].ammo === ammoFor(LEVELS[0].waves[1]) && g2.phase === 'break', 'munição recarrega no intervalo');
  // começo com casas faltando (vindas da fase anterior)
  const mask = allMask(0) & ~0b101;
  const g3 = new Game(1, { houses: mask });
  ok(g3.standing === 8 && countMask(g3.mask) === 8 && !g3.buildings[0].alive && !g3.buildings[2].alive, 'casas destruídas continuam destruídas na fase seguinte');
}

console.log('Cometas');
{
  for (const [w, W] of WORLDS.entries()) {
    const lv = w * 4 + 3;
    const g = quiet(lv);
    g.wave = LEVELS[lv].waves.length - 1;
    const B = new Comet(g, { ...W.comet, az: 0, el: 45 });
    g.boss = B;
    const p0 = B.p.slice();
    const evs = run(g, 4);
    ok(dist(B.p, p0) > 0.2 && evs.some(e => e.type === 'shed'), `${W.comet.name}: se move e solta cacos`);
    // explosão encosta: 1 de vida por explosão, não por quadro
    g.blasts.push({ p: B.p.slice(), t: 0, level: 0, R: BLAST.r, r: 0, hitComet: false });
    run(g, 1.5);
    ok(B.hp === B.max - 1, `${W.comet.name}: cada explosão tira 1 de vida (${B.hp}/${B.max})`);
    g.meteors = [];
    for (let k = 0; k < 40 && !B.dead; k++) { g.meteors = []; g.blasts.push({ p: B.p.slice(), t: 0, level: 0, R: BLAST.r, r: 0, hitComet: false }); run(g, 0.05); g.blasts.length = 0; run(g, COMET_INVULN); }
    ok(B.dead && B.hp === 0, `${W.comet.name}: derrubado`);
    const pieces = g.meteors.length;
    ok(pieces >= W.comet.pieces.length, `${W.comet.name}: se parte em ${W.comet.pieces.length} pedaços (${pieces})`);
    // cometa que chega na vila arrasa tudo
    const g2 = quiet(lv);
    g2.boss = new Comet(g2, { ...W.comet, az: 0, el: 45, shed: 1e9 });
    const ev2 = run(g2, 120);
    ok(ev2.some(e => e.type === 'comet-impact') && g2.over && !g2.result.won, `${W.comet.name}: se chegar na vila, perde a fase (${ev2.find(e => e.type === 'comet-impact') ? 'caiu' : 'não caiu'} em ${g2.t.toFixed(0)} s)`);
    ok(g2.t > 40, `${W.comet.name}: leva mais de 40 s para cair (${g2.t.toFixed(0)} s)`);
    if (W.comet.boss === 'mare') {
      // dá a volta no jogador
      const g3 = quiet(lv);
      const C = new Comet(g3, { ...W.comet, az: 0, el: 45, shed: 1e9 });
      let turn = 0, prev = Math.atan2(C.p[0], -C.p[2]);
      for (let i = 0; i < 60 * 30; i++) { C.update(); const a = Math.atan2(C.p[0], -C.p[2]); let da = a - prev; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; turn += da; prev = a; }
      ok(Math.abs(turn) > 1.2 * Math.PI, `${W.comet.name}: dá a volta no jogador (${Math.round(turn / DEG)}° em 30 s)`);
    }
  }
}

console.log('Robô (limites humanos)');
{
  const SEEDS = [11, 23, 37, 41, 59];
  const play = (lv, seed, houses) => {
    const g = new Game(lv, { seed, houses }), rb = makeRobot();
    let head = rb.head.slice(), hands = rb.hands.map(h => h.slice()), wh = 0, wd = 0;
    for (let i = 0; i < 60 * 400 && !g.over; i++) {
      g.step(rb.step(g));
      wh = Math.max(wh, angle(head, rb.head) / DT);
      for (const k of [0, 1]) wd = Math.max(wd, angle(hands[k], rb.hands[k]) / DT);
      head = rb.head.slice(); hands = rb.hands.map(h => h.slice());
    }
    return { g, r: g.result || { won: false, lost: g.lostHere, stars: 0, score: g.score, accuracy: 0, time: g.t }, wh, wd };
  };
  let worstHead = 0, worstHand = 0;
  for (const [lv, L] of LEVELS.entries()) {
    const res = SEEDS.map(s => play(lv, s));
    for (const x of res) { worstHead = Math.max(worstHead, x.wh); worstHand = Math.max(worstHand, x.wd); }
    const won = res.every(x => x.r.won);
    const lost = res.map(x => x.r.lost), stars = res.map(x => x.r.stars);
    ok(won, `robô vence a fase ${lv + 1} (${L.name}) nas ${SEEDS.length} partidas`);
    ok(Math.max(...lost) <= L.stars[1], `fase ${lv + 1}: robô termina com pelo menos 2 estrelas (perdeu até ${Math.max(...lost)}, limite ${L.stars[1]})`);
    const acc = Math.round(100 * res.reduce((s, x) => s + x.r.accuracy, 0) / res.length);
    console.log(`  ${String(lv + 1).padStart(2)}: ${L.name.padEnd(16)} perdidas ${lost.join(',')}  estrelas ${stars.join(' ')}  pontos ~${Math.round(res.reduce((s, x) => s + x.r.score, 0) / res.length)}  acerto ${acc}%  cadeia máx ${Math.max(...res.map(x => x.r.bestChain ?? 0))}  ~${Math.round(res.reduce((s, x) => s + x.r.time, 0) / res.length)} s`);
  }
  ok(worstHead <= HUMAN.headSpeed * 1.001 && worstHand <= HUMAN.handSpeed * 1.001, `robô gira cabeça (${(worstHead / DEG).toFixed(0)}°/s) e mãos (${(worstHand / DEG).toFixed(0)}°/s) no limite humano`);
  // mundo inteiro seguido: as casas perdidas passam para a fase seguinte
  for (let w = 0; w < 3; w++) {
    for (const seed of [7, 19]) {
      let mask = allMask(w), allWon = true;
      for (let k = 0; k < 4; k++) {
        const x = play(w * 4 + k, seed, mask);
        if (!x.r.won) { allWon = false; break; }
        mask = x.r.mask;
      }
      ok(allWon, `robô vence o mundo ${w + 1} inteiro em sequência (semente ${seed}, terminou com ${countMask(mask)} construções)`);
    }
  }
}

console.log(fails ? `\n${fails} de ${count} verificações falharam` : `\nTudo certo (${count} verificações)`);
process.exit(fails ? 1 : 0);
