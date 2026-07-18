(() => {
  const dock = document.getElementById("dock");
  const modal = document.getElementById("contactsModal");
  if (!dock || !modal) return;

  const win = modal.querySelector(".contacts");
  const dockItems = dock.querySelectorAll(".dock__item[data-panel]");
  const closers = modal.querySelectorAll("[data-close]");
  const minBtn = modal.querySelector("[data-minimize]");
  const zoomBtn = modal.querySelector("[data-zoom]");
  const tabs = modal.querySelectorAll(".clist__item[data-panel]");
  const panels = modal.querySelectorAll(".panel[data-panel]");
  const ANIM_MS = 280;
  let closeTimer = null;
  let openRaf = null;
  let activePanel = "overview";
  let minimized = false;
  let busy = false;

  function isVisible() {
    return modal.classList.contains("is-open") && !modal.hidden;
  }

  function dockIconFor(panel) {
    return (
      dock.querySelector(`.dock__item[data-panel="${panel}"]`) ||
      dock.querySelector('.dock__item[data-panel="overview"]')
    );
  }

  function showPanel(name) {
    activePanel = name;

    tabs.forEach((t) => {
      const active = t.dataset.panel === name;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });

    panels.forEach((p) => {
      const active = p.dataset.panel === name;
      p.classList.toggle("is-active", active);
      p.hidden = !active;
    });
  }

  function syncDockDots() {
    const show = minimized || isVisible();
    dockItems.forEach((item) => {
      item.classList.toggle("is-open", show && item.dataset.panel === activePanel);
    });
  }

  function clearAnimTimers() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (openRaf) {
      cancelAnimationFrame(openRaf);
      openRaf = null;
    }
  }

  function open(panel = "overview") {
    if (busy) return;
    clearAnimTimers();
    minimized = false;
    showPanel(panel);
    window.ToxicWindowFx?.clearAnimation(win);
    modal.classList.remove("is-closing", "is-minimizing", "is-genie-restoring");
    modal.hidden = false;

    void modal.offsetWidth;

    openRaf = requestAnimationFrame(() => {
      modal.classList.add("is-open");
      syncDockDots();
      openRaf = null;
    });
    document.addEventListener("keydown", onKey);
  }

  async function restore() {
    if (!minimized || busy) return;
    busy = true;
    clearAnimTimers();
    minimized = false;
    modal.classList.remove("is-closing", "is-minimizing");
    modal.hidden = false;
    modal.classList.add("is-open", "is-genie-restoring");
    syncDockDots();
    document.addEventListener("keydown", onKey);

    const icon = dockIconFor(activePanel);
    try {
      if (window.ToxicWindowFx && win && icon) {
        await window.ToxicWindowFx.genieRestore(win, icon);
      }
    } finally {
      modal.classList.remove("is-genie-restoring");
      busy = false;
    }
  }

  function close() {
    if ((!isVisible() && !minimized) || busy) return;

    clearAnimTimers();
    minimized = false;
    window.ToxicWindowFx?.clearAnimation(win);
    if (win) win.classList.remove("is-zoomed");
    zoomBtn?.setAttribute("aria-label", "Zoom");

    modal.classList.add("is-closing");
    modal.classList.remove("is-open", "is-minimizing", "is-genie-restoring");
    syncDockDots();
    document.removeEventListener("keydown", onKey);

    closeTimer = setTimeout(() => {
      modal.hidden = true;
      modal.classList.remove("is-closing");
      closeTimer = null;
    }, ANIM_MS);
  }

  async function minimize() {
    if (!isVisible() || busy) return;
    busy = true;

    clearAnimTimers();
    minimized = true;
    const icon = dockIconFor(activePanel);
    modal.classList.add("is-minimizing");
    syncDockDots();
    document.removeEventListener("keydown", onKey);

    try {
      if (window.ToxicWindowFx && win && icon) {
        await window.ToxicWindowFx.genieMinimize(win, icon);
      } else {
        await new Promise((r) => setTimeout(r, 380));
      }
    } finally {
      modal.classList.remove("is-open", "is-minimizing");
      modal.hidden = true;
      window.ToxicWindowFx?.clearAnimation(win);
      busy = false;
    }
  }

  function toggleZoom() {
    if (!isVisible() || !win || busy) return;
    const zoomed = win.classList.toggle("is-zoomed");
    zoomBtn?.setAttribute("aria-label", zoomed ? "Restore" : "Zoom");
  }

  function onKey(e) {
    if (e.key === "Escape") {
      if (win?.classList.contains("is-zoomed")) {
        toggleZoom();
        return;
      }
      close();
    }
  }

  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      showPanel(t.dataset.panel);
      syncDockDots();
    })
  );

  dockItems.forEach((item) => {
    item.addEventListener("click", () => {
      const panel = item.dataset.panel;

      if (minimized) {
        showPanel(panel);
        restore();
        return;
      }

      if (isVisible()) {
        if (activePanel === panel) {
          close();
          return;
        }
        showPanel(panel);
        syncDockDots();
        return;
      }

      open(panel);
    });
  });

  closers.forEach((el) => el.addEventListener("click", close));
  minBtn?.addEventListener("click", minimize);
  zoomBtn?.addEventListener("click", toggleZoom);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
})();
