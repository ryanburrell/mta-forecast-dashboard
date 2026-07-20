"""US holiday calendar for baseline-training exclusion (PRD FR-3).

Source choice (Python `holidays` package) is config-driven per
data-sources.config.json's `us_holiday_calendar` entry - no network call,
computed locally.
"""
from __future__ import annotations

import datetime as dt

import holidays

from lib.config import get_source


def get_excluded_dates(years: list[int]) -> set[dt.date]:
    """Return the set of US federal holiday dates to exclude from baseline training."""
    source = get_source("us_holiday_calendar")
    if source["package"] != "holidays":
        raise ValueError(f"Unexpected holiday package configured: {source['package']!r}")
    us_holidays = holidays.US(years=years)
    return set(us_holidays.keys())


if __name__ == "__main__":
    today = dt.date.today()
    dates = get_excluded_dates([today.year - 1, today.year])
    print(f"{len(dates)} holiday dates loaded for {today.year - 1}-{today.year}")
    for d in sorted(dates)[:10]:
        print(" ", d)
