// Regras do Céu de Fogo: vila em volta da cintura do jogador, meteoros caindo de todo lado,
// dois lançadores (um em cada mão) que mandam um projétil até o ponto apontado, onde nasce uma
// explosão que cresce e some; meteoros que tocam a explosão explodem também (reação em cadeia).
// Sem navegador e sem Three.js (os testes rodam no Node).
//
// Coordenadas: metros; a cabeça do jogador fica na origem. -z = frente, +x = direita, +y = cima.
// O chão da vila fica em GROUND_Y (na altura da cintura).
import { sub, add, mul, madd, dot, len, dist, norm, clamp, DEG, dirFrom, rotateToward, Rng } from './vec.js';
import { LEVELS, WORLDS } from './levels.js';

export const DT = 1 / 60;
export const GROUND_Y = -0.7;
export const SPAWN_D = 7.5;          // distância (da cabeça) onde os meteoros aparecem
export const DOME_R = 3.2;           // profundidade do cursor quando não há meteoro perto do raio
export const MAX_AIM = 9;            // alcance máximo do lançador
export const WARN_T = 1.3;           // aviso (som e seta) antes de cada meteoro aparecer
export const INTRO_T = 3, BREAK_T = 4.5;
export const LAUNCH = { speed: 7.5, cooldown: 0.2 };
export const BLAST = { grow: 0.4, hold: 0.35, fade: 0.45, r: 0.34, chainR: 0.29 };
export const HANDS = [[-0.2, -0.35, -0.05], [0.2, -0.35, -0.05]];

// Tipos de meteoro: raio (m), velocidade (vezes a da fase), pontos.
export const KIND = {
  pedra: { r: 0.06, speed: 1, pts: 25, name: 'pedra' },
  rapido: { r: 0.045, speed: 1.85, pts: 50, name: 'rápido' },
  racha: { r: 0.085, speed: 0.85, pts: 50, name: 'rachador', splitD: 2.4, pieces: 3 },
  curva: { r: 0.065, speed: 1.0, pts: 50, name: 'curvo', turn: 75 * DEG },
  caco: { r: 0.045, speed: 1.1, pts: 25, name: 'caco' },
};

// Construções: raio de acerto e altura (m). O desenho em scene.js usa as mesmas medidas.
export const BUILD = {
  casa: { r: 0.09, h: 0.12 }, sobrado: { r: 0.09, h: 0.19 }, igreja: { r: 0.12, h: 0.32 },
  caixa: { r: 0.08, h: 0.3 }, celeiro: { r: 0.12, h: 0.15 }, farol: { r: 0.08, h: 0.38 },
  armazem: { r: 0.13, h: 0.13 }, predio: { r: 0.1, h: 0.34 }, torre: { r: 0.08, h: 0.36 },
};

export const COMET_INVULN = 0.6;   // s depois de cada dano em que o cometa não sente outra explosão
export const BONUS = { house: 100, ammo: 10, boss: 2000, comet: 150 };

export function starsFor(def, lost) {
  if (lost <= def.stars[0]) return 3;
  if (lost <= def.stars[1]) return 2;
  return 1;
}

export function buildingsOf(world) {
  return WORLDS[world].layout.map(([kind, az, r], id) => {
    const a = az * DEG, B = BUILD[kind];
    return { id, kind, x: Math.sin(a) * r, z: -Math.cos(a) * r, r: B.r, h: B.h, alive: true, az };
  });
}
export const allMask = (world) => (1 << WORLDS[world].layout.length) - 1;
export const countMask = (m) => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };

// Projéteis por lançador numa onda: 45% dos meteoros (rachador conta como 3) mais 2 de folga, no mínimo 8.
export function ammoFor(W) {
  if (W.ammo) return W.ammo;
  let n = 0;
  for (const g of W.groups) n += g[2] * (g[1] === 'racha' ? 3 : 1);
  return Math.max(AMMO_MIN, Math.ceil(n * AMMO_SHARE) + 2);
}
export const AMMO_SHARE = 0.45;
export const FLOCK_SPREAD = 8;
export const AMMO_MIN = 8;

const hitPoint = (b) => [b.x, GROUND_Y + b.h * 0.55, b.z];

