let ac = null
let master = null
let sfxBus = null
let musicBus = null
let ambBus = null
let noiseBuf = null
let amb = null
let music = null
const vol = { master: 0.6, music: 0.5, sfx: 1 }

try {
  const saved = JSON.parse(localStorage.getItem('vale-morto-audio') || 'null')
  if (saved) Object.assign(vol, saved)
} catch (e) {}

export function getVolumes() {
  return { ...vol }
}

export function setVolumes(v) {
  Object.assign(vol, v)
  try {
    localStorage.setItem('vale-morto-audio', JSON.stringify(vol))
  } catch (e) {}
  if (!ac) return
  master.gain.setTargetAtTime(vol.master, ac.currentTime, 0.05)
  musicBus.gain.setTargetAtTime(vol.music * 0.9, ac.currentTime, 0.05)
  sfxBus.gain.setTargetAtTime(vol.sfx, ac.currentTime, 0.05)
}

export function unlockAudio() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume()
    return
  }
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  ac = new Ctx()
  master = ac.createGain()
  master.gain.value = vol.master
  const comp = ac.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 4
  master.connect(comp)
  comp.connect(ac.destination)
  sfxBus = ac.createGain()
  sfxBus.gain.value = vol.sfx
  sfxBus.connect(master)
  musicBus = ac.createGain()
  musicBus.gain.value = vol.music * 0.9
  musicBus.connect(master)
  ambBus = ac.createGain()
  ambBus.gain.value = 1
  ambBus.connect(master)
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  startAmbience()
  startMusic()
}

function out(pan) {
  if (pan === undefined || pan === 0 || !ac.createStereoPanner) return sfxBus
  const p = ac.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  p.connect(sfxBus)
  return p
}

function noise(dur, freq, q, v, type = 'bandpass', attack = 0.005, pan, rate = 1) {
  if (!ac) return
  const src = ac.createBufferSource()
  src.buffer = noiseBuf
  src.playbackRate.value = rate
  const f = ac.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = ac.createGain()
  const t = ac.currentTime
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(v, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f)
  f.connect(g)
  g.connect(out(pan))
  src.start(t, Math.random() * 2)
  src.stop(t + dur + 0.05)
}

function tone(dur, f0, f1, v, type = 'sine', pan, attack = 0.02) {
  if (!ac) return
  const o = ac.createOscillator()
  o.type = type
  const g = ac.createGain()
  const t = ac.currentTime
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(v, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(out(pan))
  o.start(t)
  o.stop(t + dur + 0.05)
}

function loopNoise(filterType, freq, q) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = ac.createBiquadFilter()
  f.type = filterType
  f.frequency.value = freq
  f.Q.value = q
  const g = ac.createGain()
  g.gain.value = 0
  src.connect(f)
  f.connect(g)
  g.connect(ambBus)
  src.start()
  return { src, f, g }
}

function startAmbience() {
  const wind = loopNoise('bandpass', 400, 0.6)
  const lfo = ac.createOscillator()
  lfo.frequency.value = 0.07
  const lg = ac.createGain()
  lg.gain.value = 220
  lfo.connect(lg)
  lg.connect(wind.f.frequency)
  lfo.start()
  const rain = loopNoise('highpass', 1400, 0.4)
  const rain2 = loopNoise('lowpass', 500, 0.5)
  amb = { wind, rain, rain2 }
}

export function setAmbience(a) {
  if (!ac || !amb) return
  const t = ac.currentTime
  const inside = a.indoor ? 0.35 : 1
  amb.wind.g.gain.setTargetAtTime(0.05 * inside * (a.night ? 1.25 : 1) * (a.rain ? 1.4 : 1), t, 0.8)
  amb.rain.g.gain.setTargetAtTime(a.rain ? 0.07 * (a.indoor ? 0.5 : 1) : 0, t, 1.2)
  amb.rain2.g.gain.setTargetAtTime(a.rain ? 0.05 : 0, t, 1.2)
  if (music) {
    music.tension = a.tension
    music.night = a.night
    music.tg.gain.setTargetAtTime(a.tension * 0.22, t, a.tension > music.lastT ? 0.6 : 2.5)
    music.lastT = a.tension
    music.padBus.gain.setTargetAtTime(0.5 * (1 - a.tension * 0.5), t, 2)
  }
}

