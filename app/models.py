from pydantic import BaseModel


class VocabItem(BaseModel):
    word: str
    translation: str


class TranslationOutput(BaseModel):
    translated: str
    source_lang: str
    target_lang: str
    vocab: list[VocabItem]


class TranslationResponse(BaseModel):
    translated: str
    from_lang: str
    to_lang: str
    vocab: list[VocabItem]

    def to_dict(self) -> dict:
        return {
            "translated": self.translated,
            "from": self.from_lang,
            "to": self.to_lang,
            "vocab": [v.model_dump() for v in self.vocab],
        }