// ---------- Cometas (chefes) ----------
// Cada mundo tem o seu: tição desce reto, maré dá voltas em espiral em volta do jogador,
// rei muda de rumo. Toda explosão que encosta tira 1 de vida (uma vez por explosão).
// A vida em degraus solta cacos; a zero ele se parte em pedaços que ainda caem na vila.
export class Comet {
  constructor(game, def) {
    this.g = game; this.def = def;
    this.kind = 'comet'; this.style = def.boss;
    this.name = def.name;
    this.id = game.nextId++;
    this.r = def.r; this.hp = this.max = def.hp;
    this.t = 0; this.dead = false;
    this.shedT = def.shed;
    this.a0 = def.az * DEG;
    this.p = mul(dirFrom(def.az, def.el), def.dist);
    this.v = [0, 0, 0];
    this.wp = null; this.wpT = 0;
    this.hitT = -9;
  }
  get hpFrac() { return Math.max(0, this.hp / this.max); }
  update() {
    const g = this.g, D = this.def;
    this.t += DT;
    const old = this.p;
    if (this.style === 'ticao') {
      const tgt = [0, GROUND_Y, 0];
      this.p = madd(this.p, norm(sub(tgt, this.p)), D.speed * DT);
    } else if (this.style === 'mare') {
      // espiral: dá a volta no jogador baixando e chegando perto
      const f = clamp(this.t / D.time, 0, 1);
      const a = this.a0 + this.t * D.spin * DEG;
      const R = D.dist * (1 - f) + 0.6 * f, y = 3.6 * (1 - f) + (GROUND_Y + 0.2) * f;
      this.p = [Math.sin(a) * R, y, -Math.cos(a) * R];
    } else {
      // rei: voa até pontos do céu sorteados, cada vez mais baixos e perto
      this.wpT -= DT;
      if (!this.wp || this.wpT <= 0 || dist(this.p, this.wp) < 0.2) {
        const f = clamp(this.t / D.time, 0, 1);
        const az = Math.atan2(this.p[0], -this.p[2]) / DEG + g.rng.range(50, 95) * g.rng.sign();
        const el = 52 - 50 * f + g.rng.range(-6, 6), d = D.dist * (1 - f) + 0.7 * f;
        this.wp = f >= 1 ? [0, GROUND_Y, 0] : mul(dirFrom(az, el), d);
        this.wpT = D.hop;
      }
      const sp = len(sub(this.wp, this.p)) / Math.max(0.3, this.wpT);
      this.p = madd(this.p, norm(sub(this.wp, this.p)), Math.min(sp, D.speed * 2.5) * DT);
    }
    this.v = mul(sub(this.p, old), 1 / DT);
    this.shedT -= DT;
    if (this.shedT <= 0) { this.shedT = D.shed; this.shed(1); }
    // chegou na vila: arrasa tudo
    if (this.p[1] <= GROUND_Y + 0.25 || (len([this.p[0], 0, this.p[2]]) < 0.7 && this.p[1] < GROUND_Y + 0.6)) {
      this.dead = true;
      g.events.push({ type: 'comet-impact', p: this.p.slice() });
      for (const b of g.buildings) if (b.alive) g.destroyHouse(b, this.p);
    }
  }
  shed(n, kinds = this.def.shedKinds) {
    for (let k = 0; k < n; k++) this.g.spawnMeteor(this.g.rng.pick(kinds), madd(this.p, norm(this.g.rng.unit()), this.r * 0.8), null);
    this.g.events.push({ type: 'shed', p: this.p.slice(), n });
  }
  hit(level) {
    const g = this.g;
    if (this.dead || g.t - this.hitT < COMET_INVULN) return false;
    this.hp--; this.hitT = g.t;
    g.score += BONUS.comet * (level + 1);
    g.events.push({ type: 'comet-hit', p: this.p.slice(), hp: this.hp, level });
    if (this.hp > 0 && this.hp % this.def.stepHp === 0) this.shed(this.def.stepShed);
    if (this.hp <= 0) {
      this.dead = true;
      g.score += BONUS.boss;
      g.events.push({ type: 'boss-down', p: this.p.slice(), name: this.name });
      for (const k of this.def.pieces) g.spawnMeteor(k, madd(this.p, norm(g.rng.unit()), this.r), null);
    }
    return true;
  }
}

function newBlast(p, level, r = level ? BLAST.chainR : BLAST.r) {
  return { p: p.slice(), t: 0, level, R: r, r: 0, hitComet: false };
}
const blastLife = BLAST.grow + BLAST.hold + BLAST.fade;
function blastRadius(b) {
  const t = b.t;
  if (t < BLAST.grow) return b.R * (0.15 + 0.85 * t / BLAST.grow);
  if (t < BLAST.grow + BLAST.hold) return b.R;
  return b.R * Math.max(0, 1 - (t - BLAST.grow - BLAST.hold) / BLAST.fade);
}

