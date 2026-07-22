"""FR-4: Model 1 - baseline demand & supply, by route and day-of-week.

Seasonal-naive baseline (tech-stack doc §5): for each route x day-of-week,
average the observed daily ridership across all matching weekdays in the
training window (holidays excluded per FR-3), and pair it with the GTFS
scheduled-trip count for a representative day of that weekday.

Also produces a station-level demand aggregate (station x day-of-week),
which is not part of the tech-stack doc's original forecast_demand_supply
table but is needed to satisfy FR-13/14 (station-point map colored by the
active forecast's value) without introducing a new model - it's the same
Model 1 ridership computation at station grain instead of route grain,
tagged with the same model_run. Flagged here as a deliberate, scoped
schema extension per tech-stack doc §7 ("starting schema, not frozen").

Demand-to-route attribution: a station's ridership is attributed in full
to every route serving that station (parsed from station_complex, see
lib/route_labels.py). This double-counts ridership at transfer stations
across the routes that share them - an accepted simplification for a
lightweight baseline (PRD §6), not a hidden error.
"""
from __future__ import annotations

import datetime as dt

import pandas as pd

import pull_gtfs
import pull_mta_data
from pull_holidays import get_excluded_dates


def _exclude_holidays(ridership_df: pd.DataFrame) -> pd.DataFrame:
    years = sorted({d.year for d in ridership_df["date"]})
    holiday_dates = get_excluded_dates(years)
    before = ridership_df["date"].nunique()
    filtered = ridership_df[~ridership_df["date"].isin(holiday_dates)]
    after = filtered["date"].nunique()
    if before != after:
        print(f"Excluded {before - after} holiday date(s) from training window")
    return filtered


def compute_route_demand(ridership_df: pd.DataFrame) -> pd.DataFrame:
    """route_id, day_of_week -> forecast_ridership (mean daily total across the window)."""
    exploded = ridership_df.explode("routes").rename(columns={"routes": "route_id"})
    exploded = exploded[exploded["route_id"].notna()]

    daily_totals = (
        exploded.groupby(["route_id", "date", "day_of_week"], as_index=False)["ridership"].sum()
    )
    route_demand = (
        daily_totals.groupby(["route_id", "day_of_week"], as_index=False)["ridership"]
        .mean()
        .rename(columns={"ridership": "forecast_ridership"})
    )
    return route_demand


def compute_station_demand(ridership_df: pd.DataFrame) -> pd.DataFrame:
    """station_complex_id, day_of_week -> forecast_ridership (mean daily total across the window)."""
    daily_totals = (
        ridership_df.groupby(["station_complex_id", "date", "day_of_week"], as_index=False)["ridership"].sum()
    )
    station_demand = (
        daily_totals.groupby(["station_complex_id", "day_of_week"], as_index=False)["ridership"]
        .mean()
        .rename(columns={"ridership": "forecast_ridership"})
    )
    return station_demand


def run_model_1(
    training_window_days: int = pull_mta_data.DEFAULT_TRAINING_WINDOW_DAYS,
    gtfs_tables: dict[str, pd.DataFrame] | None = None,
) -> dict[str, object]:
    """Run the full Model 1 pipeline. Returns a dict of DataFrames plus run metadata.

    gtfs_tables can be pre-loaded and shared with Model 2 (run_pipeline.py does this)
    to avoid downloading the ~20MB feed twice in one pipeline run.
    """
    ridership_raw = pull_mta_data.fetch_ridership_window(days=training_window_days)
    window_start, window_end = ridership_raw.attrs["window_start"], ridership_raw.attrs["window_end"]

    stations_ref = pull_mta_data.build_stations_reference(ridership_raw)
    routes_by_station = stations_ref.set_index("station_complex_id")["routes"]

    ridership = _exclude_holidays(ridership_raw)
    ridership = ridership.merge(
        routes_by_station.rename("routes"), left_on="station_complex_id", right_index=True, how="left"
    )

    route_demand = compute_route_demand(ridership)
    station_demand = compute_station_demand(ridership)

    gtfs_tables = gtfs_tables or pull_gtfs.load_gtfs_tables()
    route_supply = pull_gtfs.fetch_scheduled_trips_by_route_dow(gtfs_tables)
    routes_ref = pull_gtfs.build_routes_reference(gtfs_tables)

    forecast_demand_supply = route_demand.merge(route_supply, on=["route_id", "day_of_week"], how="outer")

    # station <-> route join table, needed by the app layer to filter/highlight the map by
    # the selected route(s) (FR-13/14). Same parsed routes used for demand attribution above.
    station_routes = (
        stations_ref[["station_complex_id", "routes"]]
        .explode("routes")
        .dropna(subset=["routes"])
        .rename(columns={"routes": "route_id"})
        .reset_index(drop=True)
    )

    return {
        "forecast_demand_supply": forecast_demand_supply,
        "station_demand": station_demand,
        "station_routes": station_routes,
        "stations_ref": stations_ref.drop(columns=["routes"]),
        "routes_ref": routes_ref,
        "data_window_start": window_start,
        "data_window_end": window_end,
        "gtfs_feed_info": gtfs_tables["feed_info"].iloc[0].to_dict(),
    }


if __name__ == "__main__":
    result = run_model_1()
    fds = result["forecast_demand_supply"]
    print(f"forecast_demand_supply: {len(fds)} rows, window {result['data_window_start']}..{result['data_window_end']}")
    print(fds.sort_values(["route_id", "day_of_week"]).head(20))
    print(f"\nNull check - missing demand: {fds['forecast_ridership'].isna().sum()}, "
          f"missing supply: {fds['scheduled_trips'].isna().sum()}")

    print(f"\nstation_demand: {len(result['station_demand'])} rows")
    print(result["station_demand"].head(10))
