"""
Chaptera AI — full manuscript analysis engine.
Grammar (LanguageTool API), spelling (pyspellchecker + locale), duplicates, characters, readability.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Any

import requests
import textstat
from spellchecker import SpellChecker

from core.grammar_rules import (
    VERB_FORM_FIXES,
    all_clarity_patterns,
    all_grammar_patterns,
    apply_punctuation_fixes,
)
from core.dictionary_loader import (
    VALID_CONTRACTIONS,
    WORD_TOKEN_RE,
    fix_missing_apostrophe,
    get_spell_checker,
)
from core.locale_spelling import (
    build_locale_map,
    get_locale_word_maps,
    locale_label,
    VOCABULARY_PHRASES,
    LOCALES,
    _preserve_case,
    _preserve_case_phrase,
)

LT_API = "https://api.languagetool.org/v2/check"
LT_TIMEOUT = 5
BULK_CHUNK = 60000
LT_MAX_CHARS = 12000

GRAMMAR_PATTERNS = [
    (r"\btheir\s+is\b", "there is", "Use 'there is' not 'their is'"),
    (r"\btheir\s+are\b", "there are", "Use 'there are' not 'their are'"),
    (r"\byour\s+welcome\b", "you're welcome", "Use you're (you are)"),
    (r"\bits\s+(a|the|very|not|been|going|really|okay|ok)\b", r"it's \1", "Use it's (it is)"),
    (r"\bIts\s+(a|the|very|not|been)\b", r"It's \1", "Use It's at sentence start"),
    (r"\bcould\s+of\b", "could have", "Use 'could have' not 'could of'"),
    (r"\bshould\s+of\b", "should have", "Use 'should have'"),
    (r"\bwould\s+of\b", "would have", "Use 'would have'"),
    (r"\balot\b", "a lot", "'a lot' is two words"),
    (r"\bmore\s+harder\b", "harder", "Avoid double comparative"),
    (r"\bthen\s+(anyone|anything|anybody)\s+else\b", r"than \1 else", "Comparisons use 'than'"),
    (r"\bthan\s+(he|she|they|we|I)\s+(went|goes|go|came|come)\b", r"then \1 \2", "Use 'then' for time sequence"),
    (r"\bto\s+much\b", "too much", "Use 'too' not 'to'"),
    (r"\bto\s+many\b", "too many", "Use 'too' not 'to'"),
    (r"\bto\s+late\b", "too late", "Use 'too' not 'to'"),
    (r"\bpeoples\b", "people", "People is usually plural already"),
    (r"\bchildrens\b", "children's", "Use children's for possession"),
    (r"\bit's\s+own\b", "its own", "Possessive 'its' has no apostrophe"),
    (r"\bharder\s+then\b", "harder than", "Use 'than' for comparisons"),
    (r"\bmore\s+then\b", "more than", "Use 'than' for comparisons"),
    (r"\bless\s+then\b", "less than", "Use 'than' for comparisons"),
    (r"\bbetter\s+then\b", "better than", "Use 'than' for comparisons"),
    (r"\bworse\s+then\b", "worse than", "Use 'than' for comparisons"),
]

CLARITY_PATTERNS = [
    (r"\bin order to\b", "to", "Simplify: use 'to'"),
    (r"\bdue to the fact that\b", "because", "Wordy — use 'because'"),
    (r"\bat this point in time\b", "now", "Wordy — use 'now'"),
    (r"\bvery\s+unique\b", "unique", "'Unique' needs no 'very'"),
    (r"\bpast\s+history\b", "history", "Redundant phrase"),
]

ALL_GRAMMAR_PATTERNS = GRAMMAR_PATTERNS + all_grammar_patterns()
ALL_CLARITY_PATTERNS = CLARITY_PATTERNS + all_clarity_patterns()

SKIP_NAMES = {
    "The", "A", "An", "It", "He", "She", "They", "We", "I", "But", "And", "Or",
    "In", "On", "At", "To", "For", "Of", "As", "Is", "Was", "Are", "Be", "Been",
    "Chapter", "Part", "Page", "Mr", "Mrs", "Ms", "Dr", "If", "When", "While",
    "This", "That", "These", "Those", "Not", "All", "No", "Yes",
}

COMMON_ACRONYMS = {
    "ai", "api", "ceo", "cfo", "cto", "coo", "hr", "it", "llc", "ngo", "pdf",
    "seo", "ui", "uk", "un", "usa", "us", "ux", "wi", "fi", "wifi",
}

PROTECTED_TECH_TERMS = {
    "wifi", "wi-fi", "bluetooth", "ethernet", "internet", "router", "broadband",
    "hotspot", "network", "connection", "usb", "hdmi", "email", "e-mail",
    "website", "webpage", "smartphone", "laptop", "tablet", "charger",
}

COMMON_TYPO_FIXES = {
    "awey": "away",
    "beleive": "believe",
    "beleives": "believes",
    "caling": "calling",
    "confusng": "confusing",
    "definately": "definitely",
    "freind": "friend",
    "freinds": "friends",
    "grammer": "grammar",
    "hte": "the",
    "infron": "in front",
    "infront": "in front",
    "intresting": "interesting",
    "mistak": "mistake",
    "mistaks": "mistakes",
    "recieve": "receive",
    "recieved": "received",
    "sentance": "sentence",
    "sentances": "sentences",
    "seperate": "separate",
    "speling": "spelling",
    "teh": "the",
    "tommorow": "tomorrow",
}


@dataclass
class Issue:
    type: str  # spelling, grammar, clarity, duplicate, character
    start: int
    end: int
    text: str
    message: str
    suggestion: str
    chapter: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ChapteraAnalyzer:
    def __init__(self) -> None:
        pass

    def _apply_locale_spelling(self, text: str, locale: str) -> str:
        locale_map, _ = get_locale_word_maps(locale)
        def repl(m: re.Match) -> str:
            w = m.group(0)
            rep = locale_map.get(w.lower())
            return _preserve_case(w, rep) if rep else w
        text = re.sub(r"\b[\w'-]+\b", repl, text)
        return self._apply_vocab_phrases(text, locale)

    def _apply_vocab_phrases(
        self, text: str, locale: str, preserve: list[tuple[int, int]] | None = None
    ) -> str:
        preserve = preserve or []
        idx = LOCALES.get(locale, 0)
        for us, brit in VOCABULARY_PHRASES:
            if idx == 0:
                wrong, fix = brit, us
            else:
                wrong, fix = us, brit
            if wrong.lower() == fix.lower():
                continue

            def repl(m: re.Match, f=fix) -> str:
                if self._is_preserved(m.start(), m.end(), preserve):
                    return m.group(0)
                return _preserve_case_phrase(m.group(0), f)

            text = re.sub(re.escape(wrong), repl, text, flags=re.IGNORECASE)
        return text

    def spell_check_preview(self, text: str, locale: str = "en-US") -> dict[str, Any]:
        """Spelling-only check on original text — for live red highlights in preview."""
        original = text or ""
        locale_map, vocab_keys = get_locale_word_maps(locale)
        issues: list[Issue] = []
        issues.extend(self._locale_vocab_phrases(original, locale))
        issues.extend(self._locale_spelling(original, locale, locale_map, vocab_keys))
        issues.extend(self._pyspellcheck(original, locale_map, locale))
        issues = [i for i in self._dedupe(issues) if i.type in ("spelling", "vocabulary")]
        issues.sort(key=lambda x: x.start)
        return {
            "text": original,
            "spelling_issues": [i.to_dict() for i in issues],
            "spelling_count": len(issues),
        }

    def analyze(self, text: str, locale: str = "en-US", preserve_original: bool = False, fast: bool = False) -> dict[str, Any]:
        original = text or ""
        text = original if preserve_original else self._apply_locale_spelling(original, locale)
        issues: list[Issue] = []
        locale_map, vocab_keys = get_locale_word_maps(locale)
        check_text = original if preserve_original else text

        issues.extend(self._locale_vocab_phrases(check_text, locale))
        issues.extend(self._locale_spelling(check_text, locale, locale_map, vocab_keys))
        issues.extend(self._verb_form_issues(check_text))
        issues.extend(self._pyspellcheck(check_text, locale_map, locale))
        issues.extend(self._pattern_grammar(check_text, "grammar", ALL_GRAMMAR_PATTERNS))
        issues.extend(self._pattern_grammar(check_text, "clarity", ALL_CLARITY_PATTERNS))
        issues.extend(self._duplicates(check_text))
        if not fast:
            if len(check_text) <= LT_MAX_CHARS:
                issues.extend(self._languagetool(check_text, locale))
            issues.extend(self._long_sentences(check_text))
            issues.extend(self._character_names(check_text))

        issues = self._dedupe(issues)
        issues.sort(key=lambda x: (x.start, x.type))

        words = len(re.findall(r"\b\w+\b", check_text))
        read = self._readability(check_text)
        score = self._accuracy_score(check_text, issues, words)

        chapter_reports = []
        if not fast and len(check_text) < 80000:
            chapters = self._split_chapters(check_text)
            for ch in chapters[:20]:
                ch_issues = [i for i in issues if ch["start"] <= i.start < ch["end"]]
                ch_text = ch["text"]
                chapter_reports.append({
                    "title": ch["title"],
                    "word_count": len(re.findall(r"\b\w+\b", ch_text)),
                    "issue_count": len(ch_issues),
                    "readability": self._readability(ch_text) if len(ch_text) < 15000 else {"score": 0, "grade": "N/A", "words": 0, "sentences": 0},
                    "issues": [i.to_dict() for i in ch_issues[:30]],
                })

        return {
            "text": original if preserve_original else text,
            "locale": locale,
            "locale_label": locale_label(locale),
            "issues": [i.to_dict() for i in issues],
            "issue_count": len(issues),
            "counts": self._count_by_type(issues),
            "readability": read,
            "accuracy": score,
            "chapters": chapter_reports,
            "highlights_html": "",
            "spelling_issues": [
                i.to_dict() for i in issues if i.type in ("spelling", "vocabulary")
            ],
        }

    def analyze_stats(self, text: str, locale: str = "en-US") -> dict[str, Any]:
        """Fast summary stats only — used after chunked analyze/fix."""
        result = self._analyze_lightweight(text, locale)
        result["text"] = text
        return result

    def _split_chunks(self, text: str, limit: int = BULK_CHUNK) -> list[str]:
        if len(text) <= limit:
            return [text]
        parts: list[str] = []
        start = 0
        n = len(text)
        while start < n:
            end = min(start + limit, n)
            if end < n:
                br = text.rfind("\n\n", start, end)
                if br > start + limit // 2:
                    end = br + 2
                else:
                    br = text.rfind("\n", start, end)
                    if br > start + limit // 2:
                        end = br + 1
            parts.append(text[start:end])
            start = end
        return parts

    def analyze_bulk(
        self,
        text: str,
        locale: str = "en-US",
        preserve_original: bool = True,
        fast: bool = True,
    ) -> dict[str, Any]:
        """Analyze large manuscripts in one server pass (no per-chunk HTTP)."""
        chunks = self._split_chunks(text or "")
        merged: list[Issue] = []
        offset = 0
        for chunk in chunks:
            part = self.analyze(chunk, locale, preserve_original=preserve_original, fast=fast)
            for raw in part.get("issues") or []:
                iss = Issue(
                    raw.get("type", "grammar"),
                    raw.get("start", 0) + offset,
                    raw.get("end", 0) + offset,
                    raw.get("text", ""),
                    raw.get("message", ""),
                    raw.get("suggestion", ""),
                )
                merged.append(iss)
            offset += len(chunk)
        merged = self._dedupe(merged)
        merged.sort(key=lambda x: (x.start, x.type))
        words = len(re.findall(r"\b\w+\b", text))
        read = self._readability(text[:20000]) if text else {"score": 0, "grade": "N/A", "words": 0, "sentences": 0}
        score = self._accuracy_score(text, merged, words)
        return {
            "text": text,
            "locale": locale,
            "locale_label": locale_label(locale),
            "issues": [i.to_dict() for i in merged],
            "issue_count": len(merged),
            "counts": self._count_by_type(merged),
            "readability": read,
            "accuracy": score,
            "chapters": [],
            "highlights_html": "",
            "spelling_issues": [
                i.to_dict() for i in merged if i.type in ("spelling", "vocabulary")
            ],
        }

    def apply_fixes_bulk(self, text: str, locale: str = "en-US", fast: bool = True, preserve: list | None = None) -> dict[str, Any]:
        """Fix large manuscripts in one server pass — local rules only (no LanguageTool)."""
        preserve_ranges = self._parse_preserve_ranges(preserve)
        chunks = self._split_chunks(text or "")
        fixed_parts: list[str] = []
        passes = 2 if fast else 3
        offset = 0
        for chunk in chunks:
            chunk_preserve = [
                (max(0, ps - offset), min(len(chunk), pe - offset))
                for ps, pe in preserve_ranges
                if pe > offset and ps < offset + len(chunk)
            ]
            fixed = chunk
            for _ in range(passes):
                updated = self._apply_fixes_pass(
                    fixed, locale, use_languagetool=len(chunk) <= LT_MAX_CHARS, preserve=chunk_preserve
                )
                if updated == fixed:
                    break
                fixed = updated
            fixed_parts.append(fixed)
            offset += len(chunk)
        result_text = "".join(fixed_parts)
        return {
            "text": result_text,
            "fixed": True,
            "locale": locale,
            "locale_label": locale_label(locale),
            "issues": [],
            "issue_count": 0,
            "spelling_issues": [],
            "counts": {},
            "readability": {"score": "—"},
            "accuracy": {"percent": 100, "label": "Fixes applied"},
            "chapters": [],
            "highlights_html": "",
        }

    def _analyze_lightweight(self, text: str, locale: str) -> dict[str, Any]:
        """Fast post-fix summary — local checks only, no LanguageTool."""
        locale_map, vocab_keys = get_locale_word_maps(locale)
        issues: list[Issue] = []
        issues.extend(self._locale_vocab_phrases(text, locale))
        issues.extend(self._locale_spelling(text, locale, locale_map, vocab_keys))
        issues.extend(self._verb_form_issues(text))
        issues.extend(self._pyspellcheck(text, locale_map, locale))
        issues.extend(self._pattern_grammar(text, "grammar", ALL_GRAMMAR_PATTERNS))
        issues.extend(self._pattern_grammar(text, "clarity", ALL_CLARITY_PATTERNS))
        issues.extend(self._duplicates(text))
        issues = self._dedupe(issues)
        words = len(re.findall(r"\b\w+\b", text))
        return {
            "locale": locale,
            "locale_label": locale_label(locale),
            "issues": [i.to_dict() for i in issues],
            "issue_count": len(issues),
            "counts": self._count_by_type(issues),
            "readability": self._readability(text),
            "accuracy": self._accuracy_score(text, issues, words),
            "chapters": [],
            "highlights_html": "",
            "spelling_issues": [
                i.to_dict() for i in issues if i.type in ("spelling", "vocabulary")
            ],
        }

    def _collect_issues(self, text: str, locale: str) -> list[Issue]:
        """Gather all issues on text without modifying it."""
        locale_map, vocab_keys = get_locale_word_maps(locale)
        issues: list[Issue] = []
        issues.extend(self._locale_vocab_phrases(text, locale))
        issues.extend(self._locale_spelling(text, locale, locale_map, vocab_keys))
        issues.extend(self._verb_form_issues(text))
        issues.extend(self._pyspellcheck(text, locale_map, locale))
        issues.extend(self._pattern_grammar(text, "grammar", ALL_GRAMMAR_PATTERNS))
        issues.extend(self._pattern_grammar(text, "clarity", ALL_CLARITY_PATTERNS))
        issues.extend(self._duplicates(text))
        issues.extend(self._languagetool(text, locale))
        return self._dedupe(issues)

    def _lt_replacement_value(self, rep: Any) -> str:
        if isinstance(rep, dict):
            return str(rep.get("value", ""))
        return str(rep)

    def _protected_proper_names(self, text: str) -> set[str]:
        """Names repeated 2+ times (e.g. Karthik) — do not auto-correct."""
        counts: dict[str, int] = {}
        for m in re.finditer(r"\b[A-Z][a-z]{2,}\b", text):
            name = m.group(0)
            if name in SKIP_NAMES:
                continue
            key = name.lower()
            counts[key] = counts.get(key, 0) + 1
        return {k for k, v in counts.items() if v >= 2}

    def _edit_distance(self, a: str, b: str) -> int:
        if len(a) < len(b):
            return self._edit_distance(b, a)
        if not b:
            return len(a)
        prev = list(range(len(b) + 1))
        for i, ca in enumerate(a, 1):
            curr = [i]
            for j, cb in enumerate(b, 1):
                curr.append(min(
                    prev[j] + 1,
                    curr[j - 1] + 1,
                    prev[j - 1] + (0 if ca == cb else 1),
                ))
            prev = curr
        return prev[-1]

    def _common_prefix_len(self, a: str, b: str) -> int:
        count = 0
        for ca, cb in zip(a, b):
            if ca != cb:
                break
            count += 1
        return count

    def _spell_frequency(self, word: str, spell: SpellChecker) -> int:
        return int(getattr(spell.word_frequency, "dictionary", {}).get(word.lower(), 0) or 0)

    def _is_adjacent_transpose(self, a: str, b: str) -> bool:
        if len(a) != len(b):
            return False
        diffs = [i for i, (ca, cb) in enumerate(zip(a, b)) if ca != cb]
        return (
            len(diffs) == 2
            and diffs[1] == diffs[0] + 1
            and a[diffs[0]] == b[diffs[1]]
            and a[diffs[1]] == b[diffs[0]]
        )

    def _safe_spell_candidate(self, low: str, spell: SpellChecker) -> str | None:
        """Pick a conservative dictionary correction for manuscript text."""
        candidates = spell.candidates(low) or set()
        raw = spell.correction(low)
        if raw:
            candidates.add(raw)

        best: tuple[float, str] | None = None
        for cand in candidates:
            cand = (cand or "").lower()
            if not cand or cand == low or not cand.isalpha():
                continue
            if low in {"infront", "infron"} and cand == "infant":
                continue
            dist = self._edit_distance(low, cand)
            max_dist = 1 if len(low) <= 4 else 2
            if dist > max_dist:
                continue
            if len(low) >= 5 and low[0] != cand[0]:
                continue

            prefix = self._common_prefix_len(low, cand)
            freq = self._spell_frequency(cand, spell)
            if freq <= 1 and dist > 1:
                continue
            if len(low) >= 6 and prefix < 2:
                continue

            transpose_bonus = 85 if self._is_adjacent_transpose(low, cand) else 0
            suffix_bonus = 8 if low[-2:] == cand[-2:] else 0
            score = (min(freq, 250000) / 1000) + (prefix * 12) + suffix_bonus + transpose_bonus - (dist * 70)
            if best is None or score > best[0]:
                best = (score, cand)
        return best[1] if best else None

    def _is_likely_proper_noun(self, word: str, spell: SpellChecker) -> bool:
        """Capitalized unknown word — probably a character/place name (Karthik, etc.)."""
        if len(word) < 4 or not word[0].isupper():
            return False
        if word in SKIP_NAMES:
            return False
        low = word.lower()
        if low in VALID_CONTRACTIONS:
            return False
        return low not in spell

    def _should_skip_spell_word(self, word: str) -> bool:
        """Protect acronyms and short initialisms from dictionary typo fixes."""
        if not word or not word.isalpha():
            return True
        low = word.lower()
        if low in COMMON_ACRONYMS or low in PROTECTED_TECH_TERMS:
            return True
        if word.isupper() and 2 <= len(word) <= 8:
            return True
        if sum(1 for ch in word if ch.isupper()) >= 2:
            return True
        return False

    def _protected_inline_ranges(self, text: str) -> list[tuple[int, int]]:
        ranges: list[tuple[int, int]] = []
        for term in PROTECTED_TECH_TERMS:
            pattern = re.compile(rf"(?<![A-Za-z]){re.escape(term)}(?![A-Za-z])", re.IGNORECASE)
            ranges.extend((m.start(), m.end()) for m in pattern.finditer(text))
        return ranges

    def _is_in_protected_inline_range(self, start: int, end: int, ranges: list[tuple[int, int]]) -> bool:
        return any(start >= ps and end <= pe for ps, pe in ranges)

    def _best_spell_fix(
        self,
        word: str,
        locale_map: dict,
        protected: set[str],
        spell: SpellChecker,
    ) -> str | None:
        low = word.lower()
        if self._should_skip_spell_word(word):
            return None
        if low in protected:
            return None
        if low in VALID_CONTRACTIONS:
            return None
        apostrophe = fix_missing_apostrophe(word)
        if apostrophe:
            return apostrophe
        if low in COMMON_TYPO_FIXES:
            return _preserve_case(word, COMMON_TYPO_FIXES[low])
        if low in VERB_FORM_FIXES:
            return _preserve_case(word, VERB_FORM_FIXES[low])
        if low in locale_map:
            return _preserve_case(word, locale_map[low])
        if len(low) < 2:
            return None
        if low in spell:
            return None
        if self._is_likely_proper_noun(word, spell) and low not in locale_map:
            return None
        correction = self._safe_spell_candidate(low, spell)
        if not correction or correction == low:
            return None
        return _preserve_case(word, correction)

    def _apply_missing_apostrophe_fixes(
        self, text: str, preserve: list[tuple[int, int]] | None = None
    ) -> str:
        preserve = preserve or []

        def repl(m: re.Match) -> str:
            if self._is_preserved(m.start(), m.end(), preserve):
                return m.group(0)
            w = m.group(0)
            fixed = fix_missing_apostrophe(w)
            return fixed if fixed else w

        return WORD_TOKEN_RE.sub(repl, text)

    def _apply_verb_form_fixes(
        self, text: str, preserve: list[tuple[int, int]] | None = None
    ) -> str:
        preserve = preserve or []

        def repl(m: re.Match) -> str:
            if self._is_preserved(m.start(), m.end(), preserve):
                return m.group(0)
            w = m.group(0)
            fix = VERB_FORM_FIXES.get(w.lower())
            if fix and fix.lower() != w.lower():
                return _preserve_case(w, fix)
            return w

        return WORD_TOKEN_RE.sub(repl, text)

    def _apply_spell_corrections(
        self, text: str, locale: str, preserve: list[tuple[int, int]] | None = None
    ) -> str:
        """Force-fix unknown words using dictionary + typo map."""
        preserve = preserve or []
        spell = get_spell_checker(locale)
        locale_map = build_locale_map(locale)
        protected = self._protected_proper_names(text)
        protected_inline = self._protected_inline_ranges(text)

        def repl(m: re.Match) -> str:
            if self._is_preserved(m.start(), m.end(), preserve):
                return m.group(0)
            if self._is_in_protected_inline_range(m.start(), m.end(), protected_inline):
                return m.group(0)
            w = m.group(0)
            low = w.lower()
            if low in VALID_CONTRACTIONS:
                return w
            apostrophe = fix_missing_apostrophe(w)
            if apostrophe:
                return apostrophe
            fixed = self._best_spell_fix(w, locale_map, protected, spell)
            return fixed if fixed else w

        return WORD_TOKEN_RE.sub(repl, text)

    @staticmethod
    def _parse_preserve_ranges(items: list | None) -> list[tuple[int, int]]:
        out: list[tuple[int, int]] = []
        for item in items or []:
            try:
                start = int(item.get("start", -1))
                end = int(item.get("end", -1))
            except (AttributeError, TypeError, ValueError):
                continue
            if start >= 0 and end > start:
                out.append((start, end))
        return out

    @staticmethod
    def _is_preserved(start: int, end: int, preserve: list[tuple[int, int]]) -> bool:
        for ps, pe in preserve:
            if start >= ps and end <= pe:
                return True
        return False

    @staticmethod
    def _match_replacement(m: re.Match, fix: str) -> str:
        replacement = m.expand(fix)
        original = m.group(0)
        if original[:1].isupper() and replacement[:1].islower():
            return replacement[:1].upper() + replacement[1:]
        return replacement

    def apply_fixes(self, text: str, locale: str = "en-US", fast: bool = False, preserve: list | None = None) -> dict[str, Any]:
        """Apply spelling, grammar, and clarity fixes — multiple passes until stable."""
        preserve_ranges = self._parse_preserve_ranges(preserve)
        if fast and len(text or "") > 8000:
            return self.apply_fixes_bulk(text, locale, fast=True, preserve=preserve)

        text = text or ""
        max_passes = 2 if fast else 3
        use_lt = len(text) <= LT_MAX_CHARS
        for _ in range(max_passes):
            updated = self._apply_fixes_pass(text, locale, use_languagetool=use_lt, preserve=preserve_ranges)
            if updated == text:
                break
            text = updated

        sample = text[:12000] if len(text) > 12000 else text
        result = self._analyze_lightweight(sample, locale)
        result["fixed"] = True
        result["text"] = text
        return result

    def _apply_fixes_pass(
        self,
        text: str,
        locale: str,
        use_languagetool: bool = True,
        preserve: list[tuple[int, int]] | None = None,
    ) -> str:
        """Single pass of all fix rules."""
        preserve = preserve or []
        locale_map, _ = get_locale_word_maps(locale)

        def repl_locale(m: re.Match) -> str:
            if self._is_preserved(m.start(), m.end(), preserve):
                return m.group(0)
            w = m.group(0)
            rep = locale_map.get(w.lower())
            return _preserve_case(w, rep) if rep else w

        text = re.sub(r"\b[\w'-]+\b", repl_locale, text)
        text = self._apply_vocab_phrases(text, locale, preserve=preserve)
        text = self._apply_missing_apostrophe_fixes(text, preserve=preserve)
        text = self._apply_verb_form_fixes(text, preserve=preserve)
        text = self._apply_spell_corrections(text, locale, preserve=preserve)
        text = apply_punctuation_fixes(text)

        for pattern, fix, _ in ALL_GRAMMAR_PATTERNS + ALL_CLARITY_PATTERNS:
            def repl_grammar(m: re.Match, fix=fix) -> str:
                if self._is_preserved(m.start(), m.end(), preserve):
                    return m.group(0)
                return self._match_replacement(m, fix)

            text = re.sub(pattern, repl_grammar, text, flags=re.IGNORECASE)

        def repl_dup(m: re.Match) -> str:
            if self._is_preserved(m.start(), m.end(), preserve):
                return m.group(0)
            return m.group(1)

        text = re.sub(r"\b(\w+)\s+\1\b", repl_dup, text, flags=re.IGNORECASE)

        if use_languagetool and len(text) <= LT_MAX_CHARS:
            lt_issues = self._languagetool_raw(text, locale)
            for item in sorted(lt_issues, key=lambda x: -x.get("offset", 0), reverse=True):
                if self._lt_should_skip(item):
                    continue
                off = item.get("offset", 0)
                ln = item.get("length", 0)
                if self._is_preserved(off, off + ln, preserve):
                    continue
                reps = item.get("replacements") or []
                if not reps or off + ln > len(text) or ln > 80:
                    continue
                fix_val = self._lt_replacement_value(reps[0])
                if fix_val and fix_val.strip():
                    text = text[:off] + fix_val + text[off + ln :]
        return text

    def _verb_form_issues(self, text: str) -> list[Issue]:
        out: list[Issue] = []
        for m in WORD_TOKEN_RE.finditer(text):
            w = m.group(0)
            fix = VERB_FORM_FIXES.get(w.lower())
            if fix and fix.lower() != w.lower():
                out.append(Issue(
                    "grammar",
                    m.start(),
                    m.end(),
                    w,
                    f"Grammar: use '{fix}' instead of '{w}'",
                    _preserve_case(w, fix),
                ))
        return out

    def _locale_vocab_phrases(self, text: str, locale: str) -> list[Issue]:
        idx = LOCALES.get(locale, 0)
        out: list[Issue] = []
        for us, brit in VOCABULARY_PHRASES:
            if idx == 0:
                wrong, fix = brit, us
            else:
                wrong, fix = us, brit
            if wrong.lower() == fix.lower():
                continue
            for m in re.finditer(re.escape(wrong), text, flags=re.IGNORECASE):
                replacement = _preserve_case_phrase(m.group(0), fix)
                if replacement.lower() != m.group(0).lower():
                    out.append(Issue(
                        "vocabulary",
                        m.start(),
                        m.end(),
                        m.group(0),
                        f"Vocabulary ({locale_label(locale)}): '{m.group(0)}' → '{replacement}'",
                        replacement,
                    ))
        return out

    def _locale_spelling(
        self,
        text: str,
        locale: str,
        locale_map: dict,
        vocab_keys: set[str] | None = None,
    ) -> list[Issue]:
        vocab_keys = vocab_keys or set()
        out = []
        protected_inline = self._protected_inline_ranges(text)
        for m in re.finditer(r"\b[\w'-]+\b", text):
            if self._is_in_protected_inline_range(m.start(), m.end(), protected_inline):
                continue
            word = m.group(0)
            low = word.lower()
            if low in locale_map and low != locale_map[low].lower():
                fix = _preserve_case(word, locale_map[low])
                if fix != word:
                    if low in vocab_keys:
                        msg = f"Vocabulary ({locale_label(locale)}): '{word}' → '{fix}'"
                        itype = "vocabulary"
                    else:
                        msg = f"Spelling ({locale_label(locale)}): '{word}' → '{fix}'"
                        itype = "spelling"
                    out.append(Issue(itype, m.start(), m.end(), word, msg, fix))
        return out

    def _pyspellcheck(self, text: str, locale_map: dict, locale: str) -> list[Issue]:
        spell = get_spell_checker(locale)
        out = []
        protected = self._protected_proper_names(text)
        protected_inline = self._protected_inline_ranges(text)
        matches = list(WORD_TOKEN_RE.finditer(text))
        if not matches:
            return out

        unknown_low: set[str] = set()
        for m in matches:
            word = m.group(0)
            low = word.lower()
            if self._is_in_protected_inline_range(m.start(), m.end(), protected_inline):
                continue
            if self._should_skip_spell_word(word):
                continue
            if low in VALID_CONTRACTIONS:
                continue
            if low in protected:
                continue
            if self._is_likely_proper_noun(word, spell) and low not in locale_map:
                continue
            if low in locale_map and low != locale_map[low].lower():
                continue
            if fix_missing_apostrophe(word):
                continue
            if low in VERB_FORM_FIXES:
                continue
            if low not in spell:
                unknown_low.add(low)

        correction_cache: dict[str, str | None] = {}
        for low in unknown_low:
            correction_cache[low] = self._safe_spell_candidate(low, spell)

        for m in matches:
            word = m.group(0)
            low = word.lower()
            if self._is_in_protected_inline_range(m.start(), m.end(), protected_inline):
                continue
            if self._should_skip_spell_word(word):
                continue
            if low in VALID_CONTRACTIONS:
                continue
            if low in protected:
                continue
            if self._is_likely_proper_noun(word, spell) and low not in locale_map:
                continue
            if low in locale_map and low != locale_map[low].lower():
                fix = _preserve_case(word, locale_map[low])
                out.append(Issue(
                    "spelling", m.start(), m.end(), word,
                    f"Spelling: '{word}' → '{fix}'",
                    fix,
                ))
                continue
            apostrophe = fix_missing_apostrophe(word)
            if apostrophe and apostrophe.lower() != low:
                out.append(Issue(
                    "spelling", m.start(), m.end(), word,
                    f"Spelling: '{word}' → '{apostrophe}'",
                    apostrophe,
                ))
                continue
            fix_word = self._best_spell_fix(word, locale_map, protected, spell)
            if not fix_word and low in correction_cache:
                corr = correction_cache[low]
                if corr and corr != low:
                    fix_word = _preserve_case(word, corr)
            if fix_word and fix_word.lower() != low:
                out.append(Issue(
                    "spelling", m.start(), m.end(), word,
                    f"Spelling: '{word}' → '{fix_word}'",
                    fix_word,
                ))
        return out

    def _pattern_grammar(self, text: str, itype: str, patterns: list) -> list[Issue]:
        out = []
        claimed: list[tuple[int, int]] = []
        for pattern, fix, msg in patterns:
            for m in re.finditer(pattern, text, re.IGNORECASE):
                if any(m.start() < end and m.end() > start for start, end in claimed):
                    continue
                suggestion = self._match_replacement(m, fix)
                out.append(Issue(itype, m.start(), m.end(), m.group(0), msg, suggestion))
                claimed.append((m.start(), m.end()))
        return out

    def _duplicates(self, text: str) -> list[Issue]:
        out = []
        for m in re.finditer(r"\b(\w+)\s+\1\b", text, re.IGNORECASE):
            out.append(Issue(
                "duplicate", m.start(), m.end(), m.group(0),
                f"Repeated word '{m.group(1)}'",
                m.group(1),
            ))
        return out

    def _long_sentences(self, text: str) -> list[Issue]:
        out = []
        pos = 0
        for sent in re.split(r"(?<=[.!?])\s+", text):
            stripped = sent.strip()
            words = stripped.split()
            # Find this sentence starting from current position (avoids first-match bug)
            idx = text.find(stripped, pos)
            if idx < 0:
                pos += len(sent) + 1
                continue
            if len(words) > 35:
                snippet = stripped[:90] + ("…" if len(stripped) > 90 else "")
                out.append(Issue(
                    "clarity", idx, idx + len(stripped), snippet,
                    f"Long sentence ({len(words)} words) — consider splitting",
                    "(split into shorter sentences)",
                ))
            pos = idx + len(stripped)
        return out

    def _character_names(self, text: str) -> list[Issue]:
        out = []
        names: dict[str, list[tuple[str, int]]] = {}
        # Collect capitalized name occurrences (e.g. "Karthik")
        for m in re.finditer(r"\b([A-Z][a-z]{2,})\b", text):
            name = m.group(1)
            if name in SKIP_NAMES:
                continue
            key = name.lower()
            names.setdefault(key, []).append((name, m.start()))
        for key, forms in names.items():
            variants = sorted({f[0] for f in forms})
            if len(variants) > 1:
                out.append(Issue(
                    "character", forms[0][1], forms[0][1] + len(forms[0][0]),
                    " / ".join(variants),
                    f"Inconsistent character name: {', '.join(variants)}",
                    variants[0],
                ))
            # Also scan for all-lowercase occurrences of this character name (was dead code before)
            proper = key.capitalize()
            for m in re.finditer(rf"\b{re.escape(key)}\b", text):
                # Only flag if it's truly all-lowercase (not the capitalized form)
                found = m.group(0)
                if found[0].islower():
                    out.append(Issue(
                        "character", m.start(), m.end(), found,
                        f"Character name should be capitalized: '{proper}'",
                        proper,
                    ))
        return out

    def _languagetool_raw(self, text: str, locale: str) -> list[dict]:
        lang = locale if locale.startswith("en-") else "en-US"
        if lang in ("en-AU", "en-NZ"):
            lang = "en-GB"
        snippet = text[:LT_MAX_CHARS]
        if not snippet.strip():
            return []
        try:
            r = requests.post(
                LT_API,
                data={"text": snippet, "language": lang},
                timeout=LT_TIMEOUT,
            )
            r.raise_for_status()
            return r.json().get("matches", [])
        except Exception:
            return []

    def _lt_should_skip(self, item: dict) -> bool:
        msg = (item.get("message") or "").lower()
        skip_words = ("duplicated", "repetition", "repeated", "duplicate word")
        if any(s in msg for s in skip_words):
            return True
        if "\n" in (item.get("context") or ""):
            ln = item.get("length", 0)
            if ln > 15 and "duplic" in msg:
                return True
        return False

    def _languagetool(self, text: str, locale: str) -> list[Issue]:
        out = []
        for m in self._languagetool_raw(text, locale):
            if self._lt_should_skip(m):
                continue
            off = m.get("offset", 0)
            ln = m.get("length", 0)
            if ln > 60 or "\n" in text[off : off + ln]:
                continue
            reps = m.get("replacements") or []
            suggestion = reps[0].get("value", "") if reps else ""
            if not suggestion or suggestion == text[off : off + ln]:
                continue
            msg = m.get("message", "Grammar issue")
            err = text[off : off + ln] if off + ln <= len(text) else ""
            out.append(Issue("grammar", off, off + ln, err, msg, suggestion))
        return out

    def _split_chapters(self, text: str) -> list[dict]:
        pattern = re.compile(
            r"^(?:(?:chapter|part|book)\s+[\divxlc\d]+[^\n]*)",
            re.IGNORECASE | re.MULTILINE,
        )
        matches = list(pattern.finditer(text))
        if not matches:
            return [{"title": "Full Manuscript", "text": text, "start": 0, "end": len(text)}]
        chapters = []
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            title = m.group(0).strip()[:100]
            chapters.append({"title": title, "text": text[start:end], "start": start, "end": end})
        return chapters

    def _readability(self, text: str) -> dict:
        if not text.strip():
            return {"score": 0, "grade": "N/A", "words": 0, "sentences": 0}
        score = round(textstat.flesch_reading_ease(text))
        return {
            "score": max(0, min(100, score)),
            "grade": textstat.flesch_kincaid_grade(text),
            "words": len(re.findall(r"\b\w+\b", text)),
            "sentences": max(1, textstat.sentence_count(text)),
        }

    def _accuracy_score(self, text: str, issues: list[Issue], words: int) -> dict:
        if words == 0:
            return {"percent": 100, "label": "No text", "errors_per_1000": 0}
        per_1k = (len(issues) / words) * 1000
        # Rough score: fewer issues = higher percent
        percent = max(0, min(100, round(100 - per_1k * 8)))
        if percent >= 90:
            label = "Excellent — ready for layout"
        elif percent >= 75:
            label = "Good — minor edits suggested"
        elif percent >= 55:
            label = "Fair — review highlighted issues"
        else:
            label = "Needs work — many issues found"
        return {
            "percent": percent,
            "label": label,
            "errors_per_1000": round(per_1k, 1),
            "total_issues": len(issues),
            "word_count": words,
        }

    def _dedupe(self, issues: list[Issue]) -> list[Issue]:
        seen: set[tuple] = set()
        out = []
        for i in issues:
            key = (i.type, i.start, i.end, i.text[:20])
            if key in seen:
                continue
            seen.add(key)
            out.append(i)
        return out

    def _count_by_type(self, issues: list[Issue]) -> dict[str, int]:
        c: dict[str, int] = {}
        for i in issues:
            c[i.type] = c.get(i.type, 0) + 1
        return c


def build_highlights_html(text: str, issues: list[Issue]) -> str:
    import html

    valid = [i for i in issues if 0 <= i.start < i.end <= len(text)]
    valid.sort(key=lambda x: x.start)
    cls = {
        "spelling": "spell-error-red",
        "grammar": "hl-gram",
        "clarity": "hl-clarity",
        "duplicate": "hl-dup",
        "character": "hl-char",
    }
    parts = []
    pos = 0
    for iss in valid:
        if iss.start < pos:
            continue
        parts.append(html.escape(text[pos : iss.start]))
        c = cls.get(iss.type, "hl-gram")
        title = html.escape(f"{iss.message} → {iss.suggestion}" if iss.suggestion else iss.message)
        parts.append(
            f'<mark class="{c}" title="{title}">{html.escape(text[iss.start : iss.end])}</mark>'
        )
        pos = iss.end
    parts.append(html.escape(text[pos:]))
    return "".join(parts).replace("\n", "<br>\n")
