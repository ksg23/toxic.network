(() => {
  const dock = document.getElementById("dock");
  const modal = document.getElementById("terminalModal");
  const dockBtn = dock?.querySelector('.dock__item[data-app="terminal"]');
  if (!dock || !modal || !dockBtn) return;

  const win = modal.querySelector(".term");
  const output = document.getElementById("termOutput");
  const scroll = document.getElementById("termScroll");
  const form = document.getElementById("termForm");
  const input = document.getElementById("termInput");
  const closers = modal.querySelectorAll("[data-term-close]");
  const minBtn = modal.querySelector("[data-term-minimize]");
  const zoomBtn = modal.querySelector("[data-term-zoom]");

  const API_BASE = (
    window.TOXIC_API ||
    document.querySelector('meta[name="toxic-api"]')?.content ||
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");

  const ANIM_MS = 280;
  let closeTimer = null;
  let openRaf = null;
  let minimized = false;
  let busy = false;
  let history = [];
  let historyIndex = -1;
  let bootstrapped = false;
  let cmdBusy = false;

  function isVisible() {
    return modal.classList.contains("is-open") && !modal.hidden;
  }

  function syncDockDot() {
    dockBtn.classList.toggle("is-open", minimized || isVisible());
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

  function scrollToBottom() {
    if (!scroll) return;
    scroll.scrollTop = scroll.scrollHeight;
  }

  function appendLine(text, className = "") {
    if (!output) return;
    const p = document.createElement("p");
    p.className = "term__line" + (className ? ` ${className}` : "");
    p.textContent = text;
    output.appendChild(p);
    scrollToBottom();
    return p;
  }

  function appendHtml(html) {
    if (!output) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    while (wrap.firstChild) output.appendChild(wrap.firstChild);
    scrollToBottom();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatMoney(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return `$${Number(n).toFixed(2)}`;
  }

  function appendCommandEcho(cmd) {
    if (!output) return;
    const p = document.createElement("p");
    p.className = "term__line term__line--cmd";
    p.innerHTML =
      `<span class="term__prompt-echo">ksg@toxic:~/pokemon % </span>` +
      `<span class="term__cmd-text"></span>`;
    p.querySelector(".term__cmd-text").textContent = cmd;
    output.appendChild(p);
    scrollToBottom();
  }

  function printBanner() {
    appendLine("toxic.network terminal — pokemon browser", "term__line--accent");
    appendLine(`api: ${API_BASE}`, "term__line--muted");
    appendLine("Type `help` for available commands.", "term__line--muted");
    appendLine("");
  }

  function printHelp() {
    appendLine("Available commands:");
    appendLine("  help                      Show this help");
    appendLine("  clear                     Clear the screen");
    appendLine("  whoami                    Print current user");
    appendLine("  echo <text>               Print text");
    appendLine("  sets [query]              List / search Pokémon sets");
    appendLine("  cards <set> [query]       Cards in a set (id or abbr)");
    appendLine("  search <query>            Search cards across recent sets");
    appendLine("  exit / quit               Close the terminal");
    appendLine("");
    appendLine('examples: search charizard · sets surging · cards SSP pikachu', "term__line--muted");
  }

  async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail || body.error || detail;
      } catch {
        /* ignore */
      }
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return res.json();
  }

  function renderCards(cards) {
    if (!cards?.length) {
      appendLine("no cards found", "term__line--warn");
      return;
    }
    const items = cards
      .map((c) => {
        const meta = [c.set_abbr || c.set_name, c.number, c.rarity, formatMoney(c.market)]
          .filter(Boolean)
          .join(" · ");
        const img = c.image_url
          ? `<img class="term__card-img" src="${escapeHtml(c.image_url)}" alt="" loading="lazy">`
          : `<div class="term__card-img"></div>`;
        const href = c.tcgplayer_url
          ? ` href="${escapeHtml(c.tcgplayer_url)}" target="_blank" rel="noopener noreferrer"`
          : "";
        const tag = href ? "a" : "div";
        return `
          <${tag} class="term__card"${href}>
            ${img}
            <div class="term__card-name">${escapeHtml(c.name)}</div>
            <div class="term__card-meta">${escapeHtml(meta)}</div>
          </${tag}>
        `;
      })
      .join("");
    appendHtml(`<div class="term__card-grid">${items}</div>`);
  }

  async function handleSearch(query) {
    if (!query) {
      appendLine("usage: search <query>", "term__line--warn");
      appendLine('example: search "charizard ex"', "term__line--muted");
      return;
    }
    appendLine(`searching "${query}"…`, "term__line--muted");
    try {
      const data = await apiGet(`/search?q=${encodeURIComponent(query)}&limit=24`);
      appendLine(
        `${data.count} card${data.count === 1 ? "" : "s"} · scanned ${data.sets_scanned} sets`,
        "term__line--accent"
      );
      if (data.set_matches?.length) {
        appendLine(
          "set hits: " + data.set_matches.map((s) => s.abbreviation || s.name).join(", "),
          "term__line--muted"
        );
      }
      renderCards(data.cards);
    } catch (err) {
      appendLine(`search failed: ${err.message}`, "term__line--err");
      appendLine("Is the Python API running?  cd api && uvicorn main:app --reload", "term__line--muted");
    }
  }

  async function handleSets(query) {
    appendLine(query ? `sets matching "${query}"…` : "loading sets…", "term__line--muted");
    try {
      const data = await apiGet(`/sets?q=${encodeURIComponent(query || "")}&limit=40`);
      appendLine(`${data.count} set${data.count === 1 ? "" : "s"}`, "term__line--accent");
      for (const s of data.sets || []) {
        const when = (s.published_on || "").slice(0, 10);
        appendLine(
          `  ${String(s.id).padStart(5)}  ${(s.abbreviation || "—").padEnd(6)}  ${s.name}  (${s.product_count ?? "?"}${when ? ` · ${when}` : ""})`
        );
      }
      if (!data.sets?.length) appendLine("no sets found", "term__line--warn");
    } catch (err) {
      appendLine(`sets failed: ${err.message}`, "term__line--err");
      appendLine("Is the Python API running?  cd api && uvicorn main:app --reload", "term__line--muted");
    }
  }

  async function handleCards(arg) {
    if (!arg) {
      appendLine("usage: cards <set_id|abbr> [query]", "term__line--warn");
      appendLine("example: cards SSP  ·  cards 23651 charizard", "term__line--muted");
      return;
    }
    const [setRef, ...rest] = arg.split(/\s+/);
    const q = rest.join(" ").trim();
    appendLine(`loading cards for ${setRef}${q ? ` · filter "${q}"` : ""}…`, "term__line--muted");
    try {
      const path =
        `/sets/${encodeURIComponent(setRef)}/cards?limit=48` +
        (q ? `&q=${encodeURIComponent(q)}` : "");
      const data = await apiGet(path);
      const set = data.set || {};
      appendLine(
        `${set.name || setRef} [${set.abbreviation || set.id}] — ${data.count} card${data.count === 1 ? "" : "s"}`,
        "term__line--accent"
      );
      renderCards(data.cards);
    } catch (err) {
      appendLine(`cards failed: ${err.message}`, "term__line--err");
      appendLine("Is the Python API running?  cd api && uvicorn main:app --reload", "term__line--muted");
    }
  }

  async function runCommand(raw) {
    const line = raw.trim();
    if (!line) return;
    if (cmdBusy) {
      appendLine("busy — wait for the current command", "term__line--warn");
      return;
    }

    appendCommandEcho(line);
    history.push(line);
    historyIndex = history.length;

    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(" ").trim();
    const name = cmd.toLowerCase();

    switch (name) {
      case "help":
      case "?":
        printHelp();
        break;
      case "clear":
      case "cls":
        if (output) output.innerHTML = "";
        break;
      case "whoami":
        appendLine("ksg");
        break;
      case "echo":
        appendLine(arg || "");
        break;
      case "ls":
        appendLine("cards/  sets/  search*", "term__line--muted");
        break;
      case "sets":
      case "set":
        cmdBusy = true;
        try {
          await handleSets(arg);
        } finally {
          cmdBusy = false;
        }
        break;
      case "cards":
      case "card":
        cmdBusy = true;
        try {
          await handleCards(arg);
        } finally {
          cmdBusy = false;
        }
        break;
      case "search":
      case "find":
      case "pokemon":
        cmdBusy = true;
        try {
          await handleSearch(arg);
        } finally {
          cmdBusy = false;
        }
        break;
      case "exit":
      case "quit":
        close();
        break;
      default:
        appendLine(`command not found: ${cmd}`, "term__line--err");
        appendLine("Type `help` for available commands.", "term__line--muted");
    }
  }

  function open() {
    if (busy) return;
    clearAnimTimers();
    minimized = false;
    window.ToxicWindowFx?.clearAnimation(win);
    modal.classList.remove("is-closing", "is-minimizing", "is-genie-restoring");
    modal.hidden = false;
    void modal.offsetWidth;

    openRaf = requestAnimationFrame(() => {
      modal.classList.add("is-open");
      syncDockDot();
      openRaf = null;
      if (!bootstrapped) {
        printBanner();
        bootstrapped = true;
      }
      input?.focus();
    });
    document.addEventListener("keydown", onGlobalKey);
  }

  async function restore() {
    if (!minimized || busy) return;
    busy = true;
    clearAnimTimers();
    minimized = false;
    modal.classList.remove("is-closing", "is-minimizing");
    modal.hidden = false;
    modal.classList.add("is-open", "is-genie-restoring");
    syncDockDot();
    document.addEventListener("keydown", onGlobalKey);

    try {
      if (window.ToxicWindowFx && win && dockBtn) {
        await window.ToxicWindowFx.genieRestore(win, dockBtn);
      }
    } finally {
      modal.classList.remove("is-genie-restoring");
      busy = false;
      input?.focus();
    }
  }

  function close() {
    if ((!isVisible() && !minimized) || busy) return;
    clearAnimTimers();
    minimized = false;
    window.ToxicWindowFx?.clearAnimation(win);
    win?.classList.remove("is-zoomed");
    zoomBtn?.setAttribute("aria-label", "Zoom");
    modal.classList.add("is-closing");
    modal.classList.remove("is-open", "is-minimizing", "is-genie-restoring");
    syncDockDot();
    document.removeEventListener("keydown", onGlobalKey);
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
    modal.classList.add("is-minimizing");
    syncDockDot();
    document.removeEventListener("keydown", onGlobalKey);

    try {
      if (window.ToxicWindowFx && win && dockBtn) {
        await window.ToxicWindowFx.genieMinimize(win, dockBtn);
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
    input?.focus();
  }

  function onGlobalKey(e) {
    if (e.key === "Escape") {
      if (win?.classList.contains("is-zoomed")) {
        toggleZoom();
        return;
      }
      close();
    }
  }

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value;
    input.value = "";
    runCommand(value);
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] || "";
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!history.length) return;
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = historyIndex === history.length ? "" : history[historyIndex] || "";
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
      const sel = window.getSelection()?.toString();
      if (!sel && !input.value) {
        e.preventDefault();
        appendLine("^C", "term__line--muted");
      }
    }
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
    else input?.focus();
  });

  dockBtn.addEventListener("click", () => {
    if (minimized) {
      restore();
      return;
    }
    if (isVisible()) {
      close();
      return;
    }
    open();
  });

  closers.forEach((el) => el.addEventListener("click", close));
  minBtn?.addEventListener("click", minimize);
  zoomBtn?.addEventListener("click", toggleZoom);
})();
