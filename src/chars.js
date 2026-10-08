import { hash, shade } from './gfx.js?v=202610080040'

export const HAIRS = ['#2a1e14', '#4a3220', '#6e4a2a', '#b08a50', '#1a1a1a', '#8a8a82', '#5a2e1a', '#c8b48a']
export const OUTFITS = ['tshirt', 'jacket', 'hoodie', 'police', 'medic', 'worker', 'suit', 'tank', 'flannel', 'dress']
const OUTLINE = 'rgba(14,12,10,0.75)'

function cap(g, x1, y1, x2, y2, r) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const l = Math.hypot(x2 - x1, y2 - y1)
  g.save()
  g.translate(x1, y1)
  g.rotate(a)
  g.beginPath()
  g.roundRect(-r, -r, l + r * 2, r * 2, r)
  g.restore()
}

function ell(g, x, y, rx, ry, rot = 0) {
  g.beginPath()
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2)
}

function shapes(g, list, pass) {
  for (const s of list) {
    const o = pass === 0 ? 1.15 : 0
    if (s.t === 'c') cap(g, s.x1, s.y1, s.x2, s.y2, s.r + o)
    else ell(g, s.x, s.y, s.rx + o, s.ry + o, s.rot || 0)
    g.fillStyle = pass === 0 ? OUTLINE : s.col
    g.fill()
  }
}

function outfitColors(o) {
  const shirt = o.shirt
  switch (o.outfit) {
    case 'police': return { torso: '#2b3a55', sleeve: '#2b3a55', pants: '#1f2738' }
    case 'medic': return { torso: '#dcdcd4', sleeve: '#dcdcd4', pants: '#8aa0a8' }
    case 'worker': return { torso: shirt, sleeve: shirt, pants: '#3a4a6a', vest: '#e8822a' }
    case 'suit': return { torso: '#2a2a30', sleeve: '#2a2a30', pants: '#24242a' }
    case 'tank': return { torso: shirt, sleeve: null, pants: o.pants }
    case 'dress': return { torso: shirt, sleeve: null, pants: shirt }
    default: return { torso: shirt, sleeve: shirt, pants: o.pants }
  }
}

function lightOverlay(g, dir, rx, ry, cx = 0, cy = 0, strength = 0.22) {
  const lx = Math.cos(-dir - 2.36) * rx * 0.5
  const ly = Math.sin(-dir - 2.36) * ry * 0.5
  const gr = g.createRadialGradient(cx + lx, cy + ly, 0.5, cx, cy, Math.max(rx, ry) * 1.2)
  gr.addColorStop(0, `rgba(255,248,230,${strength})`)
  gr.addColorStop(0.55, 'rgba(255,255,255,0)')
  gr.addColorStop(1, `rgba(0,0,0,${strength * 1.3})`)
  g.fillStyle = gr
}

function drawHair(g, o, hx) {
  if (!o.hair) return
  g.fillStyle = o.hairColor
  if (o.hair === 2) {
    ell(g, hx - 3.2, 0, 5.4, 6.4)
    g.fill()
    g.beginPath()
    g.roundRect(hx - 10, -4.2, 6, 8.4, 3)
    g.fill()
  } else if (o.hair === 3) {
    g.beginPath()
    g.arc(hx, 0, 6.2, Math.PI * 0.62, Math.PI * 1.38)
    g.fill()
    for (let i = -2; i <= 2; i++) {
      ell(g, hx - 5 + Math.abs(i) * 0.6, i * 2.2, 1.8, 1.4)
      g.fill()
    }
  } else {
    g.beginPath()
    g.arc(hx, 0, 6, Math.PI * 0.5, Math.PI * 1.5)
    g.lineTo(hx + 2.5, -5)
    g.quadraticCurveTo(hx + 4.5, 0, hx + 2.5, 5)
    g.closePath()
    g.fill()
  }
  g.strokeStyle = 'rgba(255,255,255,0.16)'
  g.lineWidth = 0.8
  g.beginPath()
  g.arc(hx - 0.5, 0, 4, Math.PI * 0.9, Math.PI * 1.25)
  g.stroke()
  if (o.zombie && hash(o.gore, 3, 9) < 0.5) {
    g.fillStyle = o.skin
    ell(g, hx - 2, (hash(o.gore, 4, 9) - 0.5) * 6, 1.6, 1.3)
    g.fill()
  }
}

