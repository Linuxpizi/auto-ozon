import logging
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routers import dashboard, order, store, monitor, listing, finance, task_config, precision_listing, intelligence
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with scheduler_lifespan(app):
        yield


app = FastAPI(title="auto-ozon backend", lifespan=lifespan)


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
