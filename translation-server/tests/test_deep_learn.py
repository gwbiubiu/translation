import json
from unittest.mock import MagicMock, patch

import pytest


@patch("app.deep_learn._llm")
def test_deep_learn_returns_expected_keys(mock_llm):
    mock_llm.invoke.return_value.content = json.dumps({
        "vocab_enhancement": [
            {
                "word": "ephemeral",
                "examples": ["The beauty is ephemeral.", "Fame can be ephemeral."],
                "synonyms": ["transient", "fleeting"],
                "root": "希腊语 ephemeros，意为「仅存一天」",
            }
        ],
        "grammar": {
            "structure": "简单句·一般现在时",
            "breakdown": [
                {"text": "The system", "role": "主语"},
                {"text": "processes", "role": "谓语"},
                {"text": "all requests", "role": "宾语"},
            ],
            "note": "这是一个简单句，谓语 processes 为一般现在时。",
        },
    })

    from app.deep_learn import deep_learn

    result = deep_learn("The system processes all requests.", "系统处理所有请求。", "en", "zh")
    assert "vocab_enhancement" in result
    assert "grammar" in result
    assert isinstance(result["vocab_enhancement"], list)
    assert "structure" in result["grammar"]
    assert "breakdown" in result["grammar"]


@patch("app.deep_learn._tts_client")
def test_text_to_speech_returns_bytes(mock_client):
    mock_response = MagicMock()
    mock_response.content = b"fake_audio_bytes"
    mock_client.audio.speech.create.return_value = mock_response

    from app.deep_learn import text_to_speech

    result = text_to_speech("Hello world", "en")
    assert isinstance(result, bytes)
    assert result == b"fake_audio_bytes"
    mock_client.audio.speech.create.assert_called_once_with(
        model="gpt-4o-mini-tts",
        voice="coral",
        input="Hello world",
    )


@patch("app.deep_learn._tts_client")
def test_text_to_speech_uses_alloy_for_chinese(mock_client):
    mock_response = MagicMock()
    mock_response.content = b"fake_audio_bytes"
    mock_client.audio.speech.create.return_value = mock_response

    from app.deep_learn import text_to_speech

    text_to_speech("你好世界", "zh")
    mock_client.audio.speech.create.assert_called_once_with(
        model="gpt-4o-mini-tts",
        voice="alloy",
        input="你好世界",
    )
