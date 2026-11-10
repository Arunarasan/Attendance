export type Position = { lat: number; lng: number; accuracy: number }

/** Best-effort GPS: samples for a few seconds and keeps the most accurate fix. Resolves null if unavailable. */
export function getBestPosition(maxWaitMs = 6000, goodEnoughMeters = 25): Promise<Position | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise(resolve => {
    let best: Position | null = null
    let done = false
    const finish = () => {
      if (done) return
      done = true
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
      resolve(best)
    }
    const id = navigator.geolocation.watchPosition(
      p => {
        const cur = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
        if (!best || cur.accuracy < best.accuracy) best = cur
        if (cur.accuracy <= goodEnoughMeters) finish()
      },
      () => finish(),
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
    )
    const timer = setTimeout(finish, maxWaitMs)
  })
}
