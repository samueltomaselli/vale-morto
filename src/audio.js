let ac = null
let master = null
let noiseBuf = null

export function unlockAudio() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume()
    return
  }
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  ac = new Ctx()
  master = ac.createGain()
  master.gain.value = 0.5
  master.connect(ac.destination)
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
}

export function setVolume(v) {
  if (master) master.gain.value = v
}

function noise(dur, freq, q, vol, type = 'bandpass', attack = 0.005) {
  if (!ac) return
  const src = ac.createBufferSource()
  src.buffer = noiseBuf
  const f = ac.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = ac.createGain()
  const t = ac.currentTime
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.05)
}

function tone(dur, f0, f1, vol, type = 'sine') {
  if (!ac) return
  const o = ac.createOscillator()
  o.type = type
  const g = ac.createGain()
  const t = ac.currentTime
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

export const sfx = {
  swing: () => noise(0.18, 900, 0.8, 0.25, 'bandpass', 0.03),
  hit: () => { noise(0.14, 260, 1.2, 0.7); tone(0.12, 140, 60, 0.4, 'triangle') },
  kill: () => { noise(0.3, 180, 0.9, 0.6); tone(0.25, 90, 40, 0.35, 'sawtooth') },
  gun: () => { noise(0.35, 1200, 0.4, 1.0, 'lowpass', 0.002); tone(0.2, 160, 40, 0.6, 'square') },
  shotgun: () => { noise(0.6, 700, 0.3, 1.0, 'lowpass', 0.002); tone(0.35, 120, 30, 0.8, 'square') },
  click: () => tone(0.05, 1800, 1200, 0.15, 'square'),
  glass: () => { noise(0.5, 4200, 2, 0.6, 'highpass'); noise(0.3, 2600, 4, 0.4) },
  door: () => { tone(0.12, 220, 160, 0.2, 'triangle'); noise(0.08, 500, 1, 0.2) },
  bang: (v = 1) => { noise(0.25, 140, 1, 0.8 * v); tone(0.2, 80, 40, 0.5 * v, 'triangle') },
  hammer: () => { tone(0.08, 900, 600, 0.35, 'square'); noise(0.1, 2000, 2, 0.3) },
  hurt: () => { tone(0.3, 380, 180, 0.35, 'sawtooth'); noise(0.2, 800, 1, 0.3) },
  groan: (v = 0.3) => {
    if (!ac) return
    const o = ac.createOscillator()
    const o2 = ac.createOscillator()
    o.type = 'sawtooth'
    o2.type = 'sine'
    const f = ac.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 500
    const g = ac.createGain()
    const t = ac.currentTime
    const base = 70 + Math.random() * 50
    o.frequency.setValueAtTime(base, t)
    o.frequency.linearRampToValueAtTime(base * 0.7, t + 1.1)
    o2.frequency.value = 4 + Math.random() * 3
    const lfo = ac.createGain()
    lfo.gain.value = 12
    o2.connect(lfo)
    lfo.connect(o.frequency)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v, t + 0.25)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
    o.connect(f)
    f.connect(g)
    g.connect(master)
    o.start(t)
    o2.start(t)
    o.stop(t + 1.3)
    o2.stop(t + 1.3)
  },
  eat: () => noise(0.25, 1500, 3, 0.2),
  pickup: () => tone(0.06, 600, 900, 0.12, 'triangle'),
  level: () => { tone(0.15, 520, 520, 0.2, 'triangle'); setTimeout(() => tone(0.25, 780, 780, 0.2, 'triangle'), 120) },
  alarm: () => { tone(0.4, 900, 700, 0.3, 'square') },
  heli: () => { for (let i = 0; i < 6; i++) setTimeout(() => noise(0.12, 120, 0.7, 0.5, 'lowpass'), i * 110) },
  chop: () => { noise(0.12, 600, 1.5, 0.6); tone(0.1, 200, 90, 0.3, 'triangle') },
  dig: () => noise(0.3, 400, 0.8, 0.4)
}
