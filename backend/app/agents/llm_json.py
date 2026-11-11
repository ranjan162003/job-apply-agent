"""Ask a provider for JSON and get back a validated object, whatever the model does.

LLMs (especially small local ones) wrap JSON in prose or fences, leave quotes
unescaped, or get cut off. `extract_json_object` tolerates all of that, and
`generate_validated_json` gives the model one chance to repair a bad reply.
"""
from __future__ import annotations

import json
import logging
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.agents.providers.base_llm_provider import BaseLlmProvider
from app.core.app_exceptions import AgentResponseParseError

logger = logging.getLogger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)

FENCED_JSON_PATTERN = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
# strict=False lets raw line breaks/tabs inside strings through — models often write them in long prose.
_LENIENT_DECODER = json.JSONDecoder(strict=False)


def generate_validated_json(
    provider: BaseLlmProvider,
    model_name: str | None,
    prompt: str,
    response_model: type[ModelT],
) -> ModelT:
    """Prompt → reply → `response_model`, with one self-repair retry."""
    schema = response_model.model_json_schema()
    reply = provider.generate_text(prompt, model_name, json_schema=schema)
    try:
        return _parse_reply(reply, response_model)
    except AgentResponseParseError as first_error:
        logger.warning("First reply unusable (%s); asking the model to repair it.", first_error.message)
        repair_prompt = build_json_repair_prompt(prompt, reply, first_error.message)
        repaired = provider.generate_text(repair_prompt, model_name, json_schema=schema)
        try:
            return _parse_reply(repaired, response_model)
        except AgentResponseParseError as second_error:
            raise AgentResponseParseError(
                f"{second_error.message} (after one retry) — {provider.display_name} replied: "
                f"{_excerpt(repaired)}. Try again, or pick a stronger model."
            ) from second_error


def _parse_reply(reply: str, response_model: type[ModelT]) -> ModelT:
    payload = extract_json_object(reply)
    try:
        return response_model.model_validate(payload)
    except ValidationError as exc:
        problems = "; ".join(f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in exc.errors()[:5])
        raise AgentResponseParseError(f"The model's JSON didn't match the expected shape ({problems}).") from exc


def build_json_repair_prompt(original_prompt: str, bad_reply: str, problem: str) -> str:
    return (
        f"{original_prompt}\n\n"
        "---\n"
        f"Your previous reply could not be used: {problem}\n"
        f"Previous reply (may be truncated):\n{bad_reply[:3000]}\n\n"
        "Reply again with ONLY one valid JSON object that follows the format above exactly. "
        "No markdown fences, no text before or after it."
    )


def extract_json_object(raw_reply: str) -> dict:
    """The first JSON object in a model reply, tolerating the usual slips.

    Handles: markdown fences, prose before or after the object (even prose that
    contains braces), raw line breaks inside strings, and unescaped double quotes
    inside strings (`"the "best" answer"`).
    """
    text = raw_reply.strip()
    starts = []
    fenced = FENCED_JSON_PATTERN.search(text)
    if fenced:
        starts.append(fenced.group(1))
    first_brace = text.find("{")
    if first_brace != -1:
        starts.append(text[first_brace:])

    first_error: json.JSONDecodeError | None = None
    for candidate in starts:
        for attempt in (candidate, escape_stray_quotes(candidate)):
            try:
                # raw_decode stops at the end of the first complete object and ignores what follows.
                parsed, _ = _LENIENT_DECODER.raw_decode(attempt)
            except json.JSONDecodeError as exc:
                first_error = first_error or exc
                continue
            if isinstance(parsed, dict):
                return parsed

    if first_error is not None:
        at = first_error.pos
        logger.warning(
            "Model reply isn't valid JSON: %s (reply is %d chars). Around the problem: %r",
            first_error.msg, len(text), first_error.doc[max(0, at - 150) : at + 150],
        )
        if _is_cut_off(first_error.doc):
            raise AgentResponseParseError("The model's reply was cut off before the JSON ended.")
    raise AgentResponseParseError("The model's reply wasn't valid JSON.")


def _is_cut_off(text: str) -> bool:
    """True if the text ends inside a string or with braces/brackets still open."""
    depth, in_string, escaped = 0, False, False
    for ch in text:
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
        elif ch == '"':
            in_string = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
    return in_string or depth > 0


def escape_stray_quotes(text: str) -> str:
    """Escape double quotes that sit *inside* a JSON string.

    A quote ends a string only if the next non-space character is one that can
    follow a string value (`,` `:` `}` `]`) or the text ends; any other quote is
    part of the prose and gets escaped. Best-effort — only used after a strict
    parse has already failed.
    """
    out: list[str] = []
    in_string = False
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if in_string and ch == "\\":
            out.append(text[i : i + 2])
            i += 2
            continue
        if ch == '"':
            if not in_string:
                in_string = True
                out.append(ch)
            else:
                j = i + 1
                while j < n and text[j] in " \t\r\n":
                    j += 1
                if j >= n or text[j] in ",:}]":
                    in_string = False
                    out.append(ch)
                else:
                    out.append('\\"')
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def _excerpt(text: str, limit: int = 160) -> str:
    flat = " ".join(text.split())
    if not flat:
        return "(an empty reply)"
    return f"“{flat[:limit]}…”" if len(flat) > limit else f"“{flat}”"
