import logging
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.api.routers import dashboard, order, store, monitor, listing, finance, task_config, precision_listing, intelligence, browser_sync, selection, upload, logistics, ozon_card
from app.api.routers import prompt_template, title_optimize, product_optimize, image_prompt, ai_text, ai_image
from app.api.routers import exchange_rate
from app.api.routers import return_order, feishu_config, powerpaint
from app.api.routers import image_edit, image_version
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

# ── Auto-migration: keep SQLite schema aligned with model updates ──────
def _ensure_scraped_product_columns():
    """Add current columns and remove retired product-attribute columns."""
    import sqlite3 as _sqlite3

    from app.core.config import DATABASE_URL

    def _quote_default(value):
        if value is None:
            return ""
        if isinstance(value, bool):
            return f" DEFAULT {1 if value else 0}"
        if isinstance(value, (int, float)):
            return f" DEFAULT {value}"
        if isinstance(value, str):
            escaped = value.replace("'", "''")
            return f" DEFAULT '{escaped}'"
        return ""

    def _column_type(column):
        from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text

        col_type = column.type
        if isinstance(col_type, Integer):
            return "INTEGER"
        if isinstance(col_type, Float):
            return "FLOAT"
        if isinstance(col_type, Boolean):
            return "BOOLEAN"
        if isinstance(col_type, DateTime):
            return "DATETIME"
        if isinstance(col_type, JSON):
            return "TEXT"
        if isinstance(col_type, Text):
            return "TEXT"
        if isinstance(col_type, String):
            length = getattr(col_type, "length", None)
            return f"VARCHAR({length})" if length else "VARCHAR"
        return col_type.compile(dialect=engine.dialect)

    def _column_default(column):
        if column.name in {"id", "created_at", "updated_at"}:
            return ""
        default = column.default
        if default is not None:
            value = default.arg
            if value is list:
                return " DEFAULT '[]'"
            if value is dict:
                return " DEFAULT '{}'"
            if getattr(default, "is_scalar", False):
                return _quote_default(value)
        if column.nullable:
            return ""
        if _column_type(column) == "BOOLEAN":
            return " DEFAULT 0"
        return ""

    db_path = DATABASE_URL.replace("sqlite:///", "")
    try:
        from app.models.scraped_product import ScrapedProductRecord

        conn = _sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(scraped_product_records)")
        existing = {row[1] for row in cur.fetchall()}
        if not existing:
            conn.close()
            return
        for column in ScrapedProductRecord.__table__.columns:
            if column.name in existing:
                continue
            typedef = f"{_column_type(column)}{_column_default(column)}"
            cur.execute(f'ALTER TABLE scraped_product_records ADD COLUMN "{column.name}" {typedef}')
            logger.info("DB migration: added column %s %s", column.name, typedef)
        list_json_columns = ["images", "video_urls", "sku_list", "spec_list", "price_ranges", "matched_suppliers"]
        for column_name in list_json_columns:
            if column_name in existing or column_name in {c.name for c in ScrapedProductRecord.__table__.columns}:
                cur.execute(f"UPDATE scraped_product_records SET {column_name} = '[]' WHERE {column_name} IS NULL")
        if "ozon_metrics" in existing or "ozon_metrics" in {c.name for c in ScrapedProductRecord.__table__.columns}:
            cur.execute("UPDATE scraped_product_records SET ozon_metrics = '{}' WHERE ozon_metrics IS NULL")

        # 商品属性链路已移除；同步清理旧数据库中的持久化字段。
        retired_columns = {
            "scraped_product_records": ("attributes",),
            "upload_drafts": ("attributes",),
            "precision_listing_tasks": ("source_attributes", "translated_attributes"),
        }
        for table_name, column_names in retired_columns.items():
            cur.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
                (table_name,),
            )
            if cur.fetchone() is None:
                continue
            cur.execute(f'PRAGMA table_info("{table_name}")')
            table_columns = {row[1] for row in cur.fetchall()}
            for column_name in column_names:
                if column_name not in table_columns:
                    continue
                cur.execute(f'ALTER TABLE "{table_name}" DROP COLUMN "{column_name}"')
                logger.info("DB migration: dropped retired column %s.%s", table_name, column_name)
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

# Generated/edited images are returned as /static/... URLs by image services.
# Mount the backend static directory explicitly so the frontend can render those
# result images instead of hanging on broken /static paths.
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


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
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(logistics.router, prefix="/api/logistics", tags=["logistics"])
app.include_router(ozon_card.router, prefix="/api", tags=["ozon-card"])

# ── Prompt Engine routes ──────────────────────────────────────────────
app.include_router(title_optimize.router, prefix="/api/v1/title", tags=["prompt-engine"])
app.include_router(product_optimize.router, prefix="/api/v1/product", tags=["prompt-engine"])
app.include_router(image_prompt.router, prefix="/api/v1/image", tags=["prompt-engine"])
app.include_router(prompt_template.router, prefix="/api/v1/prompts", tags=["prompt-templates"])
app.include_router(ai_text.router, prefix="/api/v1/ai", tags=["ai-text"])
app.include_router(ai_image.router, prefix="/api/v1/ai", tags=["ai-image"])

# ── Exchange Rates ────────────────────────────────────────────────────
app.include_router(exchange_rate.router, prefix="/api/v1", tags=["exchange-rates"])
app.include_router(return_order.router, prefix="/api/return-orders", tags=["return-orders"])
app.include_router(feishu_config.router, prefix="/api/feishu", tags=["feishu"])
app.include_router(powerpaint.router, tags=["powerpaint"])  # prefix defined in router

# ── Image Edit routes ──────────────────────────────────────────────────
app.include_router(image_edit.router, prefix="/api/v1/image", tags=["image-edit"])
app.include_router(image_version.router, prefix="/api/v1/image", tags=["image-version"])
