from __future__ import annotations

from app.services.project_service import VALID_TRANSITIONS


def test_architecture_version_status_transitions_are_explicit():
    assert VALID_TRANSITIONS["draft"] == ["under_review"]
    assert VALID_TRANSITIONS["under_review"] == ["approved", "draft"]
    assert VALID_TRANSITIONS["approved"] == ["active"]
    assert VALID_TRANSITIONS["active"] == ["deprecated"]
    assert VALID_TRANSITIONS["deprecated"] == []