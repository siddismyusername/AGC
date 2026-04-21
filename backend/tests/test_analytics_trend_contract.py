from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.api.v1.endpoints.analytics import _build_document_metrics_trend_points


def _row(bucket_start: datetime, uploaded: int | None = None, completed: int | None = None, failed: int | None = None, processing: int | None = None):
    return SimpleNamespace(
        bucket_start=bucket_start,
        uploaded_count=uploaded,
        completed_count=completed,
        failed_count=failed,
        processing_count=processing,
    )


def test_document_trend_first_bucket_deltas_start_at_zero_and_percentages_sum_to_100():
    day_1 = datetime(2026, 4, 18, tzinfo=timezone.utc)
    day_2 = datetime(2026, 4, 19, tzinfo=timezone.utc)

    points = _build_document_metrics_trend_points(
        upload_rows=[_row(day_1, uploaded=3), _row(day_2, uploaded=5)],
        status_rows=[
            _row(day_1, completed=2, failed=1, processing=0),
            _row(day_2, completed=3, failed=1, processing=1),
        ],
    )

    first_point = points[0]
    second_point = points[1]

    assert first_point.uploaded_delta_day_over_day == 0
    assert first_point.completed_delta_day_over_day == 0
    assert first_point.failed_delta_day_over_day == 0
    assert first_point.processing_delta_day_over_day == 0
    assert first_point.success_rate_percent == 66.67
    assert first_point.failure_rate_percent == 33.33

    assert second_point.uploaded_delta_day_over_day == 2
    assert second_point.completed_delta_day_over_day == 1
    assert second_point.failed_delta_day_over_day == 0
    assert second_point.processing_delta_day_over_day == 1
    assert second_point.success_rate_percent == 75.0
    assert second_point.failure_rate_percent == 25.0


def test_document_trend_uses_null_percentages_when_no_completed_or_failed_items_exist():
    bucket = datetime(2026, 4, 20, tzinfo=timezone.utc)

    points = _build_document_metrics_trend_points(
        upload_rows=[_row(bucket, uploaded=2)],
        status_rows=[_row(bucket, completed=0, failed=0, processing=2)],
    )

    assert len(points) == 1
    point = points[0]
    assert point.uploaded_delta_day_over_day == 0
    assert point.completed_delta_day_over_day == 0
    assert point.failed_delta_day_over_day == 0
    assert point.processing_delta_day_over_day == 0
    assert point.success_rate_percent is None
    assert point.failure_rate_percent is None
