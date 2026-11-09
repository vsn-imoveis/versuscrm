import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Place = { id: string; name: string; category: string; lat: number; lon: number; straight?: number; distance?: number };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = String(body.address ?? "").trim();
    const number = String(body.number ?? "").trim();
    const neighborhood = String(body.neighborhood ?? "").trim();
    const city = String(body.city ?? "São Paulo").trim();
    const state = String(body.state ?? "SP").trim();
    const cep = String(body.cep ?? "").trim();
    if (!address && !cep) return NextResponse.json({ error: "Endereço ou CEP não informado." }, { status: 400 });

    const query = [address, number, neighborhood, city, state, cep, "Brasil"].filter(Boolean).join(", ");
    const geo = await geocode(query);
    if (!geo) return NextResponse.json({ places: [], radius_meters: 800, source: "osm", message: "Endereço não localizado." });

    const categories: Array<[string, string]> = [
      ["Supermercados", 'nwr(around:800,LAT,LON)[name][shop~"supermarket|convenience|department_store"];'],
      ["Farmácias", 'nwr(around:800,LAT,LON)[name][amenity="pharmacy"];'],
      ["Educação", 'nwr(around:800,LAT,LON)[name][amenity~"school|kindergarten|college|university"];'],
      ["Saúde", 'nwr(around:800,LAT,LON)[name][amenity~"hospital|clinic|doctors|dentist"];'],
      ["Transporte", 'nwr(around:800,LAT,LON)[name][highway="bus_stop"];nwr(around:800,LAT,LON)[name][railway~"station|subway_entrance|halt|tram_stop"];'],
      ["Padarias", 'nwr(around:800,LAT,LON)[name][shop="bakery"];'],
      ["Alimentação", 'nwr(around:800,LAT,LON)[name][amenity~"restaurant|cafe|fast_food"];'],
      ["Academias", 'nwr(around:800,LAT,LON)[name][leisure="fitness_centre"];nwr(around:800,LAT,LON)[name][amenity="gym"];'],
      ["Bancos", 'nwr(around:800,LAT,LON)[name][amenity="bank"];'],
      ["Comércio", 'nwr(around:800,LAT,LON)[name][shop~"mall|clothes|electronics|furniture|hardware"];'],
    ];

    const all: Place[] = [];
    for (const [category, fragment] of categories) {
      const overpass = '[out:json][timeout:10];(' + fragment.replaceAll("LAT", String(geo.lat)).replaceAll("LON", String(geo.lon)) + ');out center tags;';
      try {
        const response = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: { "Content-Type": "text/plain", "User-Agent": "VersusCRM/1.0" },
          body: overpass,
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) continue;
        const json = await response.json();
        for (const element of json.elements ?? []) {
          const tags = element.tags ?? {};
          const lat = Number(element.lat ?? element.center?.lat);
          const lon = Number(element.lon ?? element.center?.lon);
          if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          all.push({ id: String(element.type) + "/" + String(element.id), name: String(tags.name), category, lat, lon });
        }
      } catch { /* a category can fail without blocking the others */ }
    }

    const seen = new Set<string>();
    const candidates = all.filter((place) => {
      const key = place.name.trim().toLowerCase() + "|" + place.category;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    candidates.forEach((place) => { place.straight = distance(geo.lat, geo.lon, place.lat, place.lon); });
    const nearby = candidates.filter((place) => (place.straight ?? Infinity) <= 1200).sort((a, b) => (a.straight ?? 0) - (b.straight ?? 0)).slice(0, 60);
    const routed = await routeDistances(geo, nearby);
    const places = routed.filter((place) => Number.isFinite(place.distance) && (place.distance ?? Infinity) <= 800)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, 40)
      .map(({ lat, lon, straight, ...place }) => place);

    return NextResponse.json({ source: "openstreetmap_osrm", radius_meters: 800, distance_mode: "walking_route", places, coordinates: geo });
  } catch {
    return NextResponse.json({ error: "Falha ao consultar a localização." }, { status: 500 });
  }
}

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=" + encodeURIComponent(query);
  const response = await fetch(url, { headers: { "User-Agent": "VersusCRM/1.0 (real-estate platform)" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const rows = await response.json();
  if (!rows?.[0]) return null;
  const lat = Number(rows[0].lat), lon = Number(rows[0].lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}
async function routeDistances(origin: { lat: number; lon: number }, places: Place[]): Promise<Place[]> {
  if (!places.length) return [];
  const coordinates = [origin, ...places].map((place) => place.lon + "," + place.lat).join(";");
  const response = await fetch("https://router.project-osrm.org/table/v1/driving/" + coordinates + "?sources=0&annotations=distance", { signal: AbortSignal.timeout(12000) });
  if (!response.ok) return [];
  const json = await response.json();
  const row = json?.distances?.[0] ?? [];
  const result: Place[] = [];
  places.forEach((place, index) => {
    const distance = Number(row[index + 1]);
    if (Number.isFinite(distance)) result.push({ ...place, distance });
  });
  return result;
}
function distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371000, rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}
