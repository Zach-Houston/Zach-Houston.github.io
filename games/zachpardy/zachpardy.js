/* ============================================================
   Zachpardy — solo Jeopardy! game.
   Scores:
     Total  — actual game score (with wagers on DD + Final)
     Coryat — Single + Double only; DD scores face value on
              correct, NO penalty on miss; Final excluded
   ============================================================ */

(() => {
  "use strict";

  const SINGLE_VALUES = [200, 400, 600, 800, 1000];
  const DOUBLE_VALUES = [400, 800, 1200, 1600, 2000];
  const DD_SINGLE_COUNT = 1;
  const DD_DOUBLE_COUNT = 2;

  // ---------- DOM refs --------------------------------------
  const $ = (id) => document.getElementById(id);
  const els = {
    root:        $("zp-root"),
    round:       $("zp-round"),
    scoreTotal:  $("zp-score-total"),
    scoreCoryat: $("zp-score-coryat"),
    board:       $("zp-board"),
    seedChip:    $("zp-seed-chip"),
    seedChipVal: $("zp-seed-chip-value"),

    // Start
    startModal:    $("zp-start"),
    startBtn:      $("zp-start-btn"),
    seedInput:     $("zp-seed-input"),
    seedShuffleBtn:$("zp-seed-shuffle"),

    // Clue modal
    clueModal:   $("zp-clue"),
    clueCat:     $("zp-clue-cat"),
    clueValue:   $("zp-clue-value"),
    clueBody:    $("zp-clue-body"),
    clueText:    $("zp-clue-text"),
    answerForm:  $("zp-answer-form"),
    answerInput: $("zp-answer-input"),
    skipBtn:     $("zp-skip-btn"),
    ddSplash:    $("zp-dd-splash"),
    ddWager:     $("zp-dd-wager"),
    ddMax:       $("zp-dd-max"),
    ddConfirm:   $("zp-dd-confirm"),
    result:      $("zp-result"),
    resultBanner:$("zp-result-banner"),
    resultCorrect:$("zp-result-correct"),
    resultYours: $("zp-result-yours"),
    resultYoursRow: $("zp-result-yours-row"),
    resultDelta: $("zp-result-delta"),
    overrideBtn: $("zp-override-btn"),
    continueBtn: $("zp-continue-btn"),

    // Final
    finalModal:  $("zp-final"),
    finalWagerStage: $("zp-final-wager-stage"),
    finalClueStage:  $("zp-final-clue-stage"),
    finalResult: $("zp-final-result"),
    finalCat:    $("zp-final-cat"),
    finalWager:  $("zp-final-wager"),
    finalWagerMax: $("zp-final-wager-max"),
    finalWagerConfirm: $("zp-final-wager-confirm"),
    finalClueText: $("zp-final-clue-text"),
    finalAnswerForm: $("zp-final-answer-form"),
    finalAnswerInput: $("zp-final-answer-input"),
    finalResultBanner: $("zp-final-result-banner"),
    finalResultCorrect: $("zp-final-result-correct"),
    finalResultWager:   $("zp-final-result-wager"),
    finalOverride: $("zp-final-override"),
    finalContinue: $("zp-final-continue"),

    // Splash
    splash: $("zp-splash"),
    splashText: $("zp-splash-text"),

    // End
    endModal: $("zp-end"),
    endTotal: $("zp-end-total"),
    endCoryat: $("zp-end-coryat"),
    endCorrect: $("zp-end-correct"),
    endWrong: $("zp-end-wrong"),
    endSkipped: $("zp-end-skipped"),
    endRestart: $("zp-end-restart"),
  };

  // ---------- State -----------------------------------------
  const state = {
    phase: "idle",      // idle | single | double | final | end
    round: "single",    // single | double
    total: 0,
    coryat: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    board: [],          // [{ category, clues: [{value, ...}] }]
    currentClue: null,
    currentCell: null,
    finalClue: null,
    finalWagerAmt: 0,
    pendingDelta: 0,    // change to total when last clue resolved
    pendingDeltaCor: 0, // change to coryat
    seed: null,         // string seed currently in use (display)
    rng: Math.random,   // (replaced per-game)
  };

  // ---------- Seeded RNG ------------------------------------
  // mulberry32 — fast, well-distributed, deterministic.
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
  // FNV-1a hash of a string → 32-bit unsigned int.
  function seedFromString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  // Generate a short, easy-to-type random seed string.
  function randomSeedString() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
    let out = "";
    for (let i = 0; i < 6; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }
  // Normalize user input — uppercase, strip whitespace, cap length.
  function normalizeSeed(s) {
    return (s || "").toString().trim().toUpperCase().slice(0, 32);
  }

  // ---------- Utilities -------------------------------------
  function shuffle(arr, rng) {
    const rand = rng || Math.random;
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function dollars(n) {
    const sign = n < 0 ? "−" : "";
    return `${sign}$${Math.abs(n).toLocaleString()}`;
  }

  // ---------- Answer normalization + matching ---------------
  function normalize(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/^(who|what|where|when|why|how)\s+(is|are|was|were)\s+/i, "")
      .replace(/^(the|a|an)\s+/i, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      let cur = i;
      for (let j = 1; j <= n; j++) {
        const tmp = prev[j];
        prev[j] = a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], cur);
        cur = tmp;
      }
    }
    return prev[n];
  }
  function answersMatch(userRaw, correctRaw) {
    const u = normalize(userRaw);
    const c = normalize(correctRaw);
    if (!u) return false;
    if (u === c) return true;
    // Last-name shortcut: "Roosevelt" ≈ "Franklin D Roosevelt"
    const cWords = c.split(" ");
    if (cWords.length >= 2) {
      const last = cWords[cWords.length - 1];
      if (u === last) return true;
      if (last.length >= 4 && lev(u, last) <= 1) return true;
    }
    // Allow user to type more than just the canonical answer
    // (e.g. answer "Lincoln" / user "Abraham Lincoln")
    if (c.length >= 4 && u.includes(c)) return true;
    if (c.length >= 4 && cWords.length === 1 && u.split(" ").includes(c)) return true;
    // Levenshtein for typos (scale with answer length)
    const tol = c.length <= 5 ? 1 : c.length <= 10 ? 2 : 3;
    if (lev(u, c) <= tol) return true;
    return false;
  }

  // ---------- Board build ------------------------------------
  function pickCategories(round) {
    const want = round === "single" ? "single" : "double";
    const wantValues = round === "single" ? SINGLE_VALUES : DOUBLE_VALUES;

    // Group clues by category for this round, keep only categories
    // that have every value tier covered.
    const byCat = new Map();
    for (const c of window.ZP_CLUES) {
      if (c.round !== want) continue;
      if (!byCat.has(c.category)) byCat.set(c.category, new Map());
      byCat.get(c.category).set(c.value, c);
    }
    const fullCats = [];
    for (const [cat, m] of byCat.entries()) {
      if (wantValues.every((v) => m.has(v))) {
        fullCats.push({
          category: cat,
          clues: wantValues.map((v) => ({ ...m.get(v), used: false })),
        });
      }
    }
    return shuffle(fullCats, state.rng).slice(0, 6);
  }

  function renderBoard() {
    els.board.innerHTML = "";
    // Category headers
    for (const col of state.board) {
      const h = document.createElement("div");
      h.className = "zp-cat-cell";
      h.textContent = col.category;
      els.board.appendChild(h);
    }
    // 5 rows × 6 cols of clue cells (grid auto-flow)
    const valueCount = state.round === "single"
      ? SINGLE_VALUES.length
      : DOUBLE_VALUES.length;
    for (let r = 0; r < valueCount; r++) {
      for (let c = 0; c < state.board.length; c++) {
        const clue = state.board[c].clues[r];
        const cell = document.createElement("button");
        cell.className = "zp-clue-cell" + (clue.used ? " used" : "");
        cell.type = "button";
        cell.textContent = clue.used ? "" : `$${clue.value}`;
        cell.addEventListener("click", () => {
          if (clue.used) return;
          selectClue(state.board[c], clue);
        });
        els.board.appendChild(cell);
      }
    }
  }

  // Place Daily Doubles randomly in unused cells of the current round.
  function placeDailyDoubles(round) {
    const slots = [];
    for (const col of state.board) {
      for (const clue of col.clues) slots.push(clue);
    }
    const count = round === "single" ? DD_SINGLE_COUNT : DD_DOUBLE_COUNT;
    const picks = shuffle(slots, state.rng).slice(0, count);
    for (const p of picks) p.isDD = true;
  }

  // ---------- Round transitions -----------------------------
  function startSingle() {
    state.round = "single";
    state.phase = "single";
    state.board = pickCategories("single");
    placeDailyDoubles("single");
    els.round.textContent = "Round 1 — Jeopardy!";
    renderBoard();
    updateScores();
  }
  async function startDouble() {
    await showSplash("DOUBLE JEOPARDY!");
    state.round = "double";
    state.phase = "double";
    state.board = pickCategories("double");
    placeDailyDoubles("double");
    els.round.textContent = "Round 2 — Double Jeopardy!";
    renderBoard();
    updateScores();
  }
  async function startFinal() {
    await showSplash("FINAL JEOPARDY!");
    state.phase = "final";
    els.round.textContent = "Final Jeopardy";
    const pool = window.ZP_FINALS || [];
    state.finalClue = pool[Math.floor(state.rng() * pool.length)];
    els.finalCat.textContent = state.finalClue.category;
    const max = Math.max(0, state.total);
    els.finalWager.value = "0";
    els.finalWager.max = max;
    els.finalWagerMax.textContent = `$${max.toLocaleString()}`;
    els.finalWagerStage.hidden = false;
    els.finalClueStage.hidden = true;
    els.finalResult.hidden = true;
    els.finalModal.hidden = false;
  }
  function endGame() {
    state.phase = "end";
    els.round.textContent = "Final Results";
    els.endTotal.textContent = dollars(state.total);
    els.endCoryat.textContent = dollars(state.coryat);
    els.endCorrect.textContent = state.correct;
    els.endWrong.textContent = state.wrong;
    els.endSkipped.textContent = state.skipped;
    els.endModal.hidden = false;
  }

  function checkRoundComplete() {
    const allUsed = state.board.every((col) =>
      col.clues.every((c) => c.used)
    );
    if (!allUsed) return;
    if (state.round === "single") startDouble();
    else startFinal();
  }

  // ---------- Clue interaction -------------------------------
  function selectClue(column, clue) {
    state.currentClue = clue;
    state.currentCell = column;
    els.clueCat.textContent = column.category;
    els.clueValue.textContent = `$${clue.value}`;
    els.clueText.textContent = clue.question;
    els.answerInput.value = "";

    if (clue.isDD) {
      // Daily Double: wager first, no skipping
      els.ddSplash.hidden = false;
      els.clueBody.hidden = true;
      els.result.hidden = true;
      // Max = max(current score, round max value)
      const roundMax = state.round === "single" ? 1000 : 2000;
      const max = Math.max(state.total, roundMax);
      els.ddWager.min = 0;
      els.ddWager.max = max;
      els.ddWager.value = "";
      els.ddMax.textContent = `(max $${max.toLocaleString()})`;
    } else {
      els.ddSplash.hidden = true;
      els.clueBody.hidden = false;
      els.result.hidden = true;
    }
    els.clueModal.hidden = false;
    // Focus the right input
    setTimeout(() => {
      if (clue.isDD) els.ddWager.focus();
      else els.answerInput.focus();
    }, 0);
  }

  function confirmDDWager() {
    const roundMax = state.round === "single" ? 1000 : 2000;
    const max = Math.max(state.total, roundMax);
    let w = parseInt(els.ddWager.value, 10);
    if (isNaN(w) || w < 0) w = 0;
    if (w > max) w = max;
    state.currentClue.wager = w;
    els.ddSplash.hidden = true;
    els.clueBody.hidden = false;
    els.result.hidden = true;
    els.answerInput.value = "";
    setTimeout(() => els.answerInput.focus(), 0);
  }

  function submitAnswer(e) {
    if (e) e.preventDefault();
    const user = els.answerInput.value.trim();
    if (!user) return;
    grade(user, /*skipped=*/false);
  }

  function skipClue() {
    grade(/*user=*/"", /*skipped=*/true);
  }

  function grade(user, skipped) {
    const clue = state.currentClue;
    const isDD = clue.isDD;
    const value = clue.value;
    const wager = clue.wager || 0;

    let correct = false;
    if (!skipped) correct = answersMatch(user, clue.answer);

    let deltaTotal = 0;
    let deltaCoryat = 0;

    if (skipped) {
      state.skipped++;
      deltaTotal = 0;
      deltaCoryat = 0;
    } else if (correct) {
      state.correct++;
      deltaTotal = isDD ? +wager : +value;
      deltaCoryat = +value; // Coryat counts face value (DD or not)
    } else {
      state.wrong++;
      deltaTotal = isDD ? -wager : -value;
      // Coryat: DD miss carries NO penalty; regular miss subtracts face
      deltaCoryat = isDD ? 0 : -value;
    }
    state.pendingDelta = deltaTotal;
    state.pendingDeltaCor = deltaCoryat;
    state.total  += deltaTotal;
    state.coryat += deltaCoryat;

    showResult({ skipped, correct, user, clue, deltaTotal, deltaCoryat });
    updateScores();
  }

  function showResult({ skipped, correct, user, clue, deltaTotal }) {
    els.clueBody.hidden = true;
    els.result.hidden = false;
    if (skipped) {
      els.resultBanner.textContent = "SKIPPED";
      els.resultBanner.className = "zp-result-banner";
      els.resultBanner.style.color = "var(--jp-cream)";
      els.resultYoursRow.hidden = true;
      els.overrideBtn.hidden = true;
    } else if (correct) {
      els.resultBanner.textContent = "CORRECT";
      els.resultBanner.className = "zp-result-banner good";
      els.resultBanner.style.color = "";
      els.resultYoursRow.hidden = false;
      els.resultYours.textContent = user;
      els.overrideBtn.hidden = true;
    } else {
      els.resultBanner.textContent = "INCORRECT";
      els.resultBanner.className = "zp-result-banner bad";
      els.resultBanner.style.color = "";
      els.resultYoursRow.hidden = false;
      els.resultYours.textContent = user;
      els.overrideBtn.hidden = false;
    }
    els.resultCorrect.textContent = clue.answer;
    els.resultDelta.textContent = deltaTotal === 0
      ? "—"
      : dollars(deltaTotal);
  }

  // "Mark as Correct" flips a wrong call to correct.
  // Reverses the prior delta and applies the correct one.
  function overrideCorrect() {
    const clue = state.currentClue;
    const isDD = clue.isDD;
    const value = clue.value;
    const wager = clue.wager || 0;

    // Reverse the prior wrong-call deltas
    state.total  -= state.pendingDelta;
    state.coryat -= state.pendingDeltaCor;
    state.wrong--;

    // Apply correct-call deltas
    state.correct++;
    state.pendingDelta    = isDD ? +wager : +value;
    state.pendingDeltaCor = +value;
    state.total  += state.pendingDelta;
    state.coryat += state.pendingDeltaCor;

    els.resultBanner.textContent = "CORRECT (overridden)";
    els.resultBanner.className = "zp-result-banner good";
    els.resultDelta.textContent = dollars(state.pendingDelta);
    els.overrideBtn.hidden = true;
    updateScores();
  }

  function continueAfterClue() {
    state.currentClue.used = true;
    els.clueModal.hidden = true;
    state.currentClue = null;
    state.currentCell = null;
    renderBoard();
    checkRoundComplete();
  }

  // ---------- Final Jeopardy --------------------------------
  function confirmFinalWager() {
    const max = Math.max(0, state.total);
    let w = parseInt(els.finalWager.value, 10);
    if (isNaN(w) || w < 0) w = 0;
    if (w > max) w = max;
    state.finalWagerAmt = w;
    els.finalWagerStage.hidden = true;
    els.finalClueStage.hidden = false;
    els.finalClueText.textContent = state.finalClue.question;
    els.finalAnswerInput.value = "";
    setTimeout(() => els.finalAnswerInput.focus(), 0);
  }
  function submitFinalAnswer(e) {
    if (e) e.preventDefault();
    const user = els.finalAnswerInput.value.trim();
    const correct = !!user && answersMatch(user, state.finalClue.answer);
    const w = state.finalWagerAmt;
    if (correct) {
      state.correct++;
      state.total += w;
    } else {
      state.wrong++;
      state.total -= w;
    }
    // Final Jeopardy does NOT affect Coryat at all.
    els.finalClueStage.hidden = true;
    els.finalResult.hidden = false;
    els.finalResultBanner.textContent = correct ? "CORRECT" : "INCORRECT";
    els.finalResultBanner.className =
      "zp-result-banner " + (correct ? "good" : "bad");
    els.finalResultCorrect.textContent = state.finalClue.answer;
    els.finalResultWager.textContent =
      (correct ? "+" : "−") + `$${w.toLocaleString()}`;
    els.finalOverride.hidden = correct;
    // Stash so override can flip it
    els.finalOverride.dataset.flipped = "0";
    updateScores();
  }
  function finalOverrideCorrect() {
    if (els.finalOverride.dataset.flipped === "1") return;
    els.finalOverride.dataset.flipped = "1";
    // Reverse the wrong call: was −w, now +w (delta = +2w)
    const w = state.finalWagerAmt;
    state.total += 2 * w;
    state.wrong--;
    state.correct++;
    els.finalResultBanner.textContent = "CORRECT (overridden)";
    els.finalResultBanner.className = "zp-result-banner good";
    els.finalResultWager.textContent = `+$${w.toLocaleString()}`;
    els.finalOverride.hidden = true;
    updateScores();
  }

  // ---------- Scores ----------------------------------------
  function updateScores() {
    els.scoreTotal.textContent  = dollars(state.total);
    els.scoreCoryat.textContent = dollars(state.coryat);
  }

  // ---------- Round splash ----------------------------------
  // Shows the round title with a quick reveal animation. Holds
  // until BOTH the animation minimum AND any optional extra
  // promise (e.g. lazy load) have completed.
  function showSplash(text, extraPromise = null) {
    els.splashText.textContent = text;
    els.splash.hidden = false;
    // restart the animation
    els.splashText.classList.remove("anim");
    void els.splashText.offsetWidth;
    els.splashText.classList.add("anim");
    const min = new Promise((r) => setTimeout(r, 2200));
    return Promise.all([min, extraPromise || Promise.resolve()]).then(() => {
      els.splash.hidden = true;
    });
  }

  // ---------- Lazy load of the clue bank --------------------
  // clues.js is ~15MB so we only fetch it when the player commits
  // to a game. After first load it stays in memory for subsequent
  // games in the same session.
  let _cluesPromise = null;
  function loadClues() {
    if (window.ZP_CLUES && window.ZP_FINALS) return Promise.resolve();
    if (_cluesPromise) return _cluesPromise;
    _cluesPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "clues.js";
      s.onload = () => resolve();
      s.onerror = () => {
        _cluesPromise = null;
        reject(new Error("Failed to load clues.js"));
      };
      document.head.appendChild(s);
    });
    return _cluesPromise;
  }

  // ---------- Start / restart -------------------------------
  async function newGame() {
    // Lock in the seed from the input (or generate one if empty).
    let seedStr = normalizeSeed(els.seedInput.value);
    if (!seedStr) {
      seedStr = randomSeedString();
      els.seedInput.value = seedStr;
    }
    state.seed = seedStr;
    state.rng = makeRng(seedFromString(seedStr));
    els.seedChipVal.textContent = seedStr;
    els.seedChip.hidden = false;

    // Reset state up-front so the board behind the splash is fresh
    // when the splash dismisses.
    state.phase = "single";
    state.total = 0;
    state.coryat = 0;
    state.correct = 0;
    state.wrong = 0;
    state.skipped = 0;
    state.board = [];
    state.currentClue = null;
    state.finalClue = null;
    els.startModal.hidden = true;
    els.clueModal.hidden = true;
    els.finalModal.hidden = true;
    els.endModal.hidden = true;
    updateScores();

    // Show the round splash and load the clue bank in parallel.
    // The splash holds until both are done.
    try {
      await showSplash("JEOPARDY!", loadClues());
    } catch (e) {
      console.error(e);
      alert("Couldn't load the clue bank. Try refreshing.");
      els.splash.hidden = true;
      els.startModal.hidden = false;
      return;
    }
    startSingle();
  }

  // ---------- Wire events ----------------------------------
  function bind() {
    els.startBtn.addEventListener("click", newGame);
    els.endRestart.addEventListener("click", newGame);
    els.seedShuffleBtn.addEventListener("click", () => {
      els.seedInput.value = randomSeedString();
      els.seedInput.focus();
      els.seedInput.select();
    });
    els.seedInput.addEventListener("input", () => {
      els.seedInput.value = normalizeSeed(els.seedInput.value);
    });
    els.seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); newGame(); }
    });
    els.answerForm.addEventListener("submit", submitAnswer);
    els.skipBtn.addEventListener("click", skipClue);
    els.ddConfirm.addEventListener("click", confirmDDWager);
    els.continueBtn.addEventListener("click", continueAfterClue);
    els.overrideBtn.addEventListener("click", overrideCorrect);

    els.finalWagerConfirm.addEventListener("click", confirmFinalWager);
    els.finalAnswerForm.addEventListener("submit", submitFinalAnswer);
    els.finalOverride.addEventListener("click", finalOverrideCorrect);
    els.finalContinue.addEventListener("click", () => {
      els.finalModal.hidden = true;
      endGame();
    });

    // Enter / Space trigger Continue when a result panel is shown.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!els.clueModal.hidden && !els.result.hidden) {
        e.preventDefault();
        els.continueBtn.click();
      } else if (!els.finalModal.hidden && !els.finalResult.hidden) {
        e.preventDefault();
        els.finalContinue.click();
      }
    });
  }

  // ---------- Boot -----------------------------------------
  bind();
  updateScores();
  // Pre-fill the seed input: honor ?seed=XYZ from the URL, otherwise
  // generate a fresh random seed so the player can just click New Game.
  (() => {
    const params = new URLSearchParams(location.search);
    const fromUrl = normalizeSeed(params.get("seed"));
    els.seedInput.value = fromUrl || randomSeedString();
  })();
})();
