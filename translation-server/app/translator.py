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
