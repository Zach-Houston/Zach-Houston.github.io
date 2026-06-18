/* ============================================================
   Zachika — Suika-style merge game.
   Roll-our-own 2D physics (no framework). Circles only.
   ============================================================ */

(() => {
  "use strict";

  // ---------- Fruit chain ------------------------------------
  // Indexed cherry → strawberry → grape → lemon → orange →
  // apple → pear → peach → pineapple → melon → watermelon.
  // value = points awarded when this fruit is FORMED (real Suika
  // uses triangular numbers).
  const FRUITS = [
    { name: "Cherry",     emoji: "🍒", r: 14,  value: 0  },
    { name: "Strawberry", emoji: "🍓", r: 19,  value: 1  },
    { name: "Grape",      emoji: "🍇", r: 25,  value: 3  },
    { name: "Lemon",      emoji: "🍋", r: 32,  value: 6  },
    { name: "Orange",     emoji: "🍊", r: 40,  value: 10 },
    { name: "Apple",      emoji: "🍎", r: 48,  value: 15 },
    { name: "Pear",       emoji: "🍐", r: 57,  value: 21 },
    { name: "Peach",      emoji: "🍑", r: 67,  value: 28 },
    { name: "Pineapple",  emoji: "🍍", r: 78,  value: 36 },
    { name: "Melon",      emoji: "🍈", r: 90,  value: 45 },
    { name: "Watermelon", emoji: "🍉", r: 104, value: 55 },
  ];
  const MAX_TYPE = FRUITS.length - 1;
  const DROPPABLE_MAX = 4; // only drop fruits 0..4 (cherry..orange)

  // ---------- Canvas / world constants -----------------------
  const WIDTH = 500;
  const HEIGHT = 700;
  const WALL_LEFT = 20;
  const WALL_RIGHT = WIDTH - 20;
  const WALL_BOTTOM = HEIGHT - 20;
  const DROP_Y = 60;
  const DANGER_Y = 110;   // line just below drop area
  const GAMEOVER_FRAMES = 90; // ~1.5s @ 60fps above the line → game over

  // Physics tuning
  const GRAVITY = 0.32;
  const DAMPING = 0.995;
  const RESTITUTION = 0.15;
  const ITERATIONS = 6;
  const SLEEP_V = 0.05;
  const DROP_COOLDOWN = 22; // frames between drops

  // ---------- DOM refs ---------------------------------------
  const canvas = document.getElementById("zk-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("zk-score");
  const nextEl = document.getElementById("zk-next");
  const ladderList = document.getElementById("zk-ladder-list");
  const overlay = document.getElementById("zk-overlay");
  const overlayEyebrow = document.getElementById("zk-overlay-eyebrow");
  const overlayTitle = document.getElementById("zk-overlay-title");
  const overlaySub = document.getElementById("zk-overlay-sub");
  const startBtn = document.getElementById("zk-start");
  const dropBtn = document.getElementById("zk-drop-btn");

  // ---------- Game state -------------------------------------
  let bodies = [];
  let score = 0;
  let nextType = 0;
  let upcomingType = 0;
  let dropX = WIDTH / 2;
  let dropCooldown = 0;
  let aboveLineFrames = 0;
  let phase = "idle";  // idle | playing | over
  let nextBodyId = 1;

  // ---------- Body factory -----------------------------------
  function makeBody(type, x, y) {
    const f = FRUITS[type];
    return {
      id: nextBodyId++,
      type,
      r: f.r,
      x, y,
      vx: 0,
      vy: 0,
      mass: f.r * f.r,
      angle: Math.random() * Math.PI * 2,
      angVel: 0,
      entered: false,    // has this body fully entered the container?
      merged: false,     // marked-for-removal flag
    };
  }

  // ---------- Reset / start ---------------------------------
  function reset() {
    bodies = [];
    score = 0;
    nextType = randomDropType();
    upcomingType = randomDropType();
    dropX = WIDTH / 2;
    dropCooldown = 0;
    aboveLineFrames = 0;
    nextBodyId = 1;
    updateHud();
  }
  function randomDropType() {
    return Math.floor(Math.random() * (DROPPABLE_MAX + 1));
  }

  // ---------- Drop -------------------------------------------
  function attemptDrop() {
    if (phase !== "playing") return;
    if (dropCooldown > 0) return;
    const x = clamp(dropX,
      WALL_LEFT + FRUITS[nextType].r,
      WALL_RIGHT - FRUITS[nextType].r
    );
    const b = makeBody(nextType, x, DROP_Y);
    b.vy = 0;
    bodies.push(b);
    nextType = upcomingType;
    upcomingType = randomDropType();
    dropCooldown = DROP_COOLDOWN;
    updateHud();
  }

  // ---------- Physics step -----------------------------------
  function physicsStep() {
    // Gravity + damping
    for (const b of bodies) {
      if (b.merged) continue;
      b.vy += GRAVITY;
      b.vx *= DAMPING;
      b.vy *= DAMPING;
      b.angVel *= DAMPING;
    }
    // Integrate
    for (const b of bodies) {
      if (b.merged) continue;
      b.x += b.vx;
      b.y += b.vy;
      b.angle += b.angVel;
    }
    // Constraint iterations
    for (let it = 0; it < ITERATIONS; it++) {
      resolveWalls();
      resolveCollisions();
    }
    // Sleep + entered flag
    for (const b of bodies) {
      if (b.merged) continue;
      if (Math.abs(b.vx) < SLEEP_V) b.vx = 0;
      if (Math.abs(b.vy) < SLEEP_V) b.vy = 0;
      if (!b.entered && b.y > DANGER_Y + 30) b.entered = true;
    }
  }

  function resolveWalls() {
    for (const b of bodies) {
      if (b.merged) continue;
      if (b.x - b.r < WALL_LEFT) {
        b.x = WALL_LEFT + b.r;
        b.vx = -b.vx * RESTITUTION;
      }
      if (b.x + b.r > WALL_RIGHT) {
        b.x = WALL_RIGHT - b.r;
        b.vx = -b.vx * RESTITUTION;
      }
      if (b.y + b.r > WALL_BOTTOM) {
        b.y = WALL_BOTTOM - b.r;
        b.vy = -b.vy * RESTITUTION;
        b.vx *= 0.92;
      }
    }
  }

  function resolveCollisions() {
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      if (a.merged) continue;
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        if (b.merged) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist2 = dx * dx + dy * dy;
        const minD = a.r + b.r;
        if (dist2 >= minD * minD) continue;
        const d = Math.sqrt(dist2) || 0.0001;
        const overlap = minD - d;
        const nx = dx / d;
        const ny = dy / d;
        const totalInv = 1 / a.mass + 1 / b.mass;
        const sepA = overlap * (1 / a.mass) / totalInv;
        const sepB = overlap * (1 / b.mass) / totalInv;
        a.x -= nx * sepA;
        a.y -= ny * sepA;
        b.x += nx * sepB;
        b.y += ny * sepB;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velN = rvx * nx + rvy * ny;
        if (velN > 0) continue;
        const jImp = -(1 + RESTITUTION) * velN / totalInv;
        const ix = jImp * nx;
        const iy = jImp * ny;
        a.vx -= ix / a.mass;
        a.vy -= iy / a.mass;
        b.vx += ix / b.mass;
        b.vy += iy / b.mass;

        // Tangential friction (cosmetic spin)
        const tx = -ny, ty = nx;
        const velT = rvx * tx + rvy * ty;
        a.angVel += velT * 0.002;
        b.angVel -= velT * 0.002;
      }
    }
  }

  // ---------- Merge detection -------------------------------
  function checkMerges() {
    const newBodies = [];
    let mergedAny = false;
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      if (a.merged) continue;
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        if (b.merged) continue;
        if (a.type !== b.type) continue;
        if (a.type === MAX_TYPE) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const touchD = a.r + b.r + 0.5;
        if (d2 > touchD * touchD) continue;
        // Merge
        a.merged = true;
        b.merged = true;
        const newType = a.type + 1;
        const nb = makeBody(newType, (a.x + b.x) / 2, (a.y + b.y) / 2);
        // Carry over a touch of the colliding velocity
        nb.vx = (a.vx + b.vx) * 0.5;
        nb.vy = (a.vy + b.vy) * 0.5 - 1; // slight upward pop
        nb.entered = a.entered || b.entered;
        newBodies.push(nb);
        score += FRUITS[newType].value;
        mergedAny = true;
        break;
      }
    }
    if (mergedAny) {
      bodies = bodies.filter((b) => !b.merged).concat(newBodies);
      updateHud();
    }
  }

  // ---------- Game over check -------------------------------
  function checkGameOver() {
    let trigger = false;
    for (const b of bodies) {
      if (!b.entered) continue;
      if (b.y - b.r < DANGER_Y) { trigger = true; break; }
    }
    if (trigger) {
      aboveLineFrames++;
      if (aboveLineFrames >= GAMEOVER_FRAMES) gameOver();
    } else {
      aboveLineFrames = Math.max(0, aboveLineFrames - 2);
    }
  }

  function gameOver() {
    phase = "over";
    showOverlay("GAME OVER", "Time to stop", `Final score: ${score}`, "Play again");
  }

  // ---------- Render -----------------------------------------
  function draw() {
    // Background (container interior is the canvas itself,
    // but we draw a soft inner shadow + the drop-zone shade)
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Drop zone (lighter band at top)
    ctx.fillStyle = "rgba(255, 230, 215, 0.6)";
    ctx.fillRect(0, 0, WIDTH, DANGER_Y);

    // Danger line
    ctx.strokeStyle = "rgba(231, 111, 81, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(WALL_LEFT, DANGER_Y);
    ctx.lineTo(WALL_RIGHT, DANGER_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Container walls (inset border)
    ctx.strokeStyle = "rgba(138, 87, 64, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WALL_LEFT, DANGER_Y);
    ctx.lineTo(WALL_LEFT, WALL_BOTTOM);
    ctx.lineTo(WALL_RIGHT, WALL_BOTTOM);
    ctx.lineTo(WALL_RIGHT, DANGER_Y);
    ctx.stroke();

    // Drop preview during play
    if (phase === "playing" && dropCooldown < DROP_COOLDOWN / 2) {
      const px = clamp(dropX,
        WALL_LEFT + FRUITS[nextType].r,
        WALL_RIGHT - FRUITS[nextType].r
      );
      // Vertical guide line
      ctx.strokeStyle = "rgba(231, 111, 81, 0.25)";
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(px, DANGER_Y);
      ctx.lineTo(px, WALL_BOTTOM);
      ctx.stroke();
      ctx.setLineDash([]);
      // Ghost fruit at drop point
      drawFruit(FRUITS[nextType], px, DROP_Y, 0, 0.85);
    }

    // Fruits
    for (const b of bodies) {
      if (b.merged) continue;
      drawFruit(FRUITS[b.type], b.x, b.y, b.angle, 1);
    }
  }

  function drawFruit(f, x, y, angle, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    // Soft drop shadow circle
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.beginPath();
    ctx.arc(0, f.r * 0.15, f.r, 0, Math.PI * 2);
    ctx.fill();
    // Emoji rendered at ~2.1x radius (matches visible diameter)
    const size = f.r * 2.1;
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(f.emoji, 0, 0);
    ctx.restore();
  }

  // ---------- HUD --------------------------------------------
  function updateHud() {
    scoreEl.textContent = score;
    nextEl.textContent = FRUITS[upcomingType].emoji;
  }

  function renderLadder() {
    ladderList.innerHTML = "";
    FRUITS.forEach((f, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="lemoji">${f.emoji}</span><span class="lnum">${i + 1}</span>`;
      ladderList.appendChild(li);
    });
  }

  // ---------- Overlay ---------------------------------------
  function showOverlay(eyebrow, title, sub, btnLabel) {
    overlayEyebrow.textContent = eyebrow;
    overlayTitle.textContent = title;
    overlaySub.innerHTML = sub;
    startBtn.textContent = btnLabel;
    overlay.hidden = false;
  }
  function hideOverlay() { overlay.hidden = true; }

  // ---------- Input ------------------------------------------
  // Convert pointer event coordinates to canvas-space x.
  function pointerToWorldX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const scale = WIDTH / rect.width;
    return (clientX - rect.left) * scale;
  }

  function bindInput() {
    canvas.addEventListener("mousemove", (e) => {
      dropX = pointerToWorldX(e.clientX);
    });
    canvas.addEventListener("mousedown", (e) => {
      dropX = pointerToWorldX(e.clientX);
      attemptDrop();
    });
    canvas.addEventListener("touchmove", (e) => {
      if (e.touches.length > 0) {
        dropX = pointerToWorldX(e.touches[0].clientX);
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length > 0) {
        dropX = pointerToWorldX(e.touches[0].clientX);
      }
      e.preventDefault();
    }, { passive: false });
    dropBtn.addEventListener("click", () => attemptDrop());
    startBtn.addEventListener("click", () => {
      reset();
      phase = "playing";
      hideOverlay();
    });
    // Spacebar drops on PC
    document.addEventListener("keydown", (e) => {
      if (e.key === " " && phase === "playing") {
        e.preventDefault();
        attemptDrop();
      }
    });
  }

  // ---------- Util -------------------------------------------
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // ---------- Loop -------------------------------------------
  function loop() {
    if (phase === "playing") {
      if (dropCooldown > 0) dropCooldown--;
      physicsStep();
      checkMerges();
      checkGameOver();
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- Boot -------------------------------------------
  renderLadder();
  bindInput();
  reset();
  draw();
  requestAnimationFrame(loop);
})();
