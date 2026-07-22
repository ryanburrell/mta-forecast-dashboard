"""FR-2: Ingest GTFS static data to derive scheduled supply.
FR-15 (Phase 2): also parses shapes.txt for route-line geometry.

Uses the Supplemented feed (updated hourly, reflects planned service
changes) per tech-stack doc §8 recommendation over the Regular feed.

routes.txt, trips.txt and calendar.txt are needed for Model 1's
scheduled-trip-count-by-route-and-day-of-week baseline. shapes.txt (route
polylines) is only needed for FR-15 and is loaded on request
(load_gtfs_tables(include_shapes=True)) - Model 1-only runs skip it to
avoid the extra parse cost. stop_times.txt (~140MB uncompressed) is still
not needed by anything in this project.

calendar_dates.txt (date-specific service exceptions) is also intentionally
not applied here: Model 1 is a seasonal-naive "typical day" baseline over
the feed's service pattern, not a per-date schedule - see PRD §6 guiding
principle (lightweight but effective).
"""
from __future__ import annotations

import io
import zipfile

import pandas as pd
import requests

from lib.config import get_endpoint
from lib.route_labels import gtfs_route_label

_DAY_COLUMNS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _download_feed_zip() -> zipfile.ZipFile:
    endpoint = get_endpoint("gtfs_static_subway_supplemented")
    resp = requests.get(endpoint, timeout=120)
    resp.raise_for_status()
    return zipfile.ZipFile(io.BytesIO(resp.content))


def _read_csv(zf: zipfile.ZipFile, name: str) -> pd.DataFrame:
    with zf.open(name) as f:
        return pd.read_csv(f, dtype=str)


def load_gtfs_tables(include_shapes: bool = False) -> dict[str, pd.DataFrame]:
    """Download the feed once and return the tables needed. shapes.txt (~5MB) is
    only loaded when include_shapes=True (FR-15 route-line geometry)."""
    zf = _download_feed_zip()
    tables = {
        "routes": _read_csv(zf, "routes.txt"),
        "trips": _read_csv(zf, "trips.txt"),
        "calendar": _read_csv(zf, "calendar.txt"),
        "feed_info": _read_csv(zf, "feed_info.txt"),
    }
    if include_shapes:
        tables["shapes"] = _read_csv(zf, "shapes.txt")
    return tables


def fetch_scheduled_trips_by_route_dow(tables: dict[str, pd.DataFrame] | None = None) -> pd.DataFrame:
    """Return one row per (route_id, day_of_week) with a scheduled_trips count.

    route_id here is the rider-facing collapsed label (see lib/route_labels.py),
    day_of_week is 0=Monday..6=Sunday to match pull_mta_data.py's convention.
    """
    tables = tables or load_gtfs_tables()
    routes, trips, calendar = tables["routes"], tables["trips"], tables["calendar"]

    all_route_ids = set(routes["route_id"])
    short_name_by_id = dict(zip(routes["route_id"], routes["route_short_name"]))
    label_by_route_id = {
        rid: gtfs_route_label(rid, short_name_by_id[rid], all_route_ids) for rid in all_route_ids
    }
    trips = trips.copy()
    trips["route_label"] = trips["route_id"].map(label_by_route_id)
    trips = trips[trips["route_label"].notna()]  # drops Staten Island Railway (SI)

    trip_counts = trips.groupby(["route_label", "service_id"]).size().reset_index(name="trip_count")

    for col in _DAY_COLUMNS:
        calendar[col] = calendar[col].astype(int)
    merged = trip_counts.merge(calendar, on="service_id", how="inner")

    records = []
    for dow_index, col in enumerate(_DAY_COLUMNS):
        active = merged[merged[col] == 1]
        by_route = active.groupby("route_label")["trip_count"].sum()
        for route_label, scheduled_trips in by_route.items():
            records.append({"route_id": route_label, "day_of_week": dow_index, "scheduled_trips": int(scheduled_trips)})

    result = pd.DataFrame.from_records(records)
    result.attrs["feed_info"] = tables["feed_info"].iloc[0].to_dict()
    return result


