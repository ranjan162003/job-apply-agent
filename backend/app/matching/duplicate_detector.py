"""The no-repeat rule: is this new question/lesson the same as one already shown?

Two checks:
* exact — a SHA-256 fingerprint of the normalised text (case, punctuation and
  spacing ignored);
* near-duplicate — the same question reworded slightly, caught by character
  similarity or by almost the same set of words.
"""
from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from difflib import SequenceMatcher

NEAR_DUPLICATE_RATIO = 0.85
NEAR_DUPLICATE_WORD_OVERLAP = 0.9
# Very short texts ("What is a heap?") share most words with many different questions;
# only the character ratio is trusted for them.
MIN_WORDS_FOR_OVERLAP_CHECK = 6

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


def normalize_text(text: str) -> str:
    return _NON_ALPHANUMERIC.sub(" ", text.lower()).strip()


def fingerprint(text: str) -> str:
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()


def is_near_duplicate(normalized_a: str, normalized_b: str) -> bool:
    if not normalized_a or not normalized_b:
        return False
    if normalized_a == normalized_b:
        return True
    if SequenceMatcher(None, normalized_a, normalized_b).ratio() >= NEAR_DUPLICATE_RATIO:
        return True
    words_a, words_b = set(normalized_a.split()), set(normalized_b.split())
    if min(len(words_a), len(words_b)) < MIN_WORDS_FOR_OVERLAP_CHECK:
        return False
    return len(words_a & words_b) / len(words_a | words_b) >= NEAR_DUPLICATE_WORD_OVERLAP


def find_duplicate(text: str, existing_normalized: Iterable[str]) -> str | None:
    """The first already-seen (normalised) text that `text` duplicates, or None."""
    candidate = normalize_text(text)
    for seen in existing_normalized:
        if is_near_duplicate(candidate, seen):
            return seen
    return None
