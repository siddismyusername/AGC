from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


HISTORY_KEY = "extractor_diagnostics_history"
HISTORY_LIMIT = 25


def append_extractor_history(extracted_data: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any]:
    history_raw = extracted_data.get(HISTORY_KEY)
    history = history_raw if isinstance(history_raw, list) else []
    normalized_history = [item for item in history if isinstance(item, dict)]

    next_entry = {
        **entry,
        "timestamp": entry.get("timestamp") or datetime.now(timezone.utc).isoformat(),
    }
    normalized_history.append(next_entry)
    extracted_data[HISTORY_KEY] = normalized_history[-HISTORY_LIMIT:]
    return extracted_data
