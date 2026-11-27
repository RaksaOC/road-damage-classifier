/* Maps without keys or billing: OpenFreeMap vector tiles (OpenStreetMap data) drawn with MapLibre GL,
   and place names from OpenStreetMap's Nominatim reverse geocoder.
   Nominatim's free service allows about 1 lookup per second, so we only look up when the pin is dropped. */

/** Where the map starts when the browser won't share its position: Phnom Penh. */
export const FALLBACK = { lat: 11.5564, lng: 104.9282 };

export interface LatLng {
  lat: number;
  lng: number;
}

/** OpenFreeMap style: always the light "positron" map, in both app themes. */
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export const osmLink = (p: LatLng) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`;

/** The browser's position, or null if the user says no or it takes too long. */
export function currentPosition(timeoutMs = 8000): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export const coords = (p: LatLng) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

interface NominatimAddress {
  road?: string;
  house_number?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  village?: string;
  town?: string;
  city?: string;
  state?: string;
}

/** A short name for a point: road + area + city, without postcode or country. Falls back to the coordinates. */
export async function placeName(p: LatLng, signal?: AbortSignal): Promise<string> {
  try {
    const q = new URLSearchParams({ format: "jsonv2", lat: String(p.lat), lon: String(p.lng), zoom: "18", addressdetails: "1", "accept-language": "en" });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${q}`, { signal });
    if (!res.ok) return coords(p);
    const { address: a } = (await res.json()) as { address?: NominatimAddress };
    if (!a) return coords(p);
    const road = a.road && (a.house_number ? `${a.house_number} ${a.road}` : a.road);
    const area = a.neighbourhood ?? a.quarter ?? a.suburb ?? a.village;
    const city = a.city ?? a.town ?? a.state;
    const parts = [road, area, city].filter((x, i, all): x is string => !!x && all.indexOf(x) === i);
    return parts.length ? parts.join(", ") : coords(p);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return coords(p);
  }
}
