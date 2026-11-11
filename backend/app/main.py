"""FastAPI application entry point.

Run locally from the `backend/` folder (localhost only, never 0.0.0.0):
    uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.api_router import api_router
from app.core.app_exceptions import register_exception_handlers
from app.core.app_settings import APP_VERSION, get_settings
from app.core.logging_config import configure_logging
from app.db.database_session import init_database
from app.security.client_header_guard import ClientHeaderGuard

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    init_database()
    yield

def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=APP_VERSION, lifespan=lifespan)
    # Order matters: the last one added runs first, so CORS answers preflights before the guard.
    app.add_middleware(ClientHeaderGuard)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        # The extension's pages; its ID differs per install, and the token protects those routes.
        allow_origin_regex=r"^chrome-extension://[a-p]{32}$",
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    register_exception_handlers(app)
    app.include_router(api_router)
    return app

app = create_app()
