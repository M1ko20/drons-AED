import { latToPx, lonToPx, pxToLat, pxToLon } from './geo'
import type { LngLat } from './types'

/**
 * Elevation grid aligned to the Web-Mercator pixel lattice at `zoom` (256 px tiles).
 * Cell (col,row) covers pixel [px0+col, px0+col+1) × [py0+row, py0+row+1); values are metres AMSL.
 * Keeping the lattice in Mercator means rasters drawn from it register exactly on the map.
 */
export interface Dem {
  zoom: number
  px0: number
  py0: number
  width: number
  height: number
  data: Int16Array | Float32Array
}

export function demBounds(dem: Dem) {
  return {
    west: pxToLon(dem.px0, dem.zoom),
    east: pxToLon(dem.px0 + dem.width, dem.zoom),
    north: pxToLat(dem.py0, dem.zoom),
    south: pxToLat(dem.py0 + dem.height, dem.zoom),
  }
}

/** Bilinear elevation in metres; clamps to the grid edge outside the extent. */
export function elevationAt(dem: Dem, p: LngLat): number {
  const fx = lonToPx(p[0], dem.zoom) - dem.px0 - 0.5
  const fy = latToPx(p[1], dem.zoom) - dem.py0 - 0.5
  const x = Math.max(0, Math.min(dem.width - 1.000001, fx))
  const y = Math.max(0, Math.min(dem.height - 1.000001, fy))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = x - x0
  const ty = y - y0
  const i = y0 * dem.width + x0
  const d = dem.data
  const top = d[i] * (1 - tx) + d[i + 1] * tx
  const bot = d[i + dem.width] * (1 - tx) + d[i + dem.width + 1] * tx
  return top * (1 - ty) + bot * ty
}

export function inDem(dem: Dem, p: LngLat): boolean {
  const fx = lonToPx(p[0], dem.zoom) - dem.px0
  const fy = latToPx(p[1], dem.zoom) - dem.py0
  return fx >= 0 && fy >= 0 && fx < dem.width && fy < dem.height
}

/** Centre of a cell as lon/lat. */
export function cellCenter(dem: Dem, col: number, row: number): LngLat {
  return [pxToLon(dem.px0 + col + 0.5, dem.zoom), pxToLat(dem.py0 + row + 0.5, dem.zoom)]
}

/**
 * Coarser grid for coverage fields: each output cell is the MAX of a factor×factor block, so
 * clearance computed on the coarse grid is conservative with respect to the fine one.
 */
export function coarsen(dem: Dem, factor: number): Dem {
  const width = Math.floor(dem.width / factor)
  const height = Math.floor(dem.height / factor)
  const data = new Float32Array(width * height)
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      let m = -Infinity
      for (let dy = 0; dy < factor; dy++) {
        const base = (r * factor + dy) * dem.width + c * factor
        for (let dx = 0; dx < factor; dx++) {
          const v = dem.data[base + dx]
          if (v > m) m = v
        }
      }
      data[r * width + c] = m
    }
  }
  return {
    zoom: dem.zoom - Math.log2(factor),
    px0: dem.px0 / factor,
    py0: dem.py0 / factor,
    width,
    height,
    data,
  }
}

/** Flat synthetic terrain for tests and manual checks. */
export function flatDem(elevationM: number, center: LngLat = [18.4, 49.5], sizePx = 64, zoom = 10): Dem {
  const data = new Float32Array(sizePx * sizePx).fill(elevationM)
  return {
    zoom,
    px0: Math.floor(lonToPx(center[0], zoom)) - sizePx / 2,
    py0: Math.floor(latToPx(center[1], zoom)) - sizePx / 2,
    width: sizePx,
    height: sizePx,
    data,
  }
}
