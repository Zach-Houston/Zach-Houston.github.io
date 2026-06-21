/* ============================================================
   Zachdle — Wordle clone.
   Daily word (UTC date as seed) or custom seed for shared boards.
   ============================================================ */

(() => {
  "use strict";

  const ROWS = 6;
  const COLS = 5;

  // ---------- PRNG (mulberry32 + FNV-1a) — same as the other games -
  function makeRng(seed32) {
    let s = seed32 >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedFromString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function randomSeedString() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }
  function normalizeSeed(s) {
    return (s || "").toString().trim().toUpperCase().slice(0, 32);
  }

  // ---------- Daily seed: UTC date "YYYY-MM-DD" -------------
  function todayUtcKey() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // ---------- Pick a word from a seed string ----------------
  function pickWord(seedStr) {
    const pool = window.ZD_ANSWERS || [];
    if (pool.length === 0) return "world";
    const rng = makeRng(seedFromString(seedStr));
    return pool[Math.floor(rng() * pool.length)];
  }

  // ---------- DOM refs ---------------------------------------
  const $ = (id) => document.getElementById(id);
  const els = {
    grid:        $("zd-grid"),
    keyboard:    $("zd-keyboard"),
    toast:       $("zd-toast"),
    modeLabel:   $("zd-mode-label"),
    modeValue:   $("zd-mode-value"),
    menuBtn:     $("zd-menu-btn"),
    menu:        $("zd-menu"),
    menuClose:   $("zd-menu-close"),
    playDaily:   $("zd-play-daily"),
    seedInput:   $("zd-seed-input"),
    seedShuffle: $("zd-seed-shuffle"),
    playSeed:    $("zd-play-seed"),
    endModal:    $("zd-end"),
    endEyebrow:  $("zd-end-eyebrow"),
    endTitle:    $("zd-end-title"),
    endSecret:   $("zd-end-secret"),
    endShare:    $("zd-end-share"),
    shareBtn:    $("zd-share-btn"),
    playAgain:   $("zd-play-again"),
  };

  // ---------- State ------------------------------------------
  const state = {
    secret: "",
    seedStr: "",
    seedLabel: "DAILY",   // "DAILY" or "SEED"
    seedDisplay: "",      // what to show in the chip
    guesses: [],          // array of { letters: [], colors: [] }
    currentRow: 0,
    currentCol: 0,
    phase: "idle",        // idle | playing | won | lost
    locked: false,        // during reveal animation
    keyColors: {},        // map letter (uppercase) -> 'green'|'yellow'|'gray'
  };

  // ---------- Grid + keyboard rendering ---------------------
  function buildGrid() {
    els.grid.innerHTML = "";
    state.guesses = [];
    for (let r = 0; r < ROWS; r++) {
      const row = { letters: ["","","","",""], colors: [null,null,null,null,null], el: [] };
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement("div");
        cell.className = "zd-tile";
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        els.grid.appendChild(cell);
        row.el.push(cell);
      }
      state.guesses.push(row);
    }
  }

  const KEYBOARD_LAYOUT = [
    ["Q","W","E","R","T","Y","U","I","O","P"],
    ["A","S","D","F","G","H","J","K","L"],
    ["ENTER","Z","X","C","V","B","N","M","BACK"],
  ];

  function buildKeyboard() {
    els.keyboard.innerHTML = "";
    for (const row of KEYBOARD_LAYOUT) {
      const r = document.createElement("div");
      r.className = "zd-kb-row";
      for (const key of row) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "zd-key";
        if (key === "ENTER" || key === "BACK") b.classList.add("wide");
        b.dataset.key = key;
        b.textContent = key === "BACK" ? "⌫" : key;
        b.addEventListener("click", () => handleKey(key));
        r.appendChild(b);
      }
      els.keyboard.appendChild(r);
    }
  }

  function refreshKeyboard() {
    for (const btn of els.keyboard.querySelectorAll(".zd-key")) {
      const k = btn.dataset.key;
      if (k === "ENTER" || k === "BACK") continue;
      btn.classList.remove("green", "yellow", "gray");
      const col = state.keyColors[k];
      if (col) btn.classList.add(col);
    }
  }

  // ---------- Input handling --------------------------------
  function handleKey(key) {
    if (state.phase !== "playing" || state.locked) return;
    if (key === "ENTER") return submitRow();
    if (key === "BACK") return deleteLetter();
    if (/^[A-Z]$/.test(key)) return typeLetter(key);
  }

  function typeLetter(letter) {
    if (state.currentCol >= COLS) return;
    const row = state.guesses[state.currentRow];
    row.letters[state.currentCol] = letter;
    const tile = row.el[state.currentCol];
    tile.textContent = letter;
    tile.classList.add("filled");
    state.currentCol++;
  }

  function deleteLetter() {
    if (state.currentCol <= 0) return;
    state.currentCol--;
    const row = state.guesses[state.currentRow];
    row.letters[state.currentCol] = "";
    const tile = row.el[state.currentCol];
    tile.textContent = "";
    tile.classList.remove("filled");
  }

  function submitRow() {
    if (state.currentCol !== COLS) {
      toast("Not enough letters");
      shakeCurrentRow();
      return;
    }
    const row = state.guesses[state.currentRow];
    const guess = row.letters.join("").toLowerCase();
    const allowed = window.ZD_ALLOWED;
    if (allowed && !allowed.has(guess)) {
      toast("Not in word list");
      shakeCurrentRow();
      return;
    }
    // Score
    const colors = scoreGuess(guess, state.secret);
    row.colors = colors;
    revealRow(row, colors).then(() => {
      // Update keyboard
      for (let i = 0; i < COLS; i++) {
        const letter = guess[i].toUpperCase();
        const c = colors[i];
        const prev = state.keyColors[letter];
        if (c === "green" || (c === "yellow" && prev !== "green") ||
            (c === "gray" && !prev)) {
          state.keyColors[letter] = c;
        }
      }
      refreshKeyboard();
      // Win / lose
      if (guess === state.secret) return finishGame(true);
      state.currentRow++;
      state.currentCol = 0;
      if (state.currentRow >= ROWS) return finishGame(false);
    });
  }

  // ---------- Scoring ---------------------------------------
  // Classic Wordle two-pass: greens first, then yellows from
  // remaining (un-consumed) letters in the secret.
  function scoreGuess(guess, secret) {
    const result = new Array(COLS).fill("gray");
    const remaining = secret.split("");
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === secret[i]) {
        result[i] = "green";
        remaining[i] = null;
      }
    }
    for (let i = 0; i < COLS; i++) {
      if (result[i] === "green") continue;
      const idx = remaining.indexOf(guess[i]);
      if (idx !== -1) {
        result[i] = "yellow";
        remaining[idx] = null;
      }
    }
    return result;
  }

  // ---------- Reveal animation ------------------------------
  function revealRow(row, colors) {
    return new Promise((resolve) => {
      state.locked = true;
      const rowIndex = state.guesses.indexOf(row);
      // mark all tiles in row for animation
      for (const tile of row.el) tile.classList.add("zd-row-revealing-tile");
      // stagger color application
      for (let i = 0; i < COLS; i++) {
        setTimeout(() => {
          const tile = row.el[i];
          tile.classList.add(colors[i]);
          tile.classList.remove("filled");
        }, i * 250 + 250);
      }
      setTimeout(() => {
        state.locked = false;
        resolve();
      }, COLS * 250 + 100);
    });
  }

  function shakeCurrentRow() {
    const row = state.guesses[state.currentRow];
    const tiles = row.el;
    tiles.forEach((t) => t.classList.add("zd-row-shake-tile"));
    // simple manual shake using transform animation
    tiles.forEach((t) => {
      t.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(6px)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(4px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 380, easing: "ease" }
      );
    });
  }

  // ---------- Toast -----------------------------------------
  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1400);
  }

  // ---------- End game --------------------------------------
  function finishGame(won) {
    state.phase = won ? "won" : "lost";
    const shareText = buildShareText();
    els.endEyebrow.textContent = won ? "YOU WON" : "GAME OVER";
    els.endEyebrow.classList.toggle("lose", !won);
    els.endTitle.textContent = won
      ? winTitle(state.currentRow + 1)
      : "Better luck next time";
    els.endSecret.textContent = state.secret.toUpperCase();
    els.endShare.textContent = shareText;
    state._lastShare = shareText;
    // Small delay so the reveal animation finishes before the modal
    setTimeout(() => { els.endModal.hidden = false; }, 600);
  }
  function winTitle(rowsUsed) {
    if (rowsUsed === 1) return "Magnificent!";
    if (rowsUsed === 2) return "Impressive!";
    if (rowsUsed === 3) return "Great!";
    if (rowsUsed === 4) return "Nice!";
    if (rowsUsed === 5) return "Got it!";
    return "Phew!";
  }
  function buildShareText() {
    // On a win, currentRow points at the winning row. On a loss,
    // currentRow has already incremented past the last guess to ROWS,
    // so cap the loop at the array length to avoid an out-of-bounds
    // access that would silently abort finishGame().
    const usedGuesses = state.phase === "won"
      ? state.currentRow + 1
      : state.guesses.filter((g) => g.colors[0] !== null).length;
    const used = state.phase === "won" ? usedGuesses : "X";
    const lines = [`Zachdle ${state.seedDisplay} ${used}/6`];
    for (let r = 0; r < state.guesses.length; r++) {
      const row = state.guesses[r];
      if (!row || row.colors[0] === null) break;
      const emoji = row.colors
        .map((c) =>
          c === "green" ? "🟩" : c === "yellow" ? "🟨" : "⬛"
        )
        .join("");
      lines.push(emoji);
    }
    return lines.join("\n");
  }
  function copyShare() {
    const text = state._lastShare || "";
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast("Copied"))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Copied"); }
    catch { toast("Copy failed"); }
    document.body.removeChild(ta);
  }

  // ---------- Reset / start game ----------------------------
  function startGame(opts) {
    // opts: { mode: 'daily'|'seed', seedStr?: string }
    state.guesses = [];
    state.currentRow = 0;
    state.currentCol = 0;
    state.keyColors = {};
    state.phase = "playing";
    state.locked = false;
    state.seedLabel = opts.mode === "seed" ? "SEED" : "DAILY";

    let seedStr;
    let display;
    if (opts.mode === "seed") {
      seedStr = normalizeSeed(opts.seedStr) || randomSeedString();
      display = seedStr;
    } else {
      seedStr = "daily:" + todayUtcKey();
      display = todayUtcKey();
    }
    state.seedStr = seedStr;
    state.seedDisplay = display;
    state.secret = pickWord(seedStr);

    els.modeLabel.textContent = state.seedLabel;
    els.modeValue.textContent = display;

    buildGrid();
    refreshKeyboard();
    els.endModal.hidden = true;
    els.menu.hidden = true;
  }

  // ---------- Wire events ----------------------------------
  function bind() {
    els.menuBtn.addEventListener("click", () => { els.menu.hidden = false; });
    els.menuClose.addEventListener("click", () => { els.menu.hidden = true; });
    els.playDaily.addEventListener("click", () => startGame({ mode: "daily" }));
    els.playSeed.addEventListener("click", () => {
      startGame({ mode: "seed", seedStr: els.seedInput.value });
    });
    els.seedShuffle.addEventListener("click", () => {
      els.seedInput.value = randomSeedString();
      els.seedInput.focus();
      els.seedInput.select();
    });
    els.seedInput.addEventListener("input", () => {
      els.seedInput.value = normalizeSeed(els.seedInput.value);
    });
    els.seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        startGame({ mode: "seed", seedStr: els.seedInput.value });
      }
    });
    els.shareBtn.addEventListener("click", copyShare);
    els.playAgain.addEventListener("click", () => { els.menu.hidden = false; });

    // Physical keyboard
    document.addEventListener("keydown", (e) => {
      // Don't intercept while the seed input is focused
      if (document.activeElement === els.seedInput) return;
      if (els.menu.hidden === false || els.endModal.hidden === false) return;
      if (e.key === "Enter") { e.preventDefault(); handleKey("ENTER"); return; }
      if (e.key === "Backspace") { e.preventDefault(); handleKey("BACK"); return; }
      const m = e.key.match(/^[a-zA-Z]$/);
      if (m) handleKey(e.key.toUpperCase());
    });
  }

  // ---------- Boot -----------------------------------------
  function boot() {
    buildGrid();
    buildKeyboard();
    bind();
    // Pre-fill seed input if URL has ?seed=XYZ
    const params = new URLSearchParams(location.search);
    const fromUrl = normalizeSeed(params.get("seed"));
    els.seedInput.value = fromUrl || randomSeedString();
    // If URL has ?seed= go straight into that game; otherwise play daily.
    if (fromUrl) startGame({ mode: "seed", seedStr: fromUrl });
    else startGame({ mode: "daily" });
  }
  boot();
})();
