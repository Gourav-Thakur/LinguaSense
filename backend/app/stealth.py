import re

from .schemas import ExtractedDelta, ExtractedFacts, ParsedTurn

_CODED_TRIGGER_RE = re.compile(
    r"\b(pizza|pepperoni|burger|biryani|food\s*delivery|"
    r"plumber|electrician|locksmith|handyman|"
    r"taxi|cab|auto|uber|ola|"
    r"groceries|grocery|laundry|dry\s*clean|courier|parcel)\b",
    re.IGNORECASE,
)


def has_coded_trigger(user_text: str) -> bool:
    """Regex tripwire — fires if the caller mentions a service that does not
    belong on a 1092 line. Acts as a safety net in case the model misses it."""
    return bool(_CODED_TRIGGER_RE.search(user_text or ""))


def merge_extracted(current: ExtractedFacts, delta: ExtractedDelta) -> ExtractedFacts:
    """Merge a per-turn delta into the running ExtractedFacts. Only overwrites
    a field when the delta carries a real new value."""
    merged = current.model_copy(deep=True)

    if delta.location:
        merged.location = delta.location
    if delta.threat_level is not None:
        merged.threat_level = delta.threat_level
    if delta.weapons_present is not None:
        merged.weapons_present = delta.weapons_present
    if delta.persons_present:
        merged.persons_present = delta.persons_present
    if delta.note:
        merged.notes.append(delta.note)

    return merged


def resolve_stealth(parsed: ParsedTurn, user_text: str, prior_stealth: bool) -> bool:
    """Trust the model's flag, but latch on if the regex tripwire fires, and
    never drop the cover once engaged (matches the prompt's contract)."""
    if prior_stealth:
        return True
    return parsed.stealth_mode or has_coded_trigger(user_text)
