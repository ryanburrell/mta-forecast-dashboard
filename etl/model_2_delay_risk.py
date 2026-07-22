"""FR-5: Model 2 - delay/breakdown impact, by route and day-of-week.

Combines two independently-sourced metrics (see pull_incidents.py and
pull_delay_minutes.py for why they can't just be one query) with Model 1's
scheduled-supply figure to produce expected_degradation_pct.

expected_degradation_pct derivation: MTA's own definition of a "major
incident" is one that delays 50+ trains (data-sources.config.json). So
expected trains disrupted per day ≈ p_incident * 50, and
expected_degradation_pct = that, as a share of forecast_scheduled_trips for
the same route/day. This is a lower-bound estimate (real major incidents
often delay more than the 50-train qualifying threshold), not a fitted
statistical model - disclosed per FR-12 alongside the other Model 2
caveats (observed history, not fleet-maintenance records; incident data
undercounts routine minor delays).
"""
from __future__ import annotations

import pandas as pd

import pull_gtfs
import pull_incidents
from pull_delay_minutes import fetch_delay_minutes_by_route

MAJOR_INCIDENT_TRAIN_THRESHOLD = 50  # MTA's own qualifying definition


def run_model_2(gtfs_tables: dict[str, pd.DataFrame] | None = None) -> dict[str, object]:
    """Run the full Model 2 pipeline, including route-line geometry (FR-15).
    Returns a dict of DataFrames plus run metadata."""
    gtfs_tables = gtfs_tables or pull_gtfs.load_gtfs_tables(include_shapes=True)
    if "shapes" not in gtfs_tables:
        raise ValueError("run_model_2 requires gtfs_tables loaded with include_shapes=True")

    route_supply = pull_gtfs.fetch_scheduled_trips_by_route_dow(gtfs_tables)
    routes_ref = pull_gtfs.build_routes_reference(gtfs_tables)
    route_shapes = pull_gtfs.fetch_route_shapes(gtfs_tables)

    incident_rate = pull_incidents.fetch_incident_rate_by_route_dow()
    delay_minutes = fetch_delay_minutes_by_route()

    forecast_delay_risk = route_supply.merge(incident_rate, on=["route_id", "day_of_week"], how="left")
    forecast_delay_risk = forecast_delay_risk.merge(delay_minutes, on="route_id", how="left")

    forecast_delay_risk["expected_degradation_pct"] = (
        forecast_delay_risk["p_incident"] * MAJOR_INCIDENT_TRAIN_THRESHOLD
        / forecast_delay_risk["scheduled_trips"]
        * 100
    )

    forecast_delay_risk = forecast_delay_risk[
        ["route_id", "day_of_week", "p_incident", "expected_delay_minutes", "expected_degradation_pct"]
    ]

    return {
        "forecast_delay_risk": forecast_delay_risk,
        "routes_ref": routes_ref,
        "route_shapes": route_shapes,
        "incident_window_start_month": incident_rate.attrs["window_start_month"],
        "incident_window_end_month": incident_rate.attrs["window_end_month"],
        "delay_minutes_window_start_month": delay_minutes.attrs["window_start_month"],
        "delay_minutes_window_end_month": delay_minutes.attrs["window_end_month"],
    }


if __name__ == "__main__":
    result = run_model_2()
    fdr = result["forecast_delay_risk"]
    print(f"forecast_delay_risk: {len(fdr)} rows")
    print(
        f"incident window {result['incident_window_start_month']}..{result['incident_window_end_month']}, "
        f"delay-minutes window {result['delay_minutes_window_start_month']}..{result['delay_minutes_window_end_month']}"
    )
    print(fdr.sort_values(["route_id", "day_of_week"]).to_string())
    print(f"\nNull check - missing p_incident: {fdr['p_incident'].isna().sum()}, "
          f"missing delay_minutes: {fdr['expected_delay_minutes'].isna().sum()}")
