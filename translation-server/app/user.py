from datetime import datetime, timezone
from functools import wraps

from flask import Blueprint, jsonify, redirect, session

from .database import get_user_by_id, get_user_stats

user_bp = Blueprint("user", __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            from flask import request as req
            if req.path.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated


@user_bp.route("/api/user/me")
@login_required
def me():
    user = get_user_by_id(session["user_id"])
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
        "membership": membership,
        "membership_expires_at": expires_at.isoformat() if expires_at else None,
    })


@user_bp.route("/api/user/stats")
@login_required
def stats():
    data = get_user_stats(session["user_id"])
    # 将 datetime 转为字符串以便 JSON 序列化
    for item in data["history"]:
        if hasattr(item.get("created_at"), "strftime"):
            item["created_at"] = item["created_at"].strftime("%Y-%m-%d %H:%M")
    return jsonify(data)