function torsoDetails(g, o, c) {
  switch (o.outfit) {
    case 'jacket':
      g.strokeStyle = 'rgba(0,0,0,0.35)'
      g.lineWidth = 0.9
      g.beginPath()
      g.moveTo(6.4, -1)
      g.lineTo(-2, -0.3)
      g.stroke()
      g.fillStyle = shade(c.torso, -0.2)
      g.beginPath()
      g.roundRect(-4, -11, 7, 3.2, 1.4)
      g.roundRect(-4, 7.8, 7, 3.2, 1.4)
      g.fill()
      break
    case 'hoodie':
      g.fillStyle = shade(c.torso, -0.18)
      ell(g, -4.6, 0, 3.6, 5.8)
      g.fill()
      g.strokeStyle = '#e8e4d8'
      g.lineWidth = 0.7
      g.beginPath()
      g.moveTo(5.6, -1.5)
      g.lineTo(7.4, -2)
      g.moveTo(5.6, 1.5)
      g.lineTo(7.4, 2)
      g.stroke()
      break
    case 'police':
      g.fillStyle = '#d8b44a'
      ell(g, 2.5, -5.5, 1.2, 1.2)
      g.fill()
      g.fillStyle = '#1a2236'
      g.fillRect(-2, -11, 4, 2.4)
      g.fillRect(-2, 8.6, 4, 2.4)
      g.fillStyle = '#2a2a2a'
      g.fillRect(-1, -9, 2, 18)
      break
    case 'medic':
      g.fillStyle = '#c83a32'
      g.fillRect(-5.2, -1, 4, 2)
      g.fillRect(-4.2, -2, 2, 4)
      g.fillStyle = 'rgba(0,0,0,0.15)'
      g.fillRect(1, -7, 0.8, 14)
      break
    case 'worker':
      g.fillStyle = c.vest
      g.beginPath()
      g.ellipse(0, 0, 6, 9.6, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#dfe4e6'
      g.fillRect(-3.2, -9.4, 1.4, 18.8)
      g.fillRect(2, -9.2, 1.4, 18.4)
      break
    case 'suit':
      g.fillStyle = '#ece8de'
      g.beginPath()
      g.moveTo(6.6, -2.6)
      g.lineTo(3, 0)
      g.lineTo(6.6, 2.6)
      g.fill()
      g.fillStyle = '#8a2a26'
      g.fillRect(4.2, -0.7, 2.6, 1.4)
      break
    case 'flannel':
      g.strokeStyle = 'rgba(0,0,0,0.22)'
      g.lineWidth = 0.8
      for (let i = -9; i <= 9; i += 3) {
        g.beginPath()
        g.moveTo(-6, i)
        g.lineTo(6, i)
        g.stroke()
      }
      for (let i = -5; i <= 5; i += 3) {
        g.beginPath()
        g.moveTo(i, -10)
        g.lineTo(i, 10)
        g.stroke()
      }
      break
    case 'dress':
      g.fillStyle = 'rgba(255,255,255,0.18)'
      for (let i = 0; i < 6; i++) {
        ell(g, -4 + (i % 3) * 4, -6 + Math.floor(i / 3) * 10, 0.9, 0.9)
        g.fill()
      }
      break
    default:
      g.fillStyle = 'rgba(0,0,0,0.18)'
      ell(g, 4.6, 0, 1.6, 3.4)
      g.fill()
  }
}

function zombieGore(g, o) {
  const s = o.gore
  for (let i = 0; i < 7; i++) {
    if (hash(i, s, 1) < 0.4) continue
    g.fillStyle = `rgba(${70 + hash(i, s, 2) * 50},${8 + hash(i, s, 8) * 10},6,${0.5 + hash(i, s, 3) * 0.4})`
    ell(g, (hash(i, s, 4) - 0.5) * 9, (hash(i, s, 5) - 0.5) * 17, 1 + hash(i, s, 6) * 2.6, 0.8 + hash(i, s, 7) * 2, hash(i, s, 9) * 3)
    g.fill()
  }
  if (hash(s, 1, 11) < 0.35) {
    const wy = (hash(s, 2, 11) - 0.5) * 8
    g.fillStyle = '#4a0a08'
    ell(g, -1, wy, 3.2, 2.4)
    g.fill()
    g.strokeStyle = '#d8c8b0'
    g.lineWidth = 0.7
    for (let i = -1; i <= 1; i++) {
      g.beginPath()
      g.moveTo(-3, wy + i * 1.3)
      g.lineTo(1, wy + i * 1.3)
      g.stroke()
    }
  }
  g.fillStyle = o.skin
  for (let i = 0; i < 4; i++) {
    if (hash(i, s, 12) < 0.5) continue
    const side = hash(i, s, 13) < 0.5 ? -1 : 1
    const px = (hash(i, s, 14) - 0.5) * 8
    g.beginPath()
    g.moveTo(px - 2, side * 9.6)
    g.lineTo(px, side * 7.2)
    g.lineTo(px + 1.4, side * 8.6)
    g.lineTo(px + 2.6, side * 9.8)
    g.fill()
  }
}

function drawWeapon(g, o) {
  const w = o.weapon
  g.save()
  const base = o.swing > 0 ? -1.2 + (1 - o.swing) * 2.3 : 0.15
  g.translate(2, 5.5)
  g.rotate(base)
  const hx = 9
  const line = (len, width, col, start = -4) => {
    g.strokeStyle = OUTLINE
    g.lineCap = 'round'
    g.lineWidth = width + 1.6
    g.beginPath()
    g.moveTo(hx + start, 0)
    g.lineTo(hx + len, 0)
    g.stroke()
    g.strokeStyle = col
    g.lineWidth = width
    g.stroke()
  }
  switch (w) {
    case 'bat':
      line(9, 2.4, '#b08452')
      line(22, 4.2, '#b08452', 9)
      g.strokeStyle = 'rgba(255,255,255,0.25)'
      g.lineWidth = 0.8
      g.beginPath()
      g.moveTo(hx + 10, -1.2)
      g.lineTo(hx + 21, -1.4)
      g.stroke()
      break
    case 'axe':
      line(21, 2.2, '#8a6438')
      g.fillStyle = OUTLINE
      g.beginPath()
      g.moveTo(hx + 13, 0.4)
      g.lineTo(hx + 20, 0.4)
      g.lineTo(hx + 22.5, -9)
      g.lineTo(hx + 11.5, -8)
      g.closePath()
      g.fill()
      g.fillStyle = '#9aa4aa'
      g.beginPath()
      g.moveTo(hx + 14, -0.5)
      g.lineTo(hx + 19.5, -0.5)
      g.lineTo(hx + 21.5, -8)
      g.lineTo(hx + 12.5, -7.2)
      g.closePath()
      g.fill()
      g.fillStyle = '#e2e8ec'
      g.fillRect(hx + 12.6, -8, 9, 1.2)
      break
    case 'knife':
      line(1.5, 2.6, '#2a2a2a')
      g.fillStyle = OUTLINE
      g.beginPath()
      g.moveTo(hx + 1.5, -1.9)
      g.lineTo(hx + 13, 0)
      g.lineTo(hx + 1.5, 1.9)
      g.fill()
      g.fillStyle = '#d6dadc'
      g.beginPath()
      g.moveTo(hx + 2, -1.2)
      g.lineTo(hx + 11.5, 0)
      g.lineTo(hx + 2, 1.2)
      g.fill()
      break
    case 'crowbar':
      line(17, 2.1, '#43484e')
      g.strokeStyle = '#43484e'
      g.beginPath()
      g.moveTo(hx + 17, 0)
      g.quadraticCurveTo(hx + 22, -1, hx + 20.5, -5.5)
      g.stroke()
      break
    case 'hammer':
      line(11, 2.1, '#9a7448')
      g.fillStyle = OUTLINE
      g.fillRect(hx + 8.5, -4.6, 5.2, 9.2)
      g.fillStyle = '#5e646a'
      g.fillRect(hx + 9.1, -4, 4, 8)
      break
    case 'pan':
      line(7, 2.2, '#2a2a2a')
      g.fillStyle = OUTLINE
      ell(g, hx + 13.5, 0, 7, 7)
      g.fill()
      g.fillStyle = '#3c3e42'
      ell(g, hx + 13.5, 0, 6, 6)
      g.fill()
      g.fillStyle = '#26282a'
      ell(g, hx + 13.5, 0, 4.4, 4.4)
      g.fill()
      break
    case 'spear':
      line(27, 2, '#9a7448')
      g.fillStyle = '#d0d4d8'
      g.beginPath()
      g.moveTo(hx + 26, -1.8)
      g.lineTo(hx + 35, 0)
      g.lineTo(hx + 26, 1.8)
      g.fill()
      break
    case 'plank':
      g.fillStyle = OUTLINE
      g.fillRect(hx - 5, -3.3, 26, 6.6)
      g.fillStyle = '#a8804c'
      g.fillRect(hx - 4.2, -2.6, 24.4, 5.2)
      g.fillStyle = 'rgba(0,0,0,0.2)'
      g.fillRect(hx - 4, 0.5, 24, 0.7)
      break
    case 'pistol':
      g.fillStyle = OUTLINE
      g.fillRect(hx - 2, -2.6, 12.6, 5.2)
      g.fillStyle = '#26282c'
      g.fillRect(hx - 1.2, -1.9, 11, 3.8)
      g.fillStyle = '#4a4e54'
      g.fillRect(hx - 1.2, -1.9, 11, 1)
      break
    case 'shotgun':
      g.fillStyle = OUTLINE
      g.fillRect(hx - 9.5, -2.8, 32, 5.6)
      g.fillStyle = '#6e4a2a'
      g.fillRect(hx - 8.6, -2, 9.6, 4)
      g.fillStyle = '#26282c'
      g.fillRect(hx + 1, -1.6, 21, 3.2)
      g.fillStyle = '#4a4e54'
      g.fillRect(hx + 4, 1.1, 9, 1.4)
      break
  }
  g.fillStyle = OUTLINE
  ell(g, hx, 0.4, 3, 3)
  g.fill()
  g.fillStyle = o.skin
  ell(g, hx, 0.4, 2.2, 2.2)
  g.fill()
  g.restore()
}

function lyingPose(g, o) {
  const c = outfitColors(o)
  const pose = o.pose || 0
  const s = o.gore || 1
  const L = []
  const arm = (ax, ay, bx, by) => {
    L.push({ t: 'c', x1: ax, y1: ay, x2: bx, y2: by, r: 2.1, col: c.sleeve || o.skin })
    L.push({ t: 'e', x: bx, y: by, rx: 2.1, ry: 2.1, col: o.skin })
  }
  if (pose === 0) {
    L.push({ t: 'c', x1: -6, y1: -3, x2: -17, y2: -8, r: 2.6, col: c.pants })
    L.push({ t: 'c', x1: -6, y1: 3, x2: -17, y2: 6 + hash(s, 1, 3) * 3, r: 2.6, col: c.pants })
    if (o.missingArm !== 1) arm(2, -8, 4 + hash(s, 2, 3) * 4, -17)
    if (o.missingArm !== 2) arm(2, 8, -3, 16)
    L.push({ t: 'c', x1: -5, y1: 0, x2: 6, y2: 0, r: 7.4, col: c.torso })
    L.push({ t: 'e', x: 12, y: 1, rx: 5.6, ry: 5.4, col: o.skin })
  } else if (pose === 1) {
    L.push({ t: 'c', x1: -5, y1: -3, x2: -13, y2: -9, r: 2.6, col: c.pants })
    L.push({ t: 'c', x1: -13, y1: -9, x2: -16, y2: -2, r: 2.4, col: c.pants })
    L.push({ t: 'c', x1: -5, y1: 3, x2: -16, y2: 4, r: 2.6, col: c.pants })
    if (o.missingArm !== 1) arm(4, -7, 13, -9)
    if (o.missingArm !== 2) arm(4, 7, 14, 6)
    L.push({ t: 'c', x1: -5, y1: 0, x2: 6, y2: 0, r: 7.2, col: c.torso })
    L.push({ t: 'e', x: 12, y: 0, rx: 5.6, ry: 5.4, col: o.hairColor && o.hair ? o.hairColor : o.skin })
  } else {
    L.push({ t: 'c', x1: -5, y1: 1, x2: -12, y2: 6, r: 2.6, col: c.pants })
    L.push({ t: 'c', x1: -12, y1: 6, x2: -17, y2: 2, r: 2.4, col: c.pants })
    L.push({ t: 'c', x1: -5, y1: 2, x2: -14, y2: 9, r: 2.6, col: c.pants })
    if (o.missingArm !== 1) arm(3, -4, 10, -9)
    L.push({ t: 'c', x1: -5, y1: 0, x2: 6, y2: 0, r: 5.6, col: c.torso })
    if (o.missingArm !== 2) arm(4, 4, 11, 7)
    L.push({ t: 'e', x: 11.5, y: -1, rx: 5.2, ry: 5.6, col: o.skin })
  }
  shapes(g, L, 0)
  shapes(g, L, 1)
  if (pose !== 1 && o.hair) {
    g.save()
    g.translate(pose === 0 ? 12 : 11.5, pose === 0 ? 1 : -1)
    g.rotate(Math.PI)
    g.fillStyle = o.hairColor
    g.beginPath()
    g.arc(0, 0, 5.6, Math.PI * 0.6, Math.PI * 1.4)
    g.fill()
    g.restore()
  }
  if (o.zombie) {
    g.save()
    zombieGore(g, o)
    g.restore()
  }
}

export function drawChar(g, o) {
  const S = o.scale || 1.18
  g.save()
  g.translate(o.x, o.y)
  if (o.down) {
    const f = o.fall === undefined ? 1 : o.fall
    const e = 1 - Math.pow(1 - f, 3)
    g.fillStyle = `rgba(0,0,0,${0.22 * e})`
    ell(g, 3, 4, 17 * S, 11 * S, o.dir)
    g.fill()
    g.rotate(o.dir)
    g.translate(-(1 - e) * 8, 0)
    g.scale(S * (0.7 + 0.3 * e), S * (0.85 + 0.15 * e))
    if (o.struggle) g.rotate(Math.sin(o.struggle * 6) * 0.06)
    lyingPose(g, o)
    g.restore()
    return
  }
  g.fillStyle = 'rgba(0,0,0,0.3)'
  ell(g, 3, 5, 11 * S, 7.5 * S)
  g.fill()
  g.rotate(o.dir + (o.wobble || 0))
  g.scale(S, S)
  if (o.lean) g.translate(-o.lean * 4, 0)
  const c = outfitColors(o)
  const step = o.moving ? Math.sin(o.phase) : 0
  const limp = o.zombie && hash(o.gore, 5, 5) < 0.4 ? 0.35 : 1
  const run = o.run ? 1.35 : 1
  const L = []
  const fl = -1 + step * 6 * run
  const fr = -1 - step * 6 * limp * run
  L.push({ t: 'c', x1: -1.5, y1: -4.2, x2: fl, y2: -4.6, r: 2.7, col: c.pants })
  L.push({ t: 'c', x1: -1.5, y1: 4.2, x2: fr, y2: 4.6, r: 2.7, col: c.pants })
  L.push({ t: 'e', x: fl + 2.4, y: -4.6, rx: 2.8, ry: 2.2, col: '#1e1c1a' })
  L.push({ t: 'e', x: fr + 2.4, y: 4.6, rx: 2.8, ry: 2.2, col: '#1e1c1a' })
  if (o.outfit === 'dress') L.push({ t: 'e', x: -0.5, y: 0, rx: 6, ry: 9, col: c.torso })
  const sw = o.moving ? Math.sin(o.phase) * 4.5 * run : 0
  const sleeve = c.sleeve || o.skin
  const armL = o.missingArm !== 1
  const armR = o.missingArm !== 2
  let handL = null
  let handR = null
  if (o.reach) {
    const r1 = Math.sin(o.phase * 0.5) * 1.6
    if (armL) {
      L.push({ t: 'c', x1: 0, y1: -8.6, x2: 13 + r1, y2: -6.4, r: 2.3, col: sleeve })
      handL = [14.5 + r1, -6.2]
    }
    if (armR) {
      L.push({ t: 'c', x1: 0, y1: 8.6, x2: 12.5 - r1, y2: 6.6, r: 2.3, col: sleeve })
      handR = [14 - r1, 6.6]
    }
  } else if (o.weapon) {
    L.push({ t: 'c', x1: 0, y1: -8.6, x2: 7, y2: -3, r: 2.3, col: sleeve })
    L.push({ t: 'c', x1: 0, y1: 8.6, x2: 9, y2: 5, r: 2.3, col: sleeve })
  } else {
    if (armL) {
      L.push({ t: 'c', x1: 0, y1: -8.8, x2: 4.5 - sw, y2: -9.6, r: 2.3, col: sleeve })
      handL = [6.5 - sw, -9.6]
    }
    if (armR) {
      L.push({ t: 'c', x1: 0, y1: 8.8, x2: 4.5 + sw, y2: 9.6, r: 2.3, col: sleeve })
      handR = [6.5 + sw, 9.6]
    }
  }
  if (o.bag) L.push({ t: 'c', x1: -8.5, y1: -4.5, x2: -8.5, y2: 4.5, r: 3.4, col: o.bagColor || '#4a4a32' })
  L.push({ t: 'c', x1: 0, y1: -7.6, x2: 0, y2: 7.6, r: 4.4, col: c.torso })
  L.push({ t: 'e', x: -0.5, y: 0, rx: 6, ry: 9.6, col: c.torso })
  if (o.outfit === 'hoodie') L.push({ t: 'e', x: -4.6, y: 0, rx: 3.6, ry: 5.8, col: shade(c.torso, -0.18) })
  L.push({ t: 'e', x: 1.6, y: 0, rx: 5.7, ry: 5.4, col: o.skin })
  if (handL) L.push({ t: 'e', x: handL[0], y: handL[1], rx: 2.2, ry: 2.2, col: o.skin })
  if (handR) L.push({ t: 'e', x: handR[0], y: handR[1], rx: 2.2, ry: 2.2, col: o.skin })
  shapes(g, L, 0)
  shapes(g, L, 1)
  if (!armL || !armR) {
    g.fillStyle = '#6a0e0a'
    ell(g, 0, armL ? 9 : -9, 2, 2)
    g.fill()
  }
  if (o.bag) {
    g.fillStyle = 'rgba(0,0,0,0.3)'
    g.fillRect(-9.5, -1, 2, 2)
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.lineWidth = 0.9
    g.beginPath()
    g.moveTo(-6, -6)
    g.lineTo(2, -7)
    g.moveTo(-6, 6)
    g.lineTo(2, 7)
    g.stroke()
  }
  g.save()
  g.beginPath()
  g.ellipse(-0.5, 0, 6, 9.6, 0, 0, Math.PI * 2)
  g.rect(-4.4, -12, 8.8, 24)
  g.clip()
  torsoDetails(g, o, c)
  if (o.zombie) zombieGore(g, o)
  lightOverlay(g, o.dir, 6, 10)
  g.fillRect(-7, -13, 14, 26)
  g.restore()
  if (o.weapon) drawWeapon(g, o)
  g.save()
  g.beginPath()
  g.ellipse(1.6, 0, 5.7, 5.4, 0, 0, Math.PI * 2)
  g.clip()
  lightOverlay(g, o.dir, 5.7, 5.4, 1.6, 0, 0.3)
  g.fillRect(-5, -6, 13, 12)
  if (o.zombie) {
    g.strokeStyle = 'rgba(60,30,50,0.35)'
    g.lineWidth = 0.5
    g.beginPath()
    g.moveTo(-1, -3)
    g.lineTo(1.5, -1.5)
    g.lineTo(0.5, 1)
    g.stroke()
  }
  g.restore()
  g.fillStyle = shade(o.skin, -0.2)
  ell(g, 1.4, -5.4, 1.2, 1.5)
  g.fill()
  ell(g, 1.4, 5.4, 1.2, 1.5)
  g.fill()
  drawHair(g, o, 1)
  if (o.zombie) {
    g.fillStyle = 'rgba(30,6,4,0.9)'
    ell(g, 5.2, -2.1, 1.1, 1.4)
    g.fill()
    ell(g, 5.2, 2.1, 1.1, 1.4)
    g.fill()
    g.fillStyle = 'rgba(230,200,120,0.85)'
    ell(g, 5.4, -2.1, 0.45, 0.45)
    g.fill()
    ell(g, 5.4, 2.1, 0.45, 0.45)
    g.fill()
    g.fillStyle = 'rgba(110,10,8,0.85)'
    ell(g, 6.4, 0.4, 1, 2.2)
    g.fill()
  } else {
    g.fillStyle = 'rgba(40,24,16,0.65)'
    ell(g, 5.6, -2, 0.7, 0.9)
    g.fill()
    ell(g, 5.6, 2, 0.7, 0.9)
    g.fill()
  }
  if (o.hit > 0) {
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = Math.min(0.85, o.hit * 5)
    g.fillStyle = '#ffffff'
    ell(g, -0.5, 0, 6.5, 10)
    g.fill()
    ell(g, 1.6, 0, 6, 5.8)
    g.fill()
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }
  g.restore()
}
