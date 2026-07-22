"""Route-label normalization shared by the demand (ridership) and supply (GTFS) pulls.

Model 1 needs both sides joined on a single "route_id" grain. The two source
systems don't naturally agree:

- The ridership dataset's `station_complex` field embeds rider-facing route
  letters in parentheses, e.g. "Bowery (J,Z)" - it never distinguishes
  express variants (always "6", never "6X") and always labels all three
  shuttles as "S".
- GTFS `routes.txt` is more granular: express services get their own
  route_id (6X, 7X, FX) and the three shuttles are separate route_ids
  (FS, GS, H) that merely share route_short_name "S".

To join cleanly, GTFS route_ids are collapsed down to the same rider-facing
label the ridership dataset already uses: strip a trailing "X" when the
base route_id also exists, and map any shuttle route_id to "S". Staten
Island Railway (route_id "SI") is dropped - it is not part of the subway
network per PRD NG2, and confirmed distinct from transit_mode='subway' in
the ridership dataset itself.
"""
from __future__ import annotations

import re

_STATION_ROUTES_RE = re.compile(r"\(([^()]+)\)\s*$")


def gtfs_route_label(route_id: str, route_short_name: str, all_route_ids: set[str]) -> str | None:
    """Collapse a GTFS route_id to the rider-facing label used by the ridership dataset.

    Returns None for routes that should be excluded (Staten Island Railway).
    """
    if route_id == "SI":
        return None
    if route_short_name == "S":
        return "S"
    if route_id.endswith("X") and route_id[:-1] in all_route_ids:
        return route_id[:-1]
    return route_id


def parse_station_routes(station_complex_name: str) -> list[str]:
    """Extract the rider-facing route letters from a station_complex name.

    e.g. "Broadway-Lafayette St/Bleecker St (6,B,D,F,M)" -> ["6","B","D","F","M"]
    Returns [] if the name doesn't end in a parenthetical route list.
    """
    match = _STATION_ROUTES_RE.search(station_complex_name)
    if not match:
        return []
    return [token.strip() for token in match.group(1).split(",") if token.strip()]


# Model 2's two source datasets (MTA Subway Major Incidents, MTA Subway
# Customer Journey-Focused Metrics) use a third, different `line` labeling
# convention from either the ridership dataset or GTFS: "JZ" is combined
# (not separate J/Z), and the three shuttles are separate named lines
# instead of being combined into "S". Neither dataset has a W row at all -
# see data-sources.config.json's mta_subway_major_incidents notes for why
# (its incidents are historically folded into N's reporting).
_INCIDENT_LINE_TO_ROUTE_IDS: dict[str, list[str]] = {
    "JZ": ["J", "Z"],
    "S 42nd": ["S"],
    "S Rock": ["S"],
    "S Fkln": ["S"],
}


def incident_line_to_route_ids(line: str) -> list[str]:
    """Map a Major Incidents / Customer Journey `line` value to this project's
    route_id(s). Most lines map 1:1; JZ duplicates to both J and Z (the
    source can't distinguish which incident affected which route); the three
    named shuttles all aggregate into this project's combined "S"."""
    return _INCIDENT_LINE_TO_ROUTE_IDS.get(line, [line])
