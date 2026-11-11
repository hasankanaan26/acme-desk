# ============================================================
# Router: /login and /ui — the two pages
# ============================================================
#   /login   email + password, nothing else on the page
#   /ui      the workbench: Ask, Search, Documents, and for tenant
#            admins Sync, People, Document access, Audit
#
# The pages themselves are public (they are just HTML). Everything
# they show comes from the API, which checks the session on every
# call: a page with no session gets 401s and sends you to /login.
#
# TEACHING POINT:
#   This is NOT a frontend course. Plain HTML, vanilla JS
#   (static/app.js), one CSS file. The security lives in the API.
# ============================================================

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import AUTO_SIGNIN_EMAIL

router = APIRouter(tags=["UI"])
STATIC = Path(__file__).parent.parent / "static"


@router.get("/login", response_class=HTMLResponse, include_in_schema=False)
def login_page():
    if AUTO_SIGNIN_EMAIL:  # sign-in switched off: straight to the app
        return RedirectResponse("/ui", status_code=303)
    return HTMLResponse((STATIC / "login.html").read_text(encoding="utf-8"))


@router.get("/ui", response_class=HTMLResponse, include_in_schema=False)
def app_page():
    return HTMLResponse((STATIC / "app.html").read_text(encoding="utf-8"))
