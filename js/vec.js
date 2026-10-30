// Vetores 3D como arrays [x, y, z] e um gerador de números aleatórios com semente.
// Sem navegador e sem Three.js (os testes rodam no Node).
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const DEG = Math.PI / 180;

// Direção a partir de azimute e elevação (graus). az 0 = frente (-z), 90 = direita (+x),
// 180 = atrás; el 90 = para cima.
export function dirFrom(az, el) {
  const a = az * DEG, e = el * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}
export function azElOf(d) {
  const n = norm(d);
  return { az: Math.atan2(n[0], -n[2]) / DEG, el: Math.asin(clamp(n[1], -1, 1)) / DEG };
}

export function angle(a, b) {
  return Math.acos(clamp(dot(a, b) / ((len(a) * len(b)) || 1), -1, 1));
}

// Gira o vetor unitário `cur` na direção de `target` (unitário) no máximo `maxAng` radianos.
export function rotateToward(cur, target, maxAng) {
  const ang = angle(cur, target);
  if (ang <= maxAng || ang < 1e-6) return norm(target);
  // eixo perpendicular a cur, no plano de cur e target
  let perp = sub(target, mul(cur, dot(cur, target)));
  if (len(perp) < 1e-6) perp = any_perp(cur);
  perp = norm(perp);
  return norm(add(mul(cur, Math.cos(maxAng)), mul(perp, Math.sin(maxAng))));
}

export function any_perp(v) {
  const a = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm(cross(v, a));
}

// Segmento p0 -> p1 contra esfera (c, r): fração 0..1 do primeiro toque ou -1.
export function segSphere(p0, p1, c, r) {
  const d = sub(p1, p0), f = sub(p0, c);
  const a = dot(d, d), b = 2 * dot(f, d), cc = dot(f, f) - r * r;
  if (cc <= 0) return 0;
  if (a < 1e-12) return -1;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

// Menor distância do ponto c ao segmento p0 -> p1.
export function segPointDist(p0, p1, c) {
  const d = sub(p1, p0), l2 = dot(d, d);
  const t = l2 > 0 ? clamp(dot(sub(c, p0), d) / l2, 0, 1) : 0;
  return dist(madd(p0, d, t), c);
}

// Segmento contra caixa alinhada aos eixos: fração do primeiro toque ou -1.
export function segBox(p0, p1, min, max) {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = p1[i] - p0[i];
    if (Math.abs(d) < 1e-12) { if (p0[i] < min[i] || p0[i] > max[i]) return -1; continue; }
    let a = (min[i] - p0[i]) / d, b = (max[i] - p0[i]) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}

// Tempo para um tiro de velocidade `s` saindo de `o` alcançar um alvo em p com velocidade v.
export function interceptTime(o, s, p, v) {
  const d = sub(p, o);
  const a = dot(v, v) - s * s, b = 2 * dot(d, v), c = dot(d, d);
  if (Math.abs(a) < 1e-9) return b < 0 ? -c / b : len(d) / s;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return len(d) / s;
  const r = Math.sqrt(disc);
  const t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a);
  const t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return t > 0 ? t : len(d) / s;
}

// Mulberry32: aleatório repetível a partir de uma semente.
export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}
