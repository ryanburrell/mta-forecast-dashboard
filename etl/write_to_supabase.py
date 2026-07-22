"""Writes ETL output to Supabase using the service-role key.

This is the ONLY script in the repo that writes to Supabase. Next.js API
routes are read-only (tech-stack doc §4) - the anon key they use has
SELECT-only RLS policies (see sql/schema.sql). SUPABASE_SERVICE_ROLE_KEY
must never be exposed to the frontend; it is a GitHub Actions secret /
local .env value only.

Idempotency (tech-stack doc §5): each run inserts a fresh model_runs row
and tags every forecast row with that run's id. Nothing is deleted, so a
failed or re-run job can never corrupt a previously-good snapshot - the
app always reads the latest model_run_id per model (see the
station_demand_latest view / equivalent query for forecast_demand_supply).
"""
from __future__ import annotations

import datetime as dt
import math
import os

import pandas as pd
from supabase import Client, create_client

_CHUNK_SIZE = 500


def _clean_nans(records: list[dict]) -> list[dict]:
    """Replace float NaN with None in-place across a list of dict records.

    `df.where(df.notna(), None)` does NOT survive `.to_dict()` for float64
    columns - pandas/numpy coerces the None right back to NaN because a
    float64 array has no way to hold Python None. NaN is not valid JSON
    (json.dumps raises ValueError), so this has to be a real dict-level
    pass after to_dict(), not a DataFrame-level operation.
    """
    for record in records:
        for k, v in record.items():
            if isinstance(v, float) and math.isnan(v):
                record[k] = None
    return records


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _chunked(records: list[dict], size: int = _CHUNK_SIZE):
    for i in range(0, len(records), size):
        yield records[i : i + size]


def upsert_routes(client: Client, routes_ref: pd.DataFrame) -> None:
    records = routes_ref.to_dict(orient="records")
    for chunk in _chunked(records):
        client.table("routes").upsert(chunk, on_conflict="route_id").execute()


def upsert_stations(client: Client, stations_ref: pd.DataFrame) -> None:
    records = []
    for row in stations_ref.to_dict(orient="records"):
        records.append(
            {
                "station_complex_id": row["station_complex_id"],
                "station_name": row["station_complex"],
                "borough": row["borough"],
                # EWKT text - PostgREST passes this through and Postgres' geography
                # input function parses it directly (tech-stack doc §4).
                "geom": f"SRID=4326;POINT({row['longitude']} {row['latitude']})",
            }
        )
    for chunk in _chunked(records):
        client.table("stations").upsert(chunk, on_conflict="station_complex_id").execute()


def upsert_station_routes(client: Client, station_routes: pd.DataFrame) -> None:
    """Depends on routes/stations already being upserted (FK constraints)."""
    records = station_routes[["station_complex_id", "route_id"]].to_dict(orient="records")
    for chunk in _chunked(records):
        client.table("station_routes").upsert(chunk, on_conflict="station_complex_id,route_id").execute()


def upsert_route_shapes(client: Client, route_shapes: pd.DataFrame) -> None:
    """Depends on routes already being upserted (FK constraint)."""
    records = []
    for row in route_shapes.to_dict(orient="records"):
        wkt_points = ", ".join(f"{lon} {lat}" for lon, lat in row["points"])
        records.append(
            {
                "route_id": row["route_id"],
                "shape_id": row["shape_id"],
                "geom": f"SRID=4326;LINESTRING({wkt_points})",
            }
        )
    for chunk in _chunked(records):
        client.table("route_shapes").upsert(chunk, on_conflict="route_id,shape_id").execute()


def insert_model_run(client: Client, model_name: str, data_window_start, data_window_end, notes: str) -> int:
    resp = (
        client.table("model_runs")
        .insert(
            {
                "model_name": model_name,
                "run_timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
                "data_window_start": str(data_window_start),
                "data_window_end": str(data_window_end),
                "notes": notes,
            }
        )
        .execute()
    )
    return resp.data[0]["id"]


