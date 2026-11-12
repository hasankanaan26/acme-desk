-- ============================================================
-- 003 — one question an admin may ask across tenants
-- ============================================================
-- A person (users row) is global; a tenant admin is not. Before an
-- admin changes someone's password, name or active flag, which apply
-- in EVERY tenant that person belongs to, the API must know whether
-- the person also belongs to another tenant. Row-Level Security hides
-- other tenants' memberships, correctly.
--
-- SECURITY DEFINER runs this one function with its owner's rights, so
-- it can count past RLS, and it returns only a number: no tenant
-- names, no ids. That is the pattern for a narrow, audited exception
-- to a wall: a function that answers one question, not a hole.
-- ============================================================

CREATE FUNCTION tenants_of_user(target uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$ SELECT count(*)::integer FROM memberships WHERE user_id = target $$;

REVOKE ALL ON FUNCTION tenants_of_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenants_of_user(uuid) TO acme_app;
