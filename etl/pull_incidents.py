"""Part of FR-5 (Model 2): incident-count basis, from MTA Subway Major
Incidents (data.ny.gov ereg-mcvp - see data-sources.config.json for why this
id, not the originally-planned uqnw-2qfk, which is auth-gated).

"Major incident" = MTA's own definition, an incident that delays 50+ trains.
This dataset is monthly-granularity and only splits weekday/weekend
(day_type 1/2) - there is no public source with real per-day-of-week
incident data. To fit this project's day_of_week (0=Mon..6=Sun) grain
without fabricating precision that doesn't exist, the weekday rate is
broadcast to Mon-Fri and the weekend rate to Sat-Sun - disclosed in-product
per FR-12.
"""
from __future__ import annotations

import datetime as dt

import pandas as pd

from lib import socrata
from lib.config import get_endpoint
from lib.route_labels import incident_line_to_route_ids

TRAILING_MONTHS = 12  # major incidents are rare/month per route - need enough
# months for a non-zero, reasonably stable rate estimate.

_SELECT_FIELDS = "line,day_type,month,count"


def get_latest_available_month(endpoint: str) -> dt.date:
    row = socrata.query_scalar(endpoint, select="max(month) as max_month")
    max_month = row.get("max_month")
    if not max_month:
        raise RuntimeError("Could not determine latest available incidents month from source")
    return dt.datetime.fromisoformat(max_month).date()


def _days_by_type(window_start: dt.date, window_end_inclusive: dt.date) -> tuple[int, int]:
    """Returns (weekday_day_count, weekend_day_count) of actual calendar days in the window."""
    days = pd.date_range(window_start, window_end_inclusive, freq="D")
    weekday_count = int((days.weekday < 5).sum())
    weekend_count = int((days.weekday >= 5).sum())
    return weekday_count, weekend_count


def fetch_incident_rate_by_route_dow(trailing_months: int = TRAILING_MONTHS) -> pd.DataFrame:
    """Returns route_id, day_of_week (0-6) -> p_incident (expected major incidents/day)."""
    endpoint = get_endpoint("mta_subway_major_incidents")
    latest_month = get_latest_available_month(endpoint)
    window_start_month = (latest_month.replace(day=1) - pd.DateOffset(months=trailing_months - 1)).date()

    rows = socrata.paginate(
        endpoint,
        select=_SELECT_FIELDS,
        where=f"month >= '{window_start_month.isoformat()}'",
        order="month,line",
    )
    df = pd.DataFrame.from_records(rows)
    if df.empty:
        raise RuntimeError(f"No incident rows returned for window starting {window_start_month}")

    df["count"] = pd.to_numeric(df["count"], errors="raise")
    df["day_type"] = df["day_type"].astype(int)  # 1=weekday, 2=weekend
    df["route_id"] = df["line"].apply(incident_line_to_route_ids)
    df = df.explode("route_id")

    totals = df.groupby(["route_id", "day_type"])["count"].sum().reset_index()

    window_end = latest_month + pd.offsets.MonthEnd(0)
    weekday_days, weekend_days = _days_by_type(window_start_month, window_end.date())

    totals["day_count"] = totals["day_type"].map({1: weekday_days, 2: weekend_days})
    totals["incidents_per_day"] = totals["count"] / totals["day_count"]

    # W's incidents are historically folded into N's reporting - this dataset
    # has no W rows at all (verified: zero rows across its entire history).
    # Reporting a hard zero for W would misleadingly imply immunity to
    # disruption, so it borrows N's rate instead, with a disclosed caveat.
    if "N" in totals["route_id"].values and "W" not in totals["route_id"].values:
        n_rows = totals[totals["route_id"] == "N"].copy()
        n_rows["route_id"] = "W"
        totals = pd.concat([totals, n_rows], ignore_index=True)

    records = []
    for _, row in totals.iterrows():
        dow_range = range(0, 5) if row["day_type"] == 1 else range(5, 7)
        for dow in dow_range:
            records.append(
                {"route_id": row["route_id"], "day_of_week": dow, "p_incident": row["incidents_per_day"]}
            )

    result = pd.DataFrame.from_records(records)
    result.attrs["window_start_month"] = window_start_month
    result.attrs["window_end_month"] = latest_month
    return result


if __name__ == "__main__":
    df = fetch_incident_rate_by_route_dow()
    print(f"{len(df)} route/day-of-week incident-rate rows, "
          f"window {df.attrs['window_start_month']}..{df.attrs['window_end_month']}")
    print(df.sort_values(["route_id", "day_of_week"]).to_string())
