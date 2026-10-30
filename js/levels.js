// Os 3 mundos (vila, cometa-chefe) e as 12 fases (4 por mundo, a 4ª é o chefe). Sem navegador.
//
// layout de cada mundo: [tipo da construção, azimute (graus), distância do jogador (m)]
//   tipos: casa, sobrado, igreja, caixa (caixa d'água), celeiro, farol, armazem, predio, torre
//   azimute: 0 = frente, 90 = direita, 180 = atrás, -90 = esquerda
//
// Fase: { name, speed (velocidade base dos meteoros, m/s), stars: [casas perdidas no máximo para
//   3 estrelas, para 2], hint, waves: [...] }
// Onda: { name, ammo (opcional: projéteis por lançador; sem isso a conta é automática, ver ammoFor
//   em sim.js), groups: [[início (s), tipo, quantidade, azimute, elevação, intervalo (s), espalhamento (graus)], ...] }
//   tipo: 'pedra', 'rapido', 'racha' (se parte em 3 cacos perto da vila), 'curva' (muda de alvo)
//   elevação: de onde o meteoro aparece no céu (15 = perto do horizonte, 80 = quase em cima)
//   espalhamento de até 8 graus = bando: todos vão para a mesma construção, em fila (bom para cadeia)
// Onda de chefe: boss: { az, el, at } (o cometa do mundo, em WORLDS[].comet)
export const WORLDS = [
  {
    name: 'Vale do Campo', theme: 'campo',
    layout: [
      ['casa', 12, 1.35], ['igreja', 48, 1.9], ['casa', 86, 1.2], ['caixa', 122, 1.75], ['celeiro', 160, 2.05],
      ['casa', 198, 1.3], ['sobrado', 236, 1.85], ['casa', 272, 1.2], ['caixa', 308, 1.95], ['sobrado', 340, 1.6],
    ],
    comet: { boss: 'ticao', name: 'Cometa Tição', r: 0.34, hp: 6, speed: 0.14, dist: 8, shed: 3.6, shedKinds: ['caco'], stepHp: 2, stepShed: 3, pieces: ['caco', 'caco', 'caco', 'caco', 'pedra'] },
  },
  {
    name: 'Porto da Enseada', theme: 'porto',
    layout: [
      ['farol', 0, 2.2], ['casa', 38, 1.3], ['armazem', 75, 1.85], ['sobrado', 110, 1.25], ['casa', 145, 1.7],
      ['igreja', 182, 1.45], ['casa', 218, 1.9], ['armazem', 254, 1.4], ['sobrado', 290, 1.75], ['casa', 325, 1.2],
    ],
    comet: { boss: 'mare', name: 'Cometa Maré', r: 0.32, hp: 8, dist: 6, time: 55, spin: 16, shed: 2.8, shedKinds: ['caco', 'rapido'], stepHp: 2, stepShed: 2, pieces: ['caco', 'caco', 'caco', 'rapido', 'rapido', 'pedra'] },
  },
  {
    name: 'Cidade da Serra', theme: 'serra',
    layout: [
      ['predio', 20, 1.5], ['sobrado', 55, 1.15], ['torre', 92, 2.1], ['predio', 128, 1.4], ['caixa', 164, 1.9],
      ['igreja', 200, 1.3], ['predio', 236, 2.0], ['sobrado', 270, 1.3], ['predio', 306, 1.8], ['casa', 342, 1.15],
    ],
    comet: { boss: 'rei', name: 'Cometa Rei', r: 0.38, hp: 10, speed: 0.35, dist: 7.5, time: 60, hop: 4.5, shed: 2.6, shedKinds: ['caco', 'curva', 'rapido'], stepHp: 2, stepShed: 3, pieces: ['caco', 'caco', 'caco', 'rapido', 'rapido', 'curva', 'pedra', 'pedra'] },
  },
];

