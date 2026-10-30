# MeteoroVR

Céu de Fogo: jogo de fliperama de defesa contra meteoros em VR para o Meta Quest 3 no navegador
(WebXR), sem instalar nada. Uma vila em miniatura (casas, igreja, caixa d'água...) fica em volta da
cintura do jogador, 360°. Meteoros caem de todo lado em direção às construções; o jogador aponta
com o controle e o gatilho manda um projétil do lançador daquela mão até o ponto apontado, onde
nasce uma explosão que cresce e some. Meteoro que encosta numa explosão explode também (reação em
cadeia, pontos ×2, ×3, ×4...). 12 fases em 3 mundos; a 4ª de cada mundo é um cometa-chefe. Também
joga no PC com mouse. Tudo em português. Jogo original dentro do gênero (não é recriação de nenhum
jogo existente).

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos o endereço publicado (quando for publicado:
**https://parappathe.github.io/MeteoroVR/**) e apertar "Entrar em VR". Para atualizar o site:
commitar e rodar `python publicar.py MeteoroVR` na pasta `C:\claude code` (só quando o Eduardo pedir).

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8844` (o painel de
visualização usa `.claude/launch.json`). O `serve.py` manda o navegador não guardar cache;
`python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Mirar | Apontar o controle; o cursor (anel da cor do lançador) mostra onde vai explodir | Mouse (clique na tela trava o mouse; olhar em volta = mirar, centro da tela) |
| Disparar | Gatilho de cada mão = lançador daquela mão (um projétil por aperto) | Clique esquerdo = lançador esquerdo, direito = direito (ou Q / E) |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| Só com as mãos | Pinça dispara; apontar e pinça no menu | |
| FPS | Menu → FPS | Tecla F |

Na pausa do VR, "Recentralizar" põe a cabeça no centro da praça olhando para a frente (a vila fica
0,7 m abaixo da cabeça, sentado ou em pé). O controle vibra a cada disparo, nas cadeias, quando uma
construção cai e no cometa.

### Regras

- **Cursor que gruda:** o ponto da explosão fica na profundidade do meteoro cujo caminho (agora até
  1,5 s à frente) passa mais perto do raio apontado; dá para mirar à frente do meteoro. Sem meteoro
  perto, o cursor fica numa "cúpula" a 3,2 m (ou no chão, apontando para baixo).
- **Projétil:** voa a 7,5 m/s até o cursor; a explosão cresce até 0,34 m em 0,4 s, fica 0,35 s e
  some em 0,45 s. Cada elo da cadeia explode com raio 0,29 m e vale mais um multiplicador.
- **Munição:** cada lançador tem a sua (45% dos meteoros da onda, rachador conta 3, +2, mínimo 8;
  ondas de chefe têm valor fixo). Recarrega no intervalo entre ondas (4,5 s).
- **Meteoros** (cada um com assobio próprio de aviso, 1,3 s antes, vindo da direção dele, e cor):
  pedra (laranja), rápido (azul, 1,85x mais rápido), rachador (vermelho, se parte em 3 cacos a
  2,4 m da vila), curvo (verde, muda de alvo 2 vezes no caminho). Espalhamento de até 8° num grupo
  = bando: todos vão para a mesma construção, em fila (bom para cadeia).
- **Construções:** 10 por mundo, uma pancada derruba. Meteoro que vai para ruína só abre cratera.
  **Casas destruídas não voltam até o fim do mundo:** "Próxima fase" continua com as que sobraram;
  escolhendo a fase no menu, ela começa com as que sobraram na melhor vez que a fase anterior foi
  vencida (fase 1 de cada mundo sempre começa completa). Sem nenhuma de pé, perde a fase.
- **Bônus** no fim de cada onda: 100 por construção de pé + 10 por projétil que sobrou.
- **Cometas** (vida em explosões; cada explosão tira 1, com 0,6 s de proteção depois de cada dano;
  solta cacos de tempos em tempos e a cada 2 de vida; a zero se parte em pedaços que ainda caem;
  se chegar na vila, arrasa tudo e perde a fase): Mundo 1 **Tição** desce reto para a praça (6);
  Mundo 2 **Maré** dá voltas em espiral em volta do jogador, descendo (8); Mundo 3 **Rei** voa
  mudando de rumo e solta cacos curvos (10).
- **Estrelas** pelas construções perdidas na fase (limites em `stars` de cada fase em
  `js/levels.js`); vencer dá pelo menos 1. Vencer libera a próxima fase.
- **Pontos e recordes:** pedra/caco 25, rápido/rachador/curvo 50, vezes o elo da cadeia; cometa
  150 por acerto e 2000 ao partir. A partida soma as fases jogadas em seguida com "Próxima fase";
  termina ao perder, ao vencer a 3-4 ou ao sair por outro botão. Se entra nos 8 maiores, pede 3
  letras (▲/▼) e mostra a tabela. Progresso no navegador (localStorage `meteorovr.v1`).

Mundos (em `js/levels.js`, cenário em `THEMES` de `js/scene.js`): 1 Vale do Campo (pôr do sol,
campos e morros), 2 Porto da Enseada (noite de lua, a vila numa ilha com cais, barcos e mar),
3 Cidade da Serra (prédios, montanhas com neve, pinheiros).

## Como testar

- `node tests/run.js` (ou `npm test`): 12 fases em 3 mundos, construções separadas e longe do
  jogador, cursor (cúpula, chão, gruda no meteoro e no caminho dele), um projétil por aperto,
  munição por lançador, explosão no ponto do cursor, cadeia com ×1/×2/×3, explosão cresce e some,
  meteoro derruba construção, cratera em ruína, rachador em 3, curvo muda de alvo, rápido, perder
  com a vila destruída, aviso 1,3 s antes da mesma direção, bônus e recarga, casas que passam para
  a próxima fase, os 3 cometas (movem, soltam cacos, 1 de vida por explosão, se partem, arrasam a
  vila se chegarem, a Maré dá a volta) e o **robô**: joga as 12 fases com 5 sementes cada, com
  limites humanos (cabeça até 200°/s, mão até 300°/s, reação de 0,3 s, campo de visão de 100°, só
  conhece o que viu ou ouviu no aviso, espera a curva do curvo acabar) e tem que vencer todas com
  pelo menos 2 estrelas; também joga cada mundo inteiro em sequência carregando as perdas.
  Termina com "Tudo certo". Não toca som.
- No navegador (console): `dev.loadLevel(5)` abre a fase 5 (1 a 12, com todas as casas),
  `dev.loadLevel(4, 2)` abre a fase 4 na onda 2 (chefe), `dev.autoplay = true` faz o robô jogar (no
  PC a câmera vira a cabeça dele), `dev.advance(20)` avança 20 s na hora, `dev.state()` mostra tela,
  fase, onda, casas, munição, pontos, cometa, `dev.look(az, el)` aponta a câmera do PC (graus),
  `dev.snapshot()` devolve a imagem da tela (JPEG em data URL), `dev.resetSave()` apaga progresso e
  recordes. `window.meteoro` tem `game`, `save`, `sfx`, `robot`, `startLevel`, `goMenu`.
- **Só dá para testar no óculos:** mirar e disparar com os controles, pinça no rastreamento de
  mãos, recentralizar, áudio 3D de verdade (se dá para saber de onde vem o assobio), vibração,
  conforto, tamanho da vila na cintura, FPS no Quest.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", HUD do PC (fase, casas, placar, munição, cometa) |
| `js/vec.js` | Vetores 3D em arrays, colisões, interceptação, aleatório com semente. Sem navegador |
| `js/sim.js` | Regras: `Game` (ondas, avisos, mira com cursor que gruda, lançadores e munição, projéteis, explosões e cadeia, meteoros, construções, bônus, estrelas), `Comet` (os 3 chefes), `ammoFor`. Sem navegador |
| `js/levels.js` | Os 3 mundos (vila e cometa) e as 12 fases em notação compacta (legenda no topo). Sem navegador |
| `js/robot.js` | Robô com limites humanos (percepção, reação, giro da cabeça e das mãos, munição). Testes e `dev.autoplay`. Sem navegador |
| `js/main.js` | Liga tudo: render, VR (lançadores nos controles, gatilhos, pinça, vibração, recentralizar), mouse/teclado, cursores, menus, recordes com 3 letras, HUD, eventos → sons e efeitos, setas de aviso, pontos que sobem, `dev` |
| `js/scene.js` | Céu (degradê com estrelas e sol/lua), paisagem de cada mundo, vila (cada construção com ruína), meteoros/explosões/projéteis instanciados, partículas, cursor, lançador |
| `js/ui.js` | Painel de menu 3D em canvas e placas de texto |
| `js/audio.js` | Sons sintetizados com PannerNode HRTF: assobios de aviso por tipo, disparo, explosões que sobem de tom na cadeia, desabamento, cometa, vento por mundo |
| `js/save.js` | Progresso, casas por fase, recordes e opções salvos |
| `tests/run.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8844, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: metros; a cabeça do jogador fica na origem, o chão da vila em `GROUND_Y` (-0,7).
-z = frente, +x = direita, +y = cima. Azimute 0 = frente, 90 = direita; elevação 90 = em cima.
Os meteoros aparecem a 7,5 m da cabeça; as construções ficam entre 1,15 e 2,2 m do centro.

## Regras e convenções do projeto

- `vec.js`, `sim.js`, `levels.js` e `robot.js` não podem usar navegador nem Three.js: os testes
  rodam no Node.
- `scene.js` desenha as construções no lugar e no tamanho de `BUILD`/`layout` (o que é atingido é
  o que se vê).
- Fase nova ou mudada: seguir a legenda de `levels.js`, rodar `node tests/run.js` e conferir as
  perdas do robô impressas no fim; os limites de `stars` têm que deixar o robô com 2 estrelas ou mais.
- Eventos do jogo (`game.events`) são a única ponte da lógica para som, vibração e efeitos.

## Decisões

- Casas destruídas não voltam até o fim do mundo (pedido do Eduardo, "decida"): continuar com
  "Próxima fase" leva as perdas; pelo menu, a fase começa com o melhor resultado salvo da anterior.
- Cursor que gruda na profundidade do meteoro: em VR não dá para apontar profundidade com um raio;
  grudar no caminho (até 1,5 s à frente) deixa mirar à frente do meteoro.
- Os lançadores ficam nas mãos (o projétil sai do controle), não em torres na vila: o jogador gira
  360° e uma torre fixa ficaria às costas.
- Cometa com 0,6 s de proteção depois de cada dano: sem isso, os cacos que ele solta explodiam em
  cadeia em volta dele e matavam o chefe com um tiro só.
- Robô espera a curva do meteoro curvo acabar antes de atirar (como faria uma pessoa).
- Recordes por partida (fases seguidas), 8 maiores, 3 letras com ▲/▼ (funciona igual no VR e no PC).
- Desempenho de Quest: pixelRatio 1, foveação, meteoros/explosões/projéteis instanciados, partículas
  num só `Points`, 2 luzes sem sombra, sem pós-processamento.
- Porta do servidor local 8844.

## Pendências / problemas conhecidos

- **Nada foi testado no Quest ainda**: mira e gatilhos, cursor, pinça, recentralizar, áudio 3D,
  vibração, escala da vila na cintura, FPS no óculos.
- Sons só foram checados por não dar erro; ninguém ouviu ainda.
- A dificuldade foi calibrada pelo robô, que mira com antecipação perfeita e acerta ~90%; pessoas
  devem perder mais casas. Se ficar difícil, subir `AMMO_SHARE` ou baixar `speed` das fases.
- No PC, quando o robô joga (`dev.autoplay`), os projéteis saem das mãos dele (perto da cabeça), não
  dos lançadores desenhados embaixo da tela.
