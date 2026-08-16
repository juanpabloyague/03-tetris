'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, maxLineasDeUnaVez;
let started = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = activeStartLevel + Math.floor(lines / 10);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (cleared > maxLineasDeUnaVez) maxLineasDeUnaVez = cleared;
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const theme = THEMES[currentSkin] || THEMES.retro;
  theme.dibujarBloque(context, x, y, colorIndex, size, alpha ?? 1);
}

function drawGrid() {
  const theme = THEMES[currentSkin] || THEMES.retro;
  ctx.strokeStyle = theme.colorGrid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showRecordFormIfQualifies();
}

function pauseGame() {
  if (!started || gameOver) return;
  paused = true;
  menuOpen = true;
  cancelAnimationFrame(animId);
  showMenuView('main');
  pauseMenu.classList.remove('hidden');
}

function resumeGame() {
  if (!started || gameOver) return;
  paused = false;
  menuOpen = false;
  pauseMenu.classList.add('hidden');
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) {
        draw();
        return;
      }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  started = true;
  board = createBoard();
  score = 0;
  lines = 0;
  activeStartLevel = startLevel;
  level = activeStartLevel;
  paused = false;
  gameOver = false;
  menuOpen = false;
  dropInterval = Math.max(100, 1000 - (activeStartLevel - 1) * 90);
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  maxLineasDeUnaVez = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Temas visuales / skins ----

function aclararColor(hex, cantidad) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + cantidad;
  let g = ((num >> 8) & 0xff) + cantidad;
  let b = (num & 0xff) + cantidad;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

const PALETA_NEON = [
  null,
  '#00e5ff',
  '#fff176',
  '#e040fb',
  '#69f0ae',
  '#ff5252',
  '#536dfe',
  '#ffab40',
];

const PALETA_PASTEL = [
  null,
  '#b3e5fc',
  '#fff9c4',
  '#e1bee7',
  '#c8e6c9',
  '#ffcdd2',
  '#c5cae9',
  '#ffe0b2',
];

const PALETA_PIXEL = [
  null,
  '#26c6da',
  '#fdd835',
  '#ab47bc',
  '#66bb6a',
  '#ef5350',
  '#5c6bc0',
  '#ffa726',
];

