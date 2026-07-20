"""Phase 1 ETL orchestrator: pull -> Model 1 -> write.

Default mode is --dry-run: runs the full pull + Model 1 pipeline and writes
CSVs to etl/output/ for spot-checking, without touching Supabase. Pass
--write-to-supabase to actually write (requires SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY in the environment).

Resilience (PRD NFR-5 / risk table): the whole pipeline runs in memory and
only calls Supabase at the very end. If any pull or transform step raises,
nothing is written and the previous model_run's data - which is never
deleted - remains the latest the app will serve. This script exits non-zero
on failure so a scheduled run failure is loud (GitHub Actions job goes red),
never silent.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

from model_1_demand_supply import run_model_1
from pull_mta_data import DEFAULT_TRAINING_WINDOW_DAYS

load_dotenv(Path(__file__).resolve().parent / ".env")

_OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def _write_dry_run_output(result: dict) -> None:
    _OUTPUT_DIR.mkdir(exist_ok=True)
    result["forecast_demand_supply"].to_csv(_OUTPUT_DIR / "forecast_demand_supply.csv", index=False)
    result["station_demand"].to_csv(_OUTPUT_DIR / "station_demand.csv", index=False)
    result["station_routes"].to_csv(_OUTPUT_DIR / "station_routes.csv", index=False)
    result["stations_ref"].to_csv(_OUTPUT_DIR / "stations_ref.csv", index=False)
    result["routes_ref"].to_csv(_OUTPUT_DIR / "routes_ref.csv", index=False)

    metadata = {
        "data_window_start": str(result["data_window_start"]),
        "data_window_end": str(result["data_window_end"]),
        "gtfs_feed_info": result["gtfs_feed_info"],
        "row_counts": {
            "forecast_demand_supply": len(result["forecast_demand_supply"]),
            "station_demand": len(result["station_demand"]),
            "station_routes": len(result["station_routes"]),
            "stations_ref": len(result["stations_ref"]),
            "routes_ref": len(result["routes_ref"]),
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
        help=f"Rolling training window size in days (default {DEFAULT_TRAINING_WINDOW_DAYS}).",
    )
    args = parser.parse_args()

    print(f"Running Model 1 pipeline (training_window_days={args.training_window_days})...")
    try:
        result = run_model_1(training_window_days=args.training_window_days)
    except Exception as exc:  # noqa: BLE001 - deliberately broad: any failure must fail the whole run loudly
        print(f"ETL run FAILED: {exc}", file=sys.stderr)
        return 1

    if args.write_to_supabase:
        from write_to_supabase import write_model_1_results

        model_run_id = write_model_1_results(result)
        print(f"Wrote Model 1 results to Supabase, model_run_id={model_run_id}")
    else:
        _write_dry_run_output(result)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
