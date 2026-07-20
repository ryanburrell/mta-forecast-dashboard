"""Loads etl/config/data-sources.config.json.

All external source URLs must be read through this module. No script in
/etl should hardcode a data source URL directly (see tech-stack doc §8).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "data-sources.config.json"

_cache: dict[str, Any] | None = None


def _load() -> dict[str, Any]:
    global _cache
    if _cache is None:
        with open(_CONFIG_PATH, encoding="utf-8") as f:
            _cache = json.load(f)
    return _cache


def get_source(name: str) -> dict[str, Any]:
    """Return the config block for a named source, e.g. 'mta_subway_hourly_ridership'."""
    data = _load()
    if name not in data:
        raise KeyError(f"Unknown data source '{name}' - check {_CONFIG_PATH}")
    return data[name]


def get_endpoint(name: str) -> str:
    """Return the endpoint URL for a named source, failing loudly if unverified/TBD."""
    source = get_source(name)
    endpoint = source.get("endpoint")
    if not endpoint or endpoint == "TBD":
        raise ValueError(
            f"Data source '{name}' has no confirmed endpoint yet "
            f"(verified={source.get('verified')!r}) - see {_CONFIG_PATH}"
        )
    return endpoint
