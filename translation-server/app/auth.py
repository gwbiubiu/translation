import json
import secrets
import urllib.parse
import urllib.request

from flask import Blueprint, redirect, request, session, url_for

from .config import config
from .database import get_or_create_user, is_available
from .user import set_token_cookie

auth_bp = Blueprint("auth", __name__)


def _frontend(path: str) -> str:
    base = config.frontend_url.rstrip("/")
    return f"{base}{path}" if base else path


_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USER_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


@auth_bp.route("/auth/google")
def google_login():
    if not is_available():
        return redirect(_frontend("/login"))
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
        return redirect("/login")

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
    except Exception:
        return redirect("/login")

    access_token = token_data.get("access_token")
    if not access_token:
        return redirect("/login")

    user_req = urllib.request.Request(
        _GOOGLE_USER_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        user_info = json.loads(urllib.request.urlopen(user_req).read())
    except Exception:
        return redirect("/login")

    google_id = user_info.get("id", "")
    user = get_or_create_user(
        openid=f"google_{google_id}",
        nickname=user_info.get("name", ""),
        avatar_url=user_info.get("picture", ""),
        email=user_info.get("email", "").lower(),
    )

    response = redirect(_frontend("/dashboard"))
    set_token_cookie(response, user["id"])
    return response


@auth_bp.route("/auth/mock-login")
def mock_login():
    if not is_available():
        return redirect(_frontend("/login"))
    if config.google.client_id:
        return redirect(_frontend("/login"))
    user = get_or_create_user(
        openid="mock_user_dev",
        nickname="测试用户",
        avatar_url="",
    )
    response = redirect(_frontend("/dashboard"))
    set_token_cookie(response, user["id"])
    return response


@auth_bp.route("/auth/logout", methods=["POST"])
def logout():
    session.clear()
    response = redirect(_frontend("/login"))
    response.delete_cookie("token", path="/")
    return response
