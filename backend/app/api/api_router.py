"""Collects every route module under the `/api` prefix."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import extension_routes, health_routes, pairing_routes, profile_routes, provider_routes, resume_routes

api_router = APIRouter(prefix="/api")
api_router.include_router(health_routes.router)
api_router.include_router(provider_routes.router)
api_router.include_router(profile_routes.router)
api_router.include_router(resume_routes.router)
api_router.include_router(pairing_routes.router)
api_router.include_router(extension_routes.router)
