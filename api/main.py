"""Pokémon card API for toxic.network Terminal — proxies TCGTracking Open API."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from tcg import client


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await client.start()
    try:
        yield
    finally:
        await client.stop()


app = FastAPI(
    title="toxic.network Pokémon API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:8080",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "https://toxic.network",
        "https://www.toxic.network",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"ok": True, "category": 3, "game": "Pokemon"}


@app.get("/sets")
async def list_sets(
    q: str = Query("", description="Filter sets by name/abbr"),
    limit: int = Query(40, ge=1, le=200),
):
    sets = await client.search_sets(q, limit=limit)
    return {
        "query": q,
        "count": len(sets),
        "sets": [
            {
                "id": s["id"],
                "name": s.get("name"),
                "abbreviation": s.get("abbreviation"),
                "published_on": s.get("published_on"),
                "product_count": s.get("product_count"),
                "set_symbol_url": s.get("set_symbol_url"),
            }
            for s in sets
        ],
    }


@app.get("/search")
async def search_cards(
    q: str = Query(..., min_length=1, description="Card or set query"),
    limit: int = Query(24, ge=1, le=60),
    with_price: bool = True,
):
    return await client.search_cards(q, limit=limit, with_price=with_price)


@app.get("/sets/{set_ref}/cards")
async def cards_in_set(
    set_ref: str,
    q: str = Query("", description="Filter cards in set"),
    limit: int = Query(60, ge=1, le=200),
    with_price: bool = True,
):
    data = await client.cards_in_set(set_ref, q, limit=limit, with_price=with_price)
    if data.get("error"):
        raise HTTPException(status_code=404, detail=data["error"])
    return data
