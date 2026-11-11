"""Pick which of a field's choices means the same as a profile value.

"India" → "India (+91)", "No" → "No, I will not require sponsorship",
"Prefer not to say" → "I don't wish to answer". Returns None when nothing fits well;
the field is then left for the user rather than guessed.
"""
from __future__ import annotations

import re

_NON_WORD = re.compile(r"[^a-z0-9+]+")

DECLINE_WORDS = ("prefer not", "decline", "don t wish", "do not wish", "not to answer", "not to disclose", "not to say", "choose not")
_ALIASES = {
    "yes": ("yes", "y", "true"),
    "no": ("no", "n", "false"),
    "united states": ("united states", "usa", "us", "united states of america"),
    "united kingdom": ("united kingdom", "uk", "great britain"),
    "india": ("india", "bharat"),
}


def normalize(text: str) -> str:
    return _NON_WORD.sub(" ", text.lower()).strip()


def pick_option(value: str, options: list[str]) -> str | None:
    if not options:
        return None
    wanted = normalize(value)
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

    # The value appears as whole words inside exactly one option.
    if len(wanted) >= 3:
        containing = [option for option, norm in normalized if re.search(rf"(^| ){re.escape(wanted)}( |$)", norm)]
        if len(containing) == 1:
            return containing[0]
    return None
