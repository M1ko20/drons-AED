// Shared definition of the data extent. The simulator's selectable study areas all lie
// inside this box; it is padded so that emergency facilities just outside the mountains
// (which may be the nearest responders) are still part of the model.
export const BBOX = { south: 49.28, west: 17.95, north: 49.78, east: 18.95 }
export const TERRAIN_ZOOM = 10
export const TILE = 256

export function lonToPx(lon, z) {
  return ((lon + 180) / 360) * TILE * 2 ** z
}
export function latToPx(lat, z) {
  const s = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z
}
export function pxToLon(px, z) {
  return (px / (TILE * 2 ** z)) * 360 - 180
}
export function pxToLat(py, z) {
  const n = Math.PI - (2 * Math.PI * py) / (TILE * 2 ** z)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}
export function lonToTileX(lon, z) {
  return Math.floor(lonToPx(lon, z) / TILE)
}
export function latToTileY(lat, z) {
  return Math.floor(latToPx(lat, z) / TILE)
}
