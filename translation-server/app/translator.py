import json
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from .config import config
from .logger import get_logger
from .models import TranslationOutput, TranslationResponse, VocabItem

logger = get_logger(__name__)

_SYSTEM_PROMPT = """You are a professional translator specializing in English-Chinese translation.

Given a piece of text, you must:
1. Detect the source language: "zh" (Chinese) or "en" (English)
2. Translate it fully into the other language
3. Extract 5–8 key vocabulary items from the SOURCE text.
   - Skip common stopwords (articles, prepositions, auxiliary verbs, pronouns)
   - For English source: `word` = English term, `translation` = Chinese meaning
   - For Chinese source: `word` = Chinese term, `translation` = English meaning

Respond with ONLY a valid JSON object, no markdown, no extra text:
{
  "translated": "<full translation>",
  "source_lang": "en" or "zh",
  "target_lang": "zh" or "en",
  "vocab": [{"word": "...", "translation": "..."}, ...]
}"""

_llm = ChatOpenAI(
    model=config.ai.model,
    api_key=config.ai.api_key,
    base_url=config.ai.base_url,
)

logger.info("AI 模型: %s  base_url: %s", config.ai.model, config.ai.base_url)


def _strip_code_block(text: str) -> str:
    text = text.strip()
    m = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    return m.group(1).strip() if m else text


_CALIBRATE_PROMPT = """You are a professional translator specializing in English-Chinese translation.

You will be given:
- source_text: the original text
- draft_translation: an existing translation that may be inaccurate or unnatural
- source_lang / target_lang: language codes ("en" or "zh")

Your task: Provide a more accurate, natural, and contextually appropriate translation.
Pay close attention to: idioms, technical jargon, tone, sentence structure, and cultural nuances.

Respond with ONLY a valid JSON object, no markdown, no extra text:
{
  "calibrated": "<improved translation>",
  "note": "<one sentence in Chinese explaining what was improved>"
}"""


def calibrate(text: str, draft: str, from_lang: str, to_lang: str) -> dict:
    logger.info("校准请求 [%s→%s]，文本长度=%d", from_lang, to_lang, len(text))
    user_msg = (
        f"source_text: {text}\n"
        f"draft_translation: {draft}\n"
        f"source_lang: {from_lang}\n"
        f"target_lang: {to_lang}"
    )
    response = _llm.invoke([
        SystemMessage(content=_CALIBRATE_PROMPT),
        HumanMessage(content=user_msg),
    ])
    raw = _strip_code_block(response.content)
    logger.debug("校准响应: %s", raw[:300])
    return json.loads(raw)


_EXPLAIN_PROMPT = """You are a language expert helping learners understand vocabulary in context.

You will receive:
- word: a keyword extracted from the sentence
- translation: its base translation
- sentence: the original sentence where the word appears
- from_lang: the source language ("en" or "zh")

Your task: Write a concise, insightful contextual explanation in Chinese (2-3 sentences) that explains:
1. What this word means specifically in this sentence
2. Any nuances, connotations, or usage patterns worth noting

Respond with ONLY a valid JSON object, no markdown, no extra text:
{"explanation": "<Chinese explanation>"}"""


def explain(word: str, translation: str, sentence: str, from_lang: str) -> dict:
    logger.info("解释请求 word=%s from_lang=%s", word, from_lang)
    user_msg = (
        f"word: {word}\n"
        f"translation: {translation}\n"
        f"sentence: {sentence}\n"
        f"from_lang: {from_lang}"
    )
    response = _llm.invoke([
        SystemMessage(content=_EXPLAIN_PROMPT),
        HumanMessage(content=user_msg),
    ])
    raw = _strip_code_block(response.content)
    logger.debug("解释响应: %s", raw[:300])
    return json.loads(raw)


def translate(text: str) -> TranslationResponse:
    logger.info("翻译请求，文本长度=%d", len(text))
    response = _llm.invoke([
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=text),
    ])
    raw = _strip_code_block(response.content)
    logger.debug("AI 响应: %s", raw[:300])

    output = TranslationOutput(**json.loads(raw))
    logger.info("翻译完成 [%s→%s]  词汇=%d 条", output.source_lang, output.target_lang, len(output.vocab))

    return TranslationResponse(
        translated=output.translated,
        from_lang=output.source_lang,
        to_lang=output.target_lang,
        vocab=output.vocab,
    )
