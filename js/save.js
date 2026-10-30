// Progresso, recordes e opções, salvos no navegador.
const KEY = 'meteorovr.v1';
const DEFAULTS = {
  done: {},          // fases vencidas: { 0: { stars, score, lost }, ... }
  masks: {},         // casas de pé no fim de cada fase (a melhor), para começar a fase seguinte
  records: [],       // [{ name: 'ABC', score, reached: '2-3' }], os 8 maiores
  initials: 'AAA',
  sound: true,
  fps: false,
  arrows: true,      // setas de aviso na borda da visão
};

export function loadSave() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    if (typeof s.done !== 'object' || !s.done) s.done = {};
    if (typeof s.masks !== 'object' || !s.masks) s.masks = {};
    if (!Array.isArray(s.records)) s.records = [];
    if (!/^[A-Z]{3}$/.test(s.initials)) s.initials = 'AAA';
    return s;
  } catch { return { ...DEFAULTS, done: {}, masks: {}, records: [] }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}

export const MAX_RECORDS = 8;
export const qualifies = (s, score) => score > 0 && (s.records.length < MAX_RECORDS || score > s.records[s.records.length - 1].score);
export function addRecord(s, rec) {
  s.records.push(rec);
  s.records.sort((a, b) => b.score - a.score);
  s.records.length = Math.min(s.records.length, MAX_RECORDS);
  return s.records.indexOf(rec);
}
