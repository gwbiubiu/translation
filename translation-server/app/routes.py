from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from .database import get_user_by_id, record_translation
from .logger import get_logger
from .translator import calibrate, explain, translate
from .user import login_required

bp = Blueprint("api", __name__)
logger = get_logger(__name__)


@bp.route("/translate", methods=["POST", "OPTIONS"])
def translate_api():
    if request.method == "OPTIONS":
        return "", 204

    body = request.get_json(silent=True, force=True)
    if not body:
        return jsonify({"error": "invalid JSON body", "translated": "", "from": "", "to": "", "vocab": []}), 400

    text = body.get("text", "").strip()
    if not text:
        return jsonify({"translated": "", "from": "", "to": "", "vocab": []})

    logger.info("收到翻译请求，文本长度=%d", len(text))
    try:
        result = translate(text)
        user_id = getattr(g, "user_id", None)
        if user_id:
            try:
                record_translation(user_id, text, result.translated, result.from_lang, result.to_lang)
            except Exception:
                pass
        return jsonify(result.to_dict())
    except Exception as e:
        logger.exception("翻译异常: %s", e)
        return jsonify({"error": str(e), "translated": "", "from": "", "to": "", "vocab": []}), 500


@bp.route("/api/calibrate", methods=["POST", "OPTIONS"])
@login_required
def calibrate_api():
    if request.method == "OPTIONS":
        return "", 204

    # 校验 Pro 会员
    user = get_user_by_id(g.user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404

    membership = user.get("membership", "free")
    expires_at = user.get("membership_expires_at")
    if membership == "pro" and expires_at:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if expires_at <= now:
            membership = "free"

    if membership != "pro":
        return jsonify({"error": "pro_required"}), 403

    body = request.get_json(silent=True) or {}
    text = body.get("text", "").strip()
    translated = body.get("translated", "").strip()
    from_lang = body.get("from", "")
    to_lang = body.get("to", "")

    if not text or not translated:
        return jsonify({"error": "缺少参数"}), 400

    try:
        result = calibrate(text, translated, from_lang, to_lang)
        return jsonify(result)
    except Exception as e:
        logger.exception("校准异常: %s", e)
        return jsonify({"error": str(e)}), 500


def _check_pro(user_id: int):
    """Return (is_pro, error_response). error_response is None if pro."""
    user = get_user_by_id(user_id)
    if not user:
        return False, (jsonify({"error": "用户不存在"}), 404)
    membership = user.get("membership", "free")
    expires_at = user.get("membership_expires_at")
    if membership == "pro" and expires_at:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if expires_at <= now:
            membership = "free"
    if membership != "pro":
        return False, (jsonify({"error": "pro_required"}), 403)
    return True, None


@bp.route("/api/word-explain", methods=["POST", "OPTIONS"])
@login_required
def word_explain_api():
    if request.method == "OPTIONS":
        return "", 204

    is_pro, err = _check_pro(g.user_id)
    if not is_pro:
        return err

    body = request.get_json(silent=True) or {}
    word = body.get("word", "").strip()
    translation = body.get("translation", "").strip()
    sentence = body.get("sentence", "").strip()
    from_lang = body.get("from_lang", "")

    if not word or not sentence:
        return jsonify({"error": "缺少参数"}), 400

    try:
        result = explain(word, translation, sentence, from_lang)
        return jsonify(result)
    except Exception as e:
        logger.exception("解释异常: %s", e)
        return jsonify({"error": str(e)}), 500