def insert_forecast_demand_supply(client: Client, forecast_demand_supply: pd.DataFrame, model_run_id: int) -> None:
    df = forecast_demand_supply.rename(columns={"scheduled_trips": "forecast_scheduled_trips"}).copy()
    df["model_run_id"] = model_run_id
    records = _clean_nans(
        df[["route_id", "day_of_week", "forecast_ridership", "forecast_scheduled_trips", "model_run_id"]].to_dict(
            orient="records"
        )
    )
    for chunk in _chunked(records):
        client.table("forecast_demand_supply").upsert(chunk, on_conflict="route_id,day_of_week,model_run_id").execute()


def insert_station_demand(client: Client, station_demand: pd.DataFrame, model_run_id: int) -> None:
    df = station_demand.copy()
    df["model_run_id"] = model_run_id
    records = _clean_nans(
        df[["station_complex_id", "day_of_week", "forecast_ridership", "model_run_id"]].to_dict(orient="records")
    )
    for chunk in _chunked(records):
        client.table("station_demand").upsert(chunk, on_conflict="station_complex_id,day_of_week,model_run_id").execute()


def insert_forecast_delay_risk(client: Client, forecast_delay_risk: pd.DataFrame, model_run_id: int) -> None:
    df = forecast_delay_risk.copy()
    df["model_run_id"] = model_run_id
    records = _clean_nans(
        df[
            ["route_id", "day_of_week", "p_incident", "expected_delay_minutes", "expected_degradation_pct", "model_run_id"]
        ].to_dict(orient="records")
    )
    for chunk in _chunked(records):
        client.table("forecast_delay_risk").upsert(chunk, on_conflict="route_id,day_of_week,model_run_id").execute()


def write_model_1_results(result: dict) -> int:
    """Writes a model_1_demand_supply.run_model_1() result dict to Supabase.
    Returns the new model_run_id."""
    client = get_client()

    upsert_routes(client, result["routes_ref"])
    upsert_stations(client, result["stations_ref"])
    upsert_station_routes(client, result["station_routes"])

    feed_version = result["gtfs_feed_info"].get("feed_version", "unknown")
    notes = (
        f"Model 1 baseline (seasonal-naive). GTFS supplemented feed_version={feed_version}. "
        f"Training window {result['data_window_start']}..{result['data_window_end']}."
    )
    model_run_id = insert_model_run(
        client, "model_1", result["data_window_start"], result["data_window_end"], notes
    )

    # forecast_demand_supply/station_demand rows FK-reference model_run_id, so the
    # model_runs row necessarily exists before they're written - if either insert
    # below fails partway, delete it rather than leave an incomplete run as the
    # "latest" the app would otherwise serve (defeats the NFR-5 guarantee that a
    # failed ETL run falls back to the last good snapshot, not a broken one).
    try:
        insert_forecast_demand_supply(client, result["forecast_demand_supply"], model_run_id)
        insert_station_demand(client, result["station_demand"], model_run_id)
    except Exception:
        client.table("model_runs").delete().eq("id", model_run_id).execute()
        raise

    return model_run_id


def write_model_2_results(result: dict) -> int:
    """Writes a model_2_delay_risk.run_model_2() result dict to Supabase.
    Returns the new model_run_id."""
    client = get_client()

    upsert_routes(client, result["routes_ref"])  # idempotent - safe even if Model 1 already ran this
    upsert_route_shapes(client, result["route_shapes"])

    window_start = min(result["incident_window_start_month"], result["delay_minutes_window_start_month"])
    window_end = max(result["incident_window_end_month"], result["delay_minutes_window_end_month"])
    notes = (
        f"Model 2 (incident rate + delay minutes). "
        f"Incidents window {result['incident_window_start_month']}..{result['incident_window_end_month']}, "
        f"delay-minutes window {result['delay_minutes_window_start_month']}..{result['delay_minutes_window_end_month']}."
    )
    model_run_id = insert_model_run(client, "model_2", window_start, window_end, notes)

    try:
        insert_forecast_delay_risk(client, result["forecast_delay_risk"], model_run_id)
    except Exception:
        client.table("model_runs").delete().eq("id", model_run_id).execute()
        raise

    return model_run_id
