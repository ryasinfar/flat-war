// ─── geo helpers shared client-side ─────────────────────────────────────────
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** great-circle distance with antimeridian wrap-around */
export function attackDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const d1 = haversineKm(a.lat, a.lon, b.lat, b.lon)
  const shifted = b.lon > 0 ? b.lon - 360 : b.lon + 360
  const d2 = haversineKm(a.lat, a.lon, b.lat, shifted)
  return Math.min(d1, d2)
}

export function travelSeconds(km: number) {
  return Math.round(45 + km / 25)
}
