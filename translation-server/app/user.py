import time
from datetime import datetime, timezone
from functools import wraps

import jwt
from flask import Blueprint, g, jsonify, redirect, request

from .config import config
from .database import get_user_by_id, get_user_stats

user_bp = Blueprint("user", __name__)

TOKEN_EXPIRY = 7 * 24 * 3600   # 7 天
RENEWAL_THRESHOLD = 24 * 3600  # 剩余不足 1 天时自动续期


def _make_token(user_id: int) -> str:
    now = int(time.time())
    payload = {"sub": user_id, "iat": now, "exp": now + TOKEN_EXPIRY}
    return jwt.encode(payload, config.session_secret, algorithm="HS256")


def _decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, config.session_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def set_token_cookie(response, user_id: int):
    token = _make_token(user_id)
    response.set_cookie(
        "token",
        token,
        httponly=True,
        samesite="Lax",
        secure=False,      # 生产环境 HTTPS 时改为 True
        max_age=TOKEN_EXPIRY,
        path="/",
    )
    return response


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get("token")
        payload = _decode_token(token) if token else None
        if not payload:
            if request.path.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect("/login")

        g.user_id = payload["sub"]
        g.renew_token = (payload["exp"] - int(time.time())) < RENEWAL_THRESHOLD

        return f(*args, **kwargs)
    return decorated


@user_bp.route("/api/user/me")
@login_required
def me():
    user = get_user_by_id(g.user_id)
    if not user:
        return jsonify({"error": "not found"}), 404

    membership = user["membership"]
    expires_at = user.get("membership_expires_at")
    if membership == "pro" and expires_at:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if expires_at <= now:
            membership = "free"

    return jsonify({
        "id": user["id"],
        "nickname": user["nickname"],
        "avatar_url": user["avatar_url"],
        "email": user.get("email", ""),
        "membership": membership,
        "membership_expires_at": expires_at.isoformat() if expires_at else None,
    })


@user_bp.route("/api/user/stats")
@login_required
def stats():
    data = get_user_stats(g.user_id)
    for item in data["history"]:
        if hasattr(item.get("created_at"), "strftime"):
            item["created_at"] = item["created_at"].strftime("%Y-%m-%d %H:%M")
    return jsonify(data)
