# Project notes

freecode reads this file before every change. Add anything it should always remember about this project.

## Portfolio (Anurag Raghatwan)

- Five pages: `index.html` (hero), `skills.html`, `work.html`, `about.html`, `contact.html`; wired in `vite.config.ts` `rollupOptions.input`. Shared shell/animation code in `src/shell.ts`; page-specific styles in `src/pages.css`.
- Content rules: only use the facts Anurag supplied. Never invent employers, job titles, or completed certifications (eJPT is "pursuing", Splunk/Detection Eng = learning).
- Background: crane flock adapted from Pawan-webdeveloper/Ascii-Animals-extension (MIT). Source in `src/ascii/cranes.ts`; options passed from `src/main.ts`. Fonts are Geist/Geist Mono (OFL) in `src/fonts`.
- Styling: `src/style.css` (tokens, shell, typography, cards) + `src/pages.css` (page-specific); dark glass theme; breakpoints at 620px and a short-screen (max-height 820px) compaction.
- GitHub activity: "Activity Terrain" by @dorianbaffier (kokonutui, MIT) ported React-free to `src/ascii/activity-terrain.ts`; data baked into `src/data/contributions.json` (26 weeks). Refresh with `node scripts/fetch-contributions.mjs`.
- `vite.config.ts` has no `vite-plus/oxlint-plugin` block: `vp lint` crashed with it on this VM. Don't re-add.
