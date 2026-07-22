"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import type { RouteLineFeatureCollection } from "@/lib/types";

type Props = {
  geojson: RouteLineFeatureCollection | null;
};

const NYC_CENTER: [number, number] = [40.7128, -73.94];
const DEFAULT_ZOOM = 10;
const BASE_WEIGHT = 3;
const MAX_EXTRA_WEIGHT = 8;

// Line stroke uses the route's real MTA color (GTFS routes.txt) rather than
// a risk-value color scale, unlike StationMap's points - with ~23 routes
// and heavy track-sharing in Manhattan, a shared blue-red risk gradient
// would make overlapping lines indistinguishable. Risk is instead encoded
// in stroke weight/opacity, still satisfying FR-13/15's "colored/sized by
// the active forecast's value" via the size dimension.
function riskWeight(pct: number | null, maxPct: number): number {
  if (pct === null || maxPct <= 0) return BASE_WEIGHT;
  return BASE_WEIGHT + (Math.min(pct, maxPct) / maxPct) * MAX_EXTRA_WEIGHT;
}

function riskOpacity(pct: number | null, maxPct: number): number {
  if (pct === null || maxPct <= 0) return 0.45;
  return 0.5 + (Math.min(pct, maxPct) / maxPct) * 0.5;
}

// FR-15 (route-line geometry for the delay-risk view) + FR-13/14 (reacts to
// the same route/day-of-week selection as the chart).
export default function RouteLinesMap({ geojson }: Props) {
  const features = geojson?.features ?? [];
  const pctValues = features
    .map((f) => f.properties.expected_degradation_pct)
    .filter((v): v is number => v !== null);
  const maxPct = pctValues.length > 0 ? Math.max(...pctValues) : 0;

  return (
    <div className="h-80 w-full overflow-hidden rounded">
      <MapContainer center={NYC_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {features.map((feature) => {
          const { route_id, shape_id, route_name, route_color, expected_degradation_pct, expected_delay_minutes } =
            feature.properties;
          const positions = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
          return (
            <Polyline
              key={`${route_id}-${shape_id}`}
              positions={positions}
              pathOptions={{
                color: route_color ?? "#71717a",
                weight: riskWeight(expected_degradation_pct, maxPct),
                opacity: riskOpacity(expected_degradation_pct, maxPct),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-medium">
                    {route_id} - {route_name}
                  </div>
                  <div className="mt-1">
                    {expected_degradation_pct === null
                      ? "No delay-risk forecast"
                      : `${expected_degradation_pct.toFixed(1)}% expected service degradation`}
                  </div>
                  {expected_delay_minutes !== null && (
                    <div className="text-zinc-500">{expected_delay_minutes.toFixed(1)} min extra/rider</div>
                  )}
                </div>
              </Popup>
            </Polyline>
          );
        })}
      </MapContainer>
    </div>
  );
}
