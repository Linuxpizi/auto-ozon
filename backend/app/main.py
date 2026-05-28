from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import dashboard, order, store
from app.core.db import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="auto-ozon backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(store.router, prefix="/api/stores", tags=["stores"])
app.include_router(order.router, prefix="/api/orders", tags=["orders"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
