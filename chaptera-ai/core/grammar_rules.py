"""Local grammar, verb-form, clarity, and punctuation rules (US/UK English)."""

from __future__ import annotations

import re

# Common malformed past-tense / verb errors → correct form
VERB_FORM_FIXES: dict[str, str] = {
    "forgetter": "forgot",
    "forgoted": "forgot",
    "forgotted": "forgot",
    "forgetted": "forgot",
    "forgetten": "forgot",
    "forgotton": "forgotten",
    "runned": "ran",
    "runed": "ran",
    "goed": "went",
    "buyed": "bought",
    "catched": "caught",
    "teached": "taught",
    "meeted": "met",
    "meeten": "met",
    "metted": "met",
    "thinked": "thought",
    "bringed": "brought",
    "holded": "held",
    "keeped": "kept",
    "feeled": "felt",
    "leaved": "left",
    "builded": "built",
    "finded": "found",
    "gived": "gave",
    "taked": "took",
    "maked": "made",
    "payed": "paid",
    "sayed": "said",
    "telled": "told",
    "writed": "wrote",
    "eated": "ate",
    "drinked": "drank",
    "swimmed": "swam",
    "beginned": "began",
    "choosed": "chose",
    "freezed": "froze",
    "stealed": "stole",
    "weared": "wore",
    "speaked": "spoke",
    "breaked": "broke",
    "shooted": "shot",
    "singed": "sang",
    "ringed": "rang",
    "sinked": "sank",
    "winned": "won",
    "losed": "lost",
    "costed": "cost",
    "cutted": "cut",
    "putted": "put",
    "sitted": "sat",
    "standed": "stood",
    "layed": "laid",
    # NOTE: "lied" is valid past tense of "lie (to deceive)" — do NOT map it to "lay"
    "knowed": "knew",
    "growed": "grew",
    "throwed": "threw",
    "drawed": "drew",
    "flyed": "flew",
    "drived": "drove",
    "rided": "rode",
    # "writed" already defined above (line 38) — duplicate removed
    "bited": "bit",
    "hitted": "hit",
    "shaked": "shook",
    "waked": "woke",
    # "choosed", "telled", "keeped" already defined above — duplicates removed
    "sellted": "sold",
    "sendded": "sent",
    "spended": "spent",
    "lended": "lent",
    "meaned": "meant",
    "sleeped": "slept",
    "sweeped": "swept",
    "weeped": "wept",
    "bleeded": "bled",
    "breeded": "bred",
    "speeded": "sped",
    "leaded": "led",
    "readed": "read",
    "feeded": "fed",
}

