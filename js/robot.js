// Robô defensor com limites humanos: cabeça e mãos giram com velocidade máxima, ele só conhece o
// que já viu no campo de visão (ou ouviu no aviso) e reage depois de ~0,3 s. Cada mão escolhe um
// meteoro, aponta à frente dele (o projétil leva tempo) e aperta o gatilho uma vez; espera ver se
// explodiu antes de gastar outro projétil no mesmo. Usado pelos testes e pelo dev.autoplay.
// Sem navegador.
import { sub, add, mul, madd, len, dist, norm, clamp, DEG, angle, rotateToward, any_perp, cross, dot } from './vec.js';
import { HANDS, LAUNCH, BLAST, DT, GROUND_Y } from './sim.js';

export const HUMAN = {
  headSpeed: 200 * DEG,   // giro máximo da cabeça (por segundo)
  handSpeed: 300 * DEG,   // giro máximo da mão
  reaction: 0.3,          // s entre ver (ou ouvir) e começar a reagir
  switchDelay: 0.12,      // s para trocar de alvo
  fov: 50 * DEG,          // meio ângulo do campo de visão
  jitter: 0.3 * DEG,      // tremor da mão
};

const tg_isComet = (k) => k.tg?.kind === 'comet';

export function makeRobot(opts = {}) { return new Robot(opts); }

class Robot {
  constructor(opts) { this.h = { ...HUMAN, ...opts }; this.reset(); }
  reset() {
    this.head = [0, 0.5, -0.87];
    this.hands = [[0, 0.5, -0.87], [0, 0.5, -0.87]];
    this.known = new Map();
    this.assign = [null, null];
    this.assignAt = [0, 0];
    this.claims = new Map();   // id -> até quando esperar o projétil já mandado
    this.pressed = [false, false];
    this.glance = null;
    this.scan = 0;
  }

