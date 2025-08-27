// src/maps.ts
export function openMaps(address: string, lat?: number | null, lng?: number | null) {
  if (lat != null && lng != null) {
    window.open(`https://www.google.com/maps/search/${lat},${lng}`, "_blank");
  } else {
    const q = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/${q}`, "_blank");
  }
}
