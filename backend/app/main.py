import logging
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routers import dashboard, order, store, monitor, listing, finance, task_config, precision_listing, intelligence, browser_sync, selection
from app.api.routers import prompt_template, title_optimize, product_optimize, image_prompt
from app.core.db import engine, Base
from app.services.scheduler_service import lifespan as scheduler_lifespan

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# Silence noisy libraries
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("apscheduler").setLevel(logging.INFO)

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

# ── Auto-migration: ensure columns added after model updates ────────────
def _ensure_scraped_product_columns():
    """Add any columns missing from scraped_product_records (SQLite ALTER TABLE)."""
    import sqlite3 as _sqlite3
    from app.core.config import DATABASE_URL
    db_path = DATABASE_URL.replace("sqlite:///", "")
    try:
        conn = _sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(scraped_product_records)")
        existing = {row[1] for row in cur.fetchall()}
        if not existing:
            conn.close()
            return
        needed = {
            "price_ranges": 'TEXT DEFAULT "[]"',
            "min_order_qty": "INTEGER DEFAULT 0",
            "supplier_url": 'VARCHAR(512) DEFAULT ""',
            "trade_quantity": "INTEGER DEFAULT 0",
            "currency": 'VARCHAR(8) DEFAULT ""',
        }
        for col, typedef in needed.items():
            if col not in existing:
                cur.execute(f"ALTER TABLE scraped_product_records ADD COLUMN {col} {typedef}")
                logger.info("DB migration: added column %s", col)
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning("Auto-migration skipped: %s", e)

_ensure_scraped_product_columns()
# ────────────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with scheduler_lifespan(app):
        yield


app = FastAPI(title="鲸智 AI backend", lifespan=lifespan)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception %s %s: %s\n%s",
        request.method, request.url.path, exc,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"服务器内部错误: {exc}"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(store.router, prefix="/api/stores", tags=["stores"])
app.include_router(order.router, prefix="/api/orders", tags=["orders"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(monitor.router, prefix="/api/monitors", tags=["monitors"])
app.include_router(listing.router, prefix="/api/listings", tags=["listings"])
app.include_router(precision_listing.router, prefix="/api/precision-listing", tags=["precision-listing"])
app.include_router(finance.router, prefix="/api/finances", tags=["finances"])
app.include_router(task_config.router, prefix="/api/task-configs", tags=["task-configs"])
app.include_router(intelligence.router, prefix="/api/intelligence", tags=["intelligence"])
app.include_router(browser_sync.router, prefix="/api/browser-sync", tags=["browser-sync"])
app.include_router(selection.router, prefix="/api/selection", tags=["selection"])

# ── Prompt Engine routes ──────────────────────────────────────────────
app.include_router(title_optimize.router, prefix="/api/v1/title", tags=["prompt-engine"])
app.include_router(product_optimize.router, prefix="/api/v1/product", tags=["prompt-engine"])
app.include_router(image_prompt.router, prefix="/api/v1/image", tags=["prompt-engine"])
app.include_router(prompt_template.router, prefix="/api/v1/prompts", tags=["prompt-templates"])
