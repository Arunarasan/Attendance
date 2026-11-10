/**
 * Browser-side face capture. The model code is loaded lazily so the portal stays small.
 * Descriptors are 128 numbers; the server matches them (Euclidean distance) against enrolled templates.
 *
 * Accuracy and low light, at the same speed:
 *  - well-lit frames go straight to the detector (no extra work);
 *  - dark frames are brightened first (lib/enhance.ts) and use a slightly larger, more sensitive detector pass;
 *  - a punch averages the descriptors of several frontal frames instead of trusting a single frame;
 *  - when it is dark the page can turn the screen white as a fill light (onLight).
 * Liveness (a small head turn) is only a deterrent against holding up a photo.
 */
import { DARK_BELOW, enhanceImageData, meanLuma } from './enhance'

type FaceApi = typeof import('@vladmandic/face-api')

let api: FaceApi | null = null
let loading: Promise<FaceApi> | null = null

export function loadFace(): Promise<FaceApi> {
  if (api) return Promise.resolve(api)
  if (!loading) {
    loading = (async () => {
      const faceapi = await import('@vladmandic/face-api')
      const tf: any = faceapi.tf
      await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'))
      await tf.ready()
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ])
      api = faceapi
      return faceapi
    })().catch(e => { loading = null; throw e })
  }
  return loading
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs HTTPS (or localhost)')
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  // Ask the camera for continuous auto-exposure and, where supported, more exposure for dim rooms. Best effort only.
  try {
    const track = stream.getVideoTracks()[0]
    const caps: any = track.getCapabilities?.() ?? {}
    const advanced: any[] = []
    if (caps.exposureMode?.includes?.('continuous')) advanced.push({ exposureMode: 'continuous' })
    if (caps.whiteBalanceMode?.includes?.('continuous')) advanced.push({ whiteBalanceMode: 'continuous' })
    if (caps.exposureCompensation) advanced.push({ exposureCompensation: caps.exposureCompensation.max * 0.6 })
    if (advanced.length) await track.applyConstraints({ advanced } as any)
  } catch { /* unsupported: the software correction still applies */ }
  video.srcObject = stream
  try {
    await video.play()
  } catch (e: any) {
    // A newer start (or a cleanup) replaced this stream; that is not a failure.
    if (e?.name !== 'AbortError') throw e
  }
  return stream
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach(t => t.stop())
}

export type Capture = { descriptor: number[]; yaw: number; score: number; luma: number; enhanced: boolean; box: { width: number } }

let tiny: { c: HTMLCanvasElement; x: CanvasRenderingContext2D } | null = null
let work: { c: HTMLCanvasElement; x: CanvasRenderingContext2D } | null = null

function ctxFor(w: number, h: number, kind: 'tiny' | 'work') {
  const slot = kind === 'tiny' ? tiny : work
  if (slot && slot.c.width === w && slot.c.height === h) return slot
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const x = c.getContext('2d', { willReadFrequently: true })!
  const made = { c, x }
  if (kind === 'tiny') tiny = made; else work = made
  return made
}

/** Cheap brightness probe (48x36), so well-lit frames cost almost nothing extra. */
function probeLuma(video: HTMLVideoElement): number {
  const { x } = ctxFor(48, 36, 'tiny')
  x.drawImage(video, 0, 0, 48, 36)
  return meanLuma(x.getImageData(0, 0, 48, 36).data, 1)
}

/** The image to analyse: the video itself when bright enough, else a brightened 640-wide copy. */
function frameFor(video: HTMLVideoElement): { src: HTMLVideoElement | HTMLCanvasElement; luma: number; enhanced: boolean } {
  const luma = probeLuma(video)
  if (luma >= DARK_BELOW || !video.videoWidth) return { src: video, luma, enhanced: false }
  const w = 640, h = Math.max(1, Math.round((w * video.videoHeight) / video.videoWidth))
  const { c, x } = ctxFor(w, h, 'work')
  x.drawImage(video, 0, 0, w, h)
  const img = x.getImageData(0, 0, w, h)
  const stats = enhanceImageData(img.data)
  if (stats.applied) x.putImageData(img, 0, 0)
  return { src: c, luma, enhanced: stats.applied }
}