const NOTE = n => 440 * Math.pow(2, (n - 69) / 12)
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [50, 53, 57], [57, 60, 64], [52, 55, 59], [53, 57, 60]]
const SCALE = [69, 71, 72, 74, 76, 77, 79, 81]

function startMusic() {
  const padBus = ac.createGain()
  padBus.gain.value = 0.5
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1100
  const delay = ac.createDelay(1.5)
  delay.delayTime.value = 0.42
  const fb = ac.createGain()
  fb.gain.value = 0.35
  delay.connect(fb)
  fb.connect(delay)
  padBus.connect(lp)
  lp.connect(musicBus)
  lp.connect(delay)
  delay.connect(musicBus)
  const tg = ac.createGain()
  tg.gain.value = 0
  tg.connect(musicBus)
  const drone = ac.createOscillator()
  drone.type = 'sawtooth'
  drone.frequency.value = 55
  const drone2 = ac.createOscillator()
  drone2.type = 'sawtooth'
  drone2.frequency.value = 55.8
  const dlp = ac.createBiquadFilter()
  dlp.type = 'lowpass'
  dlp.frequency.value = 180
  dlp.Q.value = 4
  const trem = ac.createOscillator()
  trem.frequency.value = 2.2
  const tremG = ac.createGain()
  tremG.gain.value = 90
  trem.connect(tremG)
  tremG.connect(dlp.frequency)
  drone.connect(dlp)
  drone2.connect(dlp)
  dlp.connect(tg)
  drone.start()
  drone2.start()
  trem.start()
  music = { padBus, tg, tension: 0, night: false, lastT: 0, chord: 0 }
  const chordLoop = () => {
    if (!ac) return
    const t = ac.currentTime + 0.05
    const ch = CHORDS[music.chord++ % CHORDS.length]
    const len = 9
    for (const n of ch) {
      for (const det of [-4, 4]) {
        const o = ac.createOscillator()
        o.type = 'triangle'
        o.frequency.value = NOTE(n - 12)
        o.detune.value = det
        const g = ac.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.022, t + 3)
        g.gain.setValueAtTime(0.022, t + len - 3)
        g.gain.linearRampToValueAtTime(0, t + len + 1.5)
        o.connect(g)
        g.connect(padBus)
        o.start(t)
        o.stop(t + len + 2)
      }
    }
    const bass = ac.createOscillator()
    bass.type = 'sine'
    bass.frequency.value = NOTE(ch[0] - 24)
    const bg = ac.createGain()
    bg.gain.setValueAtTime(0, t)
    bg.gain.linearRampToValueAtTime(0.05, t + 2)
    bg.gain.linearRampToValueAtTime(0, t + len + 1)
    bass.connect(bg)
    bg.connect(padBus)
    bass.start(t)
    bass.stop(t + len + 1.5)
    const plucks = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < plucks; i++) {
      if (Math.random() < 0.3) continue
      const pt = t + 1 + Math.random() * (len - 2)
      const n = Math.random() < 0.5 ? ch[Math.floor(Math.random() * 3)] + 12 : SCALE[Math.floor(Math.random() * SCALE.length)]
      const o = ac.createOscillator()
      o.type = 'sine'
      o.frequency.value = NOTE(n)
      const o2 = ac.createOscillator()
      o2.type = 'sine'
      o2.frequency.value = NOTE(n) * 2.01
      const g = ac.createGain()
      g.gain.setValueAtTime(0, pt)
      g.gain.linearRampToValueAtTime(0.03, pt + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, pt + 2.6)
      const g2 = ac.createGain()
      g2.gain.value = 0.25
      o.connect(g)
      o2.connect(g2)
      g2.connect(g)
      g.connect(padBus)
      o.start(pt)
      o2.start(pt)
      o.stop(pt + 2.8)
      o2.stop(pt + 2.8)
    }
    setTimeout(chordLoop, len * 1000)
  }
  chordLoop()
  const beat = () => {
    if (!ac) return
    const ten = music.tension
    if (ten > 0.15) {
      const t = ac.currentTime + 0.02
      for (const [dt, v] of [[0, 1], [0.22, 0.7]]) {
        const o = ac.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(70, t + dt)
        o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.18)
        const g = ac.createGain()
        g.gain.setValueAtTime(0, t + dt)
        g.gain.linearRampToValueAtTime(0.28 * ten * v, t + dt + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22)
        o.connect(g)
        g.connect(musicBus)
        o.start(t + dt)
        o.stop(t + dt + 0.25)
      }
    }
    setTimeout(beat, 60000 / (68 + ten * 60))
  }
  beat()
}