const THEMES = {
  retro: {
    nombre: 'Retro',
    colores: COLORS,
    colorGrid: '#22222e',
    colorFondo: '#1a1a25',
    dibujarBloque(context, x, y, colorIndex, size, alpha) {
      const color = this.colores[colorIndex];
      context.globalAlpha = alpha;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // brillo superior
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    nombre: 'Neon',
    colores: PALETA_NEON,
    colorGrid: '#1a1a2e',
    colorFondo: '#000000',
    dibujarBloque(context, x, y, colorIndex, size, alpha) {
      const color = this.colores[colorIndex];
      const px = x * size + 2, py = y * size + 2, s = size - 4;
      context.globalAlpha = alpha;
      context.shadowBlur = 12;
      context.shadowColor = color;
      context.fillStyle = aclararColor(color, -60);
      context.fillRect(px, py, s, s);
      context.lineWidth = 2;
      context.strokeStyle = color;
      context.strokeRect(px, py, s, s);
      // el shadow no debe filtrarse a otros dibujos del canvas
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.globalAlpha = 1;
    },
  },
  pastel: {
    nombre: 'Pastel',
    colores: PALETA_PASTEL,
    colorGrid: '#e8e4f3',
    colorFondo: '#f5f3fa',
    dibujarBloque(context, x, y, colorIndex, size, alpha) {
      const color = this.colores[colorIndex];
      const px = x * size + 2, py = y * size + 2, s = size - 4, radio = 6;
      context.globalAlpha = alpha;
      context.fillStyle = color;
      context.beginPath();
      if (typeof context.roundRect === 'function') {
        context.roundRect(px, py, s, s, radio);
      } else {
        // esquinas redondeadas simuladas para contextos sin roundRect
        context.moveTo(px + radio, py);
        context.arcTo(px + s, py, px + s, py + s, radio);
        context.arcTo(px + s, py + s, px, py + s, radio);
        context.arcTo(px, py + s, px, py, radio);
        context.arcTo(px, py, px + s, py, radio);
        context.closePath();
      }
      context.fill();
      context.globalAlpha = 1;
    },
  },
  pixel: {
    nombre: 'Pixel art',
    colores: PALETA_PIXEL,
    colorGrid: '#2a2a2a',
    colorFondo: '#111111',
    dibujarBloque(context, x, y, colorIndex, size, alpha) {
      const color = this.colores[colorIndex];
      const px = x * size + 1, py = y * size + 1, s = size - 2;
      context.globalAlpha = alpha;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      // textura de dithering en celdas 6x6 con variación de luminancia
      const celdas = 6;
      const paso = s / celdas;
      for (let ry = 0; ry < celdas; ry++) {
        for (let rx = 0; rx < celdas; rx++) {
          context.fillStyle = (rx + ry) % 2 === 0 ? aclararColor(color, -20) : aclararColor(color, 20);
          context.fillRect(px + rx * paso, py + ry * paso, paso, paso);
        }
      }
      // borde duro
      context.lineWidth = 2;
      context.strokeStyle = aclararColor(color, -60);
      context.strokeRect(px, py, s, s);
      context.globalAlpha = 1;
    },
  },
};

let currentSkin = 'retro';
try {
  const skinGuardado = localStorage.getItem('tetris.skin');
  if (skinGuardado && THEMES[skinGuardado]) currentSkin = skinGuardado;
} catch (e) {
  currentSkin = 'retro';
}
document.body.setAttribute('data-skin', currentSkin);

const skinSelect = document.getElementById('skin-select');
skinSelect.value = currentSkin;

skinSelect.addEventListener('change', () => {
  const elegido = skinSelect.value;
  currentSkin = THEMES[elegido] ? elegido : 'retro';
  document.body.setAttribute('data-skin', currentSkin);
  try {
    localStorage.setItem('tetris.skin', currentSkin);
  } catch (e) {
    // almacenamiento no disponible, se ignora
  }
  draw();
  drawNext();
  skinSelect.blur();
});

/* ==================== Tabla de records ==================== */

const RECORDS_KEY = 'tetris.records.v1';
const RECORDS_NAME_KEY = 'tetris.records.lastName';
const MAX_RECORDS = 5;

const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const overlaySaveForm = document.getElementById('overlay-save-form');
const overlayNameInput = document.getElementById('overlay-name-input');
const saveRecordBtn = document.getElementById('save-record-btn');

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(r => r && typeof r.score === 'number');
  } catch (e) {
    return [];
  }
}

function saveRecordsList(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    // localStorage no disponible: se ignora, no persiste en esta sesión
  }
}

function clearRecordsList() {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (e) {
    // localStorage no disponible: nada que borrar
  }
}

function getLastName() {
  try {
    return localStorage.getItem(RECORDS_NAME_KEY) || '';
  } catch (e) {
    return '';
  }
}

function setLastName(name) {
  try {
    localStorage.setItem(RECORDS_NAME_KEY, name);
  } catch (e) {
    // localStorage no disponible: no se recuerda el nombre
  }
}

function qualifiesForTop(scoreValue, records) {
  const list = records || loadRecords();
  if (list.length < MAX_RECORDS) return true;
  const minScore = Math.min(...list.map(r => r.score));
  return scoreValue > minScore;
}

function addRecord(entry) {
  const records = loadRecords();
  records.push(entry);
  records.sort((a, b) => b.score - a.score);
  const trimmed = records.slice(0, MAX_RECORDS);
  saveRecordsList(trimmed);
  return trimmed;
}

