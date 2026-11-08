"""Block cross-site form posts to the local API.

A web page can't read this API's responses (CORS), but it could still send a "simple"
request, such as an HTML form posting a file. Every request that changes something must
carry the `X-Apply-Copilot-Client` header. A custom header forces the browser to ask
permission first (a CORS preflight), which only the dashboard and the extension pass.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

CLIENT_HEADER = "X-Apply-Copilot-Client"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class ClientHeaderGuard(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method not in SAFE_METHODS and request.url.path.startswith("/api/") and not request.headers.get(CLIENT_HEADER):
            return JSONResponse(status_code=403, content={"detail": f"Missing the {CLIENT_HEADER} header."})
        return await call_next(request)
