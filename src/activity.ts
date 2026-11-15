/**
 * Wires the Activity Terrain on the skills page to the baked contribution data.
 * Run `node scripts/fetch-contributions.mjs` to refresh src/data/contributions.json.
 */

import { createActivityTerrain } from "./ascii/activity-terrain.ts";
import contributions from "./data/contributions.json";

const canvas = document.querySelector<HTMLCanvasElement>("[data-terrain-canvas]");
if (canvas) {
  const readout = document.querySelector<HTMLElement>("[data-terrain-readout]");
  const flatBtn = document.querySelector<HTMLButtonElement>("[data-terrain-flat]");
  const resetBtn = document.querySelector<HTMLButtonElement>("[data-terrain-reset]");
  const totalEl = document.querySelector<HTMLElement>("[data-terrain-total]");
  const userEl = document.querySelector<HTMLElement>("[data-terrain-user]");
  const rangeEl = document.querySelector<HTMLElement>("[data-terrain-range]");

  const data = contributions.days;
  const endDate = contributions.endDate;

  const fmt = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  if (totalEl) totalEl.textContent = String(contributions.total);
  if (userEl) userEl.textContent = contributions.user;
  if (rangeEl) rangeEl.textContent = `${fmt(contributions.startDate)} – ${fmt(endDate)}`;

  // Phones have no hover, so the prompt should talk about tapping.
  const touchOnly = window.matchMedia("(hover: none)").matches;
  const idle = touchOnly ? "Tap a column" : "Hover a column";
  if (readout) readout.textContent = idle;

  let flat = false;

  const terrain = createActivityTerrain(canvas, {
    data,
    endDate,
    flat,
    onHover: (cell) => {
      if (!readout) return;
      if (!cell) {
        readout.textContent = idle;
        readout.removeAttribute("data-active");
        return;
      }
      const label = cell.date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      readout.textContent = `${label} · ${cell.count} ${cell.count === 1 ? "commit" : "commits"}`;
      readout.dataset.active = "true";
    },
  });

  flatBtn?.addEventListener("click", () => {
    flat = !flat;
    flatBtn.setAttribute("aria-pressed", String(flat));
    terrain.setFlat?.(flat);
  });

  resetBtn?.addEventListener("click", () => {
    terrain.reset();
    if (readout) {
      readout.textContent = idle;
      readout.removeAttribute("data-active");
    }
  });
}
