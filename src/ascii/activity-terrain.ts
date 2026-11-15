/**
 * Activity Terrain — a draggable 3D contribution grid.
 *
 * Adaptation of "Activity Terrain" by @dorianbaffier (kokonutui.com, MIT),
 * rewritten without React so it can run in a plain canvas. The projection,
 * spring physics and draw order follow the original.
 */

const DAYS = 7;
const GAP = 0.18;
const MAX_HEIGHT = 4.2;
const DEG = Math.PI / 180;
const PITCH_TERRAIN = 56 * DEG;
const YAW_TERRAIN = 18 * DEG;
const YAW_LIMIT = 38 * DEG;
const PITCH_LIMIT = 66 * DEG;
const DRAG_YAW = 0.32 * DEG;
const DRAG_PITCH = 0.36 * DEG;
const SPIN_HALF_LIFE = 0.16;
const PITCH_STIFFNESS = 140;
const PITCH_DAMPING = 2 * Math.sqrt(PITCH_STIFFNESS);
const EDGE_STIFFNESS = 180;
const BUMP_STIFFNESS = 400;
const BUMP_DAMPING = 2 * Math.sqrt(BUMP_STIFFNESS) * 0.7;
const BUMP = 0.45;
const WAVE = 0.7;
const PADDING = 22;
// The board is 26 weeks wide but only 7 days deep; stretch the depth a little
// so the terrain doesn't look like a thin ribbon on wide screens.
const DEPTH_SCALE = 1.3;
const LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

type Rgb = [number, number, number];

type Cell = {
  index: number;
  col: number;
  row: number;
  count: number;
  level: number;
  height: number;
  date: Date;
};

type Pose = {
  yaw: number;
  pitch: number;
  scale: number;
  cx: number;
  cy: number;
};

type Palette = {
  levels: Rgb[];
  accent: Rgb;
  text: string;
  font: string;
};

