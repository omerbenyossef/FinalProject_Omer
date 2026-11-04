/* Guards translations.js against the mistake that has now been made four
   times: adding a Hebrew key that already exists further down the file.
   Lookup is first-wins, so the new entry silently takes over and rewrites
   wording that is already in use somewhere else in the app.

   The file arrived with 58 of these already in it, most of them harmless case
   variants ("Hide" vs "HIDE") and a few real ("מקום" resolves to "Rank", so a
   venue label reads as a rank in English). Those are recorded in the baseline
   beside this file so the check can fail on NEW ones only — a gate that cries
   about 58 old problems is a gate nobody reads.

   Run: node scripts/check-translations.mjs            (exits 1 on a new clash)
        node scripts/check-translations.mjs --bless    (re-records the baseline) */
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/translations.js", import.meta.url), "utf8");
const lines = src.split("\n");
const seen = new Map();
const clashes = [];

lines.forEach((line, i) => {
  const m = line.match(/^\s*\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\],?\s*$/);
  if (!m) return;
  const [, he, en] = m;
  if (!seen.has(he)) {
    seen.set(he, { en, line: i + 1 });
    return;
  }
  const first = seen.get(he);
  // Two identical entries are harmless duplication; two different ones mean
  // one of them is dead and the other may have taken over a label it was
  // never meant to own.
  if (first.en !== en) clashes.push({ he, first, second: { en, line: i + 1 } });
});

const baselinePath = new URL("./translation-clashes-baseline.json", import.meta.url);
const key = (c) => `${c.he}\u0000${c.first.en}\u0000${c.second.en}`;

if (process.argv.includes("--bless")) {
  fs.writeFileSync(baselinePath, JSON.stringify(clashes.map(key).sort(), null, 2) + "\n");
  console.log(`Recorded ${clashes.length} known clash(es) as the baseline.`);
  process.exit(0);
}

const known = new Set(
  fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : []
);
const fresh = clashes.filter((c) => !known.has(key(c)));

if (fresh.length) {
  console.error(`${fresh.length} NEW Hebrew key(s) with a second, different English value:\n`);
  for (const c of fresh) {
    console.error(`  "${c.he}"`);
    console.error(`    line ${c.first.line}: "${c.first.en}"   <- wins`);
    console.error(`    line ${c.second.line}: "${c.second.en}"   <- dead\n`);
  }
  console.error("Keep one. Whichever is earlier is the one the app uses.");
  console.error("If this really is intended, run with --bless to record it.");
  process.exit(1);
}
console.log(
  `translations.js: ${seen.size} keys, ${clashes.length} known clash(es), no new ones.`
);
