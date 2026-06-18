/* ============================================================
   Z // OS — window manager
   Plain JS, no dependencies. Skeleton: open / close / minimize /
   focus / drag / taskbar / start menu / clock.
   ============================================================ */

(() => {
  "use strict";

  // ---------- App registry --------------------------------------
  // Each entry maps a desktop-icon `data-app` to a window spec.
  // `content` references a <template data-content="..."> in the
  // page. `iframe` opens a URL in an embedded frame instead.
  const APPS = {
    about:    { title: "About Me",   content: "about",    w: 480, h: 480, icon: iconAbout },
    resume:   { title: "Resume",     content: "resume",   w: 640, h: 620, icon: iconDoc },
    contact:  { title: "Contact",    content: "contact",  w: 420, h: 300, icon: iconMail },
    readme:   { title: "Read Me",    content: "readme",   w: 420, h: 320, icon: iconNote },

    // ----- Games -------------------------------------------------
    // One entry per game, all iframe-mode. Add new games here and
    // add a matching button to #icons-right in index.html.
    wikiracer: { title: "WikiRacer",  iframe: "games/wiki-racer/",        w: 1000, h: 720, icon: iconWiki },
    zachtris:  { title: "Zachtris",   iframe: "games/zachtris/",          w: 720,  h: 720, icon: iconBlocks },
    zachpardy: { title: "Zachpardy",  iframe: "games/zachpardy/",         w: 1080, h: 720, icon: iconDollar },
  };

  // ---------- State ---------------------------------------------
  const windows = new Map(); // id -> { el, taskbarEl, app, spec }
  let zCounter = 100;
  let nextId = 1;
  let focused = null;

  const layer = document.getElementById("window-layer");
  const taskbarItems = document.getElementById("taskbar-items");
  const startBtn = document.getElementById("start-btn");
  const startMenu = document.getElementById("start-menu");
  const clockEl = document.getElementById("taskbar-clock");

  // ---------- Open from desktop / start menu --------------------
  function bindLaunchers() {
    document.querySelectorAll(".desktop-icon").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".desktop-icon.selected")
          .forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
        openApp(btn.dataset.app);
      });
      // Double-click also works (true desktop muscle memory).
      btn.addEventListener("dblclick", () => openApp(btn.dataset.app));
    });

    startMenu.querySelectorAll("li[data-app]").forEach((li) => {
      li.addEventListener("click", () => {
        openApp(li.dataset.app);
        closeStartMenu();
      });
    });
    const ghLi = startMenu.querySelector('li[data-action="github"]');
    if (ghLi) {
      ghLi.addEventListener("click", () => {
        window.open("https://github.com/", "_blank", "noopener");
        closeStartMenu();
      });
    }
  }

  // Avoid double-firing single+double-click. Coalesce with a tiny debounce.
  const recentlyOpened = new Set();
  function openApp(appKey) {
    const spec = APPS[appKey];
    if (!spec) return;
    if (recentlyOpened.has(appKey)) return;
    recentlyOpened.add(appKey);
    setTimeout(() => recentlyOpened.delete(appKey), 250);

    // If already open, just focus + restore.
    for (const w of windows.values()) {
      if (w.app === appKey) {
        restore(w);
        focus(w);
        return;
      }
    }
    createWindow(appKey, spec);
  }

  // ---------- Window factory ------------------------------------
  function createWindow(appKey, spec) {
    const id = `win-${nextId++}`;

    // Position: cascade from top-left, keep inside viewport.
    const offset = (windows.size % 8) * 24;
    const x = 60 + offset;
    const y = 40 + offset;

    const el = document.createElement("section");
    el.className = "window";
    el.id = id;
    el.style.width = spec.w + "px";
    el.style.height = spec.h + "px";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.zIndex = ++zCounter;

    // Title bar
    const title = document.createElement("header");
    title.className = "title-bar";
    title.innerHTML = `
      <span class="title-bar-icon">${spec.icon()}</span>
      <span class="title-bar-text"></span>
      <span class="title-bar-controls">
        <button type="button" data-act="min" title="Minimize">_</button>
        <button type="button" data-act="max" title="Maximize">▢</button>
        <button type="button" data-act="close" title="Close">✕</button>
      </span>
    `;
    title.querySelector(".title-bar-text").textContent = spec.title;
    el.appendChild(title);

    // Body
    const body = document.createElement("div");
    body.className = "window-body";
    if (spec.iframe) {
      body.classList.add("flush");
      const frame = document.createElement("iframe");
      frame.src = spec.iframe;
      frame.title = spec.title;
      body.appendChild(frame);
    } else if (spec.content) {
      const tpl = document.querySelector(`template[data-content="${spec.content}"]`);
      if (tpl) body.appendChild(tpl.content.cloneNode(true));
      else body.innerHTML = `<p><em>// No content registered for "${spec.content}".</em></p>`;
    } else if (spec.html) {
      body.innerHTML = spec.html;
    }
    el.appendChild(body);

    // Wire title-bar buttons
    title.addEventListener("mousedown", (e) => focus(rec));
    title.querySelector('[data-act="close"]').addEventListener("click", (e) => {
      e.stopPropagation();
      closeWindow(rec);
    });
    title.querySelector('[data-act="min"]').addEventListener("click", (e) => {
      e.stopPropagation();
      minimize(rec);
    });
    title.querySelector('[data-act="max"]').addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMaximize(rec);
    });

    // Click anywhere in the window focuses it
    el.addEventListener("mousedown", () => focus(rec));

    // Taskbar entry
    const tbItem = document.createElement("button");
    tbItem.type = "button";
    tbItem.className = "taskbar-item bevel-out";
    tbItem.innerHTML = `<span class="ti-icon">${spec.icon()}</span><span class="ti-label"></span>`;
    tbItem.querySelector(".ti-label").textContent = spec.title;
    tbItem.addEventListener("click", () => {
      if (focused && focused.el === el && !el.classList.contains("minimized")) {
        minimize(rec);
      } else {
        restore(rec);
        focus(rec);
      }
    });
    taskbarItems.appendChild(tbItem);

    const rec = { id, el, taskbarEl: tbItem, app: appKey, spec, maximized: false };
    windows.set(id, rec);
    layer.appendChild(el);

    enableDrag(rec, title);

    // Wire in-body launchers — buttons/links inside a window that
    // open another app via `data-launch-iframe`.
    body.querySelectorAll("[data-launch-iframe]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        const url = b.dataset.launchIframe;
        const t = b.dataset.title || "App";
        openIframe(url, t);
      });
    });

    focus(rec);
    return rec;
  }

  // Open an arbitrary URL in an OS window (used by in-body launchers)
  function openIframe(url, title) {
    const key = `iframe:${url}`;
    for (const w of windows.values()) {
      if (w.app === key) { restore(w); focus(w); return; }
    }
    const spec = {
      title, iframe: url, w: 760, h: 560, icon: iconGames,
    };
    APPS[key] = spec;
    createWindow(key, spec);
  }

  // ---------- Drag ----------------------------------------------
  function enableDrag(rec, title) {
    let startX, startY, baseX, baseY, dragging = false;
    title.addEventListener("mousedown", (e) => {
      // Ignore drags initiated on the control buttons.
      if (e.target.closest(".title-bar-controls")) return;
      if (rec.maximized) return; // don't drag while maximized
      dragging = true;
      title.classList.add("dragging");
      startX = e.clientX; startY = e.clientY;
      baseX = parseInt(rec.el.style.left, 10) || 0;
      baseY = parseInt(rec.el.style.top, 10) || 0;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const x = baseX + (e.clientX - startX);
      const y = baseY + (e.clientY - startY);
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 60;
      rec.el.style.left = Math.max(-rec.el.offsetWidth + 80, Math.min(maxX, x)) + "px";
      rec.el.style.top  = Math.max(0, Math.min(maxY, y)) + "px";
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      title.classList.remove("dragging");
    });
  }

  // ---------- Focus / minimize / close / maximize ---------------
  function focus(rec) {
    if (!rec) return;
    if (focused && focused !== rec) {
      focused.el.classList.remove("focused");
      focused.taskbarEl.classList.remove("active");
    }
    rec.el.classList.add("focused");
    rec.taskbarEl.classList.add("active");
    rec.el.style.zIndex = ++zCounter;
    focused = rec;
  }
  function minimize(rec) {
    rec.el.classList.add("minimized");
    rec.taskbarEl.classList.remove("active");
    if (focused === rec) focused = null;
  }
  function restore(rec) {
    rec.el.classList.remove("minimized");
  }
  function closeWindow(rec) {
    rec.el.remove();
    rec.taskbarEl.remove();
    windows.delete(rec.id);
    if (focused === rec) focused = null;
    // Don't keep ad-hoc iframe specs around forever
    if (rec.app.startsWith("iframe:")) delete APPS[rec.app];
  }
  function toggleMaximize(rec) {
    if (rec.maximized) {
      Object.assign(rec.el.style, rec.preMax);
      rec.maximized = false;
    } else {
      rec.preMax = {
        left: rec.el.style.left,
        top: rec.el.style.top,
        width: rec.el.style.width,
        height: rec.el.style.height,
      };
      rec.el.style.left = "0px";
      rec.el.style.top = "0px";
      rec.el.style.width = window.innerWidth + "px";
      rec.el.style.height = window.innerHeight - 30 + "px";
      rec.maximized = true;
    }
  }

  // ---------- Start menu ----------------------------------------
  function openStartMenu() {
    startMenu.hidden = false;
    startBtn.classList.add("pressed");
    startBtn.setAttribute("aria-expanded", "true");
  }
  function closeStartMenu() {
    startMenu.hidden = true;
    startBtn.classList.remove("pressed");
    startBtn.setAttribute("aria-expanded", "false");
  }
  startBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (startMenu.hidden) openStartMenu(); else closeStartMenu();
  });
  document.addEventListener("click", (e) => {
    if (!startMenu.hidden && !startMenu.contains(e.target) && e.target !== startBtn) {
      closeStartMenu();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeStartMenu();
  });

  // ---------- Clock ---------------------------------------------
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function tick() {
    const d = new Date();
    let h = d.getHours();
    const m = pad(d.getMinutes());
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    clockEl.textContent = `${h}:${m} ${ampm}`;
  }
  tick();
  setInterval(tick, 30 * 1000);

  // ---------- Apply bevel utility classes -----------------------
  // Title-bar buttons & taskbar buttons want the outset look by default.
  // We attach via CSS where possible; here we just initialize the start
  // button's bevel.
  startBtn.classList.add("bevel-out");

  // ---------- Boot ----------------------------------------------
  bindLaunchers();

  // ---------- Tiny inline icon library --------------------------
  // Each returns an SVG string sized to its container.
  function iconAbout() {
    return `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="#ece9d8" stroke="#000"/><circle cx="8" cy="7" r="2.5" fill="#fdd9a8" stroke="#000"/><path d="M3 14 Q8 9 13 14Z" fill="#4a6ea8" stroke="#000"/></svg>`;
  }
  function iconDoc() {
    return `<svg viewBox="0 0 16 16"><path d="M3 1h8l3 3v11H3z" fill="#fff" stroke="#000"/><path d="M11 1v3h3" fill="none" stroke="#000"/><path d="M5 7h6M5 9h6M5 11h4" stroke="#000"/></svg>`;
  }
  function iconFolder() {
    return `<svg viewBox="0 0 16 16"><path d="M1 4h5l2 2h7v9H1z" fill="#f5c845" stroke="#000"/><path d="M1 6h14v9H1z" fill="#ffd966" stroke="#000"/></svg>`;
  }
  function iconGames() {
    return `<svg viewBox="0 0 16 16"><rect x="1" y="5" width="14" height="8" rx="3" fill="#c0c0c0" stroke="#000"/><rect x="4" y="7.5" width="1.5" height="3" fill="#000"/><rect x="3" y="8.25" width="3.5" height="1.5" fill="#000"/><circle cx="11" cy="8" r="0.9" fill="#e33"/><circle cx="12.5" cy="10" r="0.9" fill="#3a3"/></svg>`;
  }
  function iconMail() {
    return `<svg viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" fill="#fff" stroke="#000"/><path d="M1 3 8 9 15 3" fill="none" stroke="#000"/></svg>`;
  }
  function iconNote() {
    return `<svg viewBox="0 0 16 16"><rect x="3" y="1" width="10" height="14" fill="#fff" stroke="#000"/><path d="M5 4h6M5 6h6M5 8h6M5 10h4" stroke="#000"/></svg>`;
  }
  function iconWiki() {
    return `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="#fff" stroke="#000"/><text x="8" y="12" text-anchor="middle" font-family="Times New Roman, Georgia, serif" font-size="11" font-weight="bold" fill="#000">W</text></svg>`;
  }
  function iconBlocks() {
    return `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="6.5" height="6.5" fill="#00e5ff" stroke="#000"/><rect x="8.5" y="1" width="6.5" height="6.5" fill="#ba68c8" stroke="#000"/><rect x="1" y="8.5" width="6.5" height="6.5" fill="#ef5350" stroke="#000"/><rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#66bb6a" stroke="#000"/></svg>`;
  }
  function iconDollar() {
    return `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="#060ce9" stroke="#000"/><text x="8" y="11" text-anchor="middle" font-family="Georgia, serif" font-size="10" font-weight="bold" fill="#f5d20d">$</text></svg>`;
  }
})();
