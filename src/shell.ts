/**
 * Shared page behaviour: crane background, nav state, scroll reveals,
 * card spotlights, button ripples, role typewriter and the scroll progress bar.
 */

import { createCraneFlock } from "./ascii/cranes.ts";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- background ---------- */

const world = document.querySelector<HTMLCanvasElement>("#world");
if (world) {
  createCraneFlock(world, {
    density: 1.2,
    speed: 1,
    cell: 10,
    trails: true,
    direction: 315,
    spread: 0.12,
  });
}

/* ---------- active nav link ---------- */

const here = document.body.dataset.page ?? "home";
for (const link of document.querySelectorAll<HTMLAnchorElement>(".nav a")) {
  if (link.dataset.nav === here) link.setAttribute("aria-current", "page");
}

/* ---------- reveal on load ---------- */

document.documentElement.classList.add("js");

const reveal = () => document.documentElement.classList.add("ready");

if (document.fonts?.ready) {
  const timeout = new Promise((resolve) => setTimeout(resolve, 1200));
  void Promise.race([document.fonts.ready, timeout]).then(reveal, reveal);
} else {
  requestAnimationFrame(reveal);
}

/* ---------- reveal on scroll ---------- */

const revealTargets = document.querySelectorAll<HTMLElement>("[data-reveal]");

if (reduceMotion.matches || !("IntersectionObserver" in window)) {
  revealTargets.forEach((el) => el.classList.add("in"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.add("in");
        if (el.classList.contains("timeline")) el.classList.add("grown");
        observer.unobserve(el);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  revealTargets.forEach((el) => observer.observe(el));
}

/* extra: grow the timeline even when it starts above the fold */
const timelines = document.querySelectorAll<HTMLElement>(".timeline");
for (const timeline of timelines) {
  requestAnimationFrame(() => timeline.classList.add("grown"));
}

/* ---------- card spotlight ---------- */

for (const card of document.querySelectorAll<HTMLElement>(".card, .featured")) {
  card.addEventListener("pointermove", (ev) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${ev.clientX - rect.left}px`);
    card.style.setProperty("--my", `${ev.clientY - rect.top}px`);
  });
}

/* ---------- button ripples ---------- */

for (const btn of document.querySelectorAll<HTMLElement>(".btn")) {
  btn.addEventListener("pointerdown", (ev) => {
    if (reduceMotion.matches) return;
    const rect = btn.getBoundingClientRect();
    const ink = document.createElement("span");
    ink.className = "ripple";
    ink.style.left = `${ev.clientX - rect.left}px`;
    ink.style.top = `${ev.clientY - rect.top}px`;
    btn.appendChild(ink);
    ink.addEventListener("animationend", () => ink.remove());
  });
}

/* ---------- scroll progress ---------- */

const bar = document.querySelector<HTMLElement>(".scroll-progress");
if (bar) {
  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    bar.style.transform = `scaleX(${p})`;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  window.addEventListener("resize", update, { passive: true });
  update();
}

/* ---------- role typewriter (home) ---------- */

const rolesEl = document.querySelector<HTMLElement>("[data-roles]");
if (rolesEl) {
  const roles = rolesEl.dataset.roles?.split("|").filter(Boolean) ?? [];
  const text = rolesEl.querySelector<HTMLElement>(".role-text");
  const caret = document.createElement("span");
  caret.className = "caret";
  caret.setAttribute("aria-hidden", "true");

  if (text && roles.length) {
    text.textContent = roles[0];
    rolesEl.appendChild(caret);

    if (reduceMotion.matches) {
      // still cycles, but without the typing animation
      let index = 0;
      setInterval(() => {
        index = (index + 1) % roles.length;
        text.textContent = roles[index];
      }, 5000);
    } else {
      let roleIndex = 0;
      let charIndex = roles[0].length;
      let deleting = false;

      const tick = () => {
        const current = roles[roleIndex];
        if (!deleting) {
          charIndex += 1;
          text.textContent = current.slice(0, charIndex);
          if (charIndex >= current.length) {
            deleting = true;
            setTimeout(tick, 2600);
            return;
          }
          setTimeout(tick, 55 + Math.random() * 40);
        } else {
          charIndex -= 1;
          text.textContent = current.slice(0, charIndex);
          if (charIndex <= 0) {
            deleting = false;
            roleIndex = (roleIndex + 1) % roles.length;
            setTimeout(tick, 320);
            return;
          }
          setTimeout(tick, 28);
        }
      };

      setTimeout(tick, 2200);
    }
  }
}

/* ---------- terminal typing (skills) ---------- */

const term = document.querySelector<HTMLElement>("[data-terminal]");
if (term) {
  const lines = Array.from(term.querySelectorAll<HTMLElement>("[data-line]"));
  const started = { done: false };

  const run = () => {
    if (started.done) return;
    started.done = true;
    if (reduceMotion.matches) {
      lines.forEach((line) => (line.style.opacity = "1"));
      return;
    }
    lines.forEach((line, i) => {
      line.style.opacity = "0";
      setTimeout(
        () => {
          line.style.transition = "opacity 320ms ease";
          line.style.opacity = "1";
        },
        180 + i * 170,
      );
    });
  };

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(term);
  } else {
    run();
  }
}

/* ---------- copy to clipboard (contact) ---------- */

const toast = document.querySelector<HTMLElement>(".toast");
let toastTimer = 0;
const say = (message: string) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
};

for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  btn.addEventListener("click", async () => {
    const value = btn.dataset.copy ?? "";
    try {
      await navigator.clipboard.writeText(value);
      say("Copied to clipboard");
    } catch {
      say("Copy failed — select the text instead");
    }
  });
}

/* ---------- contact form ---------- */

const form = document.querySelector<HTMLFormElement>("[data-contact-form]");
if (form) {
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();
    const to = form.dataset.mailto ?? "";

    if (!name || !email || !message) {
      if (status) status.textContent = "Please fill in your name, email and message.";
      form.querySelector<HTMLInputElement>("[name]:not([value])")?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (status) status.textContent = "That email address doesn't look right.";
      form.querySelector<HTMLInputElement>("[name=email]")?.focus();
      return;
    }

    const subject = `Portfolio enquiry from ${name}`;
    const body = `${message}\n\n— ${name}\n${email}`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (status) status.textContent = "Opening your email app…";
    say("Opening your email app");
  });
}

/* ---------- leave transition between pages ---------- */

if (!reduceMotion.matches) {
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    "a[href$='.html'], a[href='./']",
  )) {
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) continue;
    if (url.pathname === location.pathname) continue;

    link.addEventListener("click", (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
      ev.preventDefault();
      document.documentElement.classList.add("leaving");
      setTimeout(() => {
        location.href = url.href;
      }, 150);
    });
  }
}

export { say };
