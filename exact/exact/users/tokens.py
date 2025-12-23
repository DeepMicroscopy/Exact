# app/tokens.py
import secrets
import hashlib

def generate_pat() -> tuple[str, str]:
    """
    Returns (token, prefix).
    token: full bearer token string user will copy
    prefix: short identifier for lookup
    """
    prefix = secrets.token_urlsafe(9)[:12]  # 12-ish chars
    secret = secrets.token_urlsafe(32)      # strong entropy
    token = f"pat_{prefix}.{secret}"
    return token, prefix

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()