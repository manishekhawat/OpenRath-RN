/**
 * Speed limits and speed cameras from OpenStreetMap through the free Overpass API (the pure
 * parts of Drive.speedAlerts). Many Indian roads have no limit tagged, so a limit shows only
 * where the map has one.
 */
import { ahead, dist } from './geo.ts';

export interface Camera {
  lat: number;
  lon: number;
  limit: number;
}

export const OVERPASS = 'https://overpass-api.de/api/interpreter';

export function query(lat: number, lon: number): string {
  const a = lat.toFixed(6);
  const o = lon.toFixed(6);
  return (
    '[out:json][timeout:10];(' +
    `way(around:25,${a},${o})[highway][maxspeed];` +
    `node(around:3000,${a},${o})[highway=speed_camera];` +
    `node(around:3000,${a},${o})[enforcement=maxspeed];` +
    ');out tags center;'
  );
}

/** A maxspeed tag in km/h ("50", "30 mph"; "IN:urban" gives 0). */
export function speed(s: string | null | undefined): number {
  if (!s) return 0;
  const m = /(\d+)/.exec(s);
  if (!m) return 0;
  const v = parseInt(m[1], 10);
  return s.includes('mph') ? Math.round(v * 1.609) : v;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The lowest tagged limit on the roads here, and the cameras near, from an Overpass answer. */
export function parse(j: any): { limit: number; cameras: Camera[] } {
  let limit = 0;
  const cameras: Camera[] = [];
  for (const e of j?.elements ?? []) {
    const tags = e.tags;
    if (!tags) continue;
    if (e.type === 'way') {
      const v = speed(tags.maxspeed);
      if (v > 0 && (limit === 0 || v < limit)) limit = v;
    } else {
      cameras.push({ lat: e.lat, lon: e.lon, limit: speed(tags.maxspeed) });
    }
  }
  return { limit, cameras };
}

/** Metres to the nearest camera ahead within 600 m, or -1. */
export function nearestCamera(lat: number, lon: number, heading: number, kmh: number, cams: Camera[]): number {
  let nearest = -1;
  for (const c of cams) {
    const d = dist(lat, lon, c.lat, c.lon);
    const isAhead = kmh < 5 || ahead(lat, lon, heading, c.lat, c.lon, 600);
    if (d < 600 && isAhead && (nearest < 0 || d < nearest)) nearest = Math.round(d);
  }
  return nearest;
}

/** Above the limit (with 3 km/h grace), or above the owner's warning speed anywhere. */
export function isOver(kmh: number, limit: number, warnAt: number): boolean {
  return (limit > 0 && kmh > limit + 3) || (warnAt > 0 && kmh > warnAt);
}
