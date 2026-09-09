/**
 * Bite 5 — board foley + room ambience via Web Audio API.
 * All sounds are generated procedurally in-repo (no third-party packs).
 */

import type { CameraView } from './cameraViews'
import { HEX_ZOOM_MAX, HEX_ZOOM_MIN } from './cameraViews'

const MUTE_KEY = 'openkit-board-muted'

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* ignore */
  }
}

type OneShot = 'place' | 'move' | 'delete'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let sfxBus: GainNode | null = null
let ambientBus: GainNode | null = null
let roomGain: GainNode | null = null
let closeGain: GainNode | null = null
let roomSource: AudioBufferSourceNode | null = null
let closeSource: AudioBufferSourceNode | null = null
let ambienceStarted = false
let unlockWired = false
let muted = loadMuted()
let proximity = 0.25 // 0 = room-out, 1 = close-in

function ensureContext(): AudioContext {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(ctx.destination)

    sfxBus = ctx.createGain()
    sfxBus.gain.value = 0.85
    sfxBus.connect(master)

    ambientBus = ctx.createGain()
    ambientBus.gain.value = 1
    ambientBus.connect(master)

    roomGain = ctx.createGain()
    roomGain.gain.value = 0.045
    roomGain.connect(ambientBus)

    closeGain = ctx.createGain()
    closeGain.gain.value = 0.0
    closeGain.connect(ambientBus)
  }
  return ctx
}

function wireUnlock(): void {
  if (unlockWired) return
  unlockWired = true
  const resume = () => {
    void ensureRunning()
  }
  window.addEventListener('pointerdown', resume, { passive: true })
  window.addEventListener('keydown', resume)
}

async function ensureRunning(): Promise<AudioContext> {
  const c = ensureContext()
  if (c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      /* autoplay may still block until gesture */
    }
  }
  if (!ambienceStarted && c.state === 'running') {
    startAmbienceInternal()
  }
  return c
}

/** Brownish noise buffer (integrated white noise), loopable. */
function makeNoiseBuffer(
  c: AudioContext,
  seconds: number,
  color: 'brown' | 'pink',
): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    if (color === 'brown') {
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    } else {
      // cheap pink-ish: blend white with previous
      last = 0.98 * last + 0.02 * white
      data[i] = (white * 0.3 + last * 0.7) * 0.9
    }
  }
  return buf
}

function startAmbienceInternal(): void {
  if (!ctx || !roomGain || !closeGain || ambienceStarted) return
  ambienceStarted = true

  const roomBuf = makeNoiseBuffer(ctx, 4, 'brown')
  const closeBuf = makeNoiseBuffer(ctx, 3.5, 'pink')

  const roomFilter = ctx.createBiquadFilter()
  roomFilter.type = 'lowpass'
  roomFilter.frequency.value = 180
  roomFilter.Q.value = 0.7

  const closeFilter = ctx.createBiquadFilter()
  closeFilter.type = 'lowpass'
  closeFilter.frequency.value = 520
  closeFilter.Q.value = 0.6

  roomSource = ctx.createBufferSource()
  roomSource.buffer = roomBuf
  roomSource.loop = true
  roomSource.connect(roomFilter)
  roomFilter.connect(roomGain)
  roomSource.start()

  closeSource = ctx.createBufferSource()
  closeSource.buffer = closeBuf
  closeSource.loop = true
  closeSource.connect(closeFilter)
  closeFilter.connect(closeGain)
  closeSource.start()

  applyProximity(proximity, true)
}

function applyProximity(p: number, instant = false): void {
  if (!ctx || !roomGain || !closeGain) return
  const t = ctx.currentTime
  const roomLevel = 0.045 * (1 - p * 0.55)
  const closeLevel = 0.028 * p
  if (instant) {
    roomGain.gain.value = roomLevel
    closeGain.gain.value = closeLevel
  } else {
    roomGain.gain.cancelScheduledValues(t)
    closeGain.gain.cancelScheduledValues(t)
    roomGain.gain.setTargetAtTime(roomLevel, t, 0.35)
    closeGain.gain.setTargetAtTime(closeLevel, t, 0.35)
  }
}

function envGain(
  c: AudioContext,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = c.createGain()
  const t = c.currentTime
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  return g
}

