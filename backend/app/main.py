from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import dashboard, order, store, monitor, listing
from app.core.db import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="auto-ozon backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(store.router, prefix="/api/stores", tags=["stores"])
app.include_router(order.router, prefix="/api/orders", tags=["orders"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(monitor.router, prefix="/api/monitors", tags=["monitors"])
app.include_router(listing.router, prefix="/api/listings", tags=["listings"])
