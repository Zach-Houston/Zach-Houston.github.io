/* ============================================================
   Zachtris — game logic.
   ============================================================ */

(() => {
  "use strict";

  // ---------- Constants -------------------------------------
  const COLS = 10;
  const ROWS = 20;
  // Cell size in CSS px — recomputed on every resize so the playfield
  // scales to fill the available stage area when the window grows.
  let CELL = 28;

  const COLORS = {
    I: "#00e5ff",
    O: "#ffd54f",
    T: "#ba68c8",
    S: "#66bb6a",
    Z: "#ef5350",
    J: "#42a5f5",
    L: "#ffa726",
  };

  // Pieces in spawn orientation. Square matrices so rotation is uniform.
  const PIECES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  };

  // ---------- DOM -------------------------------------------
  const root = document.getElementById("zt-root");
  const field = document.getElementById("zt-field");
  const ctx = field.getContext("2d");
  const holdCanvas = document.getElementById("zt-hold");
  const holdCtx = holdCanvas.getContext("2d");
  const nextCanvas = document.getElementById("zt-next");
  const nextCtx = nextCanvas.getContext("2d");

  const scoreEl = document.getElementById("zt-score");
  const linesEl = document.getElementById("zt-lines");
  const levelEl = document.getElementById("zt-level");

  const overlay = document.getElementById("zt-overlay");
  const overlayEyebrow = document.getElementById("zt-overlay-eyebrow");
  const overlayTitle = document.getElementById("zt-overlay-title");
  const overlaySub = document.getElementById("zt-overlay-sub");
  const startBtn = document.getElementById("zt-start");

  // ---------- State ------------------------------------------
  let board, active, hold, canHold, nextQueue, bag;
  let score, lines, level;
  let lastDrop, paused, gameOver, running;

  function reset() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    active = null;
    hold = null;
    canHold = true;
    nextQueue = [];
    bag = [];
    score = 0;
    lines = 0;
    level = 1;
    lastDrop = 0;
    paused = false;
    gameOver = false;
    running = false;
    updateStats();
  }

  // ---------- 7-bag randomizer -------------------------------
  function refillBag() {
    const types = ["I", "O", "T", "S", "Z", "J", "L"];
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    bag.push(...types);
  }
  function takePiece() {
    if (bag.length === 0) refillBag();
    const type = bag.shift();
    return { type, matrix: PIECES[type].map((row) => [...row]) };
  }

  // ---------- Collision --------------------------------------
  function collides(piece, dx = 0, dy = 0, matrix = piece.matrix) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[0].length; x++) {
        if (!matrix[y][x]) continue;
        const nx = piece.x + x + dx;
        const ny = piece.y + y + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  // ---------- Spawn ------------------------------------------
  function spawn(piece) {
    if (!piece) {
      while (nextQueue.length < 5) nextQueue.push(takePiece());
      piece = nextQueue.shift();
    }
    piece.x = Math.floor((COLS - piece.matrix[0].length) / 2);
    piece.y = piece.type === "I" ? -1 : 0;
    active = piece;
    canHold = true;
    if (collides(piece)) {
      gameOver = true;
      showOverlay("GAME OVER", "ZACHTRIS", `Score: ${score}`, "Play again");
    }
  }

  // ---------- Movement ---------------------------------------
  function move(dx) {
    if (!active || gameOver || paused) return;
    if (!collides(active, dx, 0)) active.x += dx;
  }
  function softDrop() {
    if (!active || gameOver || paused) return;
    if (!collides(active, 0, 1)) {
      active.y++;
      score += 1;
      lastDrop = performance.now();
    } else {
      lockPiece();
    }
    updateStats();
  }
  function hardDrop() {
    if (!active || gameOver || paused) return;
    let dy = 0;
    while (!collides(active, 0, dy + 1)) dy++;
    active.y += dy;
    score += dy * 2;
    lockPiece();
    updateStats();
  }

  // ---------- Rotation (with basic wall kicks) ---------------
  function rotateMatrix(m, dir) {
    const N = m.length;
    const out = Array.from({ length: N }, () => Array(N).fill(0));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (dir > 0) out[x][N - 1 - y] = m[y][x];
        else out[N - 1 - x][y] = m[y][x];
      }
    }
    return out;
  }
  function rotate(dir) {
    if (!active || gameOver || paused) return;
    if (active.type === "O") return;
    const rotated = rotateMatrix(active.matrix, dir);
    // Wall kicks: try center, then ±1, ±2 horizontal and -1 vertical.
    const kicks = [
      [0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1],
    ];
    for (const [kx, ky] of kicks) {
      if (!collides(active, kx, ky, rotated)) {
        active.matrix = rotated;
        active.x += kx;
        active.y += ky;
        return;
      }
    }
  }

  // ---------- Lock + line clear ------------------------------
  function lockPiece() {
    const m = active.matrix;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[0].length; x++) {
        if (m[y][x]) {
          const by = active.y + y;
          const bx = active.x + x;
          if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
            board[by][bx] = active.type;
          }
        }
      }
    }
    clearLines();
    if (!gameOver) spawn();
  }
  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every((c) => c)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++;
        y++;
      }
    }
    if (cleared) {
      const pts = [0, 100, 300, 500, 800][cleared] * level;
      score += pts;
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
      updateStats();
    }
  }

  // ---------- Hold -------------------------------------------
  function holdSwap() {
    if (!active || !canHold || gameOver || paused) return;
    if (hold) {
      const swap = hold;
      hold = { type: active.type, matrix: PIECES[active.type].map((r) => [...r]) };
      spawn(swap);
    } else {
      hold = { type: active.type, matrix: PIECES[active.type].map((r) => [...r]) };
      spawn();
    }
    canHold = false;
  }

  // ---------- Render -----------------------------------------
  function drawCell(c, x, y, color, opts = {}) {
    const px = x * CELL;
    const py = y * CELL;
    c.fillStyle = color;
    c.fillRect(px, py, CELL, CELL);
    // Inset bevel
    c.fillStyle = "rgba(255,255,255,0.28)";
    c.fillRect(px, py, CELL, 3);
    c.fillRect(px, py, 3, CELL);
    c.fillStyle = "rgba(0,0,0,0.32)";
    c.fillRect(px, py + CELL - 3, CELL, 3);
    c.fillRect(px + CELL - 3, py, 3, CELL);
    if (opts.ghost) {
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
    }
  }

  function drawField() {
    // Background grid
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, field.width, field.height);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, field.height);
      ctx.stroke();
    }
    for (let i = 1; i < ROWS; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(field.width, i * CELL + 0.5);
      ctx.stroke();
    }

    // Locked
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (board[y][x]) drawCell(ctx, x, y, COLORS[board[y][x]]);
      }
    }

    // Ghost + active
    if (active) {
      let dy = 0;
      while (!collides(active, 0, dy + 1)) dy++;
      const m = active.matrix;
      const c = COLORS[active.type];

      // Ghost (offset)
      for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[0].length; x++) {
          if (!m[y][x]) continue;
          const gy = active.y + y + dy;
          if (gy >= 0) drawCell(ctx, active.x + x, gy, c, { ghost: true });
        }
      }
      // Active
      for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[0].length; x++) {
          if (!m[y][x]) continue;
          const ay = active.y + y;
          if (ay >= 0) drawCell(ctx, active.x + x, ay, c);
        }
      }
    }
  }

  function drawPieceCentered(c, piece, cx, cy, cell) {
    const m = piece.matrix;
    let minX = m[0].length, maxX = -1, minY = m.length, maxY = -1;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[0].length; x++) {
        if (m[y][x]) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    const pw = (maxX - minX + 1) * cell;
    const ph = (maxY - minY + 1) * cell;
    const ox = cx - pw / 2;
    const oy = cy - ph / 2;
    const color = COLORS[piece.type];
    const b = Math.max(1, Math.floor(cell / 12));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!m[y][x]) continue;
        const px = ox + (x - minX) * cell;
        const py = oy + (y - minY) * cell;
        c.fillStyle = color;
        c.fillRect(px, py, cell, cell);
        c.fillStyle = "rgba(255,255,255,0.28)";
        c.fillRect(px, py, cell, b);
        c.fillRect(px, py, b, cell);
        c.fillStyle = "rgba(0,0,0,0.32)";
        c.fillRect(px, py + cell - b, cell, b);
        c.fillRect(px + cell - b, py, b, cell);
      }
    }
  }

  function drawSidePanels() {
    // HOLD — single centered piece
    holdCtx.fillStyle = "#14161e";
    holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (hold) {
      const cell = Math.floor(holdCanvas.width / 6);
      drawPieceCentered(
        holdCtx, hold,
        holdCanvas.width / 2, holdCanvas.height / 2, cell
      );
    }
    // NEXT — 3 pieces stacked
    nextCtx.fillStyle = "#14161e";
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    const slotH = nextCanvas.height / 3;
    const ncell = Math.floor(nextCanvas.width / 6);
    for (let i = 0; i < Math.min(3, nextQueue.length); i++) {
      drawPieceCentered(
        nextCtx, nextQueue[i],
        nextCanvas.width / 2, i * slotH + slotH / 2, ncell
      );
    }
  }

  // ---------- Resize ----------------------------------------
  // Recompute CELL so the playfield fills the available stage area,
  // and resize all canvases to match their CSS size for crisp render.
  function fitCanvas() {
    const stage = document.getElementById("zt-stage");
    const titleBar = document.querySelector(".zt-title-bar");
    const titleH = (titleBar ? titleBar.offsetHeight : 28) + 16; // gap + border
    const availH = Math.max(140, stage.clientHeight - titleH);
    const availW = Math.max(140, stage.clientWidth - 8);

    CELL = Math.max(
      14,
      Math.floor(Math.min(availW / COLS, availH / ROWS))
    );

    field.width = COLS * CELL;
    field.height = ROWS * CELL;
    field.style.width = field.width + "px";
    field.style.height = field.height + "px";

    // Match preview canvases to their CSS-displayed size for crisp pixels.
    const hCSS = holdCanvas.clientWidth || 120;
    holdCanvas.width = hCSS;
    holdCanvas.height = hCSS;
    const nCSS = nextCanvas.clientWidth || 120;
    nextCanvas.width = nCSS;
    nextCanvas.height = Math.round((nCSS * 8) / 3);

    drawField();
    drawSidePanels();
  }

  function updateStats() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
  }

  // ---------- Overlay ----------------------------------------
  function showOverlay(eyebrow, title, sub, btnLabel = "Start") {
    overlayEyebrow.textContent = eyebrow;
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    startBtn.textContent = btnLabel;
    overlay.hidden = false;
  }
  function hideOverlay() {
    overlay.hidden = true;
  }

  // ---------- Game loop --------------------------------------
  function gravity(t) {
    const speed = Math.max(80, 1000 - (level - 1) * 90);
    if (t - lastDrop > speed) {
      if (active && !collides(active, 0, 1)) active.y++;
      else if (active) lockPiece();
      lastDrop = t;
    }
  }
  function loop(t) {
    if (!running) return;
    if (!paused && !gameOver) gravity(t);
    drawField();
    drawSidePanels();
    requestAnimationFrame(loop);
  }

  // ---------- Input ------------------------------------------
  function bindKeys() {
    root.addEventListener("keydown", (e) => {
      // Always intercept arrows + space (avoid page-scroll inside iframe)
      const blockKeys = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "];
      if (blockKeys.includes(e.key)) e.preventDefault();
      if (!running) return;

      switch (e.key) {
        case "ArrowLeft":  move(-1); break;
        case "ArrowRight": move(1);  break;
        case "ArrowDown":  softDrop(); break;
        case "ArrowUp":    hardDrop(); break;
        case "z": case "Z": rotate(-1); break;
        case "x": case "X": rotate(1);  break;
        case " ":          holdSwap(); break;
        case "p": case "P":
          paused = !paused;
          if (paused) showOverlay("PAUSED", "ZACHTRIS", "Press P to resume", "Resume");
          else hideOverlay();
          break;
      }
    });
  }

  // ---------- Start / restart -------------------------------
  function startGame() {
    reset();
    spawn();
    running = true;
    lastDrop = performance.now();
    hideOverlay();
    root.focus();
    requestAnimationFrame(loop);
  }
  function bindStart() {
    startBtn.addEventListener("click", () => {
      if (paused && running && !gameOver) {
        paused = false;
        hideOverlay();
        lastDrop = performance.now();
        root.focus();
      } else {
        startGame();
      }
    });
  }

  // ---------- Boot ------------------------------------------
  reset();
  fitCanvas();
  bindKeys();
  bindStart();
  window.addEventListener("resize", fitCanvas);
  // Auto-focus so keyboard works as soon as the iframe is clicked.
  root.focus();
})();
