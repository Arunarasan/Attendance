/**
 * Low-light correction for camera frames, as a pure function over RGBA pixels so it can be tested without a camera.
 * Dark frames are stretched to the full range, then lifted with a gamma curve. Normal frames are left untouched.
 */
export type EnhanceStats = { before: number; after: number; applied: boolean }

/** Mean luminance (0-255) of an RGBA buffer, sampling every `step`th pixel. */
export function meanLuma(data: Uint8ClampedArray, step = 4): number {
  let sum = 0, n = 0
  for (let i = 0; i < data.length; i += 4 * step) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    n++
  }
  return n ? sum / n : 0
}

/** Frames at or above this mean are already well lit and are not touched. */
export const DARK_BELOW = 105

export function enhanceImageData(data: Uint8ClampedArray): EnhanceStats {
  const before = meanLuma(data)
  if (before >= DARK_BELOW) return { before, after: before, applied: false }

  // Histogram of luminance (sampled) to find the 2nd and 98th percentiles.
  const hist = new Uint32Array(256)
  let n = 0
  for (let i = 0; i < data.length; i += 16) {
    hist[Math.min(255, Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]))]++
    n++
  }
  let lo = 0, hi = 255, acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break } }
  if (hi - lo < 40) hi = Math.min(255, lo + 40) // avoid blowing up pure noise

  // Stretch, then pick a gamma that brings the stretched mean near mid-grey (never darkening).
  const stretchedMean = Math.max(0.02, Math.min(0.98, (before - lo) / (hi - lo)))
  const gamma = Math.max(0.45, Math.min(1, Math.log(0.5) / Math.log(stretchedMean)))
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const s = Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
    lut[v] = Math.round(255 * Math.pow(s, gamma))
  }
  // Same curve on every channel keeps colour balance.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }
  return { before, after: meanLuma(data), applied: true }
}
