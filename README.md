# gamesite

Personal site rendered as a retro desktop. The landing page is a Windows-9x-style
desktop you can click around; icons open draggable, focusable windows containing
short bios, project notes, and a few small browser games.

No frameworks, no build step — every page is plain HTML/CSS/JS.

## Structure

```
/
├── index.html             OS shell (desktop + taskbar + window manager)
├── assets/
│   ├── css/os.css         OS chrome
│   └── js/os.js           Window manager + app registry
└── games/
    ├── wiki-racer/        WikiRacer — race between two Wikipedia pages
    ├── zachtris/          Zachtris — a Tetris clone
    └── zachpardy/         Zachpardy — solo Jeopardy with Coryat scoring
```

## Running locally

```
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Adding a window or game

1. Drop your content into `games/<slug>/index.html`.
2. Register it in `APPS` in `assets/js/os.js` (set its window size and icon).
3. Add a matching desktop icon to `#icons` or `#icons-right` in `index.html`,
   with `data-app="<slug>"`.

The OS shell handles dragging, focus, minimizing, and the taskbar entry for free.
