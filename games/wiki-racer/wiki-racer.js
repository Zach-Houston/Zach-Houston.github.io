/* ============================================================
   WikiRacer — game logic.
   - Two random Wikipedia pages (start & target) via REST API.
   - User navigates by clicking links inside the rendered article.
   - History, timer, win detection, confetti.
   ============================================================ */

(() => {
  "use strict";

  const WIKI_API = "https://en.wikipedia.org/api/rest_v1";
  const PAGEVIEWS_API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access";
  const POPULAR_CACHE_KEY = "wr-popular-v1";
  const POPULAR_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  // ---------- State ------------------------------------------
  const state = {
    phase: "idle", // idle | revealing | playing | won
    startTitle: null,
    targetTitle: null,
    currentTitle: null,
    history: [],
    startTime: null,
    timerInterval: null,
    seed: null,           // string seed in use for this race
    rng: Math.random,     // replaced per-race
  };

  // ---------- Seeded RNG -------------------------------------
  // mulberry32: fast, well-distributed, deterministic from a 32-bit seed.
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
  // FNV-1a hash → 32-bit unsigned int.
  function seedFromString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  // Short, easy-to-type seed string (no ambiguous chars).
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

  // ---------- DOM refs ---------------------------------------
  const $ = (id) => document.getElementById(id);
  const els = {
    body: document.body,
    panel: $("wr-panel"),
    panelMin: $("wr-panel-min"),
    resizeHandle: $("wr-resize-handle"),
    restoreBtn: $("wr-restore"),
    sectionIdle: document.querySelector('[data-phase="idle"]'),
    sectionPlay: document.querySelector('[data-phase="playing"]'),
    welcome: $("wr-welcome"),
    reveal: $("wr-reveal"),
    revealStart: $("wr-reveal-start"),
    revealTarget: $("wr-reveal-target"),
    articleWrap: $("wr-article-wrap"),
    article: $("wr-article"),
    loading: $("wr-loading"),
    startBtn: $("wr-start"),
    newRaceBtn: $("wr-new-race"),
    darkToggle: $("wr-dark-toggle"),
    darkTogglePlay: $("wr-dark-toggle-play"),
    seedInput: $("wr-seed-input"),
    seedShuffle: $("wr-seed-shuffle"),
    seedChip: $("wr-seed-chip"),
    targetTitle: $("wr-target-title"),
    targetImage: $("wr-target-image"),
    timer: $("wr-timer"),
    hops: $("wr-hops"),
    history: $("wr-history"),
    win: $("wr-win"),
    winHops: $("wr-win-hops"),
    winTime: $("wr-win-time"),
    winHeadline: $("wr-win-headline"),
    playAgain: $("wr-play-again"),
    confetti: $("wr-confetti"),
  };

  // ---------- Theme ------------------------------------------
  function setTheme(theme) {
    document.body.classList.toggle("theme-dark", theme === "dark");
    document.body.classList.toggle("theme-light", theme !== "dark");
    els.darkToggle.checked = theme === "dark";
    els.darkTogglePlay.checked = theme === "dark";
    try { localStorage.setItem("wr-theme", theme); } catch {}
  }
  function initTheme() {
    let t = "light";
    try { t = localStorage.getItem("wr-theme") || "light"; } catch {}
    setTheme(t);
  }

  // ---------- Phase ------------------------------------------
  function setPhase(phase) {
    state.phase = phase;
    document.body.classList.remove(
      "phase-idle", "phase-revealing", "phase-playing", "phase-won"
    );
    document.body.classList.add("phase-" + phase);

    els.sectionIdle.hidden = phase !== "idle";
    els.sectionPlay.hidden = !(phase === "playing" || phase === "won");

    els.welcome.hidden = phase !== "idle";
    els.reveal.hidden = phase !== "revealing";
    els.articleWrap.hidden = !(phase === "playing" || phase === "won");
  }

  // ---------- Panel minimize / restore ----------------------
  function minimizePanel() {
    document.body.classList.add("panel-minimized");
    els.restoreBtn.hidden = false;
  }
  function restorePanel() {
    document.body.classList.remove("panel-minimized");
    els.restoreBtn.hidden = true;
  }

  // ---------- Panel resize (drag the right edge) ------------
  const PANEL_MIN = 220;
  function bindResize() {
    let startX = 0;
    let startW = 0;
    let dragging = false;
    const maxW = () => Math.floor(window.innerWidth * 0.6);

    els.resizeHandle.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startW = els.panel.offsetWidth;
      els.resizeHandle.classList.add("dragging");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const w = Math.max(
        PANEL_MIN,
        Math.min(maxW(), startW + (e.clientX - startX))
      );
      els.panel.style.width = w + "px";
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      els.resizeHandle.classList.remove("dragging");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try { localStorage.setItem("wr-panel-w", els.panel.style.width); } catch {}
    });
  }
  function initPanelWidth() {
    try {
      const w = localStorage.getItem("wr-panel-w");
      if (w && /^\d+px$/.test(w)) {
        const n = parseInt(w, 10);
        if (n >= PANEL_MIN && n <= window.innerWidth * 0.6) {
          els.panel.style.width = w;
        }
      }
    } catch {}
  }

  // ---------- Title normalization ---------------------------
  function normTitle(t) {
    if (!t) return "";
    return decodeURIComponent(String(t))
      .replace(/_/g, " ")
      .trim()
      .toLowerCase();
  }

  // ---------- Wikipedia API ---------------------------------
  // Strategy: bias toward well-known articles by sampling from
  // Wikipedia's Pageviews API — top 1000 most-viewed articles for
  // the previous full month. Cached for 24h in localStorage.
  // Falls back to truly-random if Pageviews is unreachable.

  async function fetchSummary(title) {
    const url = `${WIKI_API}/page/summary/${encodeURIComponent(
      title.replace(/ /g, "_")
    )}`;
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) throw new Error("summary fetch failed: " + r.status);
    return await r.json();
  }

  async function randomTrue() {
    const r = await fetch(`${WIKI_API}/page/random/summary`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error("random fetch failed: " + r.status);
    return await r.json();
  }

  // Build the URL for a "previous full month" pageviews query.
  function previousMonthUrl(offset = 1) {
    const d = new Date();
    d.setDate(1);                 // avoid month-end overflow
    d.setMonth(d.getMonth() - offset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${PAGEVIEWS_API}/${year}/${month}/all-days`;
  }

  function looksLikeArticle(title) {
    if (!title) return false;
    if (title === "Main_Page") return false;
    if (title.includes(":")) return false;          // Special: / Wikipedia: / File: / etc.
    if (title.startsWith("Deaths_")) return false;  // "Deaths_in_2024"
    if (title.startsWith("List_of_")) return false; // list articles
    if (title === "-") return false;
    return true;
  }

  let popularTitles = null;
  let popularTitlesPromise = null;

  async function fetchPopularTitlesFresh() {
    // Aggregate the top-1000 lists from the last 3 full months and
    // keep titles that appear in at least 2 of them. This filters
    // out one-month news flashes (recent movies, current events,
    // niche-political), leaving evergreen-popular topics.
    const counts = new Map();
    let succeeded = 0;
    for (let offset = 1; offset <= 5 && succeeded < 3; offset++) {
      try {
        const r = await fetch(previousMonthUrl(offset));
        if (!r.ok) continue;
        const data = await r.json();
        const articles =
          (data.items && data.items[0] && data.items[0].articles) || [];
        for (const a of articles) {
          if (!looksLikeArticle(a.article)) continue;
          counts.set(a.article, (counts.get(a.article) || 0) + 1);
        }
        succeeded++;
      } catch {
        /* try next offset */
      }
    }
    if (succeeded === 0) throw new Error("no popular titles found");

    const threshold = Math.min(2, succeeded);
    const filtered = [...counts.entries()]
      .filter(([, c]) => c >= threshold)
      .map(([t]) => t);
    // If the threshold left too few, fall back to the union.
    if (filtered.length < 100) return [...counts.keys()];
    return filtered;
  }

  async function loadPopularTitles() {
    // Cached?
    try {
      const raw = localStorage.getItem(POPULAR_CACHE_KEY);
      if (raw) {
        const { titles, ts } = JSON.parse(raw);
        if (Array.isArray(titles) && titles.length > 50 &&
            Date.now() - ts < POPULAR_TTL_MS) {
          popularTitles = titles;
          return titles;
        }
      }
    } catch {}

    const titles = await fetchPopularTitlesFresh();
    popularTitles = titles;
    try {
      localStorage.setItem(
        POPULAR_CACHE_KEY,
        JSON.stringify({ titles, ts: Date.now() })
      );
    } catch {}
    return titles;
  }

  async function randomSummary(seen = new Set()) {
    // Lazy-load (and cache) the popular-titles pool on first use.
    let pool = popularTitles;
    if (!pool) {
      if (!popularTitlesPromise) {
        popularTitlesPromise = loadPopularTitles().catch((err) => {
          console.warn("Popular titles unavailable, falling back to random:", err);
          return null;
        });
      }
      pool = await popularTitlesPromise;
    }
    if (!pool || pool.length === 0) return await randomTrue();

    // Try a few picks to dodge dupes and 404s. Uses the seeded RNG
    // so the same seed yields the same start/target across players.
    for (let i = 0; i < 8; i++) {
      const pick = pool[Math.floor(state.rng() * pool.length)];
      const key = pick.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        return await fetchSummary(pick);
      } catch {
        // 404 / network — try another pick
      }
    }
    return await randomTrue();
  }

  async function fetchPageHtml(title) {
    const url = `${WIKI_API}/page/html/${encodeURIComponent(
      title.replace(/ /g, "_")
    )}`;
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) throw new Error(`page fetch failed (${r.status}) for ${title}`);
    return await r.text();
  }

  // ---------- Article rendering -----------------------------
  function injectArticle(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.body;

    // Normalize protocol-relative image URLs.
    body.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (src && src.startsWith("//")) img.setAttribute("src", "https:" + src);
      const srcset = img.getAttribute("srcset");
      if (srcset && srcset.includes("//upload.")) {
        img.setAttribute(
          "srcset",
          srcset.replace(/(^|, )\/\//g, "$1https://")
        );
      }
    });

    // Flag external / blocked links visually; keep them clickable for
    // the interceptor (which prevents default).
    body.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const rel = a.getAttribute("rel") || "";
      const isExternal =
        rel.includes("mw:ExtLink") ||
        /^(https?:|mailto:|tel:|\/\/)/i.test(href);
      const isSpecial = /^\.?\/?(?:wiki\/)?(Special|File|Category|Template|Help|Portal|Wikipedia|Talk):/i.test(href);
      if (isExternal) a.classList.add("external");
      if (isSpecial) a.classList.add("blocked");
    });

    els.article.innerHTML = "";
    while (body.firstChild) els.article.appendChild(body.firstChild);
    els.articleWrap.scrollTop = 0;
  }

  // ---------- Link interception -----------------------------
  function bindArticleClicks() {
    els.article.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute("href") || "";

      // Same-page anchor — scroll to it.
      if (href.startsWith("#")) {
        try {
          const el = els.article.querySelector(
            `[id="${CSS.escape(href.slice(1))}"]`
          );
          if (el) el.scrollIntoView({ behavior: "smooth" });
        } catch {}
        return;
      }

      // External / disallowed — block.
      if (
        a.classList.contains("external") ||
        a.classList.contains("blocked")
      ) {
        return;
      }

      // Internal wiki link, e.g. `./United_States` or `./United_States#History`
      const m = href.match(/^\.?\/?(?:wiki\/)?([^#?]+)(?:#.*)?$/);
      if (!m) return;
      const title = decodeURIComponent(m[1]).replace(/_/g, " ");
      if (!title) return;
      navigateTo(title);
    });
  }

  // ---------- Navigation -------------------------------------
  async function navigateTo(title) {
    if (state.phase === "won") return;
    els.loading.hidden = false;
    try {
      const html = await fetchPageHtml(title);
      // Resolved title: REST API follows redirects; trust requested title
      // for now (skeleton). For exact normalization, we'd parse <title>.
      const doc = new DOMParser().parseFromString(html, "text/html");
      const resolved =
        (doc.querySelector("title") || {}).textContent ||
        title;
      const resolvedClean = resolved.replace(/ - Wikipedia$/, "").trim() || title;

      state.currentTitle = resolvedClean;
      state.history.push(resolvedClean);
      renderHistory();
      injectArticle(html);
      checkWin();
    } catch (err) {
      console.error(err);
      alert(`Couldn't load "${title}". Try a different link.`);
    } finally {
      els.loading.hidden = true;
    }
  }

  // ---------- History rendering ------------------------------
  function renderHistory() {
    els.history.innerHTML = "";
    state.history.forEach((title, i) => {
      const li = document.createElement("li");
      li.textContent = title;
      if (i === state.history.length - 1) li.classList.add("current");
      els.history.appendChild(li);
    });
    els.hops.textContent = Math.max(0, state.history.length - 1);
    // Auto-scroll history to bottom
    els.history.scrollTop = els.history.scrollHeight;
  }

  // ---------- Timer ------------------------------------------
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }
  function startTimer() {
    state.startTime = Date.now();
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(updateTimer, 250);
    updateTimer();
  }
  function stopTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  function updateTimer() {
    if (!state.startTime) return;
    els.timer.textContent = fmtTime(Date.now() - state.startTime);
  }

  // ---------- Win --------------------------------------------
  function checkWin() {
    if (
      normTitle(state.currentTitle) === normTitle(state.targetTitle) &&
      state.phase === "playing"
    ) {
      win();
    }
  }
  function win() {
    setPhase("won");
    stopTimer();
    const ms = Date.now() - state.startTime;
    const hops = Math.max(0, state.history.length - 1);
    els.winHops.textContent = hops;
    els.winTime.textContent = fmtTime(ms);
    els.winHeadline.textContent = `Reached "${state.targetTitle}"`;
    els.win.hidden = false;
    fireConfetti();
  }

  // ---------- Confetti ---------------------------------------
  function fireConfetti(durationMs = 3800) {
    const canvas = els.confetti;
    const ctx = canvas.getContext("2d");
    canvas.hidden = false;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const colors = [
      "#ff5252", "#ffd740", "#69f0ae", "#40c4ff",
      "#b388ff", "#ff8a65", "#f06292",
    ];
    const parts = [];
    for (let i = 0; i < 180; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        size: 5 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.4,
      });
    }

    const start = performance.now();
    function frame(t) {
      const elapsed = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06; // gravity
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (elapsed < durationMs) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.hidden = true;
      }
    }
    requestAnimationFrame(frame);
  }

  // ---------- Start race -------------------------------------
  async function startRace() {
    els.startBtn.disabled = true;
    els.startBtn.textContent = "Loading…";
    try {
      // Lock in the seed for this race so the start/target pair is
      // deterministic from it. If the input is blank, mint a fresh one.
      let seedStr = normalizeSeed(els.seedInput.value);
      if (!seedStr) {
        seedStr = randomSeedString();
        els.seedInput.value = seedStr;
      }
      state.seed = seedStr;
      state.rng = makeRng(seedFromString(seedStr));
      els.seedChip.textContent = seedStr;

      const seen = new Set();
      const a = await randomSummary(seen);
      const b = await randomSummary(seen);
      state.startTitle = a.title;
      state.targetTitle = b.title;

      els.revealStart.textContent = state.startTitle;
      els.revealTarget.textContent = state.targetTitle;
      els.targetTitle.textContent = state.targetTitle;

      // Target image (if the page has one)
      const thumb = (b.thumbnail && b.thumbnail.source) || null;
      if (thumb) {
        els.targetImage.src = thumb;
        els.targetImage.alt = b.title;
        els.targetImage.hidden = false;
      } else {
        els.targetImage.hidden = true;
        els.targetImage.removeAttribute("src");
      }

      // Fade welcome out first, THEN switch to the reveal phase
      // so the cards animation doesn't overlap the title screen.
      els.welcome.classList.add("fading-out");
      await new Promise((r) => setTimeout(r, 360));

      setPhase("revealing");
      els.welcome.classList.remove("fading-out");

      // Reveal animation runs ~1.7s; wait a beat longer for drama.
      await new Promise((r) => setTimeout(r, 2200));

      // Prep playing state
      state.history = [state.startTitle];
      state.currentTitle = state.startTitle;
      renderHistory();

      els.loading.hidden = false;
      const html = await fetchPageHtml(state.startTitle);
      setPhase("playing");
      injectArticle(html);
      els.loading.hidden = true;
      startTimer();
    } catch (err) {
      console.error(err);
      alert("Failed to start the race. Check your connection and try again.");
      setPhase("idle");
    } finally {
      els.startBtn.disabled = false;
      els.startBtn.textContent = "Start race";
    }
  }

  // ---------- New race ---------------------------------------
  function newRace() {
    stopTimer();
    state.history = [];
    state.currentTitle = null;
    state.startTitle = null;
    state.targetTitle = null;
    state.startTime = null;
    els.win.hidden = true;
    els.article.innerHTML = "";
    els.history.innerHTML = "";
    els.timer.textContent = "00:00";
    els.hops.textContent = "0";
    els.targetImage.hidden = true;
    els.targetImage.removeAttribute("src");
    setPhase("idle");
  }

  // ---------- Boot -------------------------------------------
  function boot() {
    initTheme();
    initPanelWidth();
    bindArticleClicks();
    bindResize();

    els.panelMin.addEventListener("click", minimizePanel);
    els.restoreBtn.addEventListener("click", restorePanel);
    els.darkToggle.addEventListener("change", () =>
      setTheme(els.darkToggle.checked ? "dark" : "light")
    );
    els.darkTogglePlay.addEventListener("change", () =>
      setTheme(els.darkTogglePlay.checked ? "dark" : "light")
    );
    els.startBtn.addEventListener("click", startRace);
    els.newRaceBtn.addEventListener("click", newRace);
    els.playAgain.addEventListener("click", newRace);

    // Seed input controls
    els.seedShuffle.addEventListener("click", () => {
      els.seedInput.value = randomSeedString();
      els.seedInput.focus();
      els.seedInput.select();
    });
    els.seedInput.addEventListener("input", () => {
      els.seedInput.value = normalizeSeed(els.seedInput.value);
    });
    els.seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); startRace(); }
    });

    // Pre-fill seed: honor ?seed=XYZ from the URL, else mint a fresh one.
    const params = new URLSearchParams(location.search);
    els.seedInput.value =
      normalizeSeed(params.get("seed")) || randomSeedString();

    setPhase("idle");
  }

  boot();
})();
