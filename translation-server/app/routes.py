from flask import Blueprint, jsonify, request, session

from .database import record_translation
from .logger import get_logger
from .translator import translate

bp = Blueprint("api", __name__)
logger = get_logger(__name__)


@bp.route("/translate", methods=["POST", "OPTIONS"])
def translate_api():
    if request.method == "OPTIONS":
        return "", 204

    body = request.get_json(silent=True, force=True)
    if not body:
        logger.warning("请求体解析失败，Content-Type=%s", request.content_type)
        return jsonify({"error": "invalid JSON body", "translated": "", "from": "", "to": "", "vocab": []}), 400

    text = body.get("text", "").strip()
    if not text:
        return jsonify({"translated": "", "from": "", "to": "", "vocab": []})

    logger.info("收到翻译请求，文本长度=%d", len(text))
    try:
        result = translate(text)
        user_id = session.get("user_id")
        if user_id:
            try:
                record_translation(user_id, text, result.translated, result.from_lang, result.to_lang)
            except Exception:
                pass
        return jsonify(result.to_dict())
    except Exception as e:
        logger.exception("翻译异常: %s", e)
        return jsonify({"error": str(e), "translated": "", "from": "", "to": "", "vocab": []}), 500