export type TerrainOptions = {
  data: number[];
  /** YYYY-MM-DD of the last value. */
  endDate: string;
  flat?: boolean;
  onHover?: (cell: { date: Date; count: number } | null) => void;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function easeOutBack(t: number) {
  const c = 1.4;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function rubber(value: number, min: number, max: number) {
  if (value < min) return min - 0.18 * (1 - Math.exp((value - min) / 0.18));
  if (value > max) return max + 0.18 * (1 - Math.exp((max - value) / 0.18));
  return value;
}

function parseDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function buildCells(data: number[], endDate: string): Cell[] {
  const end = parseDay(endDate);
  const start = new Date(end.getTime() - (data.length - 1) * 86_400_000);
  const offset = (start.getUTCDay() + 6) % 7;
  const max = Math.max(1, ...data);
  return data.map((count, index) => {
    const slot = index + offset;
    const norm = count / max;
    return {
      index,
      col: Math.floor(slot / DAYS),
      row: slot % DAYS,
      count,
      level: count === 0 ? 0 : Math.ceil(norm * 4),
      height: 0.06 + norm ** 0.85 * MAX_HEIGHT,
      date: new Date(start.getTime() + index * 86_400_000),
    };
  });
}

function hexToRgb(value: string): Rgb {
  const hex = value.trim().replace("#", "");
  const n = Number.parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
  if (Number.isNaN(n)) return [136, 136, 136];
  return [Math.floor(n / 65_536) % 256, Math.floor(n / 256) % 256, n % 256];
}

function shade([r, g, b]: Rgb, amount: number) {
  const k = 1 - amount;
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

function readPalette(node: HTMLElement): Palette {
  const style = getComputedStyle(node);
  const read = (name: string) => style.getPropertyValue(name).trim() || "#888888";
  return {
    levels: [0, 1, 2, 3, 4].map((l) => hexToRgb(read(`--terrain-${l}`))),
    accent: hexToRgb(read("--terrain-accent")),
    text: read("--terrain-text"),
    font: style.fontFamily,
  };
}

function project(pose: Pose, x: number, y: number, z: number) {
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  const zs = z * DEPTH_SCALE;
  const xr = x * cos - zs * sin;
  const zr = x * sin + zs * cos;
  return [
    pose.cx + xr * pose.scale,
    pose.cy + (zr * Math.cos(pose.pitch) - y * Math.sin(pose.pitch)) * pose.scale,
  ];
}

function visibleFaces(pose: Pose, x0: number, z0: number, h: number) {
  const x1 = x0 + 1 - GAP;
  const z1 = z0 + 1 - GAP;
  const p = (x: number, y: number, z: number) => project(pose, x, y, z);
  const faces: { points: number[][]; tone: number }[] = [];
  const sin = Math.sin(pose.yaw);
  const cos = Math.cos(pose.yaw);
  if (h > 0.02 && pose.pitch > 0.01) {
    if (cos > 0) {
      faces.push({ points: [p(x0, 0, z1), p(x1, 0, z1), p(x1, h, z1), p(x0, h, z1)], tone: 0.22 });
    } else {
      faces.push({ points: [p(x0, 0, z0), p(x1, 0, z0), p(x1, h, z0), p(x0, h, z0)], tone: 0.22 });
    }
    if (sin > 0.001) {
      faces.push({ points: [p(x1, 0, z0), p(x1, 0, z1), p(x1, h, z1), p(x1, h, z0)], tone: 0.38 });
    } else if (sin < -0.001) {
      faces.push({ points: [p(x0, 0, z0), p(x0, 0, z1), p(x0, h, z1), p(x0, h, z0)], tone: 0.38 });
    }
  }
  faces.push({ points: [p(x0, h, z0), p(x1, h, z0), p(x1, h, z1), p(x0, h, z1)], tone: 0 });
  return faces;
}

function inside(points: number[][], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function polygon(ctx: CanvasRenderingContext2D, points: number[][]) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

const formatMonth = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

export function createActivityTerrain(canvas: HTMLCanvasElement, options: TerrainOptions) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      setData() {},
      setFlat() {},
      reset() {},
      destroy() {},
      endDate: options.endDate,
    };
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let cells = buildCells(options.data, options.endDate);
  let endDate = options.endDate;
  let weeks = (cells.at(-1)?.col ?? 0) + 1;
  const startFlat = options.flat ?? false;

  const sim = {
    yaw: startFlat || reduceMotion.matches ? YAW_TERRAIN : YAW_TERRAIN,
    yawSpeed: 0,
    pitch: startFlat || reduceMotion.matches ? 0 : 0,
    pitchSpeed: 0,
    pitchTarget: startFlat ? 0 : PITCH_TERRAIN,
    bumps: new Float64Array(cells.length),
    bumpSpeeds: new Float64Array(cells.length),
    hovered: -1,
    origin: { col: 0, row: 3 },
    width: 0,
    height: 0,
    dpr: 1,
    drag: null as null | {
      id: number;
      x: number;
      y: number;
      yaw: number;
      pitch: number;
      moved: boolean;
      lastX: number;
      lastY: number;
      lastT: number;
    },
    raf: 0,
    last: 0,
    visible: false,
    started: false,
  };

  // The intro rises from flat to the resting tilt.
  if (reduceMotion.matches) sim.pitch = sim.pitchTarget;

  let palette = readPalette(canvas);

  const columnHeight = (cell: Cell, lift: number) => {
    const span = Math.hypot(weeks, DAYS) || 1;
    const d = Math.hypot(cell.col - sim.origin.col, cell.row - sim.origin.row) / span;
    const local = clamp(lift * (1 + WAVE) - d * WAVE, 0, 1);
    return cell.height * easeOutBack(local) + sim.bumps[cell.index];
  };

  const pose = (): Pose & { lift: number } => {
    const lift = clamp(sim.pitch / PITCH_TERRAIN, 0, 1.2);
    const w = weeks;
    const corners = [
      [0, 0],
      [w, 0],
      [0, DAYS],
      [w, DAYS],
    ];
    const probe: Pose = { yaw: sim.yaw, pitch: sim.pitch, scale: 1, cx: 0, cy: 0 };
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const [x, z] of corners) {
      for (const y of [0, MAX_HEIGHT * Math.min(lift, 1)]) {
        const [px, py] = project(probe, x - w / 2, y, z - DAYS / 2);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
    const scale = Math.min(
      (sim.width - PADDING * 2) / (maxX - minX),
      (sim.height - PADDING * 2) / (maxY - minY),
    );
    return {
      yaw: sim.yaw,
      pitch: sim.pitch,
      scale,
      cx: sim.width / 2 - ((minX + maxX) / 2) * scale,
      cy: sim.height / 2 - ((minY + maxY) / 2) * scale + 6,
      lift,
    };
  };

  const ordered = (p: Pose) => {
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    const depth = (c: Cell) => (c.col + 0.5 - weeks / 2) * sin + (c.row + 0.5 - DAYS / 2) * cos;
    return cells.slice().sort((a, b) => depth(a) - depth(b));
  };

  const drawLabels = (p: Pose, lift: number) => {
    const alpha = clamp(1 - lift * 1.6, 0, 1);
    if (alpha === 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.text;
    ctx.font = `11px ${palette.font}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let month = -1;
    for (const cell of cells) {
      if (cell.row !== 0 && cell.index !== 0) continue;
      const m = cell.date.getUTCMonth();
      if (m !== month && cell.col < weeks - 1) {
        month = m;
        const [x, y] = project(p, cell.col - weeks / 2, 0, -0.75 - DAYS / 2);
        ctx.fillText(formatMonth(cell.date), x, y);
      }
    }
    ctx.textAlign = "right";
    for (let row = 0; row < DAYS; row++) {
      if (LABELS[row]) {
        const [x, y] = project(p, -0.35 - weeks / 2, 0, row + 0.4 - DAYS / 2);
        ctx.fillText(LABELS[row], x, y);
      }
    }
    ctx.globalAlpha = 1;
  };

  const draw = () => {
    if (!sim.width || !sim.height) return;
    palette = readPalette(canvas);
    const p = pose();
    ctx.setTransform(sim.dpr, 0, 0, sim.dpr, 0, 0);
    ctx.clearRect(0, 0, sim.width, sim.height);
    drawLabels(p, p.lift);
    ctx.lineJoin = "round";
    for (const cell of ordered(p)) {
      const h = columnHeight(cell, p.lift);
      const color = cell.index === sim.hovered ? palette.accent : palette.levels[cell.level];
      for (const face of visibleFaces(p, cell.col - weeks / 2, cell.row - DAYS / 2, h)) {
        polygon(ctx, face.points);
        const fill = shade(color, face.tone);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = fill;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
  };

  const hitTest = (x: number, y: number): Cell | null => {
    const p = pose();
    const list = ordered(p);
    for (let i = list.length - 1; i >= 0; i--) {
      const cell = list[i];
      const h = columnHeight(cell, p.lift);
      for (const face of visibleFaces(p, cell.col - weeks / 2, cell.row - DAYS / 2, h)) {
        if (inside(face.points, x, y)) return cell;
      }
    }
    return null;
  };

  const stepSprings = (dt: number) => {
    let energy = 0;
    if (!sim.drag) {
      sim.yawSpeed *= 0.5 ** (dt / SPIN_HALF_LIFE);
      let target = sim.yaw;
      if (sim.pitchTarget === 0) {
        target = 0;
      } else if (sim.yaw > YAW_LIMIT) {
        target = YAW_LIMIT;
      } else if (sim.yaw < -YAW_LIMIT) {
        target = -YAW_LIMIT;
      }
      if (target !== sim.yaw) {
        sim.yawSpeed +=
          ((target - sim.yaw) * EDGE_STIFFNESS - sim.yawSpeed * 2 * Math.sqrt(EDGE_STIFFNESS)) * dt;
      }
      sim.yaw += sim.yawSpeed * dt;
      energy = Math.max(energy, Math.abs(sim.yawSpeed), Math.abs(target - sim.yaw));

      const force =
        (sim.pitchTarget - sim.pitch) * PITCH_STIFFNESS - sim.pitchSpeed * PITCH_DAMPING;
      sim.pitchSpeed += force * dt;
      sim.pitch += sim.pitchSpeed * dt;
      energy = Math.max(energy, Math.abs(sim.pitchSpeed), Math.abs(sim.pitchTarget - sim.pitch));
    }
    for (let i = 0; i < sim.bumps.length; i++) {
      const target = i === sim.hovered && sim.pitch > 0.1 ? BUMP : 0;
      sim.bumpSpeeds[i] +=
        ((target - sim.bumps[i]) * BUMP_STIFFNESS - sim.bumpSpeeds[i] * BUMP_DAMPING) * dt;
      sim.bumps[i] += sim.bumpSpeeds[i] * dt;
      energy = Math.max(energy, Math.abs(sim.bumpSpeeds[i]) * 0.1, Math.abs(target - sim.bumps[i]));
    }
    return energy;
  };

  const tick = (now: number) => {
    sim.raf = 0;
    const dt = sim.last ? Math.min((now - sim.last) / 1000, 0.05) : 0.016;
    sim.last = now;
    const energy = stepSprings(dt);
    draw();
    // Keep animating while anything is still moving and the card is on screen.
    if (!sim.visible) return;
    if (energy > 0.0005 || sim.drag) {
      sim.raf = requestAnimationFrame(tick);
    } else {
      sim.raf = 0;
    }
  };

  const kick = () => {
    sim.last = 0;
    if (!sim.raf && sim.visible) sim.raf = requestAnimationFrame(tick);
  };

  /* ---------- sizing ---------- */

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    sim.dpr = Math.min(window.devicePixelRatio || 1, 2);
    sim.width = rect.width;
    sim.height = rect.height;
    canvas.width = Math.round(rect.width * sim.dpr);
    canvas.height = Math.round(rect.height * sim.dpr);
    draw();
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /* ---------- pointer ---------- */

  const local = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const { x, y } = local(ev);
    canvas.setPointerCapture(ev.pointerId);
    sim.drag = {
      id: ev.pointerId,
      x,
      y,
      yaw: sim.yaw,
      pitch: sim.pitch,
      moved: false,
      lastX: x,
      lastY: y,
      lastT: performance.now(),
    };
    sim.yawSpeed = 0;
    canvas.classList.add("grabbing");
    kick();
  };

  const onPointerMove = (ev: PointerEvent) => {
    const { x, y } = local(ev);
    const drag = sim.drag;
    if (drag && drag.id === ev.pointerId) {
      const dx = x - drag.x;
      const dy = y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      const dyaw = dx * DRAG_YAW;
      const yaw = rubber(drag.yaw + dyaw, -YAW_LIMIT * 1.6, YAW_LIMIT * 1.6);
      sim.yaw = yaw;
      // Flick velocity, for the coast after release.
      const now = performance.now();
      const ddx = x - drag.lastX;
      const dtms = Math.max(8, now - drag.lastT);
      sim.yawSpeed = (ddx * DRAG_YAW) / (dtms / 1000);
      drag.lastX = x;
      drag.lastT = now;
      sim.pitch = clamp(drag.pitch + dy * DRAG_PITCH, -PITCH_LIMIT, PITCH_LIMIT);
      draw();
      kick();
      return;
    }

    const hit = hitTest(x, y);
    const next = hit ? hit.index : -1;
    if (next !== sim.hovered) {
      sim.hovered = next;
      canvas.classList.toggle("hovering", Boolean(hit));
      options.onHover?.(hit ? { date: hit.date, count: hit.count } : null);
      draw();
      kick();
    }
  };

  const onPointerUp = (ev: PointerEvent) => {
    const drag = sim.drag;
    if (!drag || drag.id !== ev.pointerId) return;
    sim.drag = null;
    canvas.classList.remove("grabbing");
    if (!drag.moved) {
      // A tap returns the terrain to its resting tilt.
      sim.pitchTarget = sim.pitchTarget === 0 ? PITCH_TERRAIN : sim.pitchTarget;
    }
    kick();
  };

  const onPointerLeave = () => {
    if (sim.hovered !== -1) {
      sim.hovered = -1;
      canvas.classList.remove("hovering");
      options.onHover?.(null);
      draw();
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);

  /* ---------- keyboard ---------- */

  const onKey = (ev: KeyboardEvent) => {
    const step = 4 * DEG;
    if (ev.key === "ArrowLeft") {
      sim.yaw = rubber(sim.yaw - step, -YAW_LIMIT, YAW_LIMIT);
    } else if (ev.key === "ArrowRight") {
      sim.yaw = rubber(sim.yaw + step, -YAW_LIMIT, YAW_LIMIT);
    } else if (ev.key === "ArrowUp") {
      sim.pitchTarget = clamp(sim.pitchTarget + 6 * DEG, 0, PITCH_LIMIT);
    } else if (ev.key === "ArrowDown") {
      sim.pitchTarget = clamp(sim.pitchTarget - 6 * DEG, 0, PITCH_LIMIT);
    } else if (ev.key === "Home") {
      sim.yaw = 0;
      sim.pitchTarget = PITCH_TERRAIN;
    } else {
      return;
    }
    ev.preventDefault();
    draw();
    kick();
  };
  canvas.addEventListener("keydown", onKey);

  /* ---------- visibility ---------- */

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      sim.visible = visible;
      if (visible && !sim.started) {
        sim.started = true;
        // The intro tilt.
        if (!reduceMotion.matches && !startFlat) {
          sim.pitch = 0;
          sim.pitchSpeed = 0;
        }
        kick();
      }
      if (visible) kick();
    },
    { threshold: 0.15 },
  );
  io.observe(canvas);

  resize();
  draw();

  return {
    setData(next: number[], nextEndDate: string, flat = false) {
      cells = buildCells(next, nextEndDate);
      endDate = nextEndDate;
      weeks = (cells.at(-1)?.col ?? 0) + 1;
      sim.bumps = new Float64Array(cells.length);
      sim.bumpSpeeds = new Float64Array(cells.length);
      sim.hovered = -1;
      sim.pitchTarget = flat ? 0 : PITCH_TERRAIN;
      draw();
      kick();
    },
    setFlat(flat: boolean) {
      sim.pitchTarget = flat ? 0 : PITCH_TERRAIN;
      draw();
      kick();
    },
    reset() {
      sim.yaw = 0;
      sim.yawSpeed = 0;
      sim.pitchTarget = PITCH_TERRAIN;
      draw();
      kick();
    },
    destroy() {
      cancelAnimationFrame(sim.raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("keydown", onKey);
    },
    get endDate() {
      return endDate;
    },
  };
}
