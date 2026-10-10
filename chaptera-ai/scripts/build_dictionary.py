#!/usr/bin/env python3
"""Download and build American / British English dictionary files for Chaptera."""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_DIR = ROOT / "data" / "dictionaries"
sys.path.insert(0, str(ROOT))

from core.locale_spelling import SPELLING_PAIRS, VOCABULARY_PAIRS  # noqa: E402

SOURCES = {
    "en_words_alpha.txt": "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt",
}


def download(name: str, url: str) -> None:
    dest = DICT_DIR / name
    print(f"Fetching {url} …")
    urllib.request.urlretrieve(url, dest)
    count = sum(1 for _ in dest.open(encoding="utf-8", errors="ignore"))
    print(f"  Saved {dest.name} ({count:,} lines)")


def write_contractions() -> None:
    contractions = [
        "aren't", "can't", "couldn't", "didn't", "doesn't", "don't", "hadn't", "hasn't",
        "haven't", "he'd", "he'll", "he's", "i'd", "i'll", "i'm", "i've", "isn't", "it'll",
        "it's", "let's", "mightn't", "mustn't", "needn't", "shan't", "she'd", "she'll",
        "she's", "shouldn't", "that's", "there's", "they'd", "they'll", "they're", "they've",
        "wasn't", "we'd", "we'll", "we're", "we've", "weren't", "what's", "when's", "where's",
        "who's", "why's", "won't", "wouldn't", "you'd", "you'll", "you're", "you've",
        "ain't", "how's", "here's", "o'clock",
    ]
    path = DICT_DIR / "contractions.txt"
    path.write_text("\n".join(sorted(set(contractions))) + "\n", encoding="utf-8")
    print(f"  Wrote {path.name} ({len(contractions)} contractions)")


def write_british_supplement() -> None:
    words: set[str] = set()
    for us, gb in SPELLING_PAIRS:
        words.add(gb.lower())
        words.add(us.lower())
    for us, gb in VOCABULARY_PAIRS:
        words.add(gb.lower())
        words.add(us.lower())
    british_only = {
        "colour", "centre", "organise", "organised", "organising", "recognise", "realise",
        "defence", "theatre", "metre", "travelled", "travelling", "grey", "judgement",
        "licence", "offence", "neighbour", "flavour", "labour", "humour", "catalogue",
        "dialogue", "fulfil", "cancelled", "modelling", "pyjamas", "analyse", "analysed",
        "behaviour", "favourite", "honour", "programme", "practise", "learnt", "dreamt",
        "jewellery", "mould", "sceptical", "storey", "tyre", "cheque", "plough", "draught",
        "manoeuvre", "artefact", "paediatric", "gynaecology", "oesophagus", "anaemia",
        "haemoglobin", "defence", "offence", "pretence", "licence", "practice", "advice",
    }
    words |= british_only
    path = DICT_DIR / "en_gb_supplement.txt"
    path.write_text("\n".join(sorted(words)) + "\n", encoding="utf-8")
    print(f"  Wrote {path.name} ({len(words):,} words)")


def main() -> None:
    DICT_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        download(name, url)
    write_contractions()
    write_british_supplement()
    print("Dictionary build complete.")


if __name__ == "__main__":
    main()
