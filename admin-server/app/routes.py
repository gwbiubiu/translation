from flask import Blueprint, jsonify, request

from .auth import admin_required
from .database import (
    get_daily_stats,
    get_overview_stats,
    get_users,
    is_available,
    update_user_membership,
)

api_bp = Blueprint("api", __name__)


@api_bp.route("/admin/api/stats")
@admin_required
def stats():
    if not is_available():
        return jsonify({"error": "数据库不可用"}), 503
    return jsonify({
        "overview": get_overview_stats(),
        "daily": get_daily_stats(14),
    })


@api_bp.route("/admin/api/users")
@admin_required
def users():
    if not is_available():
        return jsonify({"error": "数据库不可用"}), 503
    page = int(request.args.get("page", 1))
    q = request.args.get("q", "").strip()
    return jsonify(get_users(page=page, q=q))


@api_bp.route("/admin/api/users/<int:user_id>", methods=["PATCH"])
@admin_required
def update_user(user_id: int):
    if not is_available():
        return jsonify({"error": "数据库不可用"}), 503
    body = request.get_json(silent=True) or {}
    membership = body.get("membership")
    if not membership:
        return jsonify({"error": "缺少 membership 字段"}), 400
    months = int(body.get("months", 1))
    months = max(1, min(12, months))
    ok = update_user_membership(user_id, membership, months)
    return jsonify({"ok": ok}) if ok else (jsonify({"error": "用户不存在"}), 404)