def build_routes_reference(tables: dict[str, pd.DataFrame] | None = None) -> pd.DataFrame:
    """Distinct rider-facing route_id + display name + official MTA line color,
    for the `routes` reference table."""
    tables = tables or load_gtfs_tables()
    routes = tables["routes"]
    all_route_ids = set(routes["route_id"])

    seen: dict[str, dict[str, str]] = {}
    for _, row in routes.iterrows():
        label = gtfs_route_label(row["route_id"], row["route_short_name"], all_route_ids)
        if label is None or label in seen:
            continue
        name = (
            "Shuttle (Franklin Ave / 42 St / Rockaway Park - combined)"
            if label == "S"
            else row["route_long_name"]
        )
        seen[label] = {"route_name": name, "route_color": f"#{row['route_color']}"}
    return pd.DataFrame(
        [{"route_id": k, **v, "mode": "subway"} for k, v in seen.items()]
    ).sort_values("route_id").reset_index(drop=True)


def fetch_route_shapes(tables: dict[str, pd.DataFrame] | None = None) -> pd.DataFrame:
    """FR-15: route_id, shape_id -> ordered [(lon, lat), ...] polyline points.

    A route can have multiple distinct shapes (branches, directions, express
    vs. local routing) - all are kept as separate rows rather than merged
    into one line, so the map can render each accurately.
    """
    tables = tables or load_gtfs_tables(include_shapes=True)
    if "shapes" not in tables:
        raise ValueError("fetch_route_shapes requires load_gtfs_tables(include_shapes=True)")
    routes, trips, shapes = tables["routes"], tables["trips"], tables["shapes"]

    all_route_ids = set(routes["route_id"])
    short_name_by_id = dict(zip(routes["route_id"], routes["route_short_name"]))
    label_by_route_id = {
        rid: gtfs_route_label(rid, short_name_by_id[rid], all_route_ids) for rid in all_route_ids
    }
    trips = trips.copy()
    trips["route_label"] = trips["route_id"].map(label_by_route_id)
    trips = trips[trips["route_label"].notna() & trips["shape_id"].notna()]

    route_shape_pairs = (
        trips[["route_label", "shape_id"]]
        .drop_duplicates()
        .rename(columns={"route_label": "route_id"})
        .reset_index(drop=True)
    )

    shapes = shapes.copy()
    shapes["shape_pt_lat"] = pd.to_numeric(shapes["shape_pt_lat"], errors="raise")
    shapes["shape_pt_lon"] = pd.to_numeric(shapes["shape_pt_lon"], errors="raise")
    shapes["shape_pt_sequence"] = pd.to_numeric(shapes["shape_pt_sequence"], errors="raise")

    points_by_shape = (
        shapes.sort_values(["shape_id", "shape_pt_sequence"])
        .groupby("shape_id")[["shape_pt_lon", "shape_pt_lat"]]
        .apply(lambda g: list(zip(g["shape_pt_lon"], g["shape_pt_lat"])))
    )

    route_shape_pairs["points"] = route_shape_pairs["shape_id"].map(points_by_shape)
    route_shape_pairs = route_shape_pairs[route_shape_pairs["points"].notna()]
    route_shape_pairs = route_shape_pairs[route_shape_pairs["points"].apply(len) >= 2]

    return route_shape_pairs.reset_index(drop=True)


if __name__ == "__main__":
    tables = load_gtfs_tables(include_shapes=True)
    supply = fetch_scheduled_trips_by_route_dow(tables)
    print(f"{len(supply)} route/day-of-week supply rows")
    print(supply.head(20))
    print("\nfeed_info:", supply.attrs["feed_info"])
    routes_ref = build_routes_reference(tables)
    print(f"\n{len(routes_ref)} distinct routes")
    print(routes_ref)

    shapes_df = fetch_route_shapes(tables)
    print(f"\n{len(shapes_df)} route/shape_id pairs")
    print(shapes_df.groupby("route_id").size().sort_values(ascending=False))
    sample = shapes_df.iloc[0]
    print(f"\nsample shape ({sample['route_id']}, {sample['shape_id']}): "
          f"{len(sample['points'])} points, first 3: {sample['points'][:3]}")
