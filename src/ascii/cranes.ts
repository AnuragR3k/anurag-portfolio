/**
 * Crane flock background.
 *
 * Adapted from the "cranes" scene in ASCII Animals New Tab
 * (https://github.com/Pawan-webdeveloper/Ascii-Animals-extension, MIT).
 * Cranes are sampled procedurally onto a coarse cell grid: solid parts become
 * tinted square cells, wispy parts (legs, trails) become monospace glyphs.
 */

type RGB = [number, number, number];

export type CraneOptions = {
  /** Multiplier on the number of cranes. */
  density?: number;
  /** Speed multiplier. */
  speed?: number;
  /** Cell size in CSS pixels. Larger = chunkier. */
  cell?: number;
  /** Main direction of travel, degrees (0 = right, 90 = down). */
  direction?: number;
  /** How much individual cranes stray from that direction (0-1). */
  spread?: number;
  /** Leave fading ASCII characters behind the flock. */
  trails?: boolean;
};

const TAU = Math.PI * 2;
const sq = (x: number) => x * x;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]): T => arr[(Math.random() * arr.length) | 0];
const ell = (u: number, v: number, cu: number, cv: number, ru: number, rv: number) =>
  sq((u - cu) / ru) + sq((v - cv) / rv);

function hash2(i: number, j: number, s: number) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ---------- sampler output (reused to avoid allocations) ---------- */

const out = { r: 0, g: 0, b: 0, a: 1, ch: null as string | null, shine: 0 };

function hit(c: RGB, a = 1, shine = 0, k = 1) {
  out.r = c[0] * k;
  out.g = c[1] * k;
  out.b = c[2] * k;
  out.a = a;
  out.ch = null;
  out.shine = shine;
  return true;
}

function glyph(chars: string, c: RGB, a = 1, k = 1) {
  out.r = c[0] * k;
  out.g = c[1] * k;
  out.b = c[2] * k;
  out.a = a;
  out.ch = chars;
  out.shine = 0;
  return true;
}

/* ---------- the crane ---------- */

type Palette = { white: RGB; black: RGB; feather: RGB; crown: RGB };

const PALETTES: Palette[] = [
  { white: [226, 230, 240], black: [44, 46, 54], feather: [78, 82, 96], crown: [222, 42, 42] },
  { white: [214, 220, 238], black: [50, 54, 62], feather: [88, 92, 106], crown: [210, 52, 52] },
  { white: [172, 180, 196], black: [64, 68, 78], feather: [98, 104, 120], crown: [200, 56, 56] },
];

const RADIUS = 15;
const SCALE = 1.15;
const TRAIL_CHARS = "'`.";

/** Sprite units: +u points the way the crane faces, v is lateral. */
function sampleCrane(u: number, v: number, pal: Palette, span: number) {
  const av = Math.abs(v);

  // beak, head, neck
  if (u > 9.0 && u < 10.8 && av < 0.34) return hit([196, 186, 136]);
  if (ell(u, v, 8.3, 0, 0.95, 0.78) < 1)
    return u > 8.3 && av < 0.42 ? hit(pal.crown) : hit(pal.black);
  if (u > 2.3 && u <= 8.3 && av < 0.5) return hit(u > 4.6 ? pal.black : pal.white);

  // body
  if (ell(u, v, -1, 0, 3.8, 1.45) < 1) return hit(pal.white, 1, 0.1);

  // tail
  if (u < -4.4 && u > -6.0 && av < 0.9) return hit(pal.black);

  // trailing legs
  if (u <= -5.6 && u > -10.5 && Math.abs(av - 0.45) < 0.32)
    return glyph(":|", [130, 130, 136], 0.8);

  // wings, beating with the phase
  if (av >= 1.1 && av < 1.1 + span) {
    const w = av - 1.1;
    const s = w / span;
    const uf = 1.5 - 1.7 * s - (s > 0.82 ? sq((s - 0.82) * 9) * 0.5 : 0);
    const ub = -2.5 - 1.0 * s + (s > 0.74 ? sq((s - 0.74) * 6.5) : 0);
    if (u < uf && u > ub) {
      if (u - ub < 0.55 && ((w * 1.4) | 0) & 1) return false;
      const shade = 0.72 + (0.28 * span) / 13;
      if (s > 0.84 || (s < 0.74 && u - ub < (uf - ub) * 0.4)) return hit(pal.feather, 1, 0, shade);
      return hit(pal.white, 1, 0.1, shade);
    }
  }
  return false;
}