  step(game) {
    const t = game.t, H = this.h;
    // ---- percepção ----
    const alive = new Set();
    for (const tg of game.targets()) {
      alive.add(tg.id);
      const vis = angle(this.head, tg.p) < H.fov;
      let k = this.known.get(tg.id);
      if (vis) {
        if (!k) { k = { seen: t }; this.known.set(tg.id, k); }
        // vendo virar (curvo mudando de alvo): espera a curva acabar antes de atirar
        const turn = k.v && len(k.v) > 1e-6 && len(tg.v) > 1e-6 ? angle(k.v, tg.v) / Math.max(DT, t - k.last) : 0;
        k.turning = Math.max(turn > 15 * DEG ? 0.35 : 0, (k.turning || 0) - (t - (k.last ?? t)));
        k.p = tg.p.slice(); k.v = tg.v.slice(); k.last = t; k.tg = tg;
      } else if (k) k.tg = tg;
    }
    for (const id of this.known.keys()) if (!alive.has(id)) this.known.delete(id);
    for (const [id, until] of this.claims) if (!alive.has(id) || t > until) this.claims.delete(id);

    const est = (k, dt = 0) => madd(k.p, k.v, Math.min(1.5, t - k.last) + dt);
    const ready = [];
    for (const [id, k] of this.known) {
      if (t - k.seen < H.reaction) continue;
      const s = this.threat(k.tg, est(k));
      if (s > 0 && (!k.turning || s > 8 || tg_isComet(k))) ready.push({ id, k, s });
    }

    // ---- escolha dos alvos (um por mão, sem repetir, sem os que já têm projétil a caminho) ----
    for (const hi of [0, 1]) {
      const cur = this.assign[hi];
      if (cur !== null && (!this.known.has(cur) || this.claims.has(cur))) this.assign[hi] = null;
    }
    const ammo = game.guns.map(G => G.ammo);
    for (const hi of [0, 1]) {
      const other = ammo[1 - hi] > 0 ? this.assign[1 - hi] : null;
      // mão sem munição não pega alvo; a que tem mais munição pega mais
      const share = ammo[hi] <= 0 ? 0 : clamp(0.6 + 0.4 * (ammo[hi] - ammo[1 - hi]) / 3, 0.35, 1.4);
      let best = null, bestS = 0;
      for (const r of ready) {
        if (r.id === other && r.k.tg.kind !== 'comet') continue;
        if (this.claims.has(r.id)) continue;
        const turn = angle(this.hands[hi], sub(est(r.k), HANDS[hi]));
        let s = share * r.s / (1 + turn / (90 * DEG));
        if (r.id === this.assign[hi]) s *= 1.5;
        if (s > bestS) { bestS = s; best = r; }
      }
      const id = best ? best.id : null;
      if (id !== this.assign[hi]) { this.assign[hi] = id; this.assignAt[hi] = t; }
    }

    // ---- cabeça ----
    let tdirs = this.assign.filter(id => id !== null).map(id => ({ d: norm(est(this.known.get(id))), s: ready.find(r => r.id === id)?.s || 0 }));
    // as duas mãos em lados opostos: olha para o mais urgente
    if (tdirs.length === 2 && angle(tdirs[0].d, tdirs[1].d) > H.fov * 1.6) tdirs = [tdirs[0].s >= tdirs[1].s ? tdirs[0] : tdirs[1]];
    tdirs = tdirs.map(x => x.d);
    const urgent = ready.reduce((m, r) => Math.max(m, r.s), 0);
    const fresh = game.warnings.filter(w => t - w.t0 >= H.reaction && t - w.t0 < 2.5 && angle(this.head, w.dir) > H.fov * 0.8 && !w.looked);
    if (this.glance && (t > this.glance.until || urgent > 7.5)) this.glance = null;
    if (!this.glance && fresh.length && urgent < 7) {
      const w = fresh[fresh.length - 1];
      w.looked = true;
      this.glance = { dir: w.dir, until: t + 0.5 + angle(this.head, w.dir) / H.headSpeed };
    }
    // vigia: a cada tanto dá uma olhada nos que já conhece mas não vê faz tempo (podem ter virado)
    let want;
    if (this.glance) want = this.glance.dir;
    else if (tdirs.length) want = norm(tdirs.reduce((a, b) => add(a, b), [0, 0, 0]));
    else {
      let stale = null, age = 1.2;
      for (const [, k] of this.known) if (t - k.last > age) { age = t - k.last; stale = k; }
      if (stale) want = norm(est(stale));
      else if (game.warnings.length) want = game.warnings[game.warnings.length - 1].dir;
      else { this.scan += DT * 60 * DEG; want = norm([Math.sin(this.scan), 0.75, -Math.cos(this.scan)]); }
    }
    if (len(want) > 0.01) this.head = rotateToward(this.head, norm(want), H.headSpeed * DT);

    // ---- mãos e gatilhos ----
    const guns = [0, 1].map(hi => {
      const o = HANDS[hi];
      const id = this.assign[hi];
      const k = id !== null ? this.known.get(id) : null;
      if (!k || t - this.assignAt[hi] < H.switchDelay || game.guns[hi].ammo <= 0) { this.pressed[hi] = false; return { o, d: this.noisy(hi, t), fire: false }; }
      // onde o alvo vai estar quando a explosão crescer: voo do projétil + um pouco do crescimento
      let aim = est(k);
      for (let it = 0; it < 3; it++) {
        const T = dist(o, aim) / LAUNCH.speed + BLAST.grow * 0.25;
        aim = est(k, T);
      }
      if (aim[1] < GROUND_Y + 0.03) aim[1] = GROUND_Y + 0.03;
      const des = norm(sub(aim, o));
      this.hands[hi] = rotateToward(this.hands[hi], des, H.handSpeed * DT);
      const d = this.noisy(hi, t);
      const R = dist(o, aim);
      const tol = clamp(Math.atan2(0.1, R), 0.8 * DEG, 8 * DEG);
      let fire = false;
      if (!this.pressed[hi] && angle(d, des) < tol && game.guns[hi].cool <= 0) {
        const a = game.aimPoint(o, d);
        if (dist(a.p, aim) < BLAST.r * 0.8) {
          fire = true;
          const flight = dist(o, a.p) / LAUNCH.speed;
          // cometa aguenta várias explosões: só espera o projétil chegar
          this.claims.set(id, t + flight + (k.tg.kind === 'comet' ? 0.15 : BLAST.grow + 0.35));
        }
      }
      this.pressed[hi] = fire;
      return { o, d, fire };
    });
    return { guns, head: this.head };
  }

  noisy(hi, t) {
    const d = this.hands[hi], p1 = any_perp(d), p2 = cross(d, p1), j = this.h.jitter;
    return norm(add(d, add(mul(p1, Math.sin(t * 7.1 + hi * 2) * j), mul(p2, Math.sin(t * 5.3 + hi) * j))));
  }

  // Urgência do alvo (0 = ignorar). Meteoro indo para ruína não ameaça nada.
  threat(tg, p) {
    if (!tg) return 0;
    if (tg.kind === 'comet') return 3 + 6 / (len(p) + 0.5);
    const m = tg.m;
    if (!m.target.alive && m.kind !== 'racha' && m.kind !== 'curva') return 0;
    const tt = dist(p, m.tp) / Math.max(0.05, m.speed);
    if (len(p) > 7.3) return 0;   // ainda saindo da borda do céu
    return 1 + 12 / (tt + 0.8);
  }
}