function renderRecordsInto(panel, records, highlightEntry) {
  const tbody = panel.querySelector('.records-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    if (records.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'records-empty';
      td.textContent = 'Sin records todavía';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      records.forEach((r, i) => {
        const tr = document.createElement('tr');
        if (highlightEntry && r === highlightEntry) tr.classList.add('record-nuevo');
        [i + 1, r.nombre, r.score.toLocaleString(), r.lines, r.level].forEach(val => {
          const td = document.createElement('td');
          td.textContent = val;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
  }

  const bestCombo = records.reduce((m, r) => Math.max(m, r.maxCombo || 0), 0);
  const bestLineas = records.reduce((m, r) => Math.max(m, r.maxLineasDeUnaVez || 0), 0);
  const bestComboEl = panel.querySelector('.records-best-combo');
  const bestLineasEl = panel.querySelector('.records-best-lineas');
  if (bestComboEl) bestComboEl.textContent = bestCombo;
  if (bestLineasEl) bestLineasEl.textContent = bestLineas;
}

function renderRecords(records, highlightEntry) {
  const data = records || loadRecords();
  document.querySelectorAll('.records-panel').forEach(panel => {
    renderRecordsInto(panel, data, highlightEntry);
  });
}

function resetClearButtons() {
  document.querySelectorAll('.clear-records-btn').forEach(btn => {
    btn.textContent = 'Borrar records';
    btn.dataset.confirm = '0';
  });
}

function setupClearButtons() {
  document.querySelectorAll('.clear-records-btn').forEach(btn => {
    btn.dataset.confirm = '0';
    btn.addEventListener('click', () => {
      if (btn.dataset.confirm === '1') {
        clearRecordsList();
        resetClearButtons();
        renderRecords();
      } else {
        resetClearButtons();
        btn.dataset.confirm = '1';
        btn.textContent = '¿Seguro?';
      }
    });
  });
}

function showRecordFormIfQualifies() {
  const records = loadRecords();
  if (qualifiesForTop(score, records)) {
    overlaySaveForm.classList.remove('hidden');
    overlayNameInput.value = getLastName();
  } else {
    overlaySaveForm.classList.add('hidden');
  }
  renderRecords(records);
}

function handleSaveRecord() {
  let name = overlayNameInput.value.trim().slice(0, 12);
  if (!name) name = 'JUGADOR';
  setLastName(name);
  const entry = {
    nombre: name,
    score,
    lines,
    level,
    maxCombo,
    maxLineasDeUnaVez,
    fecha: new Date().toISOString(),
  };
  const updated = addRecord(entry);
  renderRecords(updated, entry);
  overlaySaveForm.classList.add('hidden');
}

saveRecordBtn.addEventListener('click', handleSaveRecord);
overlayNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') handleSaveRecord();
});

function startGame() {
  startScreen.classList.add('hidden');
  init();
}

playBtn.addEventListener('click', startGame);
setupClearButtons();
renderRecords();

/* ==================== /Tabla de records ==================== */

// ---- Menú de pausa ----
const pauseMenu = document.getElementById('pause-menu');
const menuMain = document.getElementById('menu-main');
const menuControlsView = document.getElementById('menu-controls');
const menuResumeBtn = document.getElementById('menu-resume-btn');
const menuRestartBtn = document.getElementById('menu-restart-btn');
const menuControlsBtn = document.getElementById('menu-controls-btn');
const menuBackBtn = document.getElementById('menu-back-btn');
const menuLevelSelect = document.getElementById('menu-level-select');

let startLevel = 1;
let activeStartLevel = startLevel;
let menuOpen = false;
let menuView = 'main';

for (let i = 1; i <= 15; i++) {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = String(i);
  menuLevelSelect.appendChild(opt);
}
menuLevelSelect.value = String(startLevel);

menuLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(menuLevelSelect.value, 10);
});

function showMenuView(view) {
  menuView = view;
  menuMain.classList.toggle('hidden', view !== 'main');
  menuControlsView.classList.toggle('hidden', view !== 'controls');
  (view === 'main' ? menuResumeBtn : menuBackBtn).focus();
}

function togglePauseMenu() {
  if (gameOver) return;
  if (menuOpen) resumeGame(); else pauseGame();
}

function menuFocusables() {
  const view = menuView === 'controls' ? menuControlsView : menuMain;
  return Array.from(view.querySelectorAll('button, select'));
}

function stepLevelSelect(dir) {
  const newVal = Math.min(15, Math.max(1, parseInt(menuLevelSelect.value, 10) + dir));
  menuLevelSelect.value = String(newVal);
  startLevel = newVal;
}

menuResumeBtn.addEventListener('click', resumeGame);
menuRestartBtn.addEventListener('click', () => { init(); });
menuControlsBtn.addEventListener('click', () => showMenuView('controls'));
menuBackBtn.addEventListener('click', () => showMenuView('main'));

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) return; // dejar que el <select> maneje sus propias teclas

  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    togglePauseMenu();
    return;
  }

  if (menuOpen) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      const dir = e.code === 'ArrowDown' ? 1 : -1;
      if (document.activeElement === menuLevelSelect) {
        stepLevelSelect(dir);
        return;
      }
      const focusables = menuFocusables();
      const idx = focusables.indexOf(document.activeElement);
      const nextIdx = idx === -1 ? 0 : (idx + dir + focusables.length) % focusables.length;
      focusables[nextIdx].focus();
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space') {
      e.preventDefault();
      return;
    }
    return;
  }

  if (!started || paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
