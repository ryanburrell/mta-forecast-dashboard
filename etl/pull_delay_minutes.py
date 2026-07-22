"""Part of FR-5 (Model 2): delay-minutes basis, from MTA Subway Customer
Journey-Focused Metrics (data.ny.gov r7qk-6tcy).

additional_platform_time + additional_train_time = MTA's own published
"extra minutes per rider" methodology. This dataset splits by peak/off-peak
period, not weekday/weekend at all (a different split than the incidents
dataset in pull_incidents.py) - so unlike p_incident, expected_delay_minutes
does not vary by day_of_week here; it's one ridership-weighted average per
route across peak and off-peak, disclosed per FR-12.
"""
from __future__ import annotations

import datetime as dt

import pandas as pd

from lib import socrata
from lib.config import get_endpoint
from lib.route_labels import incident_line_to_route_ids

TRAILING_MONTHS = 6  # this metric is densely populated every month (unlike
# major incidents), so a shorter window keeps it more current.

_SELECT_FIELDS = "line,period,month,num_passengers,additional_platform_time,additional_train_time"


def get_latest_available_month(endpoint: str) -> dt.date:
    row = socrata.query_scalar(endpoint, select="max(month) as max_month")
    max_month = row.get("max_month")
    if not max_month:
        raise RuntimeError("Could not determine latest available customer-journey month from source")
    return dt.datetime.fromisoformat(max_month).date()


def fetch_delay_minutes_by_route(trailing_months: int = TRAILING_MONTHS) -> pd.DataFrame:
    """Returns route_id -> expected_delay_minutes (ridership-weighted average extra minutes/rider)."""
    endpoint = get_endpoint("mta_subway_customer_journey_metrics")
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
        raise RuntimeError(f"No customer-journey rows returned for window starting {window_start_month}")

    df["num_passengers"] = pd.to_numeric(df["num_passengers"], errors="raise")
    df["additional_platform_time"] = pd.to_numeric(df["additional_platform_time"], errors="raise")
    df["additional_train_time"] = pd.to_numeric(df["additional_train_time"], errors="raise")
    df["journey_minutes"] = df["additional_platform_time"] + df["additional_train_time"]

    df["route_id"] = df["line"].apply(incident_line_to_route_ids)
    df = df.explode("route_id")

    # Ridership-weighted average - handles JZ's duplicate rows and the three
    # shuttles' combined-into-"S" aggregation with one groupby (see
    # lib/route_labels.py: JZ maps to [J, Z], each computing its own
    # identical weighted average from the same source rows; the shuttles
    # all map to "S" and get properly weighted-averaged together).
    df["weighted"] = df["journey_minutes"] * df["num_passengers"]
    grouped = df.groupby("route_id").agg(weighted=("weighted", "sum"), num_passengers=("num_passengers", "sum"))
    grouped["expected_delay_minutes"] = grouped["weighted"] / grouped["num_passengers"]

    result = grouped.reset_index()[["route_id", "expected_delay_minutes"]]
    result.attrs["window_start_month"] = window_start_month
    result.attrs["window_end_month"] = latest_month
    return result


if __name__ == "__main__":
    df = fetch_delay_minutes_by_route()
    print(f"{len(df)} route rows, window {df.attrs['window_start_month']}..{df.attrs['window_end_month']}")
    print(df.sort_values("expected_delay_minutes", ascending=False).to_string())
