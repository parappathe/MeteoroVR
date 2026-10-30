// Sons sintetizados na hora (sem arquivos), com áudio 3D (PannerNode HRTF): o assobio de aviso
// de cada meteoro soa da direção de onde ele vai aparecer, e lançamentos, explosões e impactos soam
// de onde acontecem. Cada tipo de meteoro tem um assobio próprio:
//   pedra = assobio que desce, rápido = assobio agudo e curto, rachador = assobio duplo com estalos,
//   curvo = assobio ondulado, cometa = ronco grave com sirene.
// As explosões da reação em cadeia sobem de tom a cada elo (como num fliperama).
// Só começa depois de um clique, tecla ou da entrada no VR (regra do navegador).
export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.last = {}; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  // ouvinte = cabeça do jogador (posição, frente e cima no mundo)
  setListener(p, f, u) {
    const L = this.ctx?.listener;
    if (!L) return;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
      L.upX.setValueAtTime(u.x, t); L.upY.setValueAtTime(u.y, t); L.upZ.setValueAtTime(u.z, t);
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  // nó de saída: posicional (HRTF) se tiver posição, senão direto
  out(pos, ref = 6) {
    const c = this.ctx;
    if (!pos) return this.master;
    const p = c.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = ref; p.maxDistance = 1000; p.rolloffFactor = 0.9;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
    else p.setPosition(pos[0], pos[1], pos[2]);
    p.connect(this.master);
    return p;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.005, pos = null, ref } = {}) {
    const c = this.ctx;
    if (!c) return null;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out(pos, ref));
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }

  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', pos = null, ref, slide = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    if (!this.nbuf) {
      this.nbuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.nbuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.nbuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out(pos, ref));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  // limita sons repetidos no mesmo instante (rajadas)
  gate(key, gap) {
    const t = this.ctx?.currentTime ?? 0;
    if (t - (this.last[key] || -9) < gap) return false;
    this.last[key] = t;
    return true;
  }

  startAmbient() {
    const c = this.ctx;
    // vento baixinho; no porto o vento sobe e desce como ondas
    const src = c.createBufferSource(), nb = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), d = nb.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = 0.985 * b + 0.015 * (Math.random() * 2 - 1); d[i] = b * 6; }
    src.buffer = nb; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.045;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.12; lg.gain.value = 0.008;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.wind = { f, g, lg };
    if (this.theme) this.setWorld(this.theme);
  }
  setWorld(theme) {
    this.theme = theme;
    if (!this.wind) return;
    const t = this.ctx.currentTime, W = this.wind;
    W.f.frequency.setTargetAtTime(theme === 'porto' ? 260 : theme === 'serra' ? 700 : 380, t, 0.5);
    W.lg.gain.setTargetAtTime(theme === 'porto' ? 0.035 : 0.008, t, 0.5);
    W.g.gain.setTargetAtTime(theme === 'serra' ? 0.06 : 0.045, t, 0.5);
  }

  // ---------- avisos (o assobio vem de onde o meteoro vai aparecer) ----------
  warn(kind, dir, boss) {
    if (!this.ctx) return;
    const pos = [dir[0] * 5, dir[1] * 5, dir[2] * 5];
    const o = { pos, ref: 3 };
    if (boss) {
      this.tone(55, 2.2, { ...o, type: 'sawtooth', vol: 0.3, attack: 0.4 });
      this.noise(2.2, { ...o, vol: 0.25, freq: 200, q: 0.7, type: 'lowpass' });
      for (let k = 0; k < 3; k++) this.tone(440, 0.6, { ...o, type: 'square', vol: 0.07, at: k * 0.7, slide: 0.6, attack: 0.1 });
      return;
    }
    if (kind === 'pedra' || kind === 'caco') {
      this.tone(1500, 1.1, { ...o, type: 'sine', vol: 0.22, slide: 0.45, attack: 0.15 });
    } else if (kind === 'rapido') {
      this.tone(2400, 0.55, { ...o, type: 'sine', vol: 0.2, slide: 0.4, attack: 0.05 });
      this.tone(2400, 0.55, { ...o, type: 'triangle', vol: 0.06, slide: 0.38, attack: 0.05, at: 0.04 });
    } else if (kind === 'racha') {
      this.tone(1200, 1.0, { ...o, type: 'sine', vol: 0.2, slide: 0.5, attack: 0.12 });
      this.tone(900, 1.0, { ...o, type: 'sine', vol: 0.14, slide: 0.5, attack: 0.12, at: 0.08 });
      for (let k = 0; k < 4; k++) this.noise(0.05, { ...o, vol: 0.2, freq: 3000, q: 2, at: 0.2 + k * 0.18 });
    } else if (kind === 'curva') {
      for (let k = 0; k < 6; k++) this.tone(k % 2 ? 1100 : 1500, 0.2, { ...o, type: 'sine', vol: 0.18, at: k * 0.16, slide: k % 2 ? 1.36 : 0.73, attack: 0.03 });
    } else this.tone(1200, 0.6, { ...o, vol: 0.18, slide: 0.5 });
  }

  // ---------- jogador ----------
  launch(gun, pos) {
    if (!this.ctx || !this.gate('launch' + gun, 0.05)) return;
    this.tone(gun ? 150 : 180, 0.15, { type: 'sine', vol: 0.3, slide: 0.4, pos, ref: 0.5 });
    this.noise(0.35, { vol: 0.14, freq: 900, q: 0.8, slide: 2.5, pos, ref: 0.5 });
  }
  empty(pos) { this.tone(900, 0.04, { type: 'square', vol: 0.08, pos, ref: 0.5 }); this.tone(700, 0.05, { type: 'square', vol: 0.07, at: 0.07, pos, ref: 0.5 }); }

  // ---------- explosões e acertos ----------
  blast(pos, level = 0) {
    if (!this.ctx || !this.gate('blast', 0.03)) return;
    const up = Math.pow(1.122, Math.min(12, level));   // sobe um tom a cada elo
    this.noise(0.7, { vol: 0.35, freq: 700 * up, q: 0.6, type: 'lowpass', slide: 0.25, pos, ref: 1.5 });
    this.tone(90 * up, 0.5, { type: 'sine', vol: 0.32, slide: 0.45, pos, ref: 1.5 });
  }
  kill(pos, level = 0) {
    if (!this.ctx || !this.gate('kill', 0.025)) return;
    const notes = [523, 659, 784, 988, 1175, 1319, 1568, 1760, 2093];
    const f = notes[Math.min(notes.length - 1, level)];
    this.tone(f, 0.22, { type: 'square', vol: 0.07, pos, ref: 2 });
    this.tone(f * 2, 0.15, { type: 'triangle', vol: 0.05, at: 0.04, pos, ref: 2 });
    this.noise(0.18, { vol: 0.2, freq: 2500, q: 1, pos, ref: 2 });
  }
  chain(n) {
    // jingle de cadeia longa
    if (!this.ctx || !this.gate('chain', 0.4)) return;
    for (let i = 0; i < Math.min(6, n); i++) this.tone(660 * Math.pow(1.26, i), 0.16, { type: 'square', vol: 0.06, at: i * 0.07 });
  }
  houseDown(pos) {
    if (!this.ctx) return;
    this.tone(55, 0.9, { type: 'sine', vol: 0.5, slide: 0.5, pos, ref: 1.5 });
    this.noise(0.9, { vol: 0.45, freq: 500, q: 0.6, type: 'lowpass', slide: 0.3, pos, ref: 1.5 });
    for (let k = 0; k < 5; k++) this.noise(0.08, { vol: 0.18, freq: 1500 + Math.random() * 2000, q: 2, at: 0.1 + k * 0.09, pos, ref: 1.5 });
  }
  crater(pos) { if (this.gate('crater', 0.08)) { this.tone(70, 0.35, { type: 'sine', vol: 0.25, slide: 0.6, pos, ref: 1.5 }); this.noise(0.3, { vol: 0.15, freq: 400, type: 'lowpass', pos, ref: 1.5 }); } }
  split(pos) { this.noise(0.25, { vol: 0.3, freq: 2200, q: 1.5, slide: 0.5, pos, ref: 2 }); this.tone(1300, 0.3, { type: 'sine', vol: 0.12, slide: 0.6, pos, ref: 2 }); }
  swerve(pos) { if (this.gate('swerve', 0.15)) this.tone(900, 0.35, { type: 'sine', vol: 0.12, slide: 1.6, pos, ref: 2 }); }

  // ---------- cometa ----------
  cometHit(pos) { this.tone(160, 0.6, { type: 'sawtooth', vol: 0.2, slide: 0.5, pos, ref: 3 }); this.noise(0.5, { vol: 0.35, freq: 1200, q: 0.7, slide: 0.3, pos, ref: 3 }); }
  shed(pos) { if (this.gate('shed', 0.3)) this.noise(0.4, { vol: 0.22, freq: 1800, q: 1.2, slide: 0.4, pos, ref: 3 }); }
  bossDown(pos) {
    for (let k = 0; k < 4; k++) this.noise(1.2, { vol: 0.4, freq: 600, q: 0.6, type: 'lowpass', at: k * 0.2, slide: 0.2, pos, ref: 4 });
    this.tone(60, 1.5, { type: 'sine', vol: 0.5, slide: 0.4, pos, ref: 4 });
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, { type: 'square', vol: 0.07, at: 0.9 + i * 0.12 }));
  }
  cometImpact() { this.tone(40, 2.5, { type: 'sine', vol: 0.7, slide: 0.5 }); this.noise(2.5, { vol: 0.6, freq: 400, q: 0.5, type: 'lowpass', slide: 0.2 }); }

  // ---------- fases e telas ----------
  waveStart(boss) {
    if (boss) return;
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.18, { type: 'square', vol: 0.07, at: i * 0.1 }));
  }
  waveClear() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'square', vol: 0.07, at: i * 0.1 })); }
  tick(i) { this.tone(1200 + (i % 4) * 150, 0.05, { type: 'square', vol: 0.05 }); }
  alarm() { if (this.gate('alarm', 2.5)) [0, 0.3].forEach(at => this.tone(740, 0.25, { type: 'square', vol: 0.08, at, slide: 0.7 })); }
  won() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, { type: 'square', vol: 0.07, at: i * 0.12 })); }
  lost() { [392, 330, 262, 196, 147].forEach((f, i) => this.tone(f, 0.45, { type: 'square', vol: 0.08, at: i * 0.22 })); }
  click() { this.tone(880, 0.05, { vol: 0.07, type: 'square' }); }
  star(n) { this.tone(1046 * (1 + n * 0.26), 0.3, { vol: 0.1, type: 'square' }); }
}
