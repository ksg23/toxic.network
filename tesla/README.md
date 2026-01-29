# TeslaDash — Fullscreen Tesla Browser

TeslaDash is a static web app that replicates the Tesla fullscreen "theater" redirect trick using YouTube's redirect endpoint. It's designed to be served as static files (e.g. on Cloudflare Pages) with a configurable JSON file for links.

## What this provides
- Tesla-inspired dark UI, touch-friendly tiles
- YouTube redirect trick for Tesla theater mode
- Configurable links via `config/links.json` (hot-reloadable)
- Cookie-only state (theme, recent, favorites, stats)
- Admin UI to import/export configuration

## Where it lives
Served at **toxic.network/tesla** as part of the main site. Deploy the repo root to Cloudflare Pages; `/tesla` serves this app.

## Quickstart (local)
1. Serve the repo root with any static server (e.g. `npx serve .` from repo root).
2. Visit http://localhost:3000/tesla (or the port your server uses).

To update links, edit `config/links.json`. The frontend polls for changes and reloads the list.

## Files
- `index.html` — app entry
- `css/styles.css`, `js/app.js`, `js/config-loader.js` — UI and config loader
- `config/links.json` — link configuration (edit and commit to change)

## Configuration
Edit `config/links.json` and follow the structure in the example. The client fetches `config/links.json` (relative) and will update automatically.

Example structure:

```json
{
  "categories": [
    {
      "name": "Streaming",
      "services": [
        {"name":"Netflix","url":"https://www.netflix.com","icon":"https://.../netflix.png","description":"Movies & TV"}
      ]
    }
  ]
}
```

## Security & notes
- Cookies are used exclusively for preferences and stats. No localStorage/sessionStorage.
- Serve over HTTPS (Cloudflare Pages does this).
- The admin UI runs client-side; saving exports a JSON file. To persist changes, update `config/links.json` in the repo and redeploy.

## How the fullscreen trick works
Clicking any link navigates to `https://www.youtube.com/redirect?q=[TARGET_URL]` which in Tesla's browser triggers the theater/fullscreen prompt. The user then clicks "Go to site" in Tesla's UI to open the target site fullscreen.

## Troubleshooting
- If links do not open fullscreen on Tesla, the Tesla browser or YouTube may have changed behavior.
- Ensure the site is publicly reachable by the Tesla (not a private 192.168.x.x address).
