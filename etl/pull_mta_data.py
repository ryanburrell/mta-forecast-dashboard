"""FR-1: Ingest MTA Subway Hourly Ridership (data.ny.gov 5wq4-mkjj).

Pulls hourly ridership summed per station (server-side aggregation via
Socrata $group, so payment-method/fare-class breakdown never leaves the
API - we only need totals), bounded to a rolling training window ending at
the freshest data actually available (queried dynamically, never assumed).

transit_mode is filtered to 'subway' only (PRD NG2) - this dataset also
contains 'staten_island_railway' and 'tram' (Roosevelt Island Tramway) rows
which must be excluded.
"""
from __future__ import annotations

import datetime as dt

import pandas as pd

from lib import socrata
from lib.config import get_endpoint
from lib.route_labels import parse_station_routes

DEFAULT_TRAINING_WINDOW_DAYS = 56  # 8 weeks - enough to average out day-to-day noise per day-of-week

_SELECT_FIELDS = (
    "station_complex_id,station_complex,borough,latitude,longitude,"
    "transit_timestamp,sum(ridership) as total_ridership"
)
_GROUP_FIELDS = "station_complex_id,station_complex,borough,latitude,longitude,transit_timestamp"


def get_latest_available_date(endpoint: str) -> dt.date:
    """Query the dataset for its own freshness frontier rather than assuming 'today'."""
    row = socrata.query_scalar(endpoint, select="max(transit_timestamp) as max_ts", where="transit_mode='subway'")
    max_ts = row.get("max_ts")
    if not max_ts:
        raise RuntimeError("Could not determine latest available ridership date from source")
    return dt.datetime.fromisoformat(max_ts).date()


def fetch_ridership_window(days: int = DEFAULT_TRAINING_WINDOW_DAYS) -> pd.DataFrame:
    """Fetch hourly per-station ridership totals for the most recent `days` of available data."""
    endpoint = get_endpoint("mta_subway_hourly_ridership")
    latest_date = get_latest_available_date(endpoint)
    window_end = latest_date + dt.timedelta(days=1)  # exclusive upper bound
    window_start = latest_date - dt.timedelta(days=days - 1)

    where = (
        "transit_mode='subway' AND "
        f"transit_timestamp >= '{window_start.isoformat()}T00:00:00' AND "
        f"transit_timestamp < '{window_end.isoformat()}T00:00:00'"
    )
    rows = socrata.paginate(
        endpoint,
        select=_SELECT_FIELDS,
        where=where,
        group=_GROUP_FIELDS,
        order="station_complex_id,transit_timestamp",
    )
    df = pd.DataFrame.from_records(rows)
    if df.empty:
        raise RuntimeError(f"No ridership rows returned for window {window_start}..{latest_date}")

    df["transit_timestamp"] = pd.to_datetime(df["transit_timestamp"])
    df["ridership"] = pd.to_numeric(df["total_ridership"], errors="raise")
    df["latitude"] = pd.to_numeric(df["latitude"], errors="raise")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="raise")
    df["date"] = df["transit_timestamp"].dt.date
    df["day_of_week"] = df["transit_timestamp"].dt.weekday  # 0=Monday .. 6=Sunday
    df = df.drop(columns=["total_ridership"])
    df.attrs["window_start"] = window_start
    df.attrs["window_end"] = latest_date
    return df


def build_stations_reference(ridership_df: pd.DataFrame) -> pd.DataFrame:
    """Distinct station points + the route letters serving them, sourced entirely from the
    ridership dataset's own station_complex/lat/long fields (tech-stack doc §6 - no GTFS
    stop_id crosswalk needed for Phase 1 station points)."""
    stations = (
        ridership_df[["station_complex_id", "station_complex", "borough", "latitude", "longitude"]]
        .drop_duplicates(subset=["station_complex_id"])
        .reset_index(drop=True)
    )
    stations["routes"] = stations["station_complex"].apply(parse_station_routes)
    return stations


if __name__ == "__main__":
    df = fetch_ridership_window()
    print(f"Fetched {len(df)} station-hour rows, window {df.attrs['window_start']}..{df.attrs['window_end']}")
    print(df.head())
    stations = build_stations_reference(df)
    print(f"\n{len(stations)} distinct stations")
    print(stations.head())
