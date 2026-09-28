/**
 * D-34 one small map for field scouting: sightings as coloured dots (tap → details), the
 * viewer's own position, and (Part 2) the day's route and covered / suggested areas.
 * Reuses the Leaflet / react-leaflet already in the app (LiveMapDashboard uses them too) with
 * OpenStreetMap tiles; loaded lazily so screens without a map don't download it.
 * Why not reuse LiveMapDashboard: 1,618 lines on the legacy DbManager/localStorage store.
 */

import React, { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, Rectangle, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
}

export interface MapArea {
  id: string;
  south: number;
  west: number;
  north: number;
  east: number;
  color: string;
  label?: string;
}

export interface SiteMapProps {
  points: MapPoint[];
  me?: { lat: number; lng: number } | null;
  route?: { lat: number; lng: number }[];
  areas?: MapArea[];
  onPick?: (id: string) => void;
  onPickArea?: (id: string) => void;
  heightClass?: string;
}

const PUNE = { lat: 18.5204, lng: 73.8567 };

const FitTo: React.FC<{ pts: { lat: number; lng: number }[] }> = ({ pts }) => {
  const map = useMap();
  const key = pts.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  useEffect(() => {
    const fit = () => {
      map.invalidateSize(); // the map may have been laid out while its card was still sizing
      if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 15);
      else if (pts.length > 1) map.fitBounds(pts.map(p => [p.lat, p.lng] as [number, number]), { padding: [24, 24], maxZoom: 16 });
    };
    fit();
    const again = setTimeout(fit, 250);
    return () => clearTimeout(again);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
};

const SiteMap: React.FC<SiteMapProps> = ({ points, me, route = [], areas = [], onPick, onPickArea, heightClass = 'h-80' }) => {
  const all = [...points, ...(me ? [me] : []), ...route];
  const center = all[0] ?? PUNE;
  return (
    <div className={`${heightClass} w-full rounded-2xl overflow-hidden border border-[#f0ebe2] relative z-0`}>
      <MapContainer center={[center.lat, center.lng]} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {areas.map(a => (
          <Rectangle key={a.id} bounds={[[a.south, a.west], [a.north, a.east]]}
            pathOptions={{ color: a.color, weight: 1, fillOpacity: 0.18 }}
            eventHandlers={onPickArea ? { click: () => onPickArea(a.id) } : undefined}>
            {a.label && <Tooltip>{a.label}</Tooltip>}
          </Rectangle>
        ))}
        {route.length > 1 && <Polyline positions={route.map(p => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.7 }} />}
        {points.map(p => (
          <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={9}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: p.color, fillOpacity: 0.95 }}
            eventHandlers={onPick ? { click: () => onPick(p.id) } : undefined}>
            <Tooltip>{p.label}</Tooltip>
          </CircleMarker>
        ))}
        {me && <CircleMarker center={[me.lat, me.lng]} radius={7} pathOptions={{ color: '#2563eb', weight: 3, fillColor: '#93c5fd', fillOpacity: 1 }}><Tooltip>You are here</Tooltip></CircleMarker>}
        <FitTo pts={points.length || route.length ? [...points, ...route] : me ? [me] : []} />
      </MapContainer>
    </div>
  );
};

export default SiteMap;
