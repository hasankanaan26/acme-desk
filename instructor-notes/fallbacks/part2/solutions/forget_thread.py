# Solution: tonight's exercise 2, "forget this conversation".
# Replace forget_thread() in checkpoints/02-platform/app/routers/chat.py
# with this, add `from app import db` and `audit` to its imports, then
# remove the skip mark from test_forget_a_conversation.
#
# The order matters: the checkpoints first, while the thread row still
# exists. Their policy only shows rows whose thread_id is a thread you
# can see, so once the row is gone the checkpoints are invisible to you
# and the DELETE would find nothing.


@router.delete("/threads/{thread_id}", status_code=204)
def forget_thread(thread_id: uuid.UUID, request: Request, principal: Principal = Depends(get_principal)):
    thread = _thread_or_404(principal, thread_id)
    with memory.checkpointer(principal) as saver:
        saver.delete_thread(thread["id"])
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        conn.execute("DELETE FROM chat_threads WHERE id = %s", (thread["id"],))
        audit("chat.forget", principal.email, user_id=principal.user_id, target=thread["id"], ip=client_ip(request))
