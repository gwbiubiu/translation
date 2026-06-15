import json
import secrets
import urllib.parse
import urllib.request

from flask import Blueprint, redirect, render_template, request, session, url_for

from .config import config
from .database import get_or_create_user, is_available

auth_bp = Blueprint("auth", __name__)

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USER_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


@auth_bp.route("/login")
def login():
    if not is_available():
        return render_template("login.html", has_google=False, db_unavailable=True)
    if session.get("user_id"):
        return redirect("/dashboard")
    has_google = bool(config.google.client_id and config.google.client_secret)
    return render_template("login.html", has_google=has_google, db_unavailable=False)


@auth_bp.route("/auth/google")
def google_login():
    state = secrets.token_urlsafe(16)
    session["oauth_state"] = state
    callback = config.google.redirect_uri or url_for("auth.google_callback", _external=True)
    params = urllib.parse.urlencode({
        "client_id": config.google.client_id,
        "redirect_uri": callback,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
    })
    return redirect(f"{_GOOGLE_AUTH_URL}?{params}")


@auth_bp.route("/auth/google/callback")
def google_callback():
    code = request.args.get("code")
    state = request.args.get("state")

    if not code or state != session.pop("oauth_state", None):
        return render_template("login.html", has_google=True, error="授权失败，请重试"), 400

    # 用 code 换 access_token
    callback = config.google.redirect_uri or url_for("auth.google_callback", _external=True)
    token_body = urllib.parse.urlencode({
        "client_id": config.google.client_id,
        "client_secret": config.google.client_secret,
        "code": code,
        "redirect_uri": callback,
        "grant_type": "authorization_code",
    }).encode()
    token_req = urllib.request.Request(
        _GOOGLE_TOKEN_URL,
        data=token_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        token_data = json.loads(urllib.request.urlopen(token_req).read())
    except Exception as e:
        return render_template("login.html", has_google=True, error=f"获取 Token 失败: {e}"), 400

    access_token = token_data.get("access_token")
    if not access_token:
        return render_template("login.html", has_google=True, error="Token 无效，请重试"), 400

    # 获取用户信息
    user_req = urllib.request.Request(
        _GOOGLE_USER_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        user_info = json.loads(urllib.request.urlopen(user_req).read())
    except Exception as e:
        return render_template("login.html", has_google=True, error=f"获取用户信息失败: {e}"), 400

    google_id = user_info.get("id", "")
    user = get_or_create_user(
        openid=f"google_{google_id}",
        nickname=user_info.get("name", ""),
        avatar_url=user_info.get("picture", ""),
    )
    session["user_id"] = user["id"]
    return redirect("/dashboard")


@auth_bp.route("/auth/mock-login")
def mock_login():
    """仅在未配置 Google 凭证时可用，用于本地测试。"""
    if not is_available():
        return "数据库未连接，无法登录", 503
    if config.google.client_id:
        return "已配置 Google 登录，请使用真实登录", 403
    user = get_or_create_user(
        openid="mock_user_dev",
        nickname="测试用户",
        avatar_url="",
    )
    session["user_id"] = user["id"]
    return redirect("/dashboard")


@auth_bp.route("/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect("/login")
