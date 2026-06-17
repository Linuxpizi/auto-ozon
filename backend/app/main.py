import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import dashboard, order, store, monitor, listing, finance, task_config
from app.core.db import engine, Base
from app.services.scheduler_service import lifespan as scheduler_lifespan

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with scheduler_lifespan(app):
        yield


app = FastAPI(title="auto-ozon backend", lifespan=lifespan)

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
app.include_router(finance.router, prefix="/api/finances", tags=["finances"])
app.include_router(task_config.router, prefix="/api/task-configs", tags=["task-configs"])
