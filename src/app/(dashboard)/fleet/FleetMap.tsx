"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";

// Leaflet measures its container once on init. When mounted via a client-only dynamic
// import, that measurement can happen before the surrounding layout has settled, leaving
// the map permanently sized to a stale (too-narrow) container. Force a resize check once
// the layout is stable, and again on window resize.
function MapResizeFix() {
  const map = useMap();
  useEffect(() => {
    const handleResize = () => map.invalidateSize();
    const id = requestAnimationFrame(handleResize);
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", handleResize);
    };
  }, [map]);
  return null;
}

export interface MapVehicle {
  id: string;
  plateNumber: string;
  driverName: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastSpeedKph: number | null;
  lastPingAt: string | null;
  latestShipmentOrderId: string | null;
}

const STALE_MINUTES = 15;

function isOnline(lastPingAt: string | null): boolean {
  if (!lastPingAt) return false;
  return Date.now() - new Date(lastPingAt).getTime() <= STALE_MINUTES * 60 * 1000;
}

function markerIcon(online: boolean) {
  const color = online ? "#16a34a" : "#9ca3af";
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

interface Props {
  vehicles: MapVehicle[];
  trail?: { lat: number; lng: number }[];
}

export default function FleetMap({ vehicles, trail }: Props) {
  const positioned = vehicles.filter(v => v.lastLat != null && v.lastLng != null);
  const center: [number, number] = positioned.length > 0
    ? [positioned[0].lastLat!, positioned[0].lastLng!]
    : [14.5995, 120.9842]; // Manila, default view when no pings yet

  return (
    // Leaflet gives its own panes and controls z-index values up to 1000, which otherwise
    // participate in the page's stacking context and paint over dialogs. `isolation: isolate`
    // confines that whole range to this wrapper's own stacking context, so any modal above it
    // in the tree wins on stacking regardless of the numbers Leaflet uses internally.
    <div style={{ isolation: "isolate", position: "relative", zIndex: 0 }}>
      <MapContainer center={center} zoom={11} style={{ height: 420, width: "100%", borderRadius: 8 }}>
        <MapResizeFix />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {positioned.map(v => (
          <Marker key={v.id} position={[v.lastLat!, v.lastLng!]} icon={markerIcon(isOnline(v.lastPingAt))}>
            <Popup>
              <div style={{ fontSize: 12.5 }}>
                <strong>{v.plateNumber}</strong><br />
                {v.driverName && <>Driver: {v.driverName}<br /></>}
                {v.lastSpeedKph != null && <>Speed: {Math.round(v.lastSpeedKph)} km/h<br /></>}
                Last seen: {fmtAgo(v.lastPingAt)}
                {v.latestShipmentOrderId && <><br />Shipment: {v.latestShipmentOrderId}</>}
              </div>
            </Popup>
          </Marker>
        ))}
        {trail && trail.length > 1 && (
          <Polyline positions={trail.map(p => [p.lat, p.lng])} color="#2563eb" weight={3} />
        )}
      </MapContainer>
    </div>
  );
}
