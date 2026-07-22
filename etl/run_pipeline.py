"""ETL orchestrator: pull -> Model 1 + Model 2 -> write.

Default mode is --dry-run: runs the full pipeline and writes CSVs to
etl/output/ for spot-checking, without touching Supabase. Pass
--write-to-supabase to actually write (requires SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY in the environment).

Resilience (PRD NFR-5 / risk table): each model computes and writes
independently - if Model 2's data sources hiccup, Model 1's already-good
result still gets written (and vice versa), so one model's bad day doesn't
throw away the other's good one. The overall run still exits non-zero if
either model failed, so a scheduled run failure is loud (GitHub Actions job
goes red), never silent. Each model's own write function additionally rolls
back its own model_runs row on a partial write failure (see
write_to_supabase.py) - nothing is ever left half-written.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

import pull_gtfs
from model_1_demand_supply import run_model_1
from model_2_delay_risk import run_model_2
from pull_mta_data import DEFAULT_TRAINING_WINDOW_DAYS

load_dotenv(Path(__file__).resolve().parent / ".env")

_OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def _write_model_1_dry_run(result: dict) -> None:
    result["forecast_demand_supply"].to_csv(_OUTPUT_DIR / "forecast_demand_supply.csv", index=False)
    result["station_demand"].to_csv(_OUTPUT_DIR / "station_demand.csv", index=False)
    result["station_routes"].to_csv(_OUTPUT_DIR / "station_routes.csv", index=False)
    result["stations_ref"].to_csv(_OUTPUT_DIR / "stations_ref.csv", index=False)
    result["routes_ref"].to_csv(_OUTPUT_DIR / "routes_ref.csv", index=False)


def _write_model_2_dry_run(result: dict) -> None:
    result["forecast_delay_risk"].to_csv(_OUTPUT_DIR / "forecast_delay_risk.csv", index=False)
    shapes_csv = result["route_shapes"].copy()
    shapes_csv["point_count"] = shapes_csv["points"].apply(len)
    shapes_csv.drop(columns=["points"]).to_csv(_OUTPUT_DIR / "route_shapes.csv", index=False)


def _write_dry_run_output(model_1_result: dict | None, model_2_result: dict | None) -> None:
    _OUTPUT_DIR.mkdir(exist_ok=True)
    metadata: dict[str, object] = {}

    if model_1_result is not None:
        _write_model_1_dry_run(model_1_result)
        metadata["model_1"] = {
            "data_window_start": str(model_1_result["data_window_start"]),
            "data_window_end": str(model_1_result["data_window_end"]),
            "gtfs_feed_info": model_1_result["gtfs_feed_info"],
            "row_counts": {
                "forecast_demand_supply": len(model_1_result["forecast_demand_supply"]),
                "station_demand": len(model_1_result["station_demand"]),
                "station_routes": len(model_1_result["station_routes"]),
                "stations_ref": len(model_1_result["stations_ref"]),
                "routes_ref": len(model_1_result["routes_ref"]),
            },
        }

    if model_2_result is not None:
        _write_model_2_dry_run(model_2_result)
        metadata["model_2"] = {
            "incident_window": f"{model_2_result['incident_window_start_month']}..{model_2_result['incident_window_end_month']}",
            "delay_minutes_window": f"{model_2_result['delay_minutes_window_start_month']}..{model_2_result['delay_minutes_window_end_month']}",
            "row_counts": {
                "forecast_delay_risk": len(model_2_result["forecast_delay_risk"]),
                "route_shapes": len(model_2_result["route_shapes"]),
            },
        }

    with open(_OUTPUT_DIR / "run_metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, default=str)

    print(f"[dry-run] wrote CSVs + run_metadata.json to {_OUTPUT_DIR}")
    print(json.dumps(metadata, indent=2, default=str))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-to-supabase",
        action="store_true",
        help="Actually write to Supabase (requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars). "
        "Default is a dry run that writes CSVs to etl/output/ instead.",
    )
    parser.add_argument(
        "--training-window-days",
        type=int,
        default=DEFAULT_TRAINING_WINDOW_DAYS,
        help=f"Model 1 rolling training window size in days (default {DEFAULT_TRAINING_WINDOW_DAYS}).",
    )
    args = parser.parse_args()

    print("Loading GTFS feed (shared by Model 1 and Model 2)...")
    try:
        gtfs_tables = pull_gtfs.load_gtfs_tables(include_shapes=True)
    except Exception as exc:  # noqa: BLE001
        print(f"ETL run FAILED (GTFS pull): {exc}", file=sys.stderr)
        return 1

    overall_ok = True

    print(f"Running Model 1 pipeline (training_window_days={args.training_window_days})...")
    model_1_result = None
    try:
        model_1_result = run_model_1(training_window_days=args.training_window_days, gtfs_tables=gtfs_tables)
    except Exception as exc:  # noqa: BLE001
        print(f"Model 1 pipeline FAILED: {exc}", file=sys.stderr)
        overall_ok = False

    print("Running Model 2 pipeline...")
    model_2_result = None
    try:
        model_2_result = run_model_2(gtfs_tables=gtfs_tables)
    except Exception as exc:  # noqa: BLE001
        print(f"Model 2 pipeline FAILED: {exc}", file=sys.stderr)
        overall_ok = False

    if args.write_to_supabase:
        from write_to_supabase import write_model_1_results, write_model_2_results

        if model_1_result is not None:
            try:
                model_run_id = write_model_1_results(model_1_result)
                print(f"Wrote Model 1 results to Supabase, model_run_id={model_run_id}")
            except Exception as exc:  # noqa: BLE001
                print(f"Model 1 write FAILED: {exc}", file=sys.stderr)
                overall_ok = False

        if model_2_result is not None:
            try:
                model_run_id = write_model_2_results(model_2_result)
                print(f"Wrote Model 2 results to Supabase, model_run_id={model_run_id}")
            except Exception as exc:  # noqa: BLE001
                print(f"Model 2 write FAILED: {exc}", file=sys.stderr)
                overall_ok = False
    else:
        _write_dry_run_output(model_1_result, model_2_result)

    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