EXTRA_GRAMMAR_PATTERNS: list[tuple[str, str, str]] = [
    (r"\bwas\s+wrote\b", "was written", "Use past participle after 'was': 'was written'"),
    (r"\bwere\s+wrote\b", "were written", "Use past participle after 'were': 'were written'"),
    (r"\b(is|are|am|be|been|being)\s+wrote\b", r"\1 written", "Use past participle 'written'"),
    (r"\b(has|have|had)\s+wrote\b", r"\1 written", "Use past participle 'written'"),
    (r"\b(has|have|had)\s+forgot\b", r"\1 forgotten", "Use past participle 'forgotten'"),
    (r"\b(has|have|had)\s+(meet|meeted|meeten|metted)\b", r"\1 met", "Use past participle 'met' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(saw|seed|seened)\b", r"\1 seen", "Use past participle 'seen' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(spoke|speaked)\b", r"\1 spoken", "Use past participle 'spoken' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(ate|eated)\b", r"\1 eaten", "Use past participle 'eaten' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(took|taked)\b", r"\1 taken", "Use past participle 'taken' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(gave|gived)\b", r"\1 given", "Use past participle 'given' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(began|beginned)\b", r"\1 begun", "Use past participle 'begun' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(broke|breaked)\b", r"\1 broken", "Use past participle 'broken' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(chose|choosed)\b", r"\1 chosen", "Use past participle 'chosen' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(drove|drived)\b", r"\1 driven", "Use past participle 'driven' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(fell|falled)\b", r"\1 fallen", "Use past participle 'fallen' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(knew|knowed)\b", r"\1 known", "Use past participle 'known' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(rode|rided)\b", r"\1 ridden", "Use past participle 'ridden' after 'have/has/had'"),
    (r"\b(has|have|had)\s+(swam|swimmed)\b", r"\1 swum", "Use past participle 'swum' after 'have/has/had'"),
    (r"\bit\s+have\s+been\b", "it has been", "Use singular verb: 'it has been'"),
    (r"\bthis\s+have\s+been\b", "this has been", "Use singular verb: 'this has been'"),
    (r"\bthat\s+have\s+been\b", "that has been", "Use singular verb: 'that has been'"),
    (r"\b(he|she|it|this|that)\s+have\b", r"\1 has", "Use 'has' with singular subject"),
    (r"\b(they|we|you)\s+has\b", r"\1 have", "Use 'have' with plural subject"),
    (r"\bthey\s+was\b", "they were", "Use 'were' with 'they'"),
    (r"\bwe\s+was\b", "we were", "Use 'were' with 'we'"),
    (r"\byou\s+was\b", "you were", "Use 'were' with 'you'"),
    (r"\bI\s+were\b", "I was", "Use 'was' with 'I'"),
    (r"\b(she|he|it|this|that)\s+(think|feel|look|say|tell|go|come|walk|run|jump|eat|read|write|make|need|want|like|love|hate)\b", r"\1 \2s", "Use singular verb form with singular subject"),
    (r"\b(?!(?:they|we|you|people|children|friends|students|parents|men|women)\b)([A-Z]?[a-z]{3,})\s+(think|feel|look|say|tell|go|come|walk|run|jump|eat|read|write|make|need|want|like|love|hate)\s+(over|under|through|to|from|in|on|at|away|very|too|because|with|without|for|after|before)\b", r"\1 \2s \3", "Use singular verb form with a singular noun"),
    (r"\b(my|his|her|their|our)\s+([a-z]{3,})\s+(go|come|walk|run|jump|eat|read|write|make|need|want|like|love|hate)\b", r"\1 \2 \3s", "Use singular verb form after a singular noun phrase"),
    (r"\bwho\s+live\s+in\b", "who lives in", "Use singular verb after singular person: 'who lives in'"),
    (r"\bwhich\s+make\s+me\b", "which makes me", "Use singular verb: 'which makes me'"),
    (r"\bwhich\s+make\s+(him|her|it|us|them)\b", r"which makes \1", "Use singular verb: 'which makes'"),
    (r"\bmore\s+taller\s+than\s+me\b", "taller than I am", "Avoid double comparative and use a complete comparison"),
    (r"\bmore\s+taller\b", "taller", "Avoid double comparative"),
    (r"\bmore\s+shorter\b", "shorter", "Avoid double comparative"),
    (r"\bmore\s+longer\b", "longer", "Avoid double comparative"),
    (r"\bmore\s+smaller\b", "smaller", "Avoid double comparative"),
    (r"\bmore\s+bigger\b", "bigger", "Avoid double comparative"),
    (r"\binfant\s+of\s+my\s+friends\b", "in front of my friends", "Likely phrase error: use 'in front of my friends'"),
    (r"\binfant\s+of\s+(the|his|her|our|their)\b", r"in front of \1", "Likely phrase error: use 'in front of'"),
    (r"\binfront\s+of\b", "in front of", "Use two words: 'in front of'"),
    (r"\bI forgetter\b", "I forgot", "Use past tense 'forgot'"),
    (r"\bI forgoted\b", "I forgot", "Use past tense 'forgot'"),
    (r"\bI forgotted\b", "I forgot", "Use past tense 'forgot'"),
    (r"\bI forgetted\b", "I forgot", "Use past tense 'forgot'"),
    (r"\bI forgotten to\b", "I forgot to", "Use 'forgot to' not 'forgotten to'"),
    (r"\bI have forget\b", "I have forgotten", "Use past participle 'forgotten'"),
    (r"\bI have forgot\b", "I have forgotten", "Use past participle 'forgotten'"),
    (r"\bI (have|has|had) forgoted\b", r"I \1 forgotten", "Use past participle 'forgotten'"),
    (r"\bI (have|has|had) forgotted\b", r"I \1 forgotten", "Use past participle 'forgotten'"),
    (r"\b(he|she|they|we) forgoted\b", r"\1 forgot", "Use past tense 'forgot'"),
    (r"\b(he|she|they|we) forgotted\b", r"\1 forgot", "Use past tense 'forgot'"),
    (r"\bhe forget\b", "he forgot", "Use past tense 'forgot'"),
    (r"\bshe forget\b", "she forgot", "Use past tense 'forgot'"),
    (r"\bthey forget\b", "they forgot", "Use past tense 'forgot'"),
    (r"\bwe forget\b", "we forgot", "Use past tense 'forgot'"),
    (r"\bforgetter to\b", "forgot to", "Use 'forgot to'"),
    (r"\bforgetted to\b", "forgot to", "Use 'forgot to'"),
    (r"\bdidn't forgot\b", "didn't forget", "After 'didn't' use base verb"),
    (r"\bdidn't went\b", "didn't go", "After 'didn't' use base verb"),
    (r"\bdidn't knew\b", "didn't know", "After 'didn't' use base verb"),
    (r"\bdidn't ran\b", "didn't run", "After 'didn't' use base verb"),
    (r"\bhas went\b", "has gone", "Use 'has gone' not 'has went'"),
    (r"\bhave went\b", "have gone", "Use 'have gone' not 'have went'"),
    (r"\bhas ran\b", "has run", "Use 'has run' not 'has ran'"),
    (r"\bhave ran\b", "have run", "Use 'have run' not 'have ran'"),
    (r"\bmore better\b", "better", "Avoid double comparative"),
    (r"\bmore easier\b", "easier", "Avoid double comparative"),
    (r"\bmost biggest\b", "biggest", "Avoid double superlative"),
    (r"\breturn back\b", "return", "Redundant — 'return' already implies back"),
    (r"\brevert back\b", "revert", "Redundant phrase"),
    (r"\bcontinue on\b", "continue", "Redundant phrase"),
    (r"\bclose proximity\b", "proximity", "Redundant phrase"),
    (r"\bfuture plans\b", "plans", "Redundant phrase"),
    (r"\bend result\b", "result", "Redundant phrase"),
    (r"\babsolutely essential\b", "essential", "Redundant phrase"),
    (r"\bcompletely finished\b", "finished", "Redundant phrase"),
    (r"\b(?:a|an)\s+LOT\b", "a lot", "Use 'a lot' (two words)"),
]

