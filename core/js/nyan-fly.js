(() => {
  const cat = document.querySelector(".nyan-flyer");
  if (!cat) return;

  const SPEED = 0.16; // px per ms
  const DIRECTIONS = [
    { vx: 1, vy: 0 }, // right
    { vx: -1, vy: 0 }, // left
    { vx: 0.85, vy: 0.35 }, // down-right
    { vx: 0.85, vy: -0.35 }, // up-right
    { vx: -0.85, vy: 0.35 }, // down-left
    { vx: -0.85, vy: -0.35 }, // up-left
  ];

  let x = 0;
  let y = 0;
  let vx = 1;
  let vy = 0;
  let facing = 1;
  let lastTime = 0;
  let started = false;
  let raf = null;

  function dims() {
    return {
      w: cat.offsetWidth || 220,
      h: cat.offsetHeight || 90,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }

  function place() {
    cat.style.transform = `translate(${x}px, ${y}px) scaleX(${facing})`;
  }

  function spawn() {
    const { w, h, vw, vh } = dims();
    const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    const mag = Math.hypot(dir.vx, dir.vy) || 1;
    vx = dir.vx / mag;
    vy = dir.vy / mag;
    facing = vx >= 0 ? 1 : -1;

    const pad = 40;
    const maxY = Math.max(pad, vh - h - pad);
    const maxX = Math.max(pad, vw - w - pad);

    // Enter from the opposite side of travel, random along that edge
    if (Math.abs(vx) >= Math.abs(vy)) {
      // mostly horizontal
      y = pad + Math.random() * Math.max(1, maxY - pad);
      x = vx > 0 ? -w - 20 : vw + 20;
    } else {
      // mostly vertical (fallback)
      x = pad + Math.random() * Math.max(1, maxX - pad);
      y = vy > 0 ? -h - 20 : vh + 20;
    }

    place();
  }

  function isOffscreen() {
    const { w, h, vw, vh } = dims();
    return x > vw + 40 || x + w < -40 || y > vh + 40 || y + h < -40;
  }

  function frame(time) {
    if (!lastTime) lastTime = time;
    const dt = Math.min(40, time - lastTime);
    lastTime = time;

    if (!document.hidden) {
      x += vx * SPEED * dt;
      y += vy * SPEED * dt;
      place();

      if (isOffscreen()) {
        spawn();
      }
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (started) return;
    started = true;
    spawn();
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    // Keep current pass; if somehow stranded, respawn
    if (isOffscreen()) spawn();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) lastTime = 0;
  });

  if (cat.complete) {
    start();
  } else {
    cat.addEventListener("load", start, { once: true });
    setTimeout(start, 120);
  }
})();