function playNoiseBurst(
  c: AudioContext,
  dest: AudioNode,
  opts: {
    duration: number
    peak: number
    freq: number
    q?: number
    type?: BiquadFilterType
  },
): void {
  const frames = Math.max(1, Math.floor(c.sampleRate * opts.duration))
  const buf = c.createBuffer(1, frames, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1

  const src = c.createBufferSource()
  src.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = opts.type ?? 'bandpass'
  filter.frequency.value = opts.freq
  filter.Q.value = opts.q ?? 1.2
  const g = envGain(c, opts.peak, 0.004, opts.duration * 0.85)
  src.connect(filter)
  filter.connect(g)
  g.connect(dest)
  src.start()
  src.stop(c.currentTime + opts.duration + 0.05)
}

function playTone(
  c: AudioContext,
  dest: AudioNode,
  opts: {
    freq: number
    peak: number
    attack: number
    decay: number
    type?: OscillatorType
  },
): void {
  const osc = c.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.value = opts.freq
  const g = envGain(c, opts.peak, opts.attack, opts.decay)
  osc.connect(g)
  g.connect(dest)
  const t = c.currentTime
  osc.start(t)
  osc.stop(t + opts.attack + opts.decay + 0.02)
}

function playOneShot(kind: OneShot): void {
  if (muted) return
  void ensureRunning().then((c) => {
    if (!sfxBus || muted) return
    if (kind === 'place') {
      // Dry wooden "tok" — noise + low thump
      playNoiseBurst(c, sfxBus, {
        duration: 0.045,
        peak: 0.55,
        freq: 900,
        q: 1.4,
        type: 'bandpass',
      })
      playTone(c, sfxBus, {
        freq: 165,
        peak: 0.35,
        attack: 0.003,
        decay: 0.07,
        type: 'triangle',
      })
    } else if (kind === 'move') {
      // Soft scrape across felt/wood
      playNoiseBurst(c, sfxBus, {
        duration: 0.09,
        peak: 0.22,
        freq: 420,
        q: 0.8,
        type: 'bandpass',
      })
      playTone(c, sfxBus, {
        freq: 110,
        peak: 0.08,
        attack: 0.01,
        decay: 0.08,
        type: 'sine',
      })
    } else {
      // Soft lift / delete tick
      playNoiseBurst(c, sfxBus, {
        duration: 0.035,
        peak: 0.28,
        freq: 1400,
        q: 1.6,
        type: 'bandpass',
      })
      playTone(c, sfxBus, {
        freq: 240,
        peak: 0.12,
        attack: 0.002,
        decay: 0.05,
        type: 'sine',
      })
    }
  })
}

export const boardAudio = {
  init(): void {
    wireUnlock()
    ensureContext()
    applyProximity(proximity, true)
  },

  playPlace(): void {
    playOneShot('place')
  },

  playMove(): void {
    playOneShot('move')
  },

  playDelete(): void {
    playOneShot('delete')
  },

  isMuted(): boolean {
    return muted
  },

  setMuted(next: boolean): void {
    muted = next
    saveMuted(next)
    ensureContext()
    if (!master || !ctx) return
    const t = ctx.currentTime
    master.gain.cancelScheduledValues(t)
    master.gain.setTargetAtTime(next ? 0 : 1, t, 0.04)
  },

  /** 0 = table-room picture, 1 = leaned-in close bed. */
  setProximity(p: number): void {
    proximity = Math.min(1, Math.max(0, p))
    applyProximity(proximity)
  },

  /** Map camera preset + hex zoom into a proximity blend. */
  syncFromView(view: CameraView, hexZoom?: number): void {
    const base = view === 'close' ? 0.85 : view === 'top' ? 0.05 : 0.25
    let zoomFactor = 0
    if (typeof hexZoom === 'number' && Number.isFinite(hexZoom)) {
      const span = HEX_ZOOM_MAX - HEX_ZOOM_MIN || 1
      // Fit-to-view may go below comfort min on large boards — clamp blend 0..1
      zoomFactor = Math.min(1, Math.max(0, (hexZoom - HEX_ZOOM_MIN) / span))
    }
    // Prefer view bed, nudge with live scroll zoom
    this.setProximity(Math.min(1, base * 0.7 + zoomFactor * 0.55))
  },
}
