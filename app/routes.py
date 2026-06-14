from flask import Blueprint, jsonify, render_template, request

from .logger import get_logger
from .translator import translate

bp = Blueprint("api", __name__)
logger = get_logger(__name__)


@bp.route("/")
def index():
    return render_template("index.html")


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
        return jsonify(result.to_dict())
    except Exception as e:
        logger.exception("翻译异常: %s", e)
        return jsonify({"error": str(e), "translated": "", "from": "", "to": "", "vocab": []}), 500
