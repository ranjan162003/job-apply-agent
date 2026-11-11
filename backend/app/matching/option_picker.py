"""Pick which of a field's choices means the same as a profile value.

"India" → "India (+91)", "No" → "No, I will not require sponsorship",
"Prefer not to say" → "I don't wish to answer", "SPPU" → "Savitribai Phule Pune University".
Returns None when nothing fits well; the field is then left for the user rather than guessed.
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

_NON_WORD = re.compile(r"[^a-z0-9+]+")
_BRACKETS = re.compile(r"\([^)]*\)|\[[^\]]*\]")

DECLINE_WORDS = ("prefer not", "decline", "don t wish", "do not wish", "not to answer", "not to disclose", "not to say", "choose not")
_ALIASES = {
    "yes": ("yes", "y", "true"),
    "no": ("no", "n", "false"),
    "united states": ("united states", "usa", "us", "united states of america"),
    "united kingdom": ("united kingdom", "uk", "great britain"),
    "india": ("india", "bharat"),
}
# Words that don't tell two institution names apart.
_FILLER = {"of", "the", "and", "for", "at", "in", "a", "an", "&"}
_FUZZY_THRESHOLD = 0.88
_FUZZY_MARGIN = 0.05  # the best choice must clearly beat the runner-up


def normalize(text: str) -> str:
    return _NON_WORD.sub(" ", text.lower()).strip()


def _words(text: str) -> list[str]:
    return [w for w in normalize(_BRACKETS.sub(" ", text)).split() if w not in _FILLER]


def _initials(text: str) -> str:
    return "".join(w[0] for w in _words(text))


def _similarity(a: str, b: str) -> float:
    wa, wb = _words(a), _words(b)
    if not wa or not wb:
        return 0.0
    characters = SequenceMatcher(None, " ".join(wa), " ".join(wb)).ratio()
    sa, sb = set(wa), set(wb)
    overlap = len(sa & sb) / len(sa | sb)
    # Every word of the shorter name appears in the longer one: "IIT Madras" vs "IIT Madras, Chennai".
    # Covering more of the longer name scores higher, so "College of Engineering Guindy" beats
    # "Anna University" for "College of Engineering Guindy, Anna University, Chennai".
    smaller, larger = sorted((len(sa), len(sb)))
    contained = 0.85 + 0.12 * smaller / larger if (sa <= sb or sb <= sa) and smaller >= 2 else 0.0
    return max(characters, overlap, contained)


# Degree name → the level forms list it under, most specific first.
# "M.Sc. (Information Technology)-Integrated" → "master of science", "master s", "masters", "master".
_DEGREE_LEVELS: list[tuple[re.Pattern[str], tuple[str, ...]]] = [
    (re.compile(r"^(ph ?d|doctor|d phil)"), ("doctor of philosophy", "doctorate", "phd", "doctoral")),
    (re.compile(r"^(m ?sc|ms|m s|master of science)( |$)"), ("master of science", "master s", "masters", "master")),
    (re.compile(r"^(m ?tech|m ?e|me|m eng|master of (technology|engineering))( |$)"), ("master of technology", "master of engineering", "master s", "masters", "master")),
    (re.compile(r"^(mca|master of computer applications)( |$)"), ("master of computer applications", "master s", "masters", "master")),
    (re.compile(r"^(mba|pgdm|master of business)( |$)"), ("master of business administration", "mba", "master s", "masters", "master")),
    (re.compile(r"^(m ?a|ma|master of arts)( |$)"), ("master of arts", "master s", "masters", "master")),
    (re.compile(r"^(m ?com|master of commerce)( |$)"), ("master of commerce", "master s", "masters", "master")),
    (re.compile(r"^master"), ("master s", "masters", "master")),
    (re.compile(r"^(b ?e|be|b ?tech|b eng|bachelor of (engineering|technology))( |$)"), ("bachelor of engineering", "bachelor of technology", "bachelor s", "bachelors", "bachelor")),
    (re.compile(r"^(b ?sc|bs|b s|bachelor of science)( |$)"), ("bachelor of science", "bachelor s", "bachelors", "bachelor")),
    (re.compile(r"^(bca|bachelor of computer applications)( |$)"), ("bachelor of computer applications", "bachelor s", "bachelors", "bachelor")),
    (re.compile(r"^(b ?com|bachelor of commerce)( |$)"), ("bachelor of commerce", "bachelor s", "bachelors", "bachelor")),
    (re.compile(r"^(b ?a|ba|bachelor of arts)( |$)"), ("bachelor of arts", "bachelor s", "bachelors", "bachelor")),
    (re.compile(r"^bachelor"), ("bachelor s", "bachelors", "bachelor")),
    (re.compile(r"^(diploma|polytechnic)"), ("diploma",)),
    (re.compile(r"^(12th|hsc|higher secondary|intermediate)"), ("higher secondary", "high school", "12th")),
    (re.compile(r"^(10th|ssc|secondary school|matriculation)"), ("secondary school", "high school", "10th")),
]


def _degree_option(value: str, normalized: list[tuple[str, str]]) -> str | None:
    """A degree name picked by its level: the most specific level phrase found in exactly one option."""
    text = normalize(_BRACKETS.sub(" ", value))
    for pattern, phrases in _DEGREE_LEVELS:
        if not pattern.search(text):
            continue
        for phrase in phrases:
            found = [option for option, norm in normalized if re.search(rf"(^| ){re.escape(phrase)}( |$)", norm)]
            if len(found) == 1:
                return found[0]
            if len(found) > 1:
                # "Master's Degree" and "Master's Degree (Integrated)": prefer the plainest one.
                return min(found, key=len)
        return None
    return None


def pick_option(value: str, options: list[str]) -> str | None:
    if not options:
        return None
    wanted = normalize(value)
    if not wanted:
        return None
    normalized = [(option, normalize(option)) for option in options]

    for option, norm in normalized:
        if norm == wanted:
            return option

    if any(word in wanted for word in DECLINE_WORDS):
        return next((option for option, norm in normalized if any(word in norm for word in DECLINE_WORDS)), None)

    aliases = next((names for names in _ALIASES.values() if wanted in names), (wanted,))
    # Options that start with the value as a whole word: "No, I don't need…", "India (+91)".
    for alias in aliases:
        starting = [option for option, norm in normalized if norm == alias or norm.startswith(f"{alias} ")]
        if len(starting) == 1:
            return starting[0]

    # A number inside a range option: "3" → "2-4 years".
    if re.fullmatch(r"\d+(\.\d+)?", wanted):
        number = float(wanted)
        for option, norm in normalized:
            bounds = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", norm)]
            if len(bounds) == 2 and bounds[0] <= number <= bounds[1]:
                return option
            if len(bounds) == 1 and ("+" in option or "more" in norm or "above" in norm) and number >= bounds[0]:
                return option
        return None

    # The value appears as whole words inside exactly one option.
    if len(wanted) >= 3:
        containing = [option for option, norm in normalized if re.search(rf"(^| ){re.escape(wanted)}( |$)", norm)]
        if len(containing) == 1:
            return containing[0]

    # Abbreviations either way: "SPPU" ↔ "Savitribai Phule Pune University".
    compact = wanted.replace(" ", "")
    if 2 <= len(compact) <= 8:
        by_initials = [option for option in options if _initials(option) == compact]
        if len(by_initials) == 1:
            return by_initials[0]
    if len(_words(value)) >= 2:
        own_initials = _initials(value)
        by_abbreviation = [option for option, norm in normalized if norm.replace(" ", "") == own_initials]
        if len(by_abbreviation) == 1:
            return by_abbreviation[0]

    degree = _degree_option(value, normalized)
    if degree is not None:
        return degree

    # Names inside names: "College of Engineering Guindy, Anna University, Chennai" contains both
    # "College of Engineering Guindy" and "Anna University"; the one covering more words wins.
    value_words = set(_words(value))
    contained = []
    for option in options:
        option_words = set(_words(option))
        if len(option_words) >= 2 and len(value_words) >= 2 and (option_words <= value_words or value_words <= option_words):
            contained.append((len(option_words & value_words) / len(option_words | value_words), option))
    if contained:
        contained.sort(reverse=True)
        if len(contained) == 1 or contained[0][0] > contained[1][0]:
            return contained[0][1]

    # Close spelling: "Savitribai Phule Pune Univ." ↔ "Savitribai Phule Pune University".
    scored = sorted(((_similarity(value, option), option) for option in options), reverse=True)
    best_score, best = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    if best_score >= _FUZZY_THRESHOLD and best_score - runner_up >= _FUZZY_MARGIN:
        return best
    return None
