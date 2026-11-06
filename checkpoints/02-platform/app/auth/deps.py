# ============================================================
# Route guards — FastAPI dependencies
# ============================================================
#   principal = Depends(get_principal)   signed in, or 401
#   principal = Depends(require_admin)   a tenant admin, or 403
#   dependencies=[Depends(csrf_guard)]   on every route that changes
#                                        something
#
# CSRF, in one paragraph: the browser sends our cookie with ANY
# request to our site, including one a malicious page triggers. Two
# defences, both cheap:
#   - SameSite=Lax on the cookie: a cross-site POST arrives without it.
#   - Every state-changing request must carry the header
#     X-Acme-Request: 1. A plain HTML form cannot set a header, and a
#     cross-site fetch() with one needs a CORS preflight, which this
#     API never approves.
# ============================================================

from fastapi import Depends, HTTPException, Request

from app.auth.service import Principal, principal_for
from app.config import SESSION_COOKIE

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "X-Acme-Request"


def client_ip(request: Request) -> str | None:
    # Behind a reverse proxy this would be the proxy's address; then read
    # X-Forwarded-For, but ONLY from a proxy you trust (uvicorn
    # --forwarded-allow-ips). Never trust it from the open internet.
    return request.client.host if request.client else None


def get_principal(request: Request) -> Principal:
    token = request.cookies.get(SESSION_COOKIE)
    principal = principal_for(token) if token else None
    if principal is None:
        raise HTTPException(status_code=401, detail="Sign in first.")
    request.state.principal = principal
    return principal


def require_admin(principal: Principal = Depends(get_principal)) -> Principal:
    if not principal.is_admin:
        raise HTTPException(status_code=403, detail="Only a tenant admin can do this.")
    return principal


def csrf_guard(request: Request) -> None:
    if request.method in SAFE_METHODS:
        return
    if request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(status_code=403, detail=f"Missing the {CSRF_HEADER} header (CSRF protection).")