// ---------- Jogo ----------
export class Game {
  // level: 0..11. opts: { seed, houses (máscara das casas de pé no começo), startWave }
  constructor(level, opts = {}) {
    this.level = level;
    this.def = LEVELS[level];
    this.world = Math.floor(level / 4);
    this.rng = new Rng(opts.seed ?? (level * 7919 + 13));
    this.rng.unit = () => { const u = this.rng.range(-1, 1), a = this.rng.range(0, Math.PI * 2), r = Math.sqrt(1 - u * u); return [Math.cos(a) * r, u, Math.sin(a) * r]; };
    this.buildings = buildingsOf(this.world);
    const mask = opts.houses ?? allMask(this.world);
    for (const b of this.buildings) b.alive = !!(mask & (1 << b.id));
    this.startStanding = this.standing;
    this.t = 0;
    this.nextId = 1;
    this.meteors = []; this.shots = []; this.blasts = []; this.warnings = []; this.pending = [];
    this.events = [];
    this.guns = [0, 1].map(() => ({ ammo: 0, cool: 0, prev: false }));
    this.score = 0; this.kills = 0; this.fired = 0; this.bestChain = 0; this.lostHere = 0;
    this.waves = this.def.waves.length;
    this.wave = clamp(opts.startWave || 0, 0, this.waves - 1);
    this.phase = 'intro'; this.phaseT = INTRO_T;
    this.boss = null;
    this.over = false; this.result = null;
    this.reload();
  }
  get waveDef() { return this.def.waves[this.wave]; }
  get standing() { return this.buildings.filter(b => b.alive).length; }
  get mask() { return this.buildings.reduce((m, b) => m | (b.alive ? 1 << b.id : 0), 0); }

  reload() { const a = ammoFor(this.waveDef); for (const G of this.guns) { G.ammo = a; G.cool = 0; } this.ammoMax = a; }

  startWave() {
    const W = this.waveDef;
    this.phase = 'wave';
    this.waveT = -WARN_T;   // o primeiro meteoro também tem o aviso inteiro
    this.pending = [];
    for (const [at, kind, n, az, el, gap = 1, spread = 20] of W.groups) {
      // bando (espalhamento até FLOCK_SPREAD): todos vão para a mesma construção, em fila
      const flock = spread <= FLOCK_SPREAD && n > 1 ? { target: null } : null;
      for (let k = 0; k < n; k++) {
        const a = az + this.rng.range(-spread, spread), e = clamp(el + this.rng.range(-(flock ? spread : 8), flock ? spread : 8), 14, 82);
        this.pending.push({ at: at + k * gap, kind, p: mul(dirFrom(a, e), SPAWN_D), warned: false, flock });
      }
    }
    if (W.boss) this.pending.push({ at: W.boss.at, kind: 'comet', p: mul(dirFrom(W.boss.az, W.boss.el), WORLDS[this.world].comet.dist), warned: false });
    this.pending.sort((a, b) => a.at - b.at);
    this.events.push({ type: 'wave-start', wave: this.wave, name: W.name, boss: !!W.boss });
  }

  // Constrói um meteoro indo para uma construção (de pé pesa 3, em ruína 1) ou para `target`.
  spawnMeteor(kind, p, target) {
    const K = KIND[kind];
    const b = target ?? this.pickTarget();
    const m = {
      id: this.nextId++, kind, p: p.slice(), r: K.r, t: 0,
      speed: K.speed * this.def.speed * this.rng.range(0.92, 1.08),
      target: b, tp: hitPoint(b), turns: kind === 'curva' ? 2 : 0, turnAt: 0,
    };
    if (kind === 'curva') m.turnAt = this.rng.range(1.6, 2.6);
    m.v = mul(norm(sub(m.tp, m.p)), m.speed);
    this.meteors.push(m);
    this.events.push({ type: 'spawn', kind, p: m.p.slice(), id: m.id });
    return m;
  }
  pickTarget(except = null) {
    const list = this.buildings.filter(b => b !== except);
    let tot = 0;
    for (const b of list) tot += b.alive ? 3 : 1;
    let r = this.rng.next() * tot;
    for (const b of list) { r -= b.alive ? 3 : 1; if (r <= 0) return b; }
    return list[list.length - 1];
  }

  destroyHouse(b, p) {
    if (!b.alive) return;
    b.alive = false;
    this.lostHere++;
    this.events.push({ type: 'house-down', id: b.id, p: p ? p.slice() : hitPoint(b), left: this.standing });
  }