const STEP = {
  grass: [0.14, 700, 0.8, 'lowpass', 0.9],
  dirt: [0.13, 500, 0.8, 'lowpass', 0.8],
  road: [0.07, 2200, 1.2, 'bandpass', 1.2],
  sidewalk: [0.07, 1800, 1.4, 'bandpass', 1.1],
  wood: [0.1, 380, 2, 'bandpass', 1],
  tile: [0.05, 3000, 2, 'bandpass', 1.3],
  concrete: [0.06, 1500, 1.4, 'bandpass', 1],
  water: [0.25, 900, 0.7, 'bandpass', 0.6]
}

export const sfx = {
  swing: () => noise(0.18, 900, 0.8, 0.25, 'bandpass', 0.03),
  hit: () => { noise(0.14, 260, 1.2, 0.7); tone(0.12, 140, 60, 0.4, 'triangle'); noise(0.08, 1800, 2, 0.15) },
  kill: () => { noise(0.3, 180, 0.9, 0.6); tone(0.25, 90, 40, 0.35, 'sawtooth'); noise(0.35, 600, 1, 0.25, 'lowpass', 0.05) },
  gun: () => { noise(0.35, 1200, 0.4, 1.0, 'lowpass', 0.002); tone(0.2, 160, 40, 0.6, 'square'); noise(1.2, 300, 0.5, 0.2, 'lowpass', 0.05) },
  shotgun: () => { noise(0.6, 700, 0.3, 1.0, 'lowpass', 0.002); tone(0.35, 120, 30, 0.8, 'square'); noise(1.6, 250, 0.5, 0.25, 'lowpass', 0.05) },
  click: () => tone(0.05, 1800, 1200, 0.15, 'square'),
  glass: () => { noise(0.5, 4200, 2, 0.6, 'highpass'); noise(0.3, 2600, 4, 0.4); for (let i = 0; i < 4; i++) setTimeout(() => tone(0.08, 3000 + Math.random() * 2000, 2500, 0.06, 'sine'), 80 + i * 70) },
  door: () => { tone(0.12, 220, 160, 0.2, 'triangle'); noise(0.08, 500, 1, 0.2) },
  creak: () => {
    if (!ac) return
    const o = ac.createOscillator()
    o.type = 'sawtooth'
    const f = ac.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 900
    f.Q.value = 8
    const g = ac.createGain()
    const t = ac.currentTime
    const base = 180 + Math.random() * 120
    o.frequency.setValueAtTime(base, t)
    o.frequency.linearRampToValueAtTime(base * 1.6, t + 0.35)
    o.frequency.linearRampToValueAtTime(base * 1.2, t + 0.55)
    const lfo = ac.createOscillator()
    lfo.frequency.value = 28
    const lg = ac.createGain()
    lg.gain.value = 18
    lfo.connect(lg)
    lg.connect(o.frequency)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    o.connect(f)
    f.connect(g)
    g.connect(sfxBus)
    o.start(t)
    lfo.start(t)
    o.stop(t + 0.65)
    lfo.stop(t + 0.65)
    setTimeout(() => noise(0.08, 500, 1, 0.22), 560)
  },
  bang: (v = 1, pan) => { noise(0.25, 140, 1, 0.8 * v, 'bandpass', 0.005, pan); tone(0.2, 80, 40, 0.5 * v, 'triangle', pan) },
  hammer: () => { tone(0.08, 900, 600, 0.35, 'square'); noise(0.1, 2000, 2, 0.3) },
  hurt: () => { tone(0.3, 380, 180, 0.35, 'sawtooth'); noise(0.2, 800, 1, 0.3) },
  groan: (v = 0.3, pan = 0) => {
    if (!ac) return
    const kind = Math.random()
    const o = ac.createOscillator()
    const o2 = ac.createOscillator()
    o.type = 'sawtooth'
    o2.type = 'sine'
    const f = ac.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 2.5
    const f2 = ac.createBiquadFilter()
    f2.type = 'lowpass'
    f2.frequency.value = 900
    const g = ac.createGain()
    const t = ac.currentTime
    const base = kind < 0.4 ? 60 + Math.random() * 30 : 85 + Math.random() * 50
    const dur = kind < 0.4 ? 1.6 : 0.9 + Math.random() * 0.6
    o.frequency.setValueAtTime(base, t)
    o.frequency.linearRampToValueAtTime(base * (kind < 0.7 ? 0.75 : 1.2), t + dur)
    f.frequency.setValueAtTime(kind < 0.4 ? 380 : 650, t)
    f.frequency.linearRampToValueAtTime(kind < 0.4 ? 260 : 450, t + dur)
    o2.frequency.value = 3 + Math.random() * 6
    const lfo = ac.createGain()
    lfo.gain.value = base * 0.12
    o2.connect(lfo)
    lfo.connect(o.frequency)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v, t + 0.2)
    g.gain.setValueAtTime(v * 0.8, t + dur * 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(f)
    f.connect(f2)
    f2.connect(g)
    g.connect(out(pan))
    if (kind > 0.75) noise(dur * 0.6, 1200, 1, v * 0.35, 'bandpass', 0.1, pan, 0.6)
    o.start(t)
    o2.start(t)
    o.stop(t + dur + 0.1)
    o2.stop(t + dur + 0.1)
  },
  step: (surface, v = 1, pan = 0) => {
    const s = STEP[surface] || STEP.road
    noise(s[0], s[1] * (0.9 + Math.random() * 0.2), s[2], 0.16 * v, s[3], 0.004, pan, s[4])
    if (surface === 'wood') tone(0.06, 140, 90, 0.06 * v, 'triangle', pan)
  },
  zstep: (v, pan) => noise(0.22, 400, 0.8, 0.12 * v, 'lowpass', 0.05, pan, 0.7),
  eat: () => noise(0.25, 1500, 3, 0.2),
  pickup: () => tone(0.06, 600, 900, 0.12, 'triangle'),
  ui: () => tone(0.04, 1200, 1400, 0.05, 'triangle'),
  level: () => { tone(0.15, 520, 520, 0.2, 'triangle'); setTimeout(() => tone(0.25, 780, 780, 0.2, 'triangle'), 120) },
  alarm: () => { tone(0.4, 900, 700, 0.3, 'square') },
  heli: () => { for (let i = 0; i < 6; i++) setTimeout(() => noise(0.12, 120, 0.7, 0.5, 'lowpass'), i * 110) },
  chop: () => { noise(0.12, 600, 1.5, 0.6); tone(0.1, 200, 90, 0.3, 'triangle') },
  dig: () => noise(0.3, 400, 0.8, 0.4),
  thud: (v = 1, pan) => { noise(0.2, 160, 0.8, 0.5 * v, 'lowpass', 0.005, pan); tone(0.15, 70, 40, 0.3 * v, 'sine', pan) }
}
