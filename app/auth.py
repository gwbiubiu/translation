import json
import secrets
import urllib.parse
import urllib.request

from flask import Blueprint, redirect, render_template, request, session, url_for

from .config import config
from .database import get_or_create_user, is_available

auth_bp = Blueprint("auth", __name__)

_WECHAT_QR_URL = "https://open.weixin.qq.com/connect/qrconnect"
_WECHAT_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token"
_WECHAT_USER_URL = "https://api.weixin.qq.com/sns/userinfo"


@auth_bp.route("/login")
def login():
    if not is_available():
        return render_template("login.html", has_wechat=False, db_unavailable=True)
    if session.get("user_id"):
        return redirect("/dashboard")
    has_wechat = bool(config.wechat.app_id and config.wechat.app_secret)
    return render_template("login.html", has_wechat=has_wechat, db_unavailable=False)


@auth_bp.route("/auth/wechat")
def wechat_login():
    state = secrets.token_urlsafe(16)
    session["oauth_state"] = state
    callback = url_for("auth.wechat_callback", _external=True)
    params = urllib.parse.urlencode({
        "appid": config.wechat.app_id,
        "redirect_uri": callback,
        "response_type": "code",
        "scope": "snsapi_login",
        "state": state,
    })
    return redirect(f"{_WECHAT_QR_URL}?{params}#wechat_redirect")


@auth_bp.route("/auth/wechat/callback")
def wechat_callback():
    code = request.args.get("code")
    state = request.args.get("state")

    if not code or state != session.pop("oauth_state", None):
        return render_template("login.html", has_wechat=True, error="授权失败，请重试"), 400

    # 用 code 换 access_token
    token_qs = urllib.parse.urlencode({
        "appid": config.wechat.app_id,
        "secret": config.wechat.app_secret,
        "code": code,
        "grant_type": "authorization_code",
    })
    token_data = json.loads(
        urllib.request.urlopen(f"{_WECHAT_TOKEN_URL}?{token_qs}").read()
    )
    if "errcode" in token_data:
        return render_template("login.html", has_wechat=True,
                               error=f"微信错误: {token_data.get('errmsg')}"), 400

    access_token = token_data["access_token"]
    openid = token_data["openid"]

    # 获取用户信息
    user_qs = urllib.parse.urlencode({
        "access_token": access_token,
        "openid": openid,
        "lang": "zh_CN",
    })
    user_info = json.loads(
        urllib.request.urlopen(f"{_WECHAT_USER_URL}?{user_qs}").read()
    )

    user = get_or_create_user(
        openid=openid,
        nickname=user_info.get("nickname", ""),
        avatar_url=user_info.get("headimgurl", ""),
    )
    session["user_id"] = user["id"]
    return redirect("/dashboard")


@auth_bp.route("/auth/mock-login")
def mock_login():
    """仅在未配置微信凭证时可用，用于本地测试。"""
    if not is_available():
        return "数据库未连接，无法登录", 503
    if config.wechat.app_id:
        return "已配置微信登录，请使用真实登录", 403
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
