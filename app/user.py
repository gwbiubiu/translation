from functools import wraps

from flask import Blueprint, jsonify, redirect, render_template, session

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


@user_bp.route("/dashboard")
@login_required
def dashboard():
    user = get_user_by_id(session["user_id"])
    if not user:
        session.clear()
        return redirect("/login")
    stats = get_user_stats(user["id"])
    return render_template("dashboard.html", user=user, stats=stats)


@user_bp.route("/api/user/me")
@login_required
def me():
    user = get_user_by_id(session["user_id"])
    if not user:
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "id": user["id"],
        "nickname": user["nickname"],
        "avatar_url": user["avatar_url"],
        "membership": user["membership"],
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
