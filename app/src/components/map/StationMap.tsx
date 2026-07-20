"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { StationFeatureCollection } from "@/lib/types";

type Props = {
  geojson: StationFeatureCollection | null;
};

const NYC_CENTER: [number, number] = [40.7128, -73.94];
const DEFAULT_ZOOM = 10;

// Simple sequential scale (tech-stack doc §3: "no need for a complex legend
// system in v1"). Radius and color both track forecast_ridership so the
// map communicates the same signal two ways (size for at-a-glance scanning,
// color for a numeric-adjacent gradient).
function ridershipColor(value: number, max: number): string {
  const t = max > 0 ? Math.min(value / max, 1) : 0;
  const hue = 220 - t * 220; // blue (low) -> red (high)
  return `hsl(${hue}, 80%, 50%)`;
}

function ridershipRadius(value: number, max: number): number {
  const t = max > 0 ? Math.min(value / max, 1) : 0;
  return 4 + t * 14;
}

// FR-13 (station points colored/sized by the active forecast's value) +
// FR-14 (reacts to the same route/day-of-week selection as the chart).
export default function StationMap({ geojson }: Props) {
  const features = geojson?.features ?? [];
  const values = features
    .map((f) => f.properties.forecast_ridership)
    .filter((v): v is number => v !== null);
  const maxValue = values.length > 0 ? Math.max(...values) : 0;

  return (
    <div className="h-80 w-full overflow-hidden rounded">
      <MapContainer center={NYC_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {features.map((feature) => {
          const value = feature.properties.forecast_ridership;
          const [lng, lat] = feature.geometry.coordinates;
          return (
            <CircleMarker
              key={feature.properties.station_complex_id}
              center={[lat, lng]}
              radius={value === null ? 3 : ridershipRadius(value, maxValue)}
              pathOptions={{
                color: value === null ? "#a1a1aa" : ridershipColor(value, maxValue),
                fillOpacity: 0.7,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-medium">{feature.properties.station_name}</div>
                  <div className="text-zinc-500">{feature.properties.borough}</div>
                  <div className="mt-1">
                    {value === null ? "No forecast" : `${Math.round(value).toLocaleString()} forecasted riders/day`}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
