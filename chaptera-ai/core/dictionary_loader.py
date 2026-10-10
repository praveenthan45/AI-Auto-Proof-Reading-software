"""Load American / British English dictionary word lists for spell checking."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from spellchecker import SpellChecker

from core.locale_spelling import LOCALES, SPELLING_PAIRS, VOCABULARY_PAIRS, _preserve_case

DICT_DIR = Path(__file__).resolve().parent.parent / "data" / "dictionaries"

WORD_TOKEN_RE = re.compile(r"\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b")

TECH_WORDS = frozenset({
    "wifi", "wi", "fi", "bluetooth", "ethernet", "internet", "router", "broadband",
    "hotspot", "network", "connection", "usb", "hdmi", "email", "website",
    "webpage", "smartphone", "laptop", "tablet", "charger",
})

VALID_CONTRACTIONS = frozenset({
    "aren't", "can't", "couldn't", "didn't", "doesn't", "don't", "hadn't", "hasn't",
    "haven't", "he'd", "he'll", "he's", "i'd", "i'll", "i'm", "i've", "isn't", "it'll",
    "it's", "let's", "mightn't", "mustn't", "needn't", "shan't", "she'd", "she'll",
    "she's", "shouldn't", "that's", "there's", "they'd", "they'll", "they're", "they've",
    "wasn't", "we'd", "we'll", "we're", "we've", "weren't", "what's", "when's", "where's",
    "who's", "why's", "won't", "wouldn't", "you'd", "you'll", "you're", "you've",
    "ain't", "how's", "here's", "o'clock",
})

MISSING_APOSTROPHE: dict[str, str] = {
    "arent": "aren't",
    "cant": "can't",
    "couldnt": "couldn't",
    "didnt": "didn't",
    "doesnt": "doesn't",
    "dont": "don't",
    "hadnt": "hadn't",
    "hasnt": "hasn't",
    "havent": "haven't",
    "hed": "he'd",
    "hell": "he'll",
    "hes": "he's",
    "id": "I'd",
    "ill": "I'll",
    "im": "I'm",
    "ive": "I've",
    "isnt": "isn't",
    "itll": "it'll",
    "its": "it's",  # only when clearly contraction context — handled carefully
    "lets": "let's",
    "mustnt": "mustn't",
    "neednt": "needn't",
    "shouldnt": "shouldn't",
    "thats": "that's",
    "theres": "there's",
    "theyd": "they'd",
    "theyll": "they'll",
    "theyre": "they're",
    "theyve": "they've",
    "wasnt": "wasn't",
    "wed": "we'd",
    "weve": "we've",
    "werent": "weren't",
    "whats": "what's",
    "wheres": "where's",
    "whos": "who's",
    "wont": "won't",
    "wouldnt": "wouldn't",
    "youd": "you'd",
    "youll": "you'll",
    "youre": "you're",
    "youve": "you've",
}

# Ambiguous keys — only fix when clearly a contraction typo, not valid words
MISSING_APOSTROPHE_SKIP = frozenset({"well", "were", "hell", "id", "its"})


def fix_missing_apostrophe(word: str) -> str | None:
    low = word.lower()
    if low in MISSING_APOSTROPHE_SKIP:
        return None
    fix = MISSING_APOSTROPHE.get(low)
    if not fix:
        return None
    return _preserve_case(word, fix)


def is_valid_word(token: str, spell: SpellChecker, locale: str) -> bool:
    low = token.lower()
    if low in VALID_CONTRACTIONS:
        return True
    if low in spell:
        return True
    if locale != "en-US" and low in _british_supplement():
        return True
    return False


def _read_word_file(name: str) -> set[str]:
    path = DICT_DIR / name
    if not path.is_file():
        return set()
    words: set[str] = set()
    with path.open(encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            w = line.strip().lower()
            if w and (w.isalpha() or ("'" in w and w.replace("'", "").isalpha())):
                words.add(w)
    return words


@lru_cache(maxsize=1)
def _british_supplement() -> frozenset[str]:
    extra = _read_word_file("en_gb_supplement.txt")
    for us, gb in SPELLING_PAIRS:
        extra.add(gb.lower())
        extra.add(us.lower())
    for _, brit in VOCABULARY_PAIRS:
        extra.add(brit.lower())
    return frozenset(extra)


@lru_cache(maxsize=1)
def _master_words() -> frozenset[str]:
    words = _read_word_file("en_words_alpha.txt")
    words |= _read_word_file("contractions.txt")
    words |= {w.lower() for w in VALID_CONTRACTIONS}
    words |= set(TECH_WORDS)
    if not words:
        # Fallback: pyspellchecker default + common manuscript words
        words = set(SpellChecker().word_frequency.words())
    return frozenset(words)


@lru_cache(maxsize=4)
def get_spell_checker(locale: str = "en-US") -> SpellChecker:
    spell = SpellChecker()
    words = set(_master_words())
    words |= {w.lower() for w in VALID_CONTRACTIONS}
    if LOCALES.get(locale, 0) != 0:
        words |= set(_british_supplement())
    spell.word_frequency.load_words(list(words))
    return spell


def dictionary_stats() -> dict[str, int]:
    return {
        "master_words": len(_master_words()),
        "british_supplement": len(_british_supplement()),
        "contractions": len(VALID_CONTRACTIONS),
        "missing_apostrophe_rules": len(MISSING_APOSTROPHE),
    }
