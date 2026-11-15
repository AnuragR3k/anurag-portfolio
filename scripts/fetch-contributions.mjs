/**
 * Refresh the baked GitHub contribution data used by the skills page.
 * Usage: node scripts/fetch-contributions.mjs
 */
import { writeFile } from "node:fs/promises";

const USER = "AnuragR3k";
const WEEKS = 26;

const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`);
if (!res.ok) throw new Error(`Contribution API returned ${res.status}`);
const json = await res.json();

const days = json.contributions.slice(-WEEKS * 7);
const endDate = days.at(-1).date;
const data = days.map((d) => d.count);
const total = data.reduce((sum, n) => sum + n, 0);

const weeks = [];
for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));

const out = {
  user: USER,
  fetchedAt: new Date().toISOString().slice(0, 10),
  startDate: days[0].date,
  endDate,
  total,
  max: Math.max(...data),
  days: data,
  weeks,
};

await writeFile(
  new URL("../src/data/contributions.json", import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(
  `Wrote ${data.length} days (${out.startDate} → ${endDate}), ${total} contributions, max/day ${out.max}`,
);