  // Todo alvo que o jogador pode atingir (meteoros e cometa), com posição e velocidade.
  targets() {
    const out = this.meteors.map(m => ({ id: m.id, kind: m.kind, p: m.p, v: m.v, r: m.r, m }));
    if (this.boss && !this.boss.dead) out.push({ id: this.boss.id, kind: 'comet', p: this.boss.p, v: this.boss.v, r: this.boss.r, m: this.boss });
    return out;
  }

  // input: { guns: [{ o, d, fire }, { o, d, fire }] } (o = boca do lançador, d = direção apontada)
  step(input) {
    this.events = [];
    if (this.over) return;
    this.t += DT;
    const inp = input?.guns || [];
    for (let i = 0; i < 2; i++) {
      const G = this.guns[i], I = inp[i];
      G.cool = Math.max(0, G.cool - DT);
      const press = !!I?.fire && !G.prev;
      G.prev = !!I?.fire;
      if (press && this.phase !== 'won' && this.phase !== 'lost') this.fire(i, I.o, I.d);
    }

    if (this.phase === 'intro' || this.phase === 'break') {
      this.phaseT -= DT;
      if (this.phaseT <= 0) this.startWave();
    } else if (this.phase === 'wave') {
      this.waveT += DT;
      for (const P of this.pending) {
        if (!P.warned && this.waveT >= P.at - WARN_T) {
          P.warned = true;
          const w = { dir: norm(P.p), kind: P.kind, t0: this.t, until: this.t + WARN_T + 0.4, boss: P.kind === 'comet' };
          this.warnings.push(w);
          this.events.push({ type: 'warn', kind: P.kind, dir: w.dir, boss: w.boss });
        }
      }
      while (this.pending.length && this.waveT >= this.pending[0].at) {
        const P = this.pending.shift();
        if (P.kind === 'comet') {
          this.boss = new Comet(this, { ...this.waveDef.boss, ...WORLDS[this.world].comet, az: this.waveDef.boss.az, el: this.waveDef.boss.el });
          this.events.push({ type: 'boss', name: this.boss.name, style: this.boss.style, p: this.boss.p.slice() });
        } else {
          const m = this.spawnMeteor(P.kind, P.p, P.flock?.target ?? null);
          if (P.flock) P.flock.target = m.target;
        }
      }
    }
    this.warnings = this.warnings.filter(w => this.t < w.until);

    this.updateShots();
    this.updateMeteors();
    if (this.boss && !this.boss.dead) this.boss.update();
    this.updateBlasts();

    if (this.phase === 'wave' || this.phase === 'break' || this.phase === 'intro') {
      if (this.standing === 0) return this.finish(false);
    }
    if (this.phase === 'wave' && !this.pending.length && !this.meteors.length && !this.shots.length && !this.blasts.length && !(this.boss && !this.boss.dead)) {
      // fim da onda: bônus pelas casas de pé e pela munição que sobrou
      const ammo = this.guns[0].ammo + this.guns[1].ammo;
      const bonus = this.standing * BONUS.house + ammo * BONUS.ammo;
      this.score += bonus;
      this.events.push({ type: 'wave-clear', wave: this.wave, standing: this.standing, ammo, bonus });
      if (this.wave >= this.waves - 1) return this.finish(true);
      this.wave++;
      this.boss = null;
      this.phase = 'break'; this.phaseT = BREAK_T;
      this.reload();
    }
  }

  // Ponto onde o projétil vai explodir: o cursor "gruda" na profundidade do meteoro cujo caminho
  // (posição agora até 1,5 s à frente) passa mais perto do raio; sem nenhum perto, fica na cúpula
  // (DOME_R) ou no chão, o que vier primeiro.
  aimPoint(o, d) {
    d = norm(d);
    let best = null, bestQ = 1;
    for (const tg of this.targets()) {
      for (let k = 0; k <= 6; k++) {
        const q = madd(tg.p, tg.v, k * 0.25);
        const w = sub(q, o), s = dot(w, d);
        if (s < 0.3 || s > MAX_AIM) continue;
        const perp = len(madd(w, d, -s));
        const lim = tg.r + 0.12 + 0.06 * s;
        const qq = perp / lim + k * 0.02;
        if (qq < bestQ) { bestQ = qq; best = { s, id: tg.id }; }
      }
    }
    if (best) return { p: madd(o, d, best.s), snap: best.id };
    // cúpula: raiz positiva de |o + d s| = DOME_R
    const b = dot(o, d), c = dot(o, o) - DOME_R * DOME_R;
    let s = -b + Math.sqrt(Math.max(0, b * b - c));
    if (d[1] < -1e-3) {
      const sg = (GROUND_Y + 0.04 - o[1]) / d[1];
      if (sg > 0) s = Math.min(s, sg);
    }
    s = clamp(s, 0.3, MAX_AIM);
    return { p: madd(o, d, s), snap: null };
  }

