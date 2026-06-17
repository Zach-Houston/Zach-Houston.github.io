#!/usr/bin/env node
/* ============================================================
   Convert the J! Archive CSV dump into Zachpardy's clues.js
   format. Only (category, round) groups with a full 5-tier
   board column are kept.

   Usage:  node convert.js
   Reads:  ./JEOPARDY_CSV.csv
   Writes: ../clues.js
   ============================================================ */

const fs = require("fs");
const path = require("path");

const IN  = path.join(__dirname, "JEOPARDY_CSV.csv");
const OUT = path.join(__dirname, "..", "clues.js");

const ROUND_MAP = { "Jeopardy!": "single", "Double Jeopardy!": "double" };
const SINGLE = [200, 400, 600, 800, 1000];
const DOUBLE = [400, 800, 1200, 1600, 2000];
const SINGLE_SET = new Set(SINGLE);
const DOUBLE_SET = new Set(DOUBLE);

// ---------- Clue cleanup ----------------------------------
// Many clues have an embedded media link or "Clue Crew" intro that
// referenced a photo/video on the show. The media is gone in our
// text-only version, so we strip it. Clues that *depend* on the
// visual (e.g. "name this painting") get dropped entirely.

const MEDIA_INTRO_RE = new RegExp(
  String.raw`^\s*\([^)]*(clue crew|reports?|reporting|shown|pictured|picture|photo|photograph|image|audio|video|on your screen|you see|look at|sketch|drawing|animation|depicted|recording)[^)]*\)\s*[,:\-]?\s*`,
  "i"
);
// Phrases that mean the clue is unanswerable without the missing media.
const REQUIRES_MEDIA_RE = new RegExp(
  String.raw`\bthis (image|picture|photo|photograph|painting|drawing|sketch|map|animation|chart|graph|video|clip|song|tune|melody|recording|audio|sound)\b|\bsung (above|here|shown)\b|\bshown (above|here|in the)\b|\bpictured (above|here)\b|\bseen (above|here)\b`,
  "i"
);

function cleanQuestion(raw) {
  if (!raw) return null;
  // Strip HTML tags. The dataset is trusted, but we don't want stray
  // markup leaking into the UI either way.
  let s = raw.replace(/<[^>]*>/g, "");
  // Decode the most common HTML entities.
  s = s.replace(/&amp;/g, "&")
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'")
       .replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">")
       .replace(/&nbsp;/g, " ");
  // Drop a leading "(Clue Crew / reporter / pictured / etc.)" preamble.
  s = s.replace(MEDIA_INTRO_RE, "");
  // The dataset also wraps every question in single quotes — strip them.
  s = s.replace(/^'(.*)'$/s, "$1");
  s = s.trim();
  if (s.length < 10) return null;
  // If the remaining text *still* references the missing media, drop.
  if (REQUIRES_MEDIA_RE.test(s)) return null;
  return s;
}

// ---------- Minimal RFC-ish CSV parser --------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cell += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") { /* skip */ }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

console.log("Reading CSV…");
const t0 = Date.now();
const csv = fs.readFileSync(IN, "utf8");
const rows = parseCSV(csv);
console.log(`Parsed ${rows.length} rows in ${Date.now() - t0}ms`);

// Header: Show Number, Air Date, Round, Category, Value, Question, Answer
const header = rows.shift();
console.log("Header:", header.map((h) => h.trim()).join(" | "));

const clues = [];
const finals = [];
let dropped = {
  malformed: 0, badRound: 0, badValue: 0, missingFields: 0,
  mediaCleaned: 0, mediaDropped: 0,
};

for (const row of rows) {
  if (row.length < 7) { dropped.malformed++; continue; }
  const [, , roundRaw, category, valueRaw, question, answer] = row.map((c) =>
    typeof c === "string" ? c.trim() : c
  );
  if (!category || !question || !answer) { dropped.missingFields++; continue; }

  const cleaned = cleanQuestion(question);
  if (!cleaned) { dropped.mediaDropped++; continue; }
  if (cleaned !== question) dropped.mediaCleaned++;

  if (roundRaw === "Final Jeopardy!") {
    finals.push({ category, question: cleaned, answer });
    continue;
  }
  const round = ROUND_MAP[roundRaw];
  if (!round) { dropped.badRound++; continue; }

  const v = parseInt(valueRaw.replace(/[$,]/g, ""), 10);
  if (!v || isNaN(v)) { dropped.badValue++; continue; }
  if (round === "single" && !SINGLE_SET.has(v)) { dropped.badValue++; continue; }
  if (round === "double" && !DOUBLE_SET.has(v)) { dropped.badValue++; continue; }

  clues.push({ category, round, value: v, question: cleaned, answer });
}

console.log(
  `Pre-filter: ${clues.length} clues, ${finals.length} finals — ` +
  `dropped: ${JSON.stringify(dropped)}`
);

// ---------- Enforce full 5-tier coverage per (cat, round) -
const groups = new Map();
for (const c of clues) {
  const key = c.category + "\t" + c.round;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(c);
}

const kept = [];
let fullGroups = 0;
for (const items of groups.values()) {
  const round = items[0].round;
  const required = round === "single" ? SINGLE : DOUBLE;
  const byValue = new Map();
  for (const it of items) {
    if (!byValue.has(it.value)) byValue.set(it.value, it);
  }
  const hasAll = required.every((v) => byValue.has(v));
  if (!hasAll) continue;
  fullGroups++;
  for (const v of required) kept.push(byValue.get(v));
}

console.log(
  `Full-coverage (cat, round) groups: ${fullGroups} — kept ${kept.length} clues`
);

// ---------- Write clues.js -------------------------------
const header_comment =
  `/* Auto-generated by source/convert.js from JEOPARDY_CSV.csv.\n` +
  `   ${kept.length} clues across ${fullGroups} full-coverage columns,\n` +
  `   ${finals.length} Final Jeopardy clues.\n` +
  `   Re-run the script to regenerate after replacing the source CSV. */\n`;

const out =
  header_comment +
  "window.ZP_CLUES = " + JSON.stringify(kept) + ";\n" +
  "window.ZP_FINALS = " + JSON.stringify(finals) + ";\n";

fs.writeFileSync(OUT, out);
const sizeMB = (Buffer.byteLength(out) / (1024 * 1024)).toFixed(2);
console.log(`Wrote ${OUT} (${sizeMB} MB)`);
