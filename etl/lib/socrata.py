"""Thin helper around the Socrata SODA REST API used by data.ny.gov sources.

Handles pagination ($limit/$offset) so callers never risk a silently
truncated pull (tech-stack doc §8), and applies the optional app token
(MTA_SOCRATA_APP_TOKEN) to raise the unauthenticated rate limit.
"""
from __future__ import annotations

import os
import time
from typing import Any

import requests

PAGE_SIZE = 50_000
MAX_RETRIES = 4
RETRY_BACKOFF_SECONDS = 5
REQUEST_TIMEOUT_SECONDS = 180  # grouped/aggregated queries on this dataset have been observed
# taking 30-50s per 50k-row page - 60s was too tight and caused spurious retries/failures.


def _headers() -> dict[str, str]:
    token = os.environ.get("MTA_SOCRATA_APP_TOKEN")
    return {"X-App-Token": token} if token else {}


def _get(endpoint: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(endpoint, params=params, headers=_headers(), timeout=REQUEST_TIMEOUT_SECONDS)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SECONDS * attempt)
    raise RuntimeError(f"Socrata request to {endpoint} failed after {MAX_RETRIES} attempts") from last_error


def query_scalar(endpoint: str, select: str, where: str | None = None) -> dict[str, Any]:
    """Run a single-row aggregate query (e.g. max/min), no pagination needed."""
    params: dict[str, Any] = {"$select": select, "$limit": 1}
    if where:
        params["$where"] = where
    rows = _get(endpoint, params)
    return rows[0] if rows else {}

def paginate(
    endpoint: str,
    select: str,
    where: str | None = None,
    group: str | None = None,
    order: str | None = None,
    page_size: int = PAGE_SIZE,
) -> list[dict[str, Any]]:
    """Fetch all rows for a query, paging with $limit/$offset until a short page is returned."""
    all_rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        params: dict[str, Any] = {"$select": select, "$limit": page_size, "$offset": offset}
        if where:
            params["$where"] = where
        if group:
            params["$group"] = group
        if order:
            params["$order"] = order
        page = _get(endpoint, params)
        all_rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return all_rows
