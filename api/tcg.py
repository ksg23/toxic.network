"""TCGTracking Open API client for Pokémon (category 3)."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

BASE_URL = "https://openapi.tcgtracking.com/v1"
POKEMON_CAT = 3
SETS_TTL = 60 * 60  # 1 hour
CARDS_TTL = 60 * 60
PRICING_TTL = 60 * 30


class TcgClient:
    def __init__(self) -> None:
        self._http: httpx.AsyncClient | None = None
        self._sets: list[dict[str, Any]] | None = None
        self._sets_at = 0.0
        self._cards: dict[int, tuple[float, list[dict[str, Any]]]] = {}
        self._pricing: dict[int, tuple[float, dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        self._http = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers={"Accept": "application/json", "User-Agent": "toxic.network-terminal/1.0"},
        )

    async def stop(self) -> None:
        if self._http:
            await self._http.aclose()
            self._http = None

    @property
    def http(self) -> httpx.AsyncClient:
        if not self._http:
            raise RuntimeError("TcgClient not started")
        return self._http

    async def get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        r = await self.http.get(path, params=params)
        r.raise_for_status()
        return r.json()

    async def all_sets(self) -> list[dict[str, Any]]:
        now = time.monotonic()
        if self._sets is not None and now - self._sets_at < SETS_TTL:
            return self._sets
        async with self._lock:
            now = time.monotonic()
            if self._sets is not None and now - self._sets_at < SETS_TTL:
                return self._sets
            data = await self.get_json(f"/{POKEMON_CAT}/sets")
            sets = data.get("sets") or []
            sets.sort(key=lambda s: s.get("published_on") or "", reverse=True)
            self._sets = sets
            self._sets_at = now
            return sets

    async def search_sets(self, query: str, limit: int = 40) -> list[dict[str, Any]]:
        q = query.strip()
        if not q:
            sets = await self.all_sets()
            return sets[:limit]
        data = await self.get_json(f"/{POKEMON_CAT}/search", params={"q": q})
        return (data.get("sets") or [])[:limit]

    async def set_cards(self, set_id: int) -> list[dict[str, Any]]:
        now = time.monotonic()
        cached = self._cards.get(set_id)
        if cached and now - cached[0] < CARDS_TTL:
            return cached[1]
        data = await self.get_json(f"/{POKEMON_CAT}/sets/{set_id}/cards")
        products = data.get("products") or []
        # Attach set context for search results
        set_name = data.get("set_name")
        set_abbr = data.get("set_abbr")
        for p in products:
            p.setdefault("set_id", set_id)
            p.setdefault("set_name", set_name)
            p.setdefault("set_abbr", set_abbr)
        self._cards[set_id] = (now, products)
        return products

    async def set_pricing(self, set_id: int) -> dict[str, Any]:
        now = time.monotonic()
        cached = self._pricing.get(set_id)
        if cached and now - cached[0] < PRICING_TTL:
            return cached[1]
        data = await self.get_json(f"/{POKEMON_CAT}/sets/{set_id}/pricing")
        prices = data.get("prices") or {}
        self._pricing[set_id] = (now, prices)
        return prices

    def _market_price(self, prices: dict[str, Any], product_id: int | str) -> float | None:
        entry = prices.get(str(product_id)) or prices.get(product_id)
        if not entry:
            return None
        tcg = entry.get("tcg") or {}
        best: float | None = None
        for subtype in tcg.values():
            m = subtype.get("market")
            if m is None:
                continue
            try:
                val = float(m)
            except (TypeError, ValueError):
                continue
            if best is None or val < best:
                best = val
        return best

    def _display_name(self, card: dict[str, Any]) -> str:
        name = (card.get("name") or "").strip()
        # "Exeggcute - 001/191" → "Exeggcute"
        if " - " in name:
            left, right = name.rsplit(" - ", 1)
            if "/" in right or right.replace(".", "").isdigit():
                return left.strip()
        return name

    def _matches(self, card: dict[str, Any], query: str) -> bool:
        q = query.casefold()
        hay = " ".join(
            str(card.get(k) or "")
            for k in ("name", "clean_name", "number", "rarity", "set_name", "set_abbr")
        ).casefold()
        return all(tok in hay for tok in q.split())

    async def search_cards(
        self,
        query: str,
        *,
        limit: int = 24,
        with_price: bool = True,
        recent_sets: int = 30,
    ) -> dict[str, Any]:
        q = query.strip()
        if not q:
            return {"query": q, "count": 0, "cards": [], "sets_scanned": 0}

        set_hits = await self.search_sets(q, limit=12)
        all_sets = await self.all_sets()
        recent = all_sets[:recent_sets]

        # Prefer exact set abbr / name hits, then recent sets
        seen: set[int] = set()
        scan_ids: list[int] = []
        for s in set_hits + recent:
            sid = int(s["id"])
            if sid in seen:
                continue
            seen.add(sid)
            scan_ids.append(sid)

        # Cap concurrency so we don't hammer the API
        sem = asyncio.Semaphore(8)

        async def load(sid: int) -> list[dict[str, Any]]:
            async with sem:
                try:
                    return await self.set_cards(sid)
                except httpx.HTTPError:
                    return []

        card_lists = await asyncio.gather(*(load(sid) for sid in scan_ids))
        matches: list[dict[str, Any]] = []
        for cards in card_lists:
            for card in cards:
                if self._matches(card, q):
                    matches.append(card)

        # Prefer name-leading matches, then rarer / numbered singles
        def score(card: dict[str, Any]) -> tuple:
            name = self._display_name(card).casefold()
            qf = q.casefold()
            starts = 0 if name.startswith(qf.split()[0]) else 1
            has_num = 0 if card.get("number") else 1
            return (starts, has_num, name)

        matches.sort(key=score)
        # Dedupe by product id
        deduped: list[dict[str, Any]] = []
        seen_pid: set[int] = set()
        for card in matches:
            pid = int(card["id"])
            if pid in seen_pid:
                continue
            seen_pid.add(pid)
            deduped.append(card)
            if len(deduped) >= limit:
                break

        if with_price and deduped:
            set_ids = {int(c["set_id"]) for c in deduped if c.get("set_id") is not None}

            async def load_price(sid: int) -> tuple[int, dict[str, Any]]:
                async with sem:
                    try:
                        return sid, await self.set_pricing(sid)
                    except httpx.HTTPError:
                        return sid, {}

            price_maps = dict(await asyncio.gather(*(load_price(sid) for sid in set_ids)))
        else:
            price_maps = {}

        out = []
        for card in deduped:
            sid = int(card.get("set_id") or 0)
            market = self._market_price(price_maps.get(sid, {}), card["id"])
            out.append(
                {
                    "id": card["id"],
                    "name": self._display_name(card),
                    "full_name": card.get("name"),
                    "number": card.get("number"),
                    "rarity": card.get("rarity"),
                    "image_url": card.get("image_url"),
                    "tcgplayer_url": card.get("tcgplayer_url"),
                    "set_id": card.get("set_id"),
                    "set_name": card.get("set_name"),
                    "set_abbr": card.get("set_abbr"),
                    "market": market,
                }
            )

        return {
            "query": q,
            "count": len(out),
            "cards": out,
            "sets_scanned": len(scan_ids),
            "set_matches": [
                {
                    "id": s["id"],
                    "name": s.get("name"),
                    "abbreviation": s.get("abbreviation"),
                    "product_count": s.get("product_count"),
                }
                for s in set_hits[:8]
            ],
        }

    async def cards_in_set(
        self,
        set_ref: str,
        query: str = "",
        *,
        limit: int = 60,
        with_price: bool = True,
    ) -> dict[str, Any]:
        sets = await self.all_sets()
        set_obj = None
        ref = set_ref.strip()
        if ref.isdigit():
            sid = int(ref)
            set_obj = next((s for s in sets if int(s["id"]) == sid), None)
        else:
            rf = ref.casefold()
            set_obj = next(
                (
                    s
                    for s in sets
                    if (s.get("abbreviation") or "").casefold() == rf
                    or (s.get("name") or "").casefold() == rf
                ),
                None,
            )
            if not set_obj:
                hits = await self.search_sets(ref, limit=1)
                set_obj = hits[0] if hits else None

        if not set_obj:
            return {"error": f"set not found: {set_ref}", "count": 0, "cards": []}

        sid = int(set_obj["id"])
        cards = await self.set_cards(sid)
        if query.strip():
            cards = [c for c in cards if self._matches(c, query)]

        cards = cards[:limit]
        prices = await self.set_pricing(sid) if with_price and cards else {}

        out = []
        for card in cards:
            out.append(
                {
                    "id": card["id"],
                    "name": self._display_name(card),
                    "full_name": card.get("name"),
                    "number": card.get("number"),
                    "rarity": card.get("rarity"),
                    "image_url": card.get("image_url"),
                    "tcgplayer_url": card.get("tcgplayer_url"),
                    "set_id": sid,
                    "set_name": set_obj.get("name"),
                    "set_abbr": set_obj.get("abbreviation"),
                    "market": self._market_price(prices, card["id"]),
                }
            )

        return {
            "set": {
                "id": sid,
                "name": set_obj.get("name"),
                "abbreviation": set_obj.get("abbreviation"),
                "product_count": set_obj.get("product_count"),
            },
            "query": query.strip(),
            "count": len(out),
            "cards": out,
        }


client = TcgClient()