  fire(i, o, d) {
    const G = this.guns[i];
    if (G.cool > 0) return;
    if (G.ammo <= 0) { this.events.push({ type: 'empty', gun: i }); G.cool = 0.3; return; }
    G.ammo--; G.cool = LAUNCH.cooldown;
    this.fired++;
    const a = this.aimPoint(o, d);
    const len0 = dist(o, a.p);
    this.shots.push({ id: this.nextId++, gun: i, o: o.slice(), p: o.slice(), to: a.p, d: norm(sub(a.p, o)), left: len0 });
    this.events.push({ type: 'launch', gun: i, o: o.slice(), to: a.p.slice(), ammo: G.ammo });
  }

  updateShots() {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const S = this.shots[i];
      const step = LAUNCH.speed * DT;
      if (S.left <= step) {
        this.shots.splice(i, 1);
        this.blasts.push(newBlast(S.to, 0));
        this.events.push({ type: 'blast', p: S.to.slice(), level: 0, gun: S.gun });
      } else { S.left -= step; S.p = madd(S.p, S.d, step); }
    }
  }

  updateMeteors() {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i], K = KIND[m.kind];
      m.t += DT;
      // curvo: muda de alvo no meio do caminho (vira suave)
      if (m.turns > 0 && m.t >= m.turnAt) {
        m.turns--; m.turnAt = m.t + this.rng.range(1.4, 2.2);
        const nb = this.pickTarget(m.target);
        m.target = nb; m.tp = hitPoint(nb);
        this.events.push({ type: 'swerve', id: m.id, p: m.p.slice() });
      }
      const want = norm(sub(m.tp, m.p));
      const cur = norm(m.v);
      m.v = mul(K.turn ? rotateToward(cur, want, K.turn * DT) : want, m.speed);
      m.p = madd(m.p, m.v, DT);
      // rachador: se parte em cacos perto da vila
      if (m.kind === 'racha' && dist(m.p, m.tp) < K.splitD) {
        this.meteors.splice(i, 1);
        const used = new Set();
        for (let k = 0; k < K.pieces; k++) {
          let b = this.pickTarget(); for (let tries = 0; tries < 6 && used.has(b.id); tries++) b = this.pickTarget();
          used.add(b.id);
          this.spawnMeteor('caco', madd(m.p, this.rng.unit(), 0.05), b);
        }
        this.events.push({ type: 'split', p: m.p.slice(), id: m.id });
        continue;
      }
      // chegou: derruba a construção (se ainda estiver de pé) ou abre uma cratera
      const toT = sub(m.tp, m.p);
      if (len(toT) < 0.03 || dot(toT, m.v) < 0 || m.p[1] <= GROUND_Y) {
        this.meteors.splice(i, 1);
        if (m.target.alive) this.destroyHouse(m.target, m.tp);
        else this.events.push({ type: 'crater', p: m.tp.slice(), id: m.id });
      }
    }
  }

  updateBlasts() {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const B = this.blasts[i];
      B.t += DT;
      B.r = blastRadius(B);
      if (B.t >= blastLife) { this.blasts.splice(i, 1); continue; }
      for (let j = this.meteors.length - 1; j >= 0; j--) {
        const m = this.meteors[j];
        if (dist(m.p, B.p) < B.r + m.r) {
          this.meteors.splice(j, 1);
          const mult = B.level + 1, pts = KIND[m.kind].pts * mult;
          this.score += pts; this.kills++;
          this.bestChain = Math.max(this.bestChain, B.level);
          this.blasts.push(newBlast(m.p, B.level + 1));
          this.events.push({ type: 'kill', kind: m.kind, p: m.p.slice(), id: m.id, level: B.level, mult, pts });
        }
      }
      const C = this.boss;
      if (C && !C.dead && !B.hitComet && dist(C.p, B.p) < B.r + C.r && C.hit(B.level)) B.hitComet = true;
    }
  }

  finish(won) {
    this.phase = won ? 'won' : 'lost';
    this.over = true;
    this.meteors = []; this.shots = []; this.pending = [];
    const stars = won ? starsFor(this.def, this.lostHere) : 0;
    this.result = {
      won, stars, score: this.score, lost: this.lostHere, standing: this.standing, startStanding: this.startStanding,
      mask: this.mask, kills: this.kills, fired: this.fired, bestChain: this.bestChain, time: this.t,
      accuracy: this.fired ? this.kills / this.fired : 0,
    };
    this.events.push({ type: won ? 'won' : 'lost' });
  }
}
