(() => {
  const dock = document.getElementById("dock");
  const modal = document.getElementById("aboutModal");
  if (!dock || !modal) return;

  const finder = modal.querySelector(".finder");
  const dockItems = dock.querySelectorAll(".dock__item[data-panel]");
  const closers = modal.querySelectorAll("[data-close]");
  const minBtn = modal.querySelector("[data-minimize]");
  const zoomBtn = modal.querySelector("[data-zoom]");
  const tabs = modal.querySelectorAll(".sidebar__item[data-panel]");
  const panels = modal.querySelectorAll(".panel[data-panel]");
  const ANIM_MS = 280;
  const MINIMIZE_MS = 380;
  let closeTimer = null;
  let openRaf = null;
  let activePanel = "overview";
  let minimized = false;

  function isVisible() {
    return modal.classList.contains("is-open") && !modal.hidden;
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
    clearAnimTimers();
    minimized = false;
    showPanel(panel);
    modal.classList.remove("is-closing", "is-minimizing");
    modal.hidden = false;

    // Force a reflow so the pop-in keyframes restart cleanly.
    void modal.offsetWidth;

    openRaf = requestAnimationFrame(() => {
      modal.classList.add("is-open");
      syncDockDots();
      openRaf = null;
    });
    document.addEventListener("keydown", onKey);
  }

  function restore() {
    if (!minimized) return;
    clearAnimTimers();
    minimized = false;
    modal.classList.remove("is-closing", "is-minimizing");
    modal.hidden = false;
    void modal.offsetWidth;
    openRaf = requestAnimationFrame(() => {
      modal.classList.add("is-open");
      syncDockDots();
      openRaf = null;
    });
    document.addEventListener("keydown", onKey);
  }

  function close() {
    if (!isVisible() && !minimized) return;

    clearAnimTimers();
    minimized = false;
    if (finder) finder.classList.remove("is-zoomed");
    zoomBtn?.setAttribute("aria-label", "Zoom");

    modal.classList.add("is-closing");
    modal.classList.remove("is-open", "is-minimizing");
    syncDockDots();
    document.removeEventListener("keydown", onKey);

    closeTimer = setTimeout(() => {
      modal.hidden = true;
      modal.classList.remove("is-closing");
      closeTimer = null;
    }, ANIM_MS);
  }

  function minimize() {
    if (!isVisible()) return;

    clearAnimTimers();
    minimized = true;
    modal.classList.add("is-minimizing");
    modal.classList.remove("is-open");
    syncDockDots();
    document.removeEventListener("keydown", onKey);

    closeTimer = setTimeout(() => {
      modal.hidden = true;
      modal.classList.remove("is-minimizing");
      closeTimer = null;
    }, MINIMIZE_MS);
  }

  function toggleZoom() {
    if (!isVisible() || !finder) return;
    const zoomed = finder.classList.toggle("is-zoomed");
    zoomBtn?.setAttribute("aria-label", zoomed ? "Restore" : "Zoom");
  }

  function onKey(e) {
    if (e.key === "Escape") {
      if (finder?.classList.contains("is-zoomed")) {
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
