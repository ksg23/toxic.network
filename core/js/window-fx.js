(() => {
  const GENIE_MS = 580;

  function rectCenter(r) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function metrics(winEl, dockEl) {
    const w = winEl.getBoundingClientRect();
    const d = dockEl.getBoundingClientRect();
    const from = rectCenter(w);
    const to = rectCenter(d);
    return {
      dx: to.x - from.x,
      dy: to.y - from.y,
      sx: Math.max(0.035, d.width / w.width),
      sy: Math.max(0.035, d.height / w.height),
    };
  }

  function clearAnimation(winEl) {
    winEl.getAnimations?.().forEach((a) => a.cancel());
    winEl.style.transform = "";
    winEl.style.opacity = "";
    winEl.style.filter = "";
    winEl.style.transformOrigin = "";
  }

  /**
   * macOS-like genie suck into a dock icon.
   */
  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function genieMinimize(winEl, dockEl) {
    if (!winEl || !dockEl) {
      return Promise.resolve();
    }

    if (prefersReducedMotion()) {
      winEl.style.opacity = "0";
      return Promise.resolve();
    }

    clearAnimation(winEl);
    const { dx, dy, sx, sy } = metrics(winEl, dockEl);
    winEl.style.transformOrigin = "50% 50%";

    const anim = winEl.animate(
      [
        {
          transform: "translate(0px, 0px) scale(1, 1)",
          opacity: 1,
          offset: 0,
        },
        {
          // Fabric squash toward the dock
          transform: `translate(${dx * 0.22}px, ${dy * 0.42}px) scale(0.62, 0.22)`,
          opacity: 1,
          offset: 0.42,
        },
        {
          transform: `translate(${dx * 0.72}px, ${dy * 0.88}px) scale(${sx * 2.2}, ${sy * 0.9})`,
          opacity: 0.85,
          offset: 0.72,
        },
        {
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
          opacity: 0,
          offset: 1,
        },
      ],
      {
        duration: GENIE_MS,
        easing: "cubic-bezier(0.4, 0.0, 0.8, 0.2)",
        fill: "forwards",
      }
    );

    return anim.finished.catch(() => {});
  }

  /**
   * Reverse genie — expand out of the dock icon.
   */
  function genieRestore(winEl, dockEl) {
    if (!winEl || !dockEl) {
      return Promise.resolve();
    }

    if (prefersReducedMotion()) {
      clearAnimation(winEl);
      return Promise.resolve();
    }

    clearAnimation(winEl);
    const { dx, dy, sx, sy } = metrics(winEl, dockEl);
    winEl.style.transformOrigin = "50% 50%";

    const anim = winEl.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
          opacity: 0,
          offset: 0,
        },
        {
          transform: `translate(${dx * 0.72}px, ${dy * 0.88}px) scale(${sx * 2.2}, ${sy * 0.9})`,
          opacity: 0.85,
          offset: 0.28,
        },
        {
          transform: `translate(${dx * 0.22}px, ${dy * 0.42}px) scale(0.62, 0.22)`,
          opacity: 1,
          offset: 0.55,
        },
        {
          transform: "translate(0px, 0px) scale(1, 1)",
          opacity: 1,
          offset: 1,
        },
      ],
      {
        duration: GENIE_MS,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        fill: "forwards",
      }
    );

    return anim.finished
      .catch(() => {})
      .then(() => {
        clearAnimation(winEl);
      });
  }

  window.ToxicWindowFx = {
    GENIE_MS,
    genieMinimize,
    genieRestore,
    clearAnimation,
  };
})();
