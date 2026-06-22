import json
from datetime import datetime, timezone

from flask import Blueprint, Response, g, jsonify, request
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from openai import OpenAI

from .config import config
from .database import get_user_by_id
from .logger import get_logger
from .translator import _strip_code_block
from .user import login_required

logger = get_logger(__name__)

_llm = ChatOpenAI(
    model=config.ai.model,
    api_key=config.ai.api_key,
    base_url=config.ai.base_url,
)

_tts_client = OpenAI(
    api_key=config.ai.api_key,
    base_url=config.ai.base_url,
)

_DEEP_LEARN_PROMPT = """You are an English learning assistant helping a Chinese speaker understand text.

Given source text, its translation, and language codes, return a JSON with:
1. vocab_enhancement: up to 5 key English words (from English side of the text). For each word:
   - word: the English word
   - examples: array of 2 short natural English example sentences
   - synonyms: array of 2-3 English synonyms
   - root: one sentence in Chinese explaining the word root or etymology

2. grammar: sentence structure analysis of the source text:
   - structure: sentence type in Chinese (e.g. "简单句·一般现在时")
   - breakdown: array of {"text": "...", "role": "..."} where role is Chinese grammatical term
   - note: 1-2 sentences in Chinese about key grammar points

If source text is fewer than 4 words, return empty vocab_enhancement list and a minimal grammar object.

Respond with ONLY valid JSON, no markdown fence:
{
  "vocab_enhancement": [{"word":"...","examples":["...","..."],"synonyms":["...","..."],"root":"..."}],
  "grammar": {"structure":"...","breakdown":[{"text":"...","role":"..."}],"note":"..."}
}"""


def deep_learn(text: str, translated: str, from_lang: str, to_lang: str) -> dict:
    logger.info("深度学习请求 [%s→%s] 文本长度=%d", from_lang, to_lang, len(text))
    user_msg = (
        f"source_text: {text}\n"
        f"translated: {translated}\n"
        f"from_lang: {from_lang}\n"
        f"to_lang: {to_lang}"
    )
    response = _llm.invoke([
        SystemMessage(content=_DEEP_LEARN_PROMPT),
        HumanMessage(content=user_msg),
    ])
    raw = _strip_code_block(response.content)
    logger.debug("深度学习响应: %s", raw[:400])
    return json.loads(raw)


def text_to_speech(text: str, lang: str) -> bytes:
    voice = "coral" if lang == "en" else "alloy"
    logger.info("TTS 请求 lang=%s voice=%s 文本长度=%d", lang, voice, len(text))
    response = _tts_client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice=voice,
        input=text,
    )
    return response.content


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


deep_learn_bp = Blueprint("deep_learn", __name__)


@deep_learn_bp.route("/api/deep-learn", methods=["POST", "OPTIONS"])
@login_required
def deep_learn_api():
    if request.method == "OPTIONS":
        return "", 204

    is_pro, err = _check_pro(g.user_id)
    if not is_pro:
        return err

    body = request.get_json(silent=True) or {}
    text = body.get("text", "").strip()
    translated = body.get("translated", "").strip()
    from_lang = body.get("from", "")
    to_lang = body.get("to", "")

    if not text or not translated:
        return jsonify({"error": "缺少参数"}), 400

    try:
        result = deep_learn(text, translated, from_lang, to_lang)
        return jsonify(result)
    except Exception as e:
        logger.exception("深度学习异常: %s", e)
        return jsonify({"error": str(e)}), 500


@deep_learn_bp.route("/api/tts", methods=["POST", "OPTIONS"])
@login_required
def tts_api():
    if request.method == "OPTIONS":
        return "", 204

    is_pro, err = _check_pro(g.user_id)
    if not is_pro:
        return err

    body = request.get_json(silent=True) or {}
    text = body.get("text", "").strip()
    lang = body.get("lang", "en")

    if not text:
        return jsonify({"error": "缺少参数"}), 400

    try:
        audio_bytes = text_to_speech(text, lang)
        return Response(audio_bytes, mimetype="audio/mpeg")
    except Exception as e:
        logger.exception("TTS 异常: %s", e)
        return jsonify({"error": str(e)}), 500
