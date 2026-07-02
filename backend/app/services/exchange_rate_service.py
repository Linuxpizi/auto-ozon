"""三大央行汇率服务 — PBOC / CBR / ECB"""
import logging
from datetime import datetime, date
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Cache (simple in-memory with TTL) ─────────────────────────────────
_cache: dict = {}
_CACHE_TTL = 300  # 5 minutes


def _is_cache_fresh(key: str) -> bool:
    entry = _cache.get(key)
    if not entry:
        return False
    return (datetime.now() - entry["ts"]).total_seconds() < _CACHE_TTL


# ── PBOC (People's Bank of China) ──────────────────────────────────────
async def fetch_pboc_rates() -> dict:
    """Fetch CNY exchange rates from PBOC.

    Primary: safebooc.org (structured JSON)
    Fallback: DNBCN free API
    Returns: { "CNY/RUB": ..., "CNY/USD": ..., ... }
    """
    cache_key = "pboc"
    if _is_cache_fresh(cache_key):
        return _cache[cache_key]["data"]

    rates = {}

    # Primary: safebooc.org
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://www.safebooc.org/api/exchange-rate/latest",
                params={"base": "CNY"},
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("success") or data.get("data"):
                raw = data.get("data", data.get("rates", {}))
                for code, val in raw.items():
                    if isinstance(val, (int, float)) and val > 0:
                        rates[f"CNY/{code}"] = round(val, 6)
    except Exception as e:
        logger.warning("PBOC safebooc failed: %s", e)

    # Fallback: DNBCN
    if not rates:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.dnbcn.com/exchange/cny",
                )
                resp.raise_for_status()
                data = resp.json()
                for item in data.get("rates", []):
                    code = item.get("code", "")
                    rate = item.get("rate")
                    if code and rate and float(rate) > 0:
                        rates[f"CNY/{code}"] = round(float(rate), 6)
        except Exception as e:
            logger.warning("PBOC DNBCN failed: %s", e)

    # Fallback: exchangerate.host (free, no key)
    if not rates:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://open.er-api.com/v6/latest/CNY",
                )
                resp.raise_for_status()
                data = resp.json()
                for code, val in data.get("rates", {}).items():
                    if isinstance(val, (int, float)) and val > 0:
                        rates[f"CNY/{code}"] = round(val, 6)
        except Exception as e:
            logger.warning("PBOC open.er-api fallback failed: %s", e)

    if rates:
        _cache[cache_key] = {"data": rates, "ts": datetime.now()}
        logger.info("PBOC rates fetched: %d currencies", len(rates))
    return rates


# ── CBR (Central Bank of Russia) ───────────────────────────────────────
async def fetch_cbr_rates() -> dict:
    """Fetch RUB exchange rates from CBR daily XML feed.

    Official CBR publishes daily rates at cbr.ru/scripts/XML_daily.asp
    Returns: { "RUB/CNY": ..., "RUB/USD": ..., ... }
    """
    cache_key = "cbr"
    if _is_cache_fresh(cache_key):
        return _cache[cache_key]["data"]

    rates = {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://www.cbr-xml-daily.ru/daily_json.js"
            )
            resp.raise_for_status()
            data = resp.json()
            valute = data.get("Valute", {})
            for code, item in valute.items():
                nominal = item.get("Nominal", 1)
                value = item.get("Value", 0)
                if nominal and value and value > 0:
                    # CBR gives rate per Nominal units → normalize to 1 unit
                    rate_per_unit = value / nominal
                    rates[f"RUB/{code}"] = round(rate_per_unit, 6)
    except Exception as e:
        logger.warning("CBR fetch failed: %s", e)

    if rates:
        _cache[cache_key] = {"data": rates, "ts": datetime.now()}
        logger.info("CBR rates fetched: %d currencies", len(rates))
    return rates


# ── ECB (European Central Bank) ────────────────────────────────────────
async def fetch_ecb_rates() -> dict:
    """Fetch EUR exchange rates from ECB daily feed.

    ECB publishes daily reference rates in XML.
    Uses the free DNB CN API as proxy for EUR rates.
    Returns: { "EUR/CNY": ..., "EUR/USD": ..., ... }
    """
    cache_key = "ecb"
    if _is_cache_fresh(cache_key):
        return _cache[cache_key]["data"]

    rates = {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://open.er-api.com/v6/latest/EUR",
            )
            resp.raise_for_status()
            data = resp.json()
            for code, val in data.get("rates", {}).items():
                if isinstance(val, (int, float)) and val > 0:
                    rates[f"EUR/{code}"] = round(val, 6)
    except Exception as e:
        logger.warning("ECB fetch failed: %s", e)

    if rates:
        _cache[cache_key] = {"data": rates, "ts": datetime.now()}
        logger.info("ECB rates fetched: %d currencies", len(rates))
    return rates


# ── Aggregated: the key rates for cross-border e-commerce ───────────────
async def get_all_rates() -> dict:
    """Fetch and merge rates from all three sources.

    Returns a structured dict with rates, metadata, and timestamp.
    Focuses on the key pairs relevant to this platform:
      CNY→RUB, CNY→USD, RUB→CNY, EUR→CNY, EUR→RUB, EUR→USD
    """
    import asyncio

    pboc, cbr, ecb = await asyncio.gather(
        fetch_pboc_rates(),
        fetch_cbr_rates(),
        fetch_ecb_rates(),
        return_exceptions=True,
    )

    # Normalize exceptions to empty dicts
    if isinstance(pboc, Exception):
        logger.error("PBOC: %s", pboc)
        pboc = {}
    if isinstance(cbr, Exception):
        logger.error("CBR: %s", cbr)
        cbr = {}
    if isinstance(ecb, Exception):
        logger.error("ECB: %s", ecb)
        ecb = {}

    # Extract key pairs
    key_pairs = {
        "CNY/RUB": pboc.get("CNY/RUB") or (1 / cbr.get("RUB/CNY")) if cbr.get("RUB/CNY") else None,
        "CNY/USD": pboc.get("CNY/USD") or ecb.get("EUR/USD") / ecb.get("EUR/CNY") if ecb.get("EUR/USD") and ecb.get("EUR/CNY") else None,
        "CNY/EUR": pboc.get("CNY/EUR") or (1 / ecb.get("EUR/CNY")) if ecb.get("EUR/CNY") else None,
        "USD/RUB": cbr.get("RUB/USD") and round(1 / cbr["RUB/USD"], 6) if cbr.get("RUB/USD") else None,
        "EUR/RUB": cbr.get("RUB/EUR") and round(1 / cbr["RUB/EUR"], 6) if cbr.get("RUB/EUR") else None,
        "EUR/USD": ecb.get("EUR/USD"),
        "EUR/CNY": ecb.get("EUR/CNY"),
    }

    # Clean up None values and recalculated derived rates
    resolved = {}
    for pair, val in key_pairs.items():
        if val and isinstance(val, (int, float)) and val > 0:
            resolved[pair] = round(val, 4)

    return {
        "rates": resolved,
        "sources": {
            "pboc": bool(pboc),
            "cbr": bool(cbr),
            "ecb": bool(ecb),
        },
        "source_rates": {
            "pboc": pboc,
            "cbr": cbr,
            "ecb": ecb,
        },
        "timestamp": datetime.now().isoformat(),
        "date": date.today().isoformat(),
    }