/* ---------- flock simulation ---------- */

type Crane = {
  x: number;
  y: number;
  z: number;
  seed: number;
  pal: Palette;
  phase: number;
  rateMul: number;
  speedMul: number;
  baseOff: number;
  heading: number;
  fade: number;
  speedMod: number;
  lastTrail: number;
  trailFlip: number;
  span: number;
};

const REDUCED =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

export function createCraneFlock(world: HTMLCanvasElement, options: CraneOptions = {}) {
  const opts = {
    density: options.density ?? 1,
    speed: options.speed ?? 1,
    cell: options.cell ?? 9,
    direction: options.direction ?? 315,
    spread: options.spread ?? 0.12,
    trails: options.trails ?? true,
  };

  const maybeCtx = world.getContext("2d", { alpha: false });
  if (!maybeCtx) throw new Error("Canvas 2D is not available");
  const ctx = maybeCtx;

  const BG: RGB = [13, 16, 22];
  const BG_PACKED = (255 << 24) | (BG[2] << 16) | (BG[1] << 8) | BG[0];
  const GRID_LINE = "rgba(5, 6, 9, 0.94)";

  const R = {
    dpr: 1,
    W: 0,
    H: 0,
    cell: 9,
    cols: 0,
    rows: 0,
    line: 1,
    lo: document.createElement("canvas"),
    img: null as ImageData | null,
    buf: null as Uint32Array | null,
    overlay: document.createElement("canvas"),
    occ: null as Int16Array | null,
    tLife: null as Float32Array | null,
    tChar: null as Uint8Array | null,
    tCol: null as Uint8Array | null,
    font: "",
  };
  const maybeLoCtx = R.lo.getContext("2d");
  if (!maybeLoCtx) throw new Error("Canvas 2D is not available");
  const loCtx = maybeLoCtx;

  let cranes: Crane[] = [];
  let seedCounter = 1;
  let simTime = 0;
  const pointer = { x: -1e9, y: -1e9, active: false };
  const glyphList: (number | string)[] = [];

  const scaleFor = (c: Crane) => {
    const far = 1 - 0.6 * 0.62;
    return SCALE * lerp(far, 1.12, c.z);
  };

  function desiredCount() {
    const area = (window.innerWidth * window.innerHeight) / (1440 * 900);
    return Math.max(1, Math.round(8 * opts.density * clamp(area, 0.35, 2.2)));
  }

  function makeCrane(fade = 0): Crane {
    const dirRad = ((opts.direction - 90) * Math.PI) / 180;
    const c: Crane = {
      x: rand(0, R.W),
      y: rand(0, R.H),
      z: Math.pow(Math.random(), 0.85),
      seed: (seedCounter++ * 2654435761) >>> 16,
      pal: pick(PALETTES),
      phase: rand(0, TAU),
      rateMul: rand(0.85, 1.15),
      speedMul: rand(0.75, 1.25),
      baseOff: rand(-1, 1),
      heading: 0,
      fade,
      speedMod: 1,
      lastTrail: -1,
      trailFlip: 0,
      span: 10,
    };
    c.heading = dirRad + c.baseOff * Math.PI * opts.spread * 0.35;
    return c;
  }

  function resize() {
    R.dpr = window.devicePixelRatio || 1;
    R.W = Math.round(window.innerWidth * R.dpr);
    R.H = Math.round(window.innerHeight * R.dpr);
    R.cell = Math.max(4, Math.round(opts.cell * R.dpr));
    R.line = Math.max(1, Math.round(R.dpr));
    R.cols = Math.ceil(R.W / R.cell) + 1;
    R.rows = Math.ceil(R.H / R.cell) + 1;

    world.width = R.W;
    world.height = R.H;
    R.lo.width = R.cols;
    R.lo.height = R.rows;
    R.img = loCtx.createImageData(R.cols, R.rows);
    R.buf = new Uint32Array(R.img.data.buffer);

    const n = R.cols * R.rows;
    R.occ = new Int16Array(n);
    R.tLife = new Float32Array(n);
    R.tChar = new Uint8Array(n);
    R.tCol = new Uint8Array(n * 3);

    R.font = `600 ${Math.round(R.cell * 1.02)}px "Geist Mono", ui-monospace, monospace`;
    drawOverlay();

    // keep the flock populated after a resize
    const want = desiredCount();
    while (cranes.length < want) cranes.push(makeCrane(1));
    while (cranes.length > want) cranes.pop();
    for (const c of cranes) {
      c.x = clamp(c.x, 0, R.W);
      c.y = clamp(c.y, 0, R.H);
    }
  }

  function drawOverlay() {
    const o = R.overlay;
    o.width = R.W;
    o.height = R.H;
    const g = o.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, R.W, R.H);
    g.fillStyle = GRID_LINE;
    for (let i = 0; i <= R.cols; i++) g.fillRect(i * R.cell, 0, R.line, R.H);
    for (let j = 0; j <= R.rows; j++) g.fillRect(0, j * R.cell, R.W, R.line);
    const rg = g.createRadialGradient(
      R.W / 2,
      R.H * 0.45,
      Math.min(R.W, R.H) * 0.2,
      R.W / 2,
      R.H * 0.5,
      Math.hypot(R.W, R.H) * 0.62,
    );
    rg.addColorStop(0, "rgba(0,0,0,0)");
    rg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = rg;
    g.fillRect(0, 0, R.W, R.H);
  }

  /* ---------- simulation ---------- */

  function step(dt: number) {
    const motion = REDUCED && REDUCED.matches ? 0.3 : 1;
    const sp = opts.speed * motion;
    simTime += dt * motion;
    const t = simTime;
    const dirRad = ((opts.direction - 90) * Math.PI) / 180;

    for (const c of cranes) {
      c.fade = Math.min(1, c.fade + dt / 0.9);
      c.speedMod = 1;
      const f = 0.55 + 0.45 * Math.cos(c.phase);
      c.phase += dt * 3.4 * c.rateMul * (0.55 + 0.45 * sp);
      const span = 3.5 + 9.5 * f;

      let wob = 0.08 * Math.sin(t * 0.5 + c.seed * 2);
      let dx = Math.cos(dirRad + c.baseOff * Math.PI * opts.spread * 0.35 + wob * 1.0);
      let dy = Math.sin(dirRad + c.baseOff * Math.PI * opts.spread * 0.35 + wob * 1.0);

      const k = scaleFor(c);
      const reach = RADIUS * k * R.cell;

      // gentle avoidance so the flock keeps its spacing
      for (const o of cranes) {
        if (o === c) continue;
        const ox = c.x - o.x;
        const oy = c.y - o.y;
        const d = Math.hypot(ox, oy);
        const lim = (reach + RADIUS * scaleFor(o) * R.cell) * 0.75;
        if (d > 0 && d < lim) {
          const w = (1 - d / lim) * 1.6;
          dx += (ox / d) * w;
          dy += (oy / d) * w;
        }
      }

      // cranes veer away from the cursor
      if (pointer.active) {
        const px = c.x - pointer.x;
        const py = c.y - pointer.y;
        const d = Math.hypot(px, py);
        const lim = reach + 70 * R.dpr;
        if (d > 0 && d < lim) {
          const w = (1 - d / lim) * 2.5;
          dx += (px / d) * w;
          dy += (py / d) * w;
        }
      }

      const desired = Math.atan2(dy, dx);
      let diff = (desired - c.heading) % TAU;
      if (diff > Math.PI) diff -= TAU;
      if (diff < -Math.PI) diff += TAU;
      const turn = 0.5 * dt;
      c.heading += clamp(diff, -turn, turn);

      const parallax = 0.55 + 0.45 * c.z;
      const v = 5.5 * c.speedMul * c.speedMod * sp * parallax * R.cell * k * 0.6;
      c.x += Math.cos(c.heading) * v * dt;
      c.y += Math.sin(c.heading) * v * dt;

      // re-enter from the opposite edge
      const m = reach + 4 * R.cell;
      if (c.x < -m) {
        c.x = R.W + m;
        c.y = rand(0, R.H);
      } else if (c.x > R.W + m) {
        c.x = -m;
        c.y = rand(0, R.H);
      }
      if (c.y < -m) {
        c.y = R.H + m;
        c.x = rand(0, R.W);
      } else if (c.y > R.H + m) {
        c.y = -m;
        c.x = rand(0, R.W);
      }

      c.span = span;
    }
  }

  /* ---------- drawing ---------- */

  function rasterize(c: Crane, buf: Uint32Array, occ: Int16Array) {
    const k = scaleFor(c);
    const cx = c.x / R.cell;
    const cy = c.y / R.cell;
    const rad = RADIUS * k;
    const i0 = Math.max(0, Math.floor(cx - rad));
    const i1 = Math.min(R.cols - 1, Math.ceil(cx + rad));
    const j0 = Math.max(0, Math.floor(cy - rad));
    const j1 = Math.min(R.rows - 1, Math.ceil(cy + rad));
    if (i0 > i1 || j0 > j1) return;

    const ang = c.heading;
    const cs = Math.cos(ang) / k;
    const sn = Math.sin(ang) / k;
    const bright = lerp(0.52, 1, c.z);
    const fade = c.fade;
    const tick = (simTime * 5) | 0;
    const span = c.span;

    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx;
        const u = dx * cs + dy * sn;
        const v = -dx * sn + dy * cs;
        if (!sampleCrane(u, v, c.pal, span)) continue;
        const idx = j * R.cols + i;
        const a = out.a * fade;
        if (a <= 0.01) continue;

        if (out.ch) {
          const set = out.ch;
          const ch = set.length > 1 ? set[(hash2(i, j, c.seed + tick) * set.length) | 0] : set;
          glyphList.push(
            i,
            j,
            out.r * bright,
            out.g * bright,
            out.b * bright,
            a * (0.45 + 0.55 * bright),
            ch,
          );
          continue;
        }

        const jit = 0.86 + 0.28 * hash2(i, j, c.seed);
        let r = out.r * jit;
        let g = out.g * jit;
        let b = out.b * jit;
        if (out.shine && hash2(i, j, c.seed ^ 77) < out.shine * 0.18) {
          r = lerp(r, 245, 0.65);
          g = lerp(g, 248, 0.65);
          b = lerp(b, 255, 0.65);
        }

        const p = buf[idx];
        const t = a * bright;
        const pr = p & 255;
        const pg = (p >>> 8) & 255;
        const pb = (p >>> 16) & 255;
        r = clamp(lerp(pr, r, t), 0, 255) | 0;
        g = clamp(lerp(pg, g, t), 0, 255) | 0;
        b = clamp(lerp(pb, b, t), 0, 255) | 0;
        buf[idx] = (255 << 24) | (b << 16) | (g << 8) | r;
        if (a > 0.5) occ[idx] = 1;
      }
    }
  }

  function emitTrail(c: Crane) {
    if (!opts.trails || c.fade < 0.5) return;
    const k = scaleFor(c);
    const cs = Math.cos(c.heading);
    const sn = Math.sin(c.heading);
    c.trailFlip = (c.trailFlip + 1) % 1;
    const tu = -9;
    const tv = 0;
    const wx = c.x / R.cell + (tu * cs - tv * sn) * k;
    const wy = c.y / R.cell + (tu * sn + tv * cs) * k;
    const i = Math.floor(wx);
    const j = Math.floor(wy);
    if (i < 0 || j < 0 || i >= R.cols || j >= R.rows) return;
    const idx = j * R.cols + i;
    if (idx === c.lastTrail) return;
    c.lastTrail = idx;
    if (Math.random() > 0.75) return;
    const tLife = R.tLife!;
    const tChar = R.tChar!;
    const tCol = R.tCol!;
    const bright = lerp(0.45, 0.95, c.z);
    tLife[idx] = bright;
    tChar[idx] = (Math.random() * TRAIL_CHARS.length) | 0;
    tCol[idx * 3] = 190;
    tCol[idx * 3 + 1] = 200;
    tCol[idx * 3 + 2] = 225;
  }

  function render(dt: number) {
    const buf = R.buf!;
    const occ = R.occ!;
    const tLife = R.tLife!;
    buf.fill(BG_PACKED);
    occ.fill(-1);
    glyphList.length = 0;

    const sorted = cranes.slice().sort((a, b) => a.z - b.z);
    for (const c of sorted) {
      rasterize(c, buf, occ);
      emitTrail(c);
    }

    loCtx.putImageData(R.img!, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(R.lo, 0, 0, R.cols * R.cell, R.rows * R.cell);
    ctx.drawImage(R.overlay, 0, 0);

    ctx.font = R.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const half = R.cell / 2 + R.line / 2;

    // fading trails underneath the birds
    const decay = dt / 1.0;
    for (let idx = 0; idx < tLife.length; idx++) {
      const l = tLife[idx];
      if (l <= 0) continue;
      const nl = l - decay;
      tLife[idx] = nl;
      if (nl <= 0.02 || occ[idx] >= 0) continue;
      const i = idx % R.cols;
      const j = (idx / R.cols) | 0;
      ctx.fillStyle = `rgba(${R.tCol![idx * 3]},${R.tCol![idx * 3 + 1]},${R.tCol![idx * 3 + 2]},${(nl * 0.55).toFixed(3)})`;
      ctx.fillText(
        TRAIL_CHARS[R.tChar![idx] % TRAIL_CHARS.length],
        i * R.cell + half,
        j * R.cell + half,
      );
    }

    for (let g = 0; g < glyphList.length; g += 7) {
      const i = glyphList[g] as number;
      const j = glyphList[g + 1] as number;
      if (occ[j * R.cols + i] >= 0) continue;
      ctx.fillStyle = `rgba(${(glyphList[g + 2] as number) | 0},${(glyphList[g + 3] as number) | 0},${(glyphList[g + 4] as number) | 0},${(glyphList[g + 5] as number).toFixed(3)})`;
      ctx.fillText(glyphList[g + 6] as string, i * R.cell + half, j * R.cell + half);
    }
  }

  let last = 0;
  let raf = 0;
  function frame(now: number) {
    const dt = last ? clamp((now - last) / 1000, 0, 0.05) : 0.016;
    last = now;
    step(dt);
    render(dt);
    raf = requestAnimationFrame(frame);
  }

  function onPointerMove(ev: PointerEvent) {
    pointer.x = ev.clientX * R.dpr;
    pointer.y = ev.clientY * R.dpr;
    pointer.active = true;
  }
  function onPointerLeave() {
    pointer.active = false;
  }

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("blur", onPointerLeave);
  raf = requestAnimationFrame(frame);

  return {
    /** Update the look without restarting the scene. */
    set(next: Partial<CraneOptions>) {
      const relayout = next.cell !== undefined && next.cell !== opts.cell;
      Object.assign(opts, next);
      if (relayout) resize();
      else if (next.density !== undefined) {
        const want = desiredCount();
        while (cranes.length < want) cranes.push(makeCrane(0));
        while (cranes.length > want) cranes.pop();
      }
    },
    /** Nudge the whole flock in a new direction (degrees). */
    turn(direction: number) {
      opts.direction = direction;
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
    },
  };
}
