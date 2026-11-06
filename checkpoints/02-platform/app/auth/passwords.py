# ============================================================
# Passwords — argon2id, and nothing clever
# ============================================================
# A password is never stored. Its argon2id hash is: slow on purpose
# (about 50 ms here) and memory-hard, so a stolen users table costs an
# attacker years instead of minutes. The hash string carries its own
# salt and parameters, so raising the cost later only needs
# needs_rehash() at the next sign-in.
#
# verify() spends the same time whether or not the account exists
# (DUMMY_HASH), so the response time does not tell an attacker which
# emails have accounts.
# ============================================================

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import PASSWORD_MIN_LENGTH

_hasher = PasswordHasher()  # argon2id with the library's current recommended parameters
DUMMY_HASH = _hasher.hash("a password nobody has; only here to spend the same time")


def hash_password(password: str) -> str:
    problem = password_problem(password)
    if problem:
        raise ValueError(problem)
    return _hasher.hash(password)


def verify(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# Purpose:
# The one rule that matters (NIST SP 800-63B): long enough. No forced
# symbols, no forced rotation; those make passwords worse, not better.
def password_problem(password: str) -> str | None:
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"A password needs at least {PASSWORD_MIN_LENGTH} characters."
    if len(password) > 256:
        return "A password can have at most 256 characters."
    return None