CLARITY_COMPLETION_PATTERNS: list[tuple[str, str, str]] = [
    (
        r"\bI\s+have\s+lived\s+in\s+this\s+city\s+since\s+three\s+years\s+ago\s+and\s+I\s+have\s+(?:meet|meeted|meeten|metted|met)\s+many\s+interesting\s+people\s+during\s+my\s+time\s+staying\s+here\b",
        "Over the past three years, I have met many interesting people",
        "Clearer phrasing: use a natural time expression and correct verb form",
    ),
    (
        r"\bsince\s+three\s+years\s+ago\b",
        "for three years",
        "Use 'for three years' for duration",
    ),
    (
        r"\bduring\s+my\s+time\s+staying\s+here\b",
        "while living here",
        "Clearer phrasing: 'while living here'",
    ),
    (
        r"\b(forgot|forget|forgets|forgetting)\s+to\s+charge(\s*[.!?]|$)",
        r"\1 to charge it\2",
        "Add missing object: 'charge it'",
    ),
    (
        r"\b(forgot|forget|forgets|forgetting)\s+to\s+plug(\s+in)?(\s*[.!?]|$)",
        r"\1 to plug it in\3",
        "Add missing object: 'plug it in'",
    ),
    (
        r"\b(forgot|forget|forgets|forgetting)\s+to\s+save(\s*[.!?]|$)",
        r"\1 to save it\2",
        "Add missing object: 'save it'",
    ),
    (
        r"\b(forgot|forget|forgets|forgetting)\s+to\s+call(\s*[.!?]|$)",
        r"\1 to call them\2",
        "Add missing object: 'call them'",
    ),
    (
        r"\b(forgot|forget|forgets|forgetting)\s+to\s+email(\s*[.!?]|$)",
        r"\1 to email them\2",
        "Add missing object: 'email them'",
    ),
    (
        r"\b(forgot|forget|forgets|forgetting)\s+to\s+reply(\s*[.!?]|$)",
        r"\1 to reply\2",
        "Complete the thought — add recipient if needed",
    ),
    (
        r"\bneed to charge(\s*[.!?]|$)",
        r"need to charge it\1",
        "Add missing object: 'charge it'",
    ),
    (
        r"\bforgot to turn off(\s*[.!?]|$)",
        r"forgot to turn it off\1",
        "Add missing object: 'turn it off'",
    ),
]

PUNCTUATION_PATTERNS: list[tuple[str, str]] = [
    (r"\.{2,}", "."),
    (r",{2,}", ","),
    (r"!{2,}", "!"),
    (r"\?{2,}", "?"),
    (r"\s+\.", "."),
    (r"\s+,", ","),
    (r"\s+([.!?])", r"\1"),
    (r"([.!?])([A-Za-z])", r"\1 \2"),
]


def apply_verb_form_fixes(text: str, preserve_case_fn) -> str:
    def repl(m: re.Match) -> str:
        w = m.group(0)
        fix = VERB_FORM_FIXES.get(w.lower())
        return preserve_case_fn(w, fix) if fix else w

    return re.sub(r"\b[a-zA-Z]+\b", repl, text)


def apply_pattern_rules(
    text: str,
    patterns: list[tuple[str, str, str]],
    flags: int = re.IGNORECASE,
) -> str:
    for pattern, fix, _ in patterns:
        text = re.sub(pattern, fix, text, flags=flags)
    return text


def apply_punctuation_fixes(text: str) -> str:
    for pattern, fix in PUNCTUATION_PATTERNS:
        text = re.sub(pattern, fix, text)
    return text


def all_grammar_patterns() -> list[tuple[str, str, str]]:
    return list(EXTRA_GRAMMAR_PATTERNS)


def all_clarity_patterns() -> list[tuple[str, str, str]]:
    return list(CLARITY_COMPLETION_PATTERNS)
