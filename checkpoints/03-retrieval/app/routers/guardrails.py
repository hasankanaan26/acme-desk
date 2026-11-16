# ============================================================
# Router: /guardrails — NeMo Guardrails input rails (a POC)
# ============================================================
#   GET  /guardrails         the settings, the rails that would run, the NeMo config (key masked)
#   PUT  /guardrails         switch on/off, pick the rails, replace the topic list
#   POST /guardrails/check   run the input rails on one message, even when switched off
#
# Tenant admins only. When guardrails are on, /query and the chat run
# the same check before retrieval (app/guardrails.py).
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app import db, guardrails
from app.auth.deps import client_ip, csrf_guard, require_admin
from app.auth.service import Principal, audit
from app.llm import get_model_name

router = APIRouter(prefix="/guardrails", tags=["Guardrails"], dependencies=[Depends(csrf_guard)])


class GuardrailsUpdate(BaseModel):
    enabled: bool | None = None
    self_check: bool | None = None
    topic_control: bool | None = None
    topics: list[str] | None = Field(default=None, max_length=guardrails.MAX_TOPICS)


class CheckRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[str] = Field(default=[], max_length=10, description="Your earlier questions, oldest first.")


def _view() -> dict:
    settings = guardrails.get_settings()
    return {**settings, "active_rails": guardrails.active_rails(settings), "model": get_model_name(),
            "config_yaml": guardrails.config_yaml(settings)}


@router.get("")
def read_guardrails(_: Principal = Depends(require_admin)):
    return _view()


@router.put("")
def update_guardrails(body: GuardrailsUpdate, request: Request, principal: Principal = Depends(require_admin)):
    before = guardrails.get_settings()
    try:
        after = guardrails.update_settings(**body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    changed = {k: {"before": before[k], "after": after[k]} for k in after if before[k] != after[k]}
    if changed:
        with db.tx("app", principal.tenant_id, principal.user_id):
            audit("admin.guardrails", principal.email, user_id=principal.user_id, target="guardrails",
                  ip=client_ip(request), detail=changed)
    return _view()


@router.post("/check")
def check(body: CheckRequest, _: Principal = Depends(require_admin)):
    """The input rails' verdict on one message, rail by rail, with each rail's raw model reply."""
    return guardrails.check_input(body.message.strip(), history=body.history, force=True)
