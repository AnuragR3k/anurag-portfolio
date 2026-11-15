# Anurag Raghatwan — Portfolio

Personal portfolio site: a dark, glassy five-page site with an animated ASCII crane
flock in the background and a draggable 3D GitHub contribution terrain.

## Pages

| Page | File | What's on it |
| --- | --- | --- |
| Home | `index.html` | Name, rotating role line, focus areas, quick links |
| Skills | `skills.html` | Stack breakdown, GitHub activity terrain, security focus, toolkit |
| Work | `work.html` | Featured projects and open-source contributions |
| About | `about.html` | Bio, timeline, certifications, interests |
| Contact | `contact.html` | Email copy, links, message form |

## Running it

Requires Node 20+ and pnpm.

```sh
pnpm install
pnpm dev        # local dev server
pnpm build      # typecheck + production build into dist/
pnpm preview    # serve the built site
pnpm typecheck
pnpm lint
```

## GitHub activity terrain

The skills page shows the last 26 weeks of contributions as a 3D landscape on a
canvas: drag to rotate, hover a column to read the day, and use **Flat** to see it
as a regular heatmap.

The numbers are stored in `src/data/contributions.json` rather than fetched in the
browser, so the page works offline and loads fast. To refresh them:

```sh
node scripts/fetch-contributions.mjs
```

That pulls the last 26 weeks for `AnuragR3k` and rewrites the JSON file. Commit the
result to update the live site.

## Credits

- **Activity Terrain** — original React component by
  [@dorianbaffier](https://github.com/kokonut-labs/kokonutui) (kokonutui, MIT).
  Ported to plain TypeScript/canvas in `src/ascii/activity-terrain.ts`.
- **ASCII crane flock** — adapted from
  [Pawan-webdeveloper/Ascii-Animals-extension](https://github.com/Pawan-webdeveloper/Ascii-Animals-extension)
  (MIT). Source in `src/ascii/cranes.ts`.
- **Fonts** — Geist and Geist Mono, licences in `src/fonts`.

## Stack

Vite+ (vp) with pnpm, TypeScript, no framework. Vanilla DOM for the shell and page
behaviour, canvas for the background and the terrain.

## Deploying

`pnpm build` produces a fully static site in `dist/` with relative asset paths, so it
can be dropped on GitHub Pages, Vercel, Netlify or any static host. For GitHub Pages,
publish the `dist/` folder (or run the build in a workflow and deploy the artifact).

Note: the contact form has no backend — it opens the visitor's mail app with the
message prefilled.