/** One detection pass: the largest face, its descriptor, a head-turn measure and how well lit the frame was. */
export async function detectOnce(video: HTMLVideoElement): Promise<Capture | null> {
  const f = await loadFace()
  const { src, luma, enhanced } = frameFor(video)
  const opts = enhanced
    ? new f.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 })
    : new f.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 })
  const r = await f.detectSingleFace(src, opts).withFaceLandmarks().withFaceDescriptor()
  if (!r) return null
  const pts = r.landmarks.positions
  const left = pts[0].x, right = pts[16].x, nose = pts[30].x
  const yaw = (nose - (left + right) / 2) / Math.max(1, right - left) // about -0.5..0.5, 0 when facing the camera
  return { descriptor: Array.from(r.descriptor), yaw, score: r.detection.score, luma, enhanced, box: { width: r.detection.box.width } }
}

/** True once the yaw has swung through at least `span` across the recent frames. */
export function turnedHead(yaws: number[], span = 0.1): boolean {
  if (yaws.length < 4) return false
  return Math.max(...yaws) - Math.min(...yaws) >= span
}

/**
 * One descriptor from several frames: the most frontal, most confident ones, averaged. Averaging cancels frame noise,
 * which is what makes recognition steadier in poor light.
 */
export function bestDescriptor(frames: Capture[]): number[] | null {
  if (!frames.length) return null
  const frontal = frames.filter(f => Math.abs(f.yaw) < 0.2).sort((a, b) => b.score - a.score).slice(0, 5)
  const use = frontal.length >= 2 ? frontal : [...frames].sort((a, b) => Math.abs(a.yaw) - Math.abs(b.yaw)).slice(0, 3)
  const out = new Array<number>(128).fill(0)
  for (const f of use) for (let i = 0; i < 128; i++) out[i] += f.descriptor[i]
  return out.map(v => v / use.length)
}

export type ScanOptions = {
  video: HTMLVideoElement
  isStopped: () => boolean
  isPaused?: () => boolean
  onHint: (hint: string) => void
  /** Called when the room is dark enough that the screen should light the face (and when it no longer needs to). */
  onLight?: (dark: boolean) => void
  /** Receives one averaged descriptor per person who looked, then turned their head. */
  onDescriptor: (descriptor: number[]) => Promise<void> | void
  /** Stop after the first descriptor (enrolment-style screens). */
  once?: boolean
}

/** Shared scan loop for the face punch, kiosk and confirmation screens. */
export async function scanForFace(o: ScanOptions): Promise<void> {
  const frames: Capture[] = []
  const yaws: number[] = []
  let dark = false
  let darkCount = 0
  const setLight = (luma: number) => {
    // Hysteresis: the white screen itself raises the reading, so it turns off only when the scene is clearly bright.
    if (!dark) { darkCount = luma < 70 ? darkCount + 1 : 0; if (darkCount >= 4) { dark = true; o.onLight?.(true) } }
    else if (luma > 150) { dark = false; darkCount = 0; o.onLight?.(false) }
  }
  while (!o.isStopped()) {
    if (o.isPaused?.()) { frames.length = 0; yaws.length = 0; await sleep(300); continue }
    let cap: Capture | null
    try { cap = await detectOnce(o.video) } catch { await sleep(500); continue }
    if (!cap) {
      frames.length = 0; yaws.length = 0
      try { setLight(probeLuma(o.video)) } catch { /* ignore */ }
      o.onHint(dark ? 'Face the screen light' : 'Look at the camera')
      await sleep(250)
      continue
    }
    setLight(cap.luma)
    if (cap.box.width < 110) { o.onHint('Come a little closer'); await sleep(250); continue }
    frames.push(cap)
    if (frames.length > 12) frames.shift()
    yaws.push(cap.yaw)
    if (yaws.length > 10) yaws.shift()
    if (!turnedHead(yaws)) { o.onHint('Turn your head slightly'); await sleep(150); continue }
    const descriptor = bestDescriptor(frames)
    frames.length = 0; yaws.length = 0
    if (!descriptor) continue
    await o.onDescriptor(descriptor)
    if (o.once) return
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
