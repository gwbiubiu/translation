from functools import wraps

from flask import Blueprint, jsonify, request, session

from .config import config

auth_bp = Blueprint("auth", __name__)


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


@auth_bp.route("/admin/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    username = body.get("username", "")
    password = body.get("password", "")

    if username == config.admin.username and password == config.admin.password:
        session["is_admin"] = True
        session["admin_user"] = username
        return jsonify({"ok": True})

    return jsonify({"error": "用户名或密码错误"}), 401


@auth_bp.route("/admin/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@auth_bp.route("/admin/me")
def me():
    if session.get("is_admin"):
        return jsonify({"username": session.get("admin_user"), "is_admin": True})
    return jsonify({"error": "unauthorized"}), 401