export const LEVELS = [
  // ---------- Mundo 1: Vale do Campo ----------
  {
    name: 'Primeira chuva', speed: 0.5, stars: [0, 2],
    hint: 'Aponte e aperte o gatilho: a explosão nasce no ponto do cursor. Meteoros na explosão explodem também.',
    waves: [
      { name: 'Pela frente', groups: [[1, 'pedra', 4, 0, 45, 1.8, 25], [9, 'pedra', 3, 60, 40, 1.6, 20]] },
      { name: 'Dos lados', groups: [[1, 'pedra', 3, -90, 40, 1.5, 20], [6, 'pedra', 3, 90, 50, 1.5, 20], [13, 'pedra', 3, 0, 60, 1.2, 30]] },
      { name: 'Em volta', groups: [[1, 'pedra', 4, 180, 45, 1.4, 30], [8, 'pedra', 4, -45, 35, 1.2, 30], [15, 'pedra', 3, 120, 55, 1.0, 20]] },
    ],
  },
  {
    name: 'Rachadores', speed: 0.55, stars: [1, 3],
    hint: 'Os rachadores (laranja) se partem em três cacos perto da vila: estoure antes.',
    waves: [
      { name: 'Pedra rachada', groups: [[1, 'racha', 2, 20, 45, 3, 20], [6, 'pedra', 4, -70, 40, 1.4, 25], [13, 'racha', 1, 150, 50]] },
      { name: 'Chuva fina', groups: [[1, 'pedra', 6, 90, 45, 0.9, 50], [9, 'racha', 2, -120, 40, 2.5, 30], [15, 'pedra', 4, 0, 65, 1.0, 40]] },
      { name: 'Cacos', groups: [[1, 'racha', 3, -30, 40, 2.2, 40], [5, 'pedra', 4, 160, 40, 1.2, 30], [12, 'racha', 2, 70, 55, 2.0, 30], [16, 'pedra', 3, -150, 50, 1.0, 20]] },
    ],
  },
  {
    name: 'Riscos azuis', speed: 0.6, stars: [1, 3],
    hint: 'Os rápidos (azuis) chegam no dobro da velocidade: mire bem à frente deles.',
    waves: [
      { name: 'Riscos', groups: [[1, 'rapido', 3, 0, 40, 2.0, 30], [7, 'pedra', 5, 100, 45, 1.0, 40], [14, 'rapido', 3, -100, 50, 1.6, 30]] },
      { name: 'Enxurrada', groups: [[1, 'pedra', 5, -160, 40, 0.8, 40], [5, 'racha', 2, 40, 50, 2.0, 30], [10, 'rapido', 4, 140, 35, 1.2, 40], [17, 'pedra', 4, -60, 60, 0.8, 30]] },
      { name: 'Noite de fogo', groups: [[1, 'racha', 2, 180, 45, 2.0, 30], [3, 'rapido', 3, 60, 40, 1.4, 30], [9, 'pedra', 6, -90, 45, 0.7, 60], [15, 'rapido', 3, 0, 55, 1.2, 40], [19, 'racha', 2, 120, 50, 2.0, 30]] },
    ],
  },
  {
    name: 'Cometa Tição', speed: 0.55, stars: [1, 3],
    hint: 'O cometa desce reto para a praça. Cada explosão que encosta nele tira um pedaço.',
    waves: [
      { name: 'Aquecimento', groups: [[1, 'pedra', 5, -40, 45, 1.0, 40], [7, 'racha', 2, 120, 45, 2.5, 30], [13, 'rapido', 3, 30, 55, 1.4, 30]] },
      { name: 'Cometa Tição', ammo: 16, boss: { az: 0, el: 48, at: 1 }, groups: [[10, 'pedra', 3, -120, 40, 1.4, 30], [24, 'pedra', 3, 120, 40, 1.4, 30], [36, 'rapido', 2, 180, 45, 2.0, 30]] },
    ],
  },
  // ---------- Mundo 2: Porto da Enseada ----------
  {
    name: 'Maré alta', speed: 0.62, stars: [1, 3],
    hint: 'Os curvos (verdes) mudam de alvo no meio do caminho: espere a curva ou acerte cedo.',
    waves: [
      { name: 'Curvas', groups: [[1, 'curva', 3, 0, 45, 2.0, 30], [7, 'pedra', 5, -90, 45, 1.0, 40], [14, 'curva', 3, 120, 50, 1.6, 30]] },
      { name: 'Vento do mar', groups: [[1, 'pedra', 5, 180, 40, 0.8, 40], [5, 'rapido', 3, 60, 45, 1.4, 30], [11, 'curva', 3, -45, 50, 1.6, 30], [17, 'racha', 2, 100, 50, 2.0, 30]] },
      { name: 'Ressaca', groups: [[1, 'racha', 2, -120, 45, 2.0, 30], [4, 'curva', 4, 30, 45, 1.2, 40], [11, 'pedra', 6, 150, 50, 0.7, 50], [17, 'rapido', 3, -30, 40, 1.2, 30]] },
    ],
  },
  {
    name: 'Farol aceso', speed: 0.66, stars: [1, 3],
    hint: 'Muitos de uma vez: uma explosão no meio do grupo derruba todos em cadeia.',
    waves: [
      { name: 'Cardume', groups: [[1, 'pedra', 8, 40, 45, 0.45, 4], [8, 'pedra', 8, -120, 45, 0.45, 4], [15, 'curva', 2, 170, 50, 1.5, 20]] },
      { name: 'Redemoinho', groups: [[1, 'rapido', 4, -60, 40, 1.0, 40], [6, 'racha', 3, 90, 45, 1.6, 40], [12, 'pedra', 7, 0, 50, 0.45, 5], [18, 'curva', 3, -160, 45, 1.2, 30]] },
      { name: 'Tempestade', groups: [[1, 'pedra', 7, 150, 45, 0.4, 20], [5, 'curva', 3, -20, 50, 1.4, 30], [10, 'rapido', 4, 80, 40, 1.0, 40], [16, 'racha', 3, -100, 50, 1.6, 30], [21, 'pedra', 6, 30, 60, 0.4, 20]] },
    ],
  },
  {
    name: 'Neblina', speed: 0.7, stars: [1, 3],
    hint: 'Ouça: o assobio vem do lado de onde o meteoro vai aparecer.',
    waves: [
      { name: 'Por trás', groups: [[1, 'pedra', 5, 180, 35, 0.8, 30], [5, 'rapido', 3, 150, 40, 1.2, 30], [10, 'curva', 3, -150, 45, 1.4, 30], [16, 'racha', 2, 180, 55, 2.0, 20]] },
      { name: 'Em cima', groups: [[1, 'pedra', 6, 0, 75, 0.6, 90], [6, 'rapido', 3, 90, 70, 1.0, 60], [12, 'racha', 3, -90, 70, 1.6, 60], [18, 'curva', 3, 180, 70, 1.2, 60]] },
      { name: 'Cerco', groups: [[1, 'pedra', 4, 0, 40, 0.5, 20], [2, 'pedra', 4, 120, 40, 0.5, 20], [3, 'pedra', 4, -120, 40, 0.5, 20], [10, 'rapido', 4, 60, 45, 1.0, 40], [14, 'curva', 4, -60, 45, 1.0, 40], [19, 'racha', 3, 180, 50, 1.4, 40]] },
    ],
  },
  {
    name: 'Cometa Maré', speed: 0.62, stars: [1, 3],
    hint: 'O cometa dá voltas em espiral em volta de você, descendo: siga ele com o olhar.',
    waves: [
      { name: 'Maré baixa', groups: [[1, 'curva', 3, 90, 45, 1.4, 30], [6, 'pedra', 6, -60, 45, 0.6, 30], [12, 'rapido', 4, 170, 45, 1.0, 40]] },
      { name: 'Ondas', groups: [[1, 'racha', 3, -150, 45, 1.6, 30], [5, 'pedra', 7, 40, 50, 0.4, 20], [12, 'curva', 3, 120, 45, 1.2, 30], [17, 'rapido', 3, -40, 40, 1.0, 30]] },
      { name: 'Cometa Maré', ammo: 18, boss: { az: -90, el: 30, at: 1 }, groups: [[14, 'pedra', 4, 90, 45, 0.8, 30], [30, 'curva', 3, -150, 45, 1.4, 30]] },
    ],
  },
  // ---------- Mundo 3: Cidade da Serra ----------
  {
    name: 'Ar rarefeito', speed: 0.74, stars: [1, 3],
    hint: 'Na serra tudo cai mais rápido. Use as duas mãos ao mesmo tempo.',
    waves: [
      { name: 'Picos', groups: [[1, 'pedra', 6, 30, 45, 0.6, 40], [6, 'rapido', 4, -90, 45, 1.0, 40], [12, 'curva', 3, 160, 50, 1.2, 30], [17, 'racha', 2, -30, 55, 2.0, 30]] },
      { name: 'Avalanche', groups: [[1, 'racha', 3, 90, 50, 1.4, 40], [4, 'pedra', 8, -140, 45, 0.45, 5], [11, 'rapido', 4, 20, 40, 0.9, 40], [16, 'curva', 4, -60, 50, 1.0, 40]] },
      { name: 'Geada', groups: [[1, 'pedra', 6, 180, 50, 0.5, 30], [4, 'curva', 4, 60, 45, 1.0, 40], [9, 'rapido', 5, -100, 40, 0.8, 50], [15, 'racha', 3, 0, 55, 1.4, 40], [20, 'pedra', 7, 120, 50, 0.35, 15]] },
    ],
  },
  {
    name: 'Vento cortante', speed: 0.78, stars: [1, 3],
    hint: 'Cadeias longas valem muito: cada elo da corrente multiplica os pontos.',
    waves: [
      { name: 'Fileira', groups: [[1, 'pedra', 9, -60, 45, 0.4, 4], [6, 'rapido', 4, 120, 40, 0.9, 40], [11, 'pedra', 9, 60, 50, 0.4, 4], [17, 'curva', 4, 180, 50, 1.0, 40]] },
      { name: 'Rajadas', groups: [[1, 'rapido', 5, 0, 45, 0.7, 60], [5, 'racha', 3, -120, 45, 1.4, 40], [10, 'curva', 4, 90, 50, 1.0, 40], [15, 'rapido', 5, 180, 40, 0.7, 60], [20, 'racha', 2, 40, 55, 1.6, 30]] },
      { name: 'Serra abaixo', groups: [[1, 'pedra', 8, 150, 45, 0.35, 15], [5, 'curva', 4, -30, 45, 1.0, 40], [10, 'racha', 3, 70, 50, 1.2, 40], [15, 'rapido', 5, -140, 40, 0.8, 50], [20, 'pedra', 8, 0, 60, 0.35, 15]] },
    ],
  },
  {
    name: 'Chuva de brasas', speed: 0.82, stars: [2, 4],
    hint: 'A última noite antes do Rei: chuva de todo lado.',
    waves: [
      { name: 'Brasa', groups: [[1, 'pedra', 5, 0, 45, 0.5, 30], [2, 'pedra', 5, 180, 45, 0.5, 30], [8, 'rapido', 5, 90, 40, 0.8, 40], [9, 'rapido', 5, -90, 40, 0.8, 40], [16, 'racha', 3, 45, 55, 1.4, 60], [20, 'curva', 4, -135, 50, 1.0, 40]] },
      { name: 'Labaredas', groups: [[1, 'curva', 5, -60, 45, 0.8, 50], [6, 'racha', 4, 120, 50, 1.2, 50], [11, 'pedra', 9, 30, 50, 0.4, 5], [16, 'rapido', 5, -150, 40, 0.7, 50], [21, 'curva', 4, 80, 55, 0.9, 40]] },
      { name: 'Incêndio', groups: [[1, 'pedra', 9, -100, 45, 0.4, 5], [5, 'rapido', 5, 60, 40, 0.7, 50], [9, 'racha', 4, 170, 50, 1.2, 40], [14, 'curva', 5, -20, 50, 0.8, 50], [19, 'pedra', 9, 100, 55, 0.3, 15], [23, 'rapido', 4, -160, 45, 0.8, 40]] },
    ],
  },
  {
    name: 'Cometa Rei', speed: 0.72, stars: [2, 4],
    hint: 'O Rei muda de rumo e solta cacos curvos. Dez explosões para derrubar.',
    waves: [
      { name: 'Corte', groups: [[1, 'curva', 4, 30, 45, 1.0, 40], [5, 'rapido', 4, -120, 40, 0.9, 40], [10, 'pedra', 8, 150, 50, 0.35, 15], [16, 'racha', 3, -40, 50, 1.4, 40]] },
      { name: 'Coroa', groups: [[1, 'pedra', 8, -90, 45, 0.35, 15], [5, 'racha', 3, 90, 50, 1.4, 40], [10, 'curva', 4, 0, 50, 1.0, 40], [15, 'rapido', 5, 180, 40, 0.8, 50]] },
      { name: 'Cometa Rei', ammo: 22, boss: { az: 30, el: 50, at: 1 }, groups: [[12, 'pedra', 5, -120, 45, 0.6, 30], [26, 'rapido', 3, 150, 40, 1.0, 30], [38, 'curva', 3, -30, 50, 1.2, 30]] },
    ],
  },
];
