# ============================================================
# /auth — sign in, sign out, who am I, change my password
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.auth.deps import client_ip, csrf_guard, get_principal
from app.auth.service import LoginError, Principal, authenticate, change_password, principal_for, sign_out
from app.config import COOKIE_SECURE, SESSION_COOKIE, SESSION_MAX_HOURS
from app.models import LoginRequest, Me, PasswordChange

router = APIRouter(prefix="/auth", tags=["Sign-in"], dependencies=[Depends(csrf_guard)])


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_MAX_HOURS * 3600, httponly=True,
                        samesite="lax", secure=COOKIE_SECURE, path="/")


@router.post("/login", response_model=Me)
def login(body: LoginRequest, request: Request, response: Response):
    """Check email and password; on success the session cookie is set."""
    try:
        token, principal = authenticate(body.email, body.password, client_ip(request),
                                        request.headers.get("user-agent"))
    except LoginError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)
    _set_cookie(response, token)
    return principal.public()


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        sign_out(token, principal_for(token), client_ip(request))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"signed_out": True}


@router.get("/me", response_model=Me)
def me(principal: Principal = Depends(get_principal)):
    return principal.public()


@router.post("/password")
def password(body: PasswordChange, request: Request, principal: Principal = Depends(get_principal)):
    """Change your own password. Every OTHER session of yours ends."""
    try:
        change_password(principal, request.cookies.get(SESSION_COOKIE), body.current_password,
                        body.new_password, client_ip(request))
    except LoginError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)
    return {"changed": True}
