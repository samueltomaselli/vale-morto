import { T, CAR_COLORS } from './world.js'

export const TS = 32
export const WALL_H = 26
const R = 2

export function hash(x, y, s = 0) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 1442695041
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  n = n ^ (n >>> 16)
  return (n >>> 0) / 4294967296
}

function vnoise(x, y, s) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi, s)
  const b = hash(xi + 1, yi, s)
  const c = hash(xi, yi + 1, s)
  const d = hash(xi + 1, yi + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x, y, s) {
  return vnoise(x, y, s) * 0.55 + vnoise(x * 2.07, y * 2.07, s + 7) * 0.3 + vnoise(x * 4.31, y * 4.31, s + 13) * 0.15
}

function vnoiseP(x, y, s, P) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const m = n => ((n % P) + P) % P
  const a = hash(m(xi), m(yi), s)
  const b = hash(m(xi + 1), m(yi), s)
  const c = hash(m(xi), m(yi + 1), s)
  const d = hash(m(xi + 1), m(yi + 1), s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

const NS = 512
let NOISE = null
function buildNoise() {
  NOISE = new Float32Array(NS * NS)
  for (let y = 0; y < NS; y++) {
    for (let x = 0; x < NS; x++) {
      const u = x / 16
      const v = y / 16
      NOISE[y * NS + x] = vnoiseP(u, v, 1, 32) * 0.55 + vnoiseP(u * 2, v * 2, 8, 64) * 0.3 + vnoiseP(u * 4, v * 4, 14, 128) * 0.15
    }
  }
}

export function samp(u, v) {
  if (!NOISE) buildNoise()
  const x = u * 16
  const y = v * 16
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const x0 = xi & 511
  const y0 = yi & 511
  const x1 = (x0 + 1) & 511
  const y1 = (y0 + 1) & 511
  const a = NOISE[y0 * NS + x0]
  const b = NOISE[y0 * NS + x1]
  const c = NOISE[y1 * NS + x0]
  const d = NOISE[y1 * NS + x1]
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

function hex(c) {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function shade(c, f) {
  const [r, g, b] = hex(c)
  const m = v => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))))
  return `rgb(${m(r)},${m(g)},${m(b)})`
}

function rr(g, x, y, w, h, r) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

function ell(g, x, y, rx, ry, rot = 0) {
  g.beginPath()
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
}

export const isWallLike = t => t === T.WALL || t === T.WINDOW || t === T.DOOR || t === T.WOODWALL

const WOOD_TONES = [[142, 104, 66], [104, 74, 48], [126, 112, 96], [152, 118, 80]]
const CARPETS = [[112, 42, 40], [46, 62, 92], [88, 92, 60], [120, 96, 60], [76, 60, 86]]
const RUGS = [['#7a2e2a', '#c9a35a', '#3a1614'], ['#2c3e5e', '#b8b08a', '#151f30'], ['#5d6b3c', '#d8c89a', '#2e361c'], ['#8a5a2a', '#e2cfa0', '#3e2812'], ['#5a3a5e', '#d0b0c8', '#2a1a2e']]

export class Ground {
  constructor(W) {
    this.W = W
    this.CH = 8
    this.cache = new Map()
    this.order = []
    this.max = 90
    this.rugs = []
    this.bTone = W.buildings.map(b => ({
      wood: WOOD_TONES[Math.floor(hash(b.id, 3, 91) * WOOD_TONES.length)],
      carpet: hash(b.id, 4, 92) < 0.45 ? CARPETS[Math.floor(hash(b.id, 5, 93) * CARPETS.length)] : null
    }))
    for (const b of W.buildings) {
      if (b.type !== 'house') continue
      b.rooms.forEach((r, i) => {
        if (r.w >= 4 && r.h >= 4 && hash(b.id, i, 94) < 0.75) {
          this.rugs.push({ x: (r.x + 1) * TS + 4, y: (r.y + 1) * TS + 4, w: (r.w - 2) * TS - 8, h: (r.h - 2) * TS - 8, s: RUGS[Math.floor(hash(b.id, i, 95) * RUGS.length)], v: hash(b.id, i, 96) })
        }
      })
    }
  }

  dirty(x, y) {
    const cx = Math.floor(x / this.CH)
    const cy = Math.floor(y / this.CH)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.cache.delete(`${cx + dx},${cy + dy}`)
  }

  draw(ctx, x0, y0, x1, y1, budget = 3) {
    const C = this.CH
    for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) {
      for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) {
        const key = `${cx},${cy}`
        let c = this.cache.get(key)
        if (!c && budget > 0) {
          budget--
          c = this.build(cx, cy)
          this.cache.set(key, c)
          this.order.push(key)
          if (this.order.length > this.max) {
            const old = this.order.shift()
            if (old !== key) this.cache.delete(old)
          }
        }
        if (c) ctx.drawImage(c, cx * C * TS, cy * C * TS, C * TS, C * TS)
        else {
          ctx.fillStyle = '#2a3020'
          ctx.fillRect(cx * C * TS, cy * C * TS, C * TS, C * TS)
        }
      }
    }
    return budget
  }

  base(x, y) {
    const W = this.W
    if (x < 0 || y < 0 || x >= W.w || y >= W.h) return T.TREE
    const k = y * W.w + x
    let t = W.tiles[k]
    if (t === T.CAR) t = W.carBase[k] ?? T.ROAD
    if (t === T.FURN && W.furn[k] && W.furn[k].base !== undefined) t = W.furn[k].base
    if (t === T.WOODWALL && W.woodwalls && W.woodwalls[k]) t = W.woodwalls[k].base
    return t
  }

  wallAt(x, y) {
    const W = this.W
    if (x < 0 || y < 0 || x >= W.w || y >= W.h) return false
    const t = W.tiles[y * W.w + x]
    return t === T.WALL || t === T.WINDOW || t === T.DOOR
  }

  info(x, y) {
    const W = this.W
    const inb = x >= 0 && y >= 0 && x < W.w && y < W.h
    if (!inb) return { t: T.TREE, indoor: false, fl: -1, tone: null, bid: -1, wall: false }
    const k = y * W.w + x
    const raw = W.tiles[k]
    const t = this.base(x, y)
    const bid = W.bld[k]
    const indoor = bid >= 0 && t !== T.GRASS && t !== T.DIRT
    return { t, indoor, fl: indoor ? W.floor[k] : -1, tone: bid >= 0 ? this.bTone[bid] : null, bid, wall: raw === T.WALL || raw === T.WINDOW || raw === T.DOOR }
  }

  pix(f, wx, wy, out) {
    const W = this.W
    let r, gg, b
    if (f.indoor) {
      const fl = f.fl
      if (fl === 1) {
        const chk = (Math.floor(wx / 32) + Math.floor(wy / 32)) % 2
        const grout = wx % 32 < 2 || wy % 32 < 2
        const base = grout ? 122 : chk ? 202 : 178
        const n = (hash(wx, wy, 4) - 0.5) * 6 + (samp(wx / 80 + 19, wy / 80 + 11) - 0.5) * 14
        r = base + n
        gg = base + n + 1
        b = base + n - 6
      } else if (fl === 3) {
        const n = (samp(wx / 50 + 25, wy / 50 + 15) - 0.5) * 22 + (hash(wx, wy, 9) - 0.5) * 8
        r = 104 + n
        gg = 105 + n
        b = 100 + n
      } else if (f.tone && f.tone.carpet && fl === 0 && W.buildings[f.bid].type === 'house' && hash(f.bid, 1, 97) < 0.5) {
        const [cr, cg, cb] = f.tone.carpet
        const n = (hash(wx, wy, 11) - 0.5) * 14 + Math.sin(wx * 0.9) * 2
        r = cr + n
        gg = cg + n
        b = cb + n
      } else {
        const [wr, wg, wb] = f.tone ? f.tone.wood : WOOD_TONES[0]
        const row = Math.floor(wy / 20)
        const off = hash(row, 1, 12) * 300
        const seg = Math.floor((wx + off) / 120)
        const bt = 0.82 + hash(row, seg, 13) * 0.3
        const grain = Math.sin(wx * 0.11 + samp(wx / 60 + 44, wy / 6 + 27) * 7) * 5
        const seam = wy % 20 === 0 || Math.floor((wx - 1 + off) / 120) !== seg ? 0.62 : 1
        r = (wr * bt + grain) * seam
        gg = (wg * bt + grain * 0.8) * seam
        b = (wb * bt + grain * 0.6) * seam
      }
    } else {
      switch (f.t) {
        case T.ROAD:
        case T.PARKING: {
          const base = f.t === T.ROAD ? 46 : 54
          let n = (samp(wx / 70 + 66, wy / 70 + 40) - 0.5) * 14 + (hash(wx, wy, 22) - 0.5) * 12
          if (hash(wx >> 1, wy >> 1, 23) > 0.97) n += 18
          if (samp(wx / 220 + 76, wy / 220 + 46) > 0.66) n -= 8
          r = base + n
          gg = base + n + 1
          b = base + n + 4
          break
        }
        case T.SIDEWALK: {
          const n = (samp(wx / 40 + 98, wy / 40 + 60) - 0.5) * 14 + (hash(wx, wy, 32) - 0.5) * 9
          const seam = wx % 32 === 0 || wy % 32 === 0 ? -22 : wx % 32 === 1 || wy % 32 === 1 ? 10 : 0
          r = 122 + n + seam
          gg = 118 + n + seam
          b = 110 + n + seam
          break
        }
        case T.DIRT: {
          const n = (samp(wx / 30 + 130, wy / 30 + 79) - 0.5) * 24 + (hash(wx, wy, 42) - 0.5) * 16
          const furrow = Math.sin((wy / 16) * Math.PI) * 9
          r = 92 + n + furrow
          gg = 66 + n * 0.8 + furrow * 0.8
          b = 44 + n * 0.6 + furrow * 0.6
          break
        }
        case T.WATER: {
          const n = (samp(wx / 60 + 161, wy / 60 + 98) - 0.5) * 16
          r = 28 + n
          gg = 58 + n
          b = 74 + n * 1.2
          break
        }
        default: {
          const n = samp(wx / 110 + 3, wy / 110 + 2)
          const dry = Math.max(0, samp(wx / 180 + 16, wy / 180 + 10) - 0.58) * 2.6
          const fine = (hash(wx, wy, 2) - 0.5) * 16
          const blade = hash(wx >> 1, Math.floor(wy / 5), 3) > 0.8 ? 12 : 0
          r = 46 + n * 30 + dry * 44 + fine + blade * 0.7
          gg = 60 + n * 30 + dry * 30 + fine + blade
          b = 32 + n * 14 + dry * 10 + fine * 0.6
          if (f.t === T.TREE) {
            r *= 0.82
            gg *= 0.86
            b *= 0.82
          }
        }
      }
    }
    out[0] = r
    out[1] = gg
    out[2] = b
  }

  build(cx, cy) {
    const W = this.W
    const C = this.CH
    const N = C * TS * R
    const c = makeCanvas(N, N)
    const g = c.getContext('2d')
    const img = g.createImageData(N, N)
    const d = img.data
    const P = TS * R
    const half = P / 2
    const band = 5 * R
    const out = [0, 0, 0]
    for (let ty = 0; ty < C; ty++) {
      for (let tx = 0; tx < C; tx++) {
        const x = cx * C + tx
        const y = cy * C + ty
        const self = this.info(x, y)
        const isWall = self.wall
        const nb = {}
        for (const [key, dx, dy] of [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0], ['nw', -1, -1], ['ne', 1, -1], ['sw', -1, 1], ['se', 1, 1]]) nb[key] = this.info(x + dx, y + dy)
        for (let py = 0; py < P; py++) {
          for (let px = 0; px < P; px++) {
            const wx = x * P + px
            const wy = y * P + py
            let f = self
            let shadeF = 1
            if (isWall) {
              const dx = px - half
              const dy = py - half
              const vert = Math.abs(dy) >= Math.abs(dx)
              const a = vert ? (dy < 0 ? 'n' : 's') : (dx < 0 ? 'w' : 'e')
              const b2 = vert ? (dx < 0 ? 'w' : 'e') : (dy < 0 ? 'n' : 's')
              const dg = (dy < 0 ? 'n' : 's') + (dx < 0 ? 'w' : 'e')
              f = !nb[a].wall ? nb[a] : !nb[b2].wall ? nb[b2] : !nb[dg].wall ? nb[dg] : nb[a]
              const dist = Math.max(0, (vert ? Math.abs(dy) : Math.abs(dx)) - band)
              if (f.indoor) shadeF = 1 - Math.max(0, 1 - dist / (9 * R)) * 0.5
              else {
                const se = a === 's' || a === 'e'
                shadeF = 1 - Math.max(0, 1 - dist / ((se ? 20 : 6) * R)) * (se ? 0.5 : 0.25)
              }
            } else if (!self.indoor) {
              let sh = 0
              if (nb.n.wall) sh = Math.max(sh, 1 - (py + 11 * R) / (20 * R))
              if (nb.w.wall) sh = Math.max(sh, 1 - (px + 11 * R) / (20 * R))
              if (sh > 0) shadeF = 1 - sh * 0.5
            }
            this.pix(f, wx, wy, out)
            const o = ((ty * P + py) * N + tx * P + px) * 4
            d[o] = out[0] * shadeF
            d[o + 1] = out[1] * shadeF
            d[o + 2] = out[2] * shadeF * (shadeF < 1 ? 1.04 : 1)
            d[o + 3] = 255
          }
        }
      }
    }
    g.putImageData(img, 0, 0)
    const ox = cx * C * TS
    const oy = cy * C * TS
    g.setTransform(R, 0, 0, R, -ox * R, -oy * R)
    for (const rug of this.rugs) {
      if (rug.x > ox + C * TS || rug.y > oy + C * TS || rug.x + rug.w < ox || rug.y + rug.h < oy) continue
      drawRug(g, rug)
    }
    for (let ty = 0; ty < C; ty++) {
      for (let tx = 0; tx < C; tx++) {
        const x = cx * C + tx
        const y = cy * C + ty
        if (x < 0 || y < 0 || x >= W.w || y >= W.h) continue
        this.details(g, x, y)
      }
    }
    return c
  }

  details(g, x, y) {
    const W = this.W
    const t = this.base(x, y)
    const k = y * W.w + x
    const px = x * TS
    const py = y * TS
    const h = hash(x, y, 77)
    const h2 = hash(x, y, 78)
    const indoor = W.bld[k] >= 0 && t !== T.GRASS && t !== T.DIRT
    if (indoor) {
      if (h < 0.04) {
        g.save()
        g.translate(px + 8 + h2 * 16, py + 8 + hash(x, y, 79) * 16)
        g.rotate(h2 * 6)
        g.fillStyle = 'rgba(230,226,212,0.8)'
        g.fillRect(-4, -5, 8, 10)
        g.fillStyle = 'rgba(80,80,80,0.35)'
        for (let i = -3; i < 4; i += 2) g.fillRect(-3, i, 6, 0.6)
        g.restore()
      }
      return
    }
    const near = (dx, dy) => this.base(x + dx, y + dy)
    if (t === T.SIDEWALK) {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const n = near(dx, dy)
        if (n === T.ROAD) {
          g.fillStyle = 'rgba(170,166,156,0.9)'
          if (dy === -1) g.fillRect(px, py, TS, 3)
          if (dy === 1) g.fillRect(px, py + TS - 3, TS, 3)
          if (dx === -1) g.fillRect(px, py, 3, TS)
          if (dx === 1) g.fillRect(px + TS - 3, py, 3, TS)
          g.fillStyle = 'rgba(0,0,0,0.35)'
          if (dy === -1) g.fillRect(px, py - 1, TS, 1)
          if (dy === 1) g.fillRect(px, py + TS, TS, 1)
          if (dx === -1) g.fillRect(px - 1, py, 1, TS)
          if (dx === 1) g.fillRect(px + TS, py, 1, TS)
        }
        if (n === T.GRASS || n === T.TREE) {
          g.fillStyle = 'rgba(40,52,28,0.5)'
          if (dy === -1) g.fillRect(px, py, TS, 2)
          if (dy === 1) g.fillRect(px, py + TS - 2, TS, 2)
          if (dx === -1) g.fillRect(px, py, 2, TS)
          if (dx === 1) g.fillRect(px + TS - 2, py, 2, TS)
        }
      }
      if (h < 0.05) crack(g, px, py, h2)
      else if (h < 0.1) leaves(g, px, py, h2, 5)
      else if (h < 0.115) paper(g, px + 16, py + 16, h2)
    } else if (t === T.ROAD) {
      const roads = W.roads
      const hb = roads.find(r => y >= r && y <= r + 2)
      const vb = roads.find(r => x >= r && x <= r + 2)
      if (hb !== undefined && vb === undefined) {
        if (y === hb + 1 && x % 2 === 0) {
          g.fillStyle = `rgba(214,178,70,${0.55 + h * 0.3})`
          g.fillRect(px + 6, py + 15, 20, 2.5)
        }
        if (roads.some(c => x === c - 1 || x === c + 3)) zebra(g, px, py, true)
      } else if (vb !== undefined && hb === undefined) {
        if (x === vb + 1 && y % 2 === 0) {
          g.fillStyle = `rgba(214,178,70,${0.55 + h * 0.3})`
          g.fillRect(px + 15, py + 6, 2.5, 20)
        }
        if (roads.some(c => y === c - 1 || y === c + 3)) zebra(g, px, py, false)
      }
      if (h < 0.04) crack(g, px, py, h2)
      else if (h < 0.07) {
        g.fillStyle = 'rgba(10,10,14,0.35)'
        ell(g, px + 10 + h2 * 12, py + 10 + h * 200, 7 + h2 * 5, 4 + h2 * 3, h2 * 3)
        g.fill()
      } else if (h < 0.075) {
        g.fillStyle = '#3b3b3d'
        ell(g, px + 16, py + 16, 8, 8)
        g.fill()
        g.strokeStyle = 'rgba(0,0,0,0.5)'
        g.lineWidth = 1
        for (let i = -5; i <= 5; i += 2.5) {
          g.beginPath()
          g.moveTo(px + 11, py + 16 + i)
          g.lineTo(px + 21, py + 16 + i)
          g.stroke()
        }
      }
    } else if (t === T.PARKING) {
      if (x % 3 === 0) {
        g.fillStyle = 'rgba(225,222,205,0.5)'
        g.fillRect(px, py + 2, 2, TS - 4)
      }
      if (h < 0.06) {
        g.fillStyle = 'rgba(10,10,14,0.3)'
        ell(g, px + 16, py + 16, 8, 5, h2 * 3)
        g.fill()
      }
    } else if (t === T.GRASS || t === T.TREE) {
      if (h < 0.045) {
        const cols = ['#e8e2d0', '#e7c94a', '#b48ad0', '#d86a5a']
        const col = cols[Math.floor(h2 * cols.length)]
        for (let i = 0; i < 6; i++) {
          g.fillStyle = col
          ell(g, px + 4 + hash(x, y, 100 + i) * 24, py + 4 + hash(x, y, 120 + i) * 24, 1.3, 1.3)
          g.fill()
        }
      } else if (h < 0.14) {
        g.strokeStyle = 'rgba(30,44,20,0.7)'
        g.lineWidth = 1
        for (let i = 0; i < 7; i++) {
          const bx = px + 6 + hash(x, y, 140 + i) * 20
          const by = py + 8 + hash(x, y, 160 + i) * 20
          g.beginPath()
          g.moveTo(bx, by)
          g.lineTo(bx + (hash(x, y, 180 + i) - 0.5) * 4, by - 4 - hash(x, y, 200 + i) * 3)
          g.stroke()
        }
        g.strokeStyle = 'rgba(120,150,70,0.5)'
        for (let i = 0; i < 4; i++) {
          const bx = px + 6 + hash(x, y, 220 + i) * 20
          const by = py + 8 + hash(x, y, 240 + i) * 20
          g.beginPath()
          g.moveTo(bx, by)
          g.lineTo(bx + 1, by - 4)
          g.stroke()
        }
      } else if (h < 0.17) {
        g.fillStyle = 'rgba(80,62,40,0.32)'
        ell(g, px + 16, py + 16, 9 + h2 * 5, 6 + h2 * 3, h2 * 4)
        g.fill()
      } else if (h < 0.19) {
        g.fillStyle = '#6d6a62'
        ell(g, px + 10 + h2 * 12, py + 12 + h * 50, 2.5, 2)
        g.fill()
        g.fillStyle = 'rgba(255,255,255,0.15)'
        ell(g, px + 9.5 + h2 * 12, py + 11.5 + h * 50, 1.2, 0.8)
        g.fill()
      } else if (h < 0.22 && t === T.TREE) leaves(g, px, py, h2, 8)
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (near(dx, dy) === T.WATER) {
          g.strokeStyle = 'rgba(70,90,40,0.9)'
          g.lineWidth = 1
          for (let i = 0; i < 4; i++) {
            const bx = px + (dx === 1 ? 24 : dx === -1 ? 4 : 4 + hash(x, y, 300 + i) * 24)
            const by = py + (dy === 1 ? 26 : dy === -1 ? 8 : 6 + hash(x, y, 320 + i) * 22)
            g.beginPath()
            g.moveTo(bx, by + 4)
            g.lineTo(bx + (hash(x, y, 340 + i) - 0.5) * 4, by - 7)
            g.stroke()
          }
        }
      }
    } else if (t === T.WATER) {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (near(dx, dy) === T.WATER) continue
        const gr = g.createLinearGradient(px + (dx === 1 ? TS : 0), py + (dy === 1 ? TS : 0), px + (dx === 1 ? TS - 10 : dx === -1 ? 10 : 0), py + (dy === 1 ? TS - 10 : dy === -1 ? 10 : 0))
        gr.addColorStop(0, 'rgba(90,110,80,0.75)')
        gr.addColorStop(0.4, 'rgba(60,100,110,0.35)')
        gr.addColorStop(1, 'rgba(40,80,100,0)')
        g.fillStyle = gr
        g.fillRect(px, py, TS, TS)
      }
      if (h < 0.06) {
        g.fillStyle = '#4c6e3a'
        ell(g, px + 16, py + 16, 6, 5)
        g.fill()
        g.fillStyle = 'rgba(0,0,0,0.2)'
        g.beginPath()
        g.moveTo(px + 16, py + 16)
        g.lineTo(px + 22, py + 13)
        g.lineTo(px + 22, py + 18)
        g.fill()
      }
    }
  }
}

function zebra(g, px, py, vertBars) {
  g.fillStyle = 'rgba(225,222,210,0.55)'
  for (let i = 3; i < TS; i += 7) {
    if (vertBars) g.fillRect(px + 4, py + i, TS - 8, 3.5)
    else g.fillRect(px + i, py + 4, 3.5, TS - 8)
  }
}

function crack(g, px, py, s) {
  g.strokeStyle = 'rgba(15,15,15,0.45)'
  g.lineWidth = 0.8
  g.beginPath()
  let x = px + 4 + s * 10
  let y = py + 6 + s * 8
  g.moveTo(x, y)
  for (let i = 0; i < 5; i++) {
    x += 3 + hash(i, s * 1000, 5) * 4
    y += (hash(i, s * 1000, 6) - 0.3) * 7
    g.lineTo(x, y)
    if (i === 2) {
      g.lineTo(x + 4, y - 5)
      g.moveTo(x, y)
    }
  }
  g.stroke()
}

function leaves(g, px, py, s, n) {
  const cols = ['#8a5a2a', '#a8742e', '#6e4a22', '#9a3e22']
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(hash(i, s * 999, 7) * cols.length)]
    ell(g, px + 3 + hash(i, s * 999, 8) * 26, py + 3 + hash(i, s * 999, 9) * 26, 2, 1.1, hash(i, s * 999, 10) * 6)
    g.fill()
  }
}

function paper(g, x, y, s) {
  g.save()
  g.translate(x, y)
  g.rotate(s * 6)
  g.fillStyle = 'rgba(232,228,214,0.85)'
  g.fillRect(-4, -3, 8, 6)
  g.restore()
}

function drawRug(g, r) {
  const [base, accent, dark] = r.s
  g.save()
  g.fillStyle = 'rgba(0,0,0,0.25)'
  g.fillRect(r.x + 1, r.y + 2, r.w, r.h)
  g.fillStyle = base
  g.fillRect(r.x, r.y, r.w, r.h)
  g.strokeStyle = accent
  g.lineWidth = 2
  g.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8)
  g.strokeStyle = dark
  g.lineWidth = 1
  g.strokeRect(r.x + 7, r.y + 7, r.w - 14, r.h - 14)
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  g.fillStyle = accent
  g.globalAlpha = 0.7
  g.beginPath()
  g.moveTo(cx, cy - Math.min(r.h, r.w) * 0.3)
  g.lineTo(cx + Math.min(r.h, r.w) * 0.3, cy)
  g.lineTo(cx, cy + Math.min(r.h, r.w) * 0.3)
  g.lineTo(cx - Math.min(r.h, r.w) * 0.3, cy)
  g.fill()
  g.globalAlpha = 1
  g.fillStyle = dark
  g.beginPath()
  g.moveTo(cx, cy - Math.min(r.h, r.w) * 0.15)
  g.lineTo(cx + Math.min(r.h, r.w) * 0.15, cy)
  g.lineTo(cx, cy + Math.min(r.h, r.w) * 0.15)
  g.lineTo(cx - Math.min(r.h, r.w) * 0.15, cy)
  g.fill()
  g.fillStyle = accent
  for (let i = r.x + 3; i < r.x + r.w - 2; i += 3) {
    g.fillRect(i, r.y - 3, 1, 3)
    g.fillRect(i, r.y + r.h, 1, 3)
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${hash(i, r.v * 1000, 1) * 0.12})`
    g.fillRect(r.x + hash(i, r.v * 1000, 2) * r.w, r.y + hash(i, r.v * 1000, 3) * r.h, 2, 2)
  }
  g.restore()
}

const spriteCache = new Map()
function cached(key, w, h, fn) {
  let c = spriteCache.get(key)
  if (c) return c
  c = makeCanvas(w * R, h * R)
  const g = c.getContext('2d')
  g.scale(R, R)
  fn(g)
  spriteCache.set(key, c)
  return c
}

function box(g, x, y, w, d, h, top, front, opts = {}) {
  g.fillStyle = 'rgba(0,0,0,0.28)'
  g.fillRect(x + 2, y + 3, w, d)
  g.fillStyle = front
  g.fillRect(x, y + d - h, w, h)
  const gr = g.createLinearGradient(0, y + d - h, 0, y + d)
  gr.addColorStop(0, 'rgba(0,0,0,0)')
  gr.addColorStop(1, 'rgba(0,0,0,0.25)')
  g.fillStyle = gr
  g.fillRect(x, y + d - h, w, h)
  g.fillStyle = top
  g.fillRect(x, y - h, w, d)
  g.fillStyle = 'rgba(255,255,255,0.14)'
  g.fillRect(x, y - h, w, 1.5)
  g.fillRect(x, y - h, 1.5, d)
  g.fillStyle = 'rgba(0,0,0,0.18)'
  g.fillRect(x + w - 1.5, y - h, 1.5, d)
  g.strokeStyle = 'rgba(0,0,0,0.45)'
  g.lineWidth = 0.8
  g.strokeRect(x + 0.4, y - h + 0.4, w - 0.8, d + h - 0.8)
  g.beginPath()
  g.moveTo(x, y + d - h)
  g.lineTo(x + w, y + d - h)
  g.stroke()
}

export const FURN_LIFT = 22

export function furnSprite(kind, variant) {
  return cached(`f:${kind}:${variant}`, TS, TS + FURN_LIFT, g => {
    g.translate(0, FURN_LIFT)
    const v = variant
    switch (kind) {
      case 'fridge': {
        box(g, 4, 4, 24, 24, 20, '#d9dcdc', '#c4c8c9')
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.fillRect(4, 14, 24, 0.8)
        g.fillStyle = '#7e8486'
        g.fillRect(23, 15, 2, 9)
        g.fillRect(23, 10, 2, 3)
        g.fillStyle = 'rgba(255,255,255,0.35)'
        g.fillRect(6, -14, 3, 18)
        break
      }
      case 'counter':
      case 'sink': {
        box(g, 1, 3, 30, 26, 12, '#b9a07a', '#6e5236')
        g.fillStyle = 'rgba(0,0,0,0.35)'
        g.fillRect(16, 18, 0.8, 11)
        g.fillStyle = '#c9a85a'
        g.fillRect(13, 22, 1.5, 3)
        g.fillRect(18, 22, 1.5, 3)
        if (kind === 'sink') {
          const gr = g.createLinearGradient(0, -6, 0, 12)
          gr.addColorStop(0, '#5f7a88')
          gr.addColorStop(1, '#a9c0cc')
          g.fillStyle = gr
          rr(g, 7, -5, 18, 14, 3)
          g.fill()
          g.strokeStyle = '#d0d8dc'
          g.lineWidth = 1.2
          g.stroke()
          g.fillStyle = '#9aa2a6'
          g.fillRect(15, -8, 2, 5)
          g.fillStyle = '#2a3a44'
          ell(g, 16, 3, 1.5, 1.5)
          g.fill()
        } else {
          if (v === 0) {
            g.fillStyle = '#8a6a44'
            rr(g, 6, -4, 12, 8, 1.5)
            g.fill()
            g.fillStyle = '#d9d2c0'
            ell(g, 24, -2, 3, 3)
            g.fill()
          } else if (v === 1) {
            g.fillStyle = '#c9c4b8'
            ell(g, 10, 0, 4, 4)
            g.fill()
            g.fillStyle = '#5a7a4a'
            ell(g, 22, -3, 2.5, 2.5)
            g.fill()
          } else {
            g.fillStyle = '#3a3a3a'
            rr(g, 18, -6, 9, 7, 1)
            g.fill()
          }
        }
        break
      }
      case 'stove': {
        box(g, 2, 3, 28, 26, 12, '#34383b', '#3e4245')
        for (const [bx, by] of [[9, -3], [23, -3], [9, 8], [23, 8]]) {
          g.strokeStyle = '#5c6064'
          g.lineWidth = 1.5
          ell(g, bx, by, 4.5, 4.5)
          g.stroke()
          g.fillStyle = '#1c1e20'
          ell(g, bx, by, 2.5, 2.5)
          g.fill()
        }
        g.fillStyle = '#16181a'
        rr(g, 6, 19, 20, 8, 1.5)
        g.fill()
        g.fillStyle = 'rgba(255,255,255,0.15)'
        g.fillRect(8, 20, 6, 1)
        g.fillStyle = '#9aa0a4'
        g.fillRect(8, 17.5, 16, 1.2)
        break
      }
      case 'wardrobe': {
        box(g, 2, 8, 28, 20, 24, '#5a3e28', '#70502f')
        g.fillStyle = 'rgba(0,0,0,0.35)'
        g.fillRect(16, 4, 0.8, 24)
        g.fillStyle = 'rgba(255,255,255,0.08)'
        g.fillRect(4, 6, 10, 20)
        g.fillStyle = '#d0b060'
        g.fillRect(13.5, 14, 1.5, 3)
        g.fillRect(17.5, 14, 1.5, 3)
        g.fillStyle = '#4a321f'
        g.fillRect(2, 4, 28, 1.5)
        break
      }
      case 'shelf': {
        box(g, 2, 14, 28, 14, 24, '#6a4c32', '#5a3e28')
        const cols = ['#8a2f2a', '#2f4f7a', '#c9a35a', '#3f5a3a', '#6b4a6e', '#d9d2c0', '#a8552a', '#24304a']
        for (let row = 0; row < 3; row++) {
          const yb = 12 + row * 7.5
          g.fillStyle = '#3a2818'
          g.fillRect(3.5, yb - 6, 25, 6.5)
          let bx = 4
          let i = 0
          while (bx < 27) {
            const bw = 1.6 + hash(i, row, v * 13 + 1) * 2.2
            const bh = 4 + hash(i, row, v * 13 + 2) * 2.3
            g.fillStyle = cols[Math.floor(hash(i, row, v * 13 + 3) * cols.length)]
            g.fillRect(bx, yb - bh, Math.min(bw, 27.5 - bx), bh)
            bx += bw + 0.4
            i++
          }
          g.fillStyle = '#6a4c32'
          g.fillRect(2, yb, 28, 1.5)
        }
        break
      }
      case 'cabinet': {
        box(g, 4, 14, 24, 14, 14, '#e2ded2', '#d4cfc2')
        g.fillStyle = 'rgba(0,0,0,0.2)'
        g.fillRect(16, 16, 0.8, 12)
        g.fillStyle = '#8a8478'
        g.fillRect(13.5, 20, 1.5, 3)
        g.fillRect(17.5, 20, 1.5, 3)
        g.fillStyle = '#7ab0c8'
        rr(g, 7, -1, 3, 5, 1)
        g.fill()
        g.fillStyle = '#e07a6a'
        rr(g, 12, -2, 3, 6, 1)
        g.fill()
        g.fillStyle = '#f0f0e8'
        rr(g, 20, 0, 4, 4, 1)
        g.fill()
        break
      }
      case 'toolbox': {
        box(g, 8, 14, 16, 12, 8, '#b5402f', '#922f22')
        g.strokeStyle = '#2a2a2a'
        g.lineWidth = 1.5
        g.beginPath()
        g.moveTo(12, 9)
        g.lineTo(12, 4)
        g.lineTo(20, 4)
        g.lineTo(20, 9)
        g.stroke()
        g.fillStyle = '#c9a85a'
        g.fillRect(15, 19, 2, 2)
        break
      }
      case 'bed': {
        const blankets = ['#7a3a34', '#3a5a7a', '#5a6a3a', '#8a6a3a', '#5a4a6a']
        box(g, 2, 2, 28, 28, 7, '#e6e0d2', '#5a3e28')
        g.fillStyle = blankets[v % blankets.length]
        g.fillRect(2, 6, 28, 17)
        g.fillStyle = 'rgba(255,255,255,0.18)'
        g.fillRect(2, 6, 28, 2.5)
        g.fillStyle = 'rgba(0,0,0,0.15)'
        for (let i = 4; i < 30; i += 6) g.fillRect(i, 9, 0.8, 14)
        g.fillStyle = '#f2eee4'
        rr(g, 6, -3, 20, 6, 2.5)
        g.fill()
        g.strokeStyle = 'rgba(0,0,0,0.2)'
        g.lineWidth = 0.6
        g.stroke()
        g.fillStyle = '#4a321f'
        g.fillRect(2, -6, 28, 2)
        break
      }
      case 'sofa': {
        const cols = ['#6d5a7a', '#5a6d5e', '#7a5a4a', '#4e5e7a']
        const c = cols[v % cols.length]
        box(g, 1, 6, 30, 22, 9, shade(c, 0.12), shade(c, -0.25))
        box(g, 1, 6, 30, 7, 16, shade(c, 0.05), shade(c, -0.15))
        g.fillStyle = 'rgba(0,0,0,0.22)'
        g.fillRect(11, 4, 0.8, 15)
        g.fillRect(21, 4, 0.8, 15)
        g.fillStyle = shade(c, -0.1)
        g.fillRect(1, -3, 4, 22)
        g.fillRect(27, -3, 4, 22)
        break
      }
      case 'rack':
      case 'medrack':
      case 'toolrack': {
        const frame = kind === 'medrack' ? '#d8ddd8' : kind === 'toolrack' ? '#7a4a2e' : '#8e9296'
        box(g, 1, 9, 30, 16, 22, shade(frame, -0.05), shade(frame, -0.2))
        const prods = kind === 'medrack' ? ['#f0f0ea', '#4a78b0', '#e0e0d8', '#c84a3a', '#7ab0a0'] : kind === 'toolrack' ? ['#9aa0a4', '#b5402f', '#5a5a5a', '#c9a85a', '#3a6a9a'] : ['#c84a3a', '#e8c84a', '#4a8a4a', '#3a5a9a', '#e88a3a', '#f0eee0', '#8a4a8a']
        for (let row = 0; row < 3; row++) {
          const yb = 8 + row * 6.5
          g.fillStyle = 'rgba(0,0,0,0.35)'
          g.fillRect(2, yb - 5, 28, 5)
          let bx = 2.5
          let i = 0
          while (bx < 29) {
            const bw = kind === 'toolrack' ? 3 : 2.5 + hash(i, row, v * 7 + 31) * 2.5
            const bh = kind === 'toolrack' ? 5 : 2.8 + hash(i, row, v * 7 + 32) * 2
            if (hash(i, row, v * 7 + 33) > 0.18) {
              g.fillStyle = prods[Math.floor(hash(i, row, v * 7 + 34) * prods.length)]
              if (kind === 'toolrack') g.fillRect(bx + 1, yb - bh, 1.2, bh)
              else g.fillRect(bx, yb - bh, Math.min(bw, 29.5 - bx), bh)
            }
            bx += bw + 0.5
            i++
          }
          g.fillStyle = frame
          g.fillRect(1, yb, 30, 1.2)
        }
        for (let i = 0; i < 8; i++) {
          if (hash(i, 9, v * 7 + 35) < 0.3) continue
          g.fillStyle = prods[Math.floor(hash(i, 8, v * 7 + 36) * prods.length)]
          g.fillRect(3 + i * 3.4, -11 + hash(i, 7, v) * 6, 2.6, 3)
        }
        break
      }
      case 'locker': {
        box(g, 2, 8, 28, 18, 26, '#56626e', '#4a5664')
        g.fillStyle = 'rgba(0,0,0,0.35)'
        g.fillRect(11, 0, 0.8, 26)
        g.fillRect(20.5, 0, 0.8, 26)
        g.fillStyle = 'rgba(0,0,0,0.3)'
        for (const lx of [4, 13, 22.5]) for (let i = 0; i < 4; i++) g.fillRect(lx, 2 + i * 1.6, 5, 0.6)
        g.fillStyle = '#b0b8c0'
        for (const lx of [8, 17, 26.5]) g.fillRect(lx, 12, 1, 4)
        break
      }
      case 'crate':
      case 'shedbox': {
        const c = kind === 'crate' ? '#a07a48' : '#7f6a48'
        box(g, 4, 6, 24, 22, 14, shade(c, 0.1), shade(c, -0.12))
        g.strokeStyle = 'rgba(0,0,0,0.35)'
        g.lineWidth = 0.7
        for (let i = 0; i < 4; i++) {
          g.beginPath()
          g.moveTo(4, -8 + i * 5.5)
          g.lineTo(28, -8 + i * 5.5)
          g.stroke()
        }
        g.strokeStyle = shade(c, -0.3)
        g.lineWidth = 1.5
        g.beginPath()
        g.moveTo(5, 15)
        g.lineTo(27, 27)
        g.moveTo(27, 15)
        g.lineTo(5, 27)
        g.stroke()
        break
      }
      case 'collector': {
        g.fillStyle = 'rgba(0,0,0,0.3)'
        ell(g, 18, 22, 12, 7)
        g.fill()
        const gr = g.createLinearGradient(5, 0, 27, 0)
        gr.addColorStop(0, '#2c5068')
        gr.addColorStop(0.4, '#4a7ea0')
        gr.addColorStop(1, '#25445a')
        g.fillStyle = gr
        g.fillRect(5, 4, 22, 18)
        ell(g, 16, 22, 11, 4)
        g.fill()
        g.fillStyle = '#3a6684'
        ell(g, 16, 4, 11, 4.5)
        g.fill()
        g.fillStyle = '#1a3040'
        ell(g, 16, 4, 8.5, 3)
        g.fill()
        g.strokeStyle = 'rgba(0,0,0,0.35)'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(5, 10)
        g.lineTo(27, 10)
        g.moveTo(5, 16)
        g.lineTo(27, 16)
        g.stroke()
        g.strokeStyle = '#d9d4c7'
        g.lineWidth = 0.8
        g.beginPath()
        g.moveTo(4, 2)
        g.lineTo(16, -4)
        g.lineTo(28, 2)
        g.stroke()
        break
      }
      default: {
        box(g, 3, 4, 26, 24, 10, '#8a6a4a', '#6a4a32')
      }
    }
  })
}

export function treeSprite(v) {
  const pine = v >= 4
  const S = 84
  return cached(`t:${v}`, S, S, g => {
    const cx = S / 2
    const cy = S / 2
    if (pine) {
      const layers = 5
      for (let l = 0; l < layers; l++) {
        const r = 30 - l * 5.2
        const pts = 9
        g.beginPath()
        for (let i = 0; i <= pts * 2; i++) {
          const a = (i / (pts * 2)) * Math.PI * 2 + l * 0.3
          const rad = i % 2 ? r : r * 0.62
          g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad - l * 2.2)
        }
        const base = [26, 46 + l * 7, 30 + l * 3]
        g.fillStyle = `rgb(${base[0] + l * 4},${base[1]},${base[2]})`
        g.fill()
        g.strokeStyle = 'rgba(0,0,0,0.25)'
        g.lineWidth = 0.8
        g.stroke()
      }
      g.fillStyle = '#5a4a32'
      ell(g, cx, cy - 11, 2, 2)
      g.fill()
      return
    }
    const blobs = 9 + v * 2
    const greens = [['#2a4224', '#3c5a2e', '#5a7a3a'], ['#2e4422', '#466530', '#6a8a3e'], ['#34401f', '#52602a', '#7c8a3a'], ['#3a3420', '#5a4e26', '#8a6e30']][v % 4]
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < blobs; i++) {
        const a = hash(i, pass, v * 11 + 1) * Math.PI * 2
        const d = hash(i, pass, v * 11 + 2) * (16 - pass * 4)
        const r = 11 + hash(i, pass, v * 11 + 3) * 7 - pass * 2
        const bx = cx + Math.cos(a) * d - pass * 2.5
        const by = cy + Math.sin(a) * d - pass * 3.5
        const gr = g.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r)
        gr.addColorStop(0, greens[Math.min(2, pass + 1)])
        gr.addColorStop(1, greens[pass])
        g.fillStyle = gr
        ell(g, bx, by, r, r)
        g.fill()
      }
    }
    for (let i = 0; i < 40; i++) {
      const a = hash(i, 5, v * 11 + 4) * Math.PI * 2
      const d = hash(i, 6, v * 11 + 5) * 22
      g.fillStyle = hash(i, 7, v) > 0.5 ? 'rgba(160,190,90,0.35)' : 'rgba(10,20,8,0.3)'
      ell(g, cx + Math.cos(a) * d - 3, cy + Math.sin(a) * d - 6, 1.6, 1.6)
      g.fill()
    }
  })
}

export function carSprite(colorIdx, wreck, horiz) {
  const L = 62
  const Wd = 28
  const key = `c:${colorIdx}:${wreck}:${horiz}`
  const w = horiz ? L + 10 : Wd + 10
  const h = horiz ? Wd + 10 : L + 10
  return cached(key, w, h, g => {
    g.translate(w / 2, h / 2)
    if (!horiz) g.rotate(Math.PI / 2)
    const col = CAR_COLORS[colorIdx]
    g.fillStyle = 'rgba(0,0,0,0.38)'
    rr(g, -L / 2 + 3, -Wd / 2 + 4, L, Wd, 8)
    g.fill()
    g.fillStyle = '#141414'
    for (const [tx, ty] of [[-19, -Wd / 2 - 1], [15, -Wd / 2 - 1], [-19, Wd / 2 - 3], [15, Wd / 2 - 3]]) {
      rr(g, tx, ty, 10, 4, 1.5)
      g.fill()
    }
    const body = g.createLinearGradient(0, -Wd / 2, 0, Wd / 2)
    body.addColorStop(0, shade(col, 0.22))
    body.addColorStop(0.5, col)
    body.addColorStop(1, shade(col, -0.35))
    g.fillStyle = body
    rr(g, -L / 2, -Wd / 2, L, Wd, 8)
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.55)'
    g.lineWidth = 1
    g.stroke()
    g.fillStyle = shade(col, -0.08)
    rr(g, 13, -Wd / 2 + 3, 14, Wd - 6, 4)
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.25)'
    g.beginPath()
    g.moveTo(17, -6)
    g.lineTo(26, -5)
    g.moveTo(17, 6)
    g.lineTo(26, 5)
    g.stroke()
    const glass = wreck ? '#1d2226' : '#22303a'
    g.fillStyle = glass
    g.beginPath()
    g.moveTo(12, -Wd / 2 + 3)
    g.lineTo(6, -Wd / 2 + 4.5)
    g.lineTo(6, Wd / 2 - 4.5)
    g.lineTo(12, Wd / 2 - 3)
    g.closePath()
    g.fill()
    g.fillStyle = shade(col, 0.1)
    rr(g, -14, -Wd / 2 + 4, 20, Wd - 8, 3)
    g.fill()
    g.fillStyle = glass
    g.beginPath()
    g.moveTo(-15, -Wd / 2 + 4.5)
    g.lineTo(-20, -Wd / 2 + 3.5)
    g.lineTo(-20, Wd / 2 - 3.5)
    g.lineTo(-15, Wd / 2 - 4.5)
    g.closePath()
    g.fill()
    g.fillRect(-13, -Wd / 2 + 1.2, 18, 2.2)
    g.fillRect(-13, Wd / 2 - 3.4, 18, 2.2)
    g.fillStyle = 'rgba(255,255,255,0.28)'
    g.beginPath()
    g.moveTo(11, -8)
    g.lineTo(8, -6)
    g.lineTo(8, 0)
    g.lineTo(11, -3)
    g.fill()
    g.fillStyle = '#f2e6b0'
    rr(g, L / 2 - 3, -Wd / 2 + 3, 2.5, 5, 1)
    g.fill()
    rr(g, L / 2 - 3, Wd / 2 - 8, 2.5, 5, 1)
    g.fill()
    g.fillStyle = '#a02a22'
    g.fillRect(-L / 2 + 0.5, -Wd / 2 + 3, 2, 5)
    g.fillRect(-L / 2 + 0.5, Wd / 2 - 8, 2, 5)
    if (wreck) {
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(${90 + hash(i, colorIdx, 3) * 40},${50 + hash(i, colorIdx, 4) * 20},20,${0.3 + hash(i, colorIdx, 5) * 0.3})`
        ell(g, -L / 2 + hash(i, colorIdx, 6) * L, -Wd / 2 + hash(i, colorIdx, 7) * Wd, 1.5 + hash(i, colorIdx, 8) * 3, 1 + hash(i, colorIdx, 9) * 2)
        g.fill()
      }
      g.strokeStyle = 'rgba(220,230,235,0.5)'
      g.lineWidth = 0.5
      g.beginPath()
      g.moveTo(9, -2)
      g.lineTo(7, -8)
      g.moveTo(9, -2)
      g.lineTo(11, 6)
      g.moveTo(9, -2)
      g.lineTo(6.5, 3)
      g.stroke()
      g.fillStyle = 'rgba(30,25,20,0.35)'
      rr(g, -L / 2, -Wd / 2, L, Wd, 8)
      g.fill()
    }
  })
}

const ROOF_COLS = ['#6b2e2a', '#4a4f57', '#5a4634', '#3f5243', '#6e5a3a', '#38404f', '#7a4a3a']
const ROOF_LABELS = { market: 'MERCADO', pharmacy: 'FARMÁCIA', hardware: 'FERRAGENS', police: 'DELEGACIA' }

export function roofSprite(b) {
  const pad = 5
  const w = b.w * TS + pad * 2
  const h = b.h * TS + pad * 2
  return cached(`r:${b.id}`, w, h, g => {
    if (b.type === 'house') {
      const col = ROOF_COLS[Math.floor(hash(b.id, 0, 61) * ROOF_COLS.length)]
      const ridgeH = b.w >= b.h
      g.fillStyle = 'rgba(0,0,0,0.45)'
      g.fillRect(3, 6, w - 2, h - 2)
      const halfA = shade(col, 0.12)
      const halfB = shade(col, -0.22)
      if (ridgeH) {
        g.fillStyle = halfA
        g.fillRect(0, 0, w, h / 2)
        g.fillStyle = halfB
        g.fillRect(0, h / 2, w, h / 2)
        for (let y = 4; y < h; y += 5) {
          const side = y < h / 2
          g.fillStyle = side ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.22)'
          g.fillRect(0, y, w, 1)
          const off = (y / 5) % 2 ? 0 : 4
          for (let x = off; x < w; x += 8) {
            g.fillStyle = `rgba(0,0,0,${0.08 + hash(x, y, b.id) * 0.12})`
            g.fillRect(x, y - 4, 0.8, 4)
            if (hash(x, y, b.id + 3) < 0.06) {
              g.fillStyle = 'rgba(255,255,255,0.08)'
              g.fillRect(x + 1, y - 4, 7, 4)
            }
          }
        }
        g.fillStyle = shade(col, 0.28)
        g.fillRect(0, h / 2 - 2, w, 3)
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.fillRect(0, h / 2 + 1, w, 1)
      } else {
        g.fillStyle = halfA
        g.fillRect(0, 0, w / 2, h)
        g.fillStyle = halfB
        g.fillRect(w / 2, 0, w / 2, h)
        for (let x = 4; x < w; x += 5) {
          const side = x < w / 2
          g.fillStyle = side ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.22)'
          g.fillRect(x, 0, 1, h)
          const off = (x / 5) % 2 ? 0 : 4
          for (let y = off; y < h; y += 8) {
            g.fillStyle = `rgba(0,0,0,${0.08 + hash(x, y, b.id) * 0.12})`
            g.fillRect(x - 4, y, 4, 0.8)
          }
        }
        g.fillStyle = shade(col, 0.28)
        g.fillRect(w / 2 - 2, 0, 3, h)
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.fillRect(w / 2 + 1, 0, 1, h)
      }
      g.strokeStyle = shade(col, -0.45)
      g.lineWidth = 2
      g.strokeRect(1, 1, w - 2, h - 2)
      if (hash(b.id, 1, 62) < 0.6) {
        const chx = ridgeH ? w * (0.2 + hash(b.id, 2, 63) * 0.6) : w / 2 - 14
        const chy = ridgeH ? h / 2 - 14 : h * (0.2 + hash(b.id, 2, 63) * 0.6)
        g.fillStyle = 'rgba(0,0,0,0.35)'
        g.fillRect(chx + 3, chy + 4, 10, 10)
        g.fillStyle = '#7a4a3a'
        g.fillRect(chx, chy, 10, 10)
        g.fillStyle = '#1e1a18'
        g.fillRect(chx + 2, chy + 2, 6, 6)
        g.strokeStyle = 'rgba(0,0,0,0.4)'
        g.lineWidth = 0.6
        g.strokeRect(chx, chy, 10, 10)
      }
    } else if (b.type === 'shed') {
      g.fillStyle = 'rgba(0,0,0,0.45)'
      g.fillRect(3, 6, w - 2, h - 2)
      g.fillStyle = '#7d8286'
      g.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 4) {
        g.fillStyle = 'rgba(255,255,255,0.12)'
        g.fillRect(x, 0, 1.5, h)
        g.fillStyle = 'rgba(0,0,0,0.18)'
        g.fillRect(x + 2, 0, 1.5, h)
      }
      for (let i = 0; i < 12; i++) {
        g.fillStyle = `rgba(140,70,30,${0.15 + hash(i, b.id, 4) * 0.3})`
        ell(g, hash(i, b.id, 5) * w, hash(i, b.id, 6) * h, 4 + hash(i, b.id, 7) * 8, 3 + hash(i, b.id, 8) * 5)
        g.fill()
      }
      g.strokeStyle = 'rgba(0,0,0,0.5)'
      g.lineWidth = 2
      g.strokeRect(1, 1, w - 2, h - 2)
    } else {
      g.fillStyle = 'rgba(0,0,0,0.45)'
      g.fillRect(3, 6, w - 2, h - 2)
      g.fillStyle = b.type === 'police' ? '#7a7f86' : '#8d8b84'
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < w * h / 30; i++) {
        g.fillStyle = hash(i, b.id, 1) > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)'
        g.fillRect(hash(i, b.id, 2) * w, hash(i, b.id, 3) * h, 1.2, 1.2)
      }
      g.strokeStyle = '#b5b2a8'
      g.lineWidth = 4
      g.strokeRect(2, 2, w - 4, h - 4)
      g.strokeStyle = 'rgba(0,0,0,0.3)'
      g.lineWidth = 1
      g.strokeRect(5, 5, w - 10, h - 10)
      const units = 2 + Math.floor(hash(b.id, 4, 5) * 3)
      for (let i = 0; i < units; i++) {
        const ux = 16 + hash(i, b.id, 9) * (w - 50)
        const uy = h * 0.55 + hash(i, b.id, 10) * (h * 0.3 - 10)
        g.fillStyle = 'rgba(0,0,0,0.35)'
        g.fillRect(ux + 3, uy + 4, 20, 14)
        g.fillStyle = '#b8bcbe'
        g.fillRect(ux, uy, 20, 14)
        g.strokeStyle = 'rgba(0,0,0,0.35)'
        g.lineWidth = 0.7
        ell(g, ux + 10, uy + 7, 5, 5)
        g.stroke()
        g.beginPath()
        g.moveTo(ux + 5, uy + 7)
        g.lineTo(ux + 15, uy + 7)
        g.moveTo(ux + 10, uy + 2)
        g.lineTo(ux + 10, uy + 12)
        g.stroke()
      }
      const label = ROOF_LABELS[b.type]
      if (label) {
        g.font = `bold ${Math.min(26, h * 0.3)}px "IBM Plex Mono", monospace`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillStyle = 'rgba(240,236,224,0.55)'
        g.fillText(label, w / 2, h * 0.32)
      }
    }
  })
}

export function splatSprite(v) {
  return cached(`s:${v}`, 40, 40, g => {
    const cx = 20
    const cy = 20
    g.fillStyle = '#5a0e0c'
    for (let i = 0; i < 7; i++) {
      const a = hash(i, v, 1) * Math.PI * 2
      const d = hash(i, v, 2) * 6
      ell(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4 + hash(i, v, 3) * 5, 3 + hash(i, v, 4) * 4, a)
      g.fill()
    }
    for (let i = 0; i < 14; i++) {
      const a = hash(i, v, 5) * Math.PI * 2
      const d = 9 + hash(i, v, 6) * 9
      ell(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.8 + hash(i, v, 7) * 1.6, 0.8 + hash(i, v, 7) * 1.4)
      g.fill()
    }
    g.fillStyle = 'rgba(120,20,16,0.6)'
    ell(g, cx - 2, cy - 2, 4, 3)
    g.fill()
  })
}

export function grainSprite() {
  return cached('grain', 128, 128, g => {
    const img = g.createImageData(256, 256)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
  })
}

export function wallFace(style, base) {
  return cached(`w:${style}:${base}`, TS, WALL_H, g => {
    g.fillStyle = base
    g.fillRect(0, 0, TS, WALL_H)
    if (style === 'clap') {
      for (let y = 0; y < WALL_H; y += 4.3) {
        g.fillStyle = 'rgba(0,0,0,0.22)'
        g.fillRect(0, y + 3.3, TS, 1)
        g.fillStyle = 'rgba(255,255,255,0.08)'
        g.fillRect(0, y, TS, 1)
      }
    } else if (style === 'brick') {
      for (let row = 0; row * 4 < WALL_H; row++) {
        const off = row % 2 ? 4 : 0
        for (let x = -off; x < TS; x += 8) {
          g.fillStyle = `rgba(${hash(x, row, 1) > 0.5 ? '0,0,0' : '255,255,255'},${hash(x, row, 2) * 0.1})`
          g.fillRect(x + 0.5, row * 4 + 0.5, 7, 3)
        }
        g.fillStyle = 'rgba(30,20,15,0.35)'
        g.fillRect(0, row * 4 + 3.5, TS, 0.8)
        for (let x = -off; x < TS; x += 8) g.fillRect(x, row * 4, 0.8, 4)
      }
    } else if (style === 'plank') {
      for (let x = 0; x < TS; x += 5.3) {
        g.fillStyle = 'rgba(0,0,0,0.28)'
        g.fillRect(x, 0, 0.9, WALL_H)
        g.fillStyle = `rgba(255,255,255,${hash(x, 1, 4) * 0.08})`
        g.fillRect(x + 1, 0, 4, WALL_H)
      }
    } else {
      g.fillStyle = 'rgba(0,0,0,0.2)'
      g.fillRect(0, WALL_H / 2, TS, 0.8)
      g.fillRect(TS / 2, 0, 0.8, WALL_H)
    }
    const gr = g.createLinearGradient(0, 0, 0, WALL_H)
    gr.addColorStop(0, 'rgba(255,255,255,0.05)')
    gr.addColorStop(0.75, 'rgba(0,0,0,0.05)')
    gr.addColorStop(1, 'rgba(0,0,0,0.35)')
    g.fillStyle = gr
    g.fillRect(0, 0, TS, WALL_H)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(0, 0, TS, 1.5)
  })
}

const HAIRS = ['#2a1e14', '#4a3220', '#6e4a2a', '#b08a50', '#1a1a1a', '#8a8a82', '#5a2e1a']

export function drawChar(g, o) {
  g.save()
  g.translate(o.x, o.y)
  if (o.down) {
    g.rotate(o.dir)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    ell(g, 2, 3, 18, 10)
    g.fill()
    g.fillStyle = o.pants
    rr(g, -17, -6, 12, 5, 2)
    g.fill()
    rr(g, -17, 1, 12, 5, 2)
    g.fill()
    g.fillStyle = o.skin
    g.save()
    g.rotate(0.9)
    rr(g, -2, -14, 4, 11, 2)
    g.fill()
    g.restore()
    g.save()
    g.rotate(-0.7)
    rr(g, -2, 3, 4, 11, 2)
    g.fill()
    g.restore()
    g.fillStyle = o.shirt
    ell(g, 0, 0, 9, 7.5)
    g.fill()
    if (o.gore) goreSpots(g, o.gore, 8)
    g.strokeStyle = 'rgba(0,0,0,0.4)'
    g.lineWidth = 0.8
    g.stroke()
    g.fillStyle = o.skin
    ell(g, 11, 0, 5.5, 5.5)
    g.fill()
    g.stroke()
    g.fillStyle = o.hairColor
    if (o.hair) {
      g.beginPath()
      g.arc(11, 0, 5.6, Math.PI * 0.5, Math.PI * 1.5)
      g.fill()
    }
    g.restore()
    return
  }
  g.fillStyle = 'rgba(0,0,0,0.3)'
  ell(g, 3, 5, 10.5, 7.5)
  g.fill()
  g.rotate(o.dir + (o.wobble || 0))
  const sw = o.moving ? Math.sin(o.phase) * 5 : 0
  g.fillStyle = o.pants
  rr(g, -4 + sw, -6.5, 10, 5, 2.4)
  g.fill()
  rr(g, -4 - sw, 1.5, 10, 5, 2.4)
  g.fill()
  g.fillStyle = 'rgba(0,0,0,0.45)'
  rr(g, 3 + sw, -6.5, 3, 5, 1.5)
  g.fill()
  rr(g, 3 - sw, 1.5, 3, 5, 1.5)
  g.fill()
  const armSw = o.moving ? Math.sin(o.phase) * 4 : 0
  if (o.reach) {
    g.fillStyle = o.shirt
    rr(g, 0, -10, 7, 4.5, 2)
    g.fill()
    rr(g, 0, 5.5, 7, 4.5, 2)
    g.fill()
    g.fillStyle = o.skin
    rr(g, 6, -9.5, 9 + Math.sin(o.phase * 0.5) * 1.5, 3.6, 1.8)
    g.fill()
    rr(g, 6, 5.9, 9 - Math.sin(o.phase * 0.5) * 1.5, 3.6, 1.8)
    g.fill()
  } else if (o.weapon) {
    g.fillStyle = o.shirt
    rr(g, -1, -10, 8, 4.5, 2)
    g.fill()
    rr(g, -1, 5.5, 8, 4.5, 2)
    g.fill()
  } else {
    g.fillStyle = o.shirt
    rr(g, -3 - armSw, -10.5, 9, 4.5, 2)
    g.fill()
    rr(g, -3 + armSw, 6, 9, 4.5, 2)
    g.fill()
    g.fillStyle = o.skin
    ell(g, 6 - armSw, -8.3, 2.2, 2.2)
    g.fill()
    ell(g, 6 + armSw, 8.2, 2.2, 2.2)
    g.fill()
  }
  if (o.bag) {
    g.fillStyle = o.bagColor || '#4a4a32'
    rr(g, -10, -6, 6, 12, 2)
    g.fill()
    g.fillStyle = 'rgba(0,0,0,0.3)'
    g.fillRect(-9, -2, 4, 1)
  }
  const tg = g.createLinearGradient(-6, -10, 6, 10)
  tg.addColorStop(0, shade(o.shirt, 0.18))
  tg.addColorStop(1, shade(o.shirt, -0.3))
  g.fillStyle = tg
  ell(g, 0, 0, 6.8, 10.5)
  g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.45)'
  g.lineWidth = 0.8
  g.stroke()
  if (o.gore) goreSpots(g, o.gore, 6)
  if (o.weapon) drawWeapon(g, o)
  const hg = g.createRadialGradient(2, -2, 1, 1, 0, 6.5)
  hg.addColorStop(0, shade(o.skin, 0.15))
  hg.addColorStop(1, shade(o.skin, -0.2))
  g.fillStyle = hg
  ell(g, 1, 0, 5.8, 5.8)
  g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.4)'
  g.stroke()
  if (o.hair) {
    g.fillStyle = o.hairColor
    g.beginPath()
    if (o.hair === 2) {
      g.arc(0.5, 0, 6.4, Math.PI * 0.42, Math.PI * 1.58)
      g.fill()
      rr(g, -7, -4.5, 4, 9, 2)
      g.fill()
    } else {
      g.arc(0.5, 0, 6, Math.PI * 0.55, Math.PI * 1.45)
      g.fill()
    }
  }
  if (o.zombie) {
    g.fillStyle = 'rgba(40,8,6,0.85)'
    ell(g, 4.4, -2, 1, 1.2)
    g.fill()
    ell(g, 4.4, 2, 1, 1.2)
    g.fill()
    g.fillStyle = 'rgba(80,10,8,0.6)'
    ell(g, 5.5, 0.5, 0.8, 1.6)
    g.fill()
  }
  if (o.hit > 0) {
    g.globalAlpha = Math.min(0.75, o.hit * 4)
    g.fillStyle = '#fff'
    ell(g, 0, 0, 7, 10.5)
    g.fill()
    ell(g, 1, 0, 6, 6)
    g.fill()
    g.globalAlpha = 1
  }
  g.restore()
}

function goreSpots(g, seed, n) {
  for (let i = 0; i < n; i++) {
    if (hash(i, seed, 1) < 0.45) continue
    g.fillStyle = `rgba(${70 + hash(i, seed, 2) * 40},10,8,${0.45 + hash(i, seed, 3) * 0.4})`
    ell(g, (hash(i, seed, 4) - 0.5) * 9, (hash(i, seed, 5) - 0.5) * 16, 1 + hash(i, seed, 6) * 2.5, 1 + hash(i, seed, 7) * 2)
    g.fill()
  }
  g.strokeStyle = 'rgba(20,15,10,0.5)'
  g.lineWidth = 0.6
  g.beginPath()
  g.moveTo(-6, 4 + (seed % 3))
  g.lineTo(-3, 6)
  g.lineTo(-5, 8)
  g.stroke()
}

function drawWeapon(g, o) {
  const w = o.weapon
  g.save()
  const base = o.swing > 0 ? -1.15 + (1 - o.swing) * 2.1 : 0.12
  g.translate(2, 5)
  g.rotate(base)
  const handX = 8
  g.fillStyle = o.skin
  ell(g, handX, 0, 2.3, 2.3)
  g.fill()
  ell(g, handX - 3, -3, 2.1, 2.1)
  g.fill()
  const line = (len, width, col) => {
    g.strokeStyle = col
    g.lineWidth = width
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(handX - 4, 0)
    g.lineTo(handX + len, 0)
    g.stroke()
  }
  switch (w) {
    case 'bat':
      g.strokeStyle = '#a07848'
      g.lineCap = 'round'
      g.lineWidth = 2.4
      g.beginPath()
      g.moveTo(handX - 4, 0)
      g.lineTo(handX + 8, 0)
      g.stroke()
      g.lineWidth = 4.2
      g.beginPath()
      g.moveTo(handX + 8, 0)
      g.lineTo(handX + 20, 0)
      g.stroke()
      break
    case 'axe':
      line(20, 2.2, '#7a5a34')
      g.fillStyle = '#9aa2a8'
      g.beginPath()
      g.moveTo(handX + 14, -1)
      g.lineTo(handX + 19, -1)
      g.lineTo(handX + 21, -8)
      g.lineTo(handX + 12, -7)
      g.closePath()
      g.fill()
      g.fillStyle = '#d0d6da'
      g.fillRect(handX + 12.5, -7.5, 8.5, 1.2)
      break
    case 'knife':
      line(2, 2.4, '#2a2a2a')
      g.fillStyle = '#d0d4d6'
      g.beginPath()
      g.moveTo(handX + 2, -1.2)
      g.lineTo(handX + 11, 0)
      g.lineTo(handX + 2, 1.2)
      g.fill()
      break
    case 'crowbar':
      line(17, 2, '#3a3e44')
      g.strokeStyle = '#3a3e44'
      g.beginPath()
      g.moveTo(handX + 17, 0)
      g.quadraticCurveTo(handX + 21, -1, handX + 20, -5)
      g.stroke()
      break
    case 'hammer':
      line(11, 2, '#8a6a42')
      g.fillStyle = '#5a5e64'
      g.fillRect(handX + 9, -4, 4, 8)
      break
    case 'pan':
      line(7, 2, '#2a2a2a')
      g.fillStyle = '#3a3c40'
      ell(g, handX + 13, 0, 6, 6)
      g.fill()
      g.fillStyle = '#26282a'
      ell(g, handX + 13, 0, 4.5, 4.5)
      g.fill()
      break
    case 'spear':
      line(26, 2, '#8a6a42')
      g.fillStyle = '#c8ccd0'
      g.beginPath()
      g.moveTo(handX + 25, -1.5)
      g.lineTo(handX + 33, 0)
      g.lineTo(handX + 25, 1.5)
      g.fill()
      break
    case 'plank':
      g.fillStyle = '#a07a48'
      g.fillRect(handX - 4, -2.5, 24, 5)
      g.strokeStyle = 'rgba(0,0,0,0.35)'
      g.lineWidth = 0.6
      g.strokeRect(handX - 4, -2.5, 24, 5)
      break
    case 'pistol':
      g.fillStyle = '#1e1f22'
      g.fillRect(handX - 1, -1.8, 10, 3.6)
      g.fillStyle = '#2e3034'
      g.fillRect(handX - 1, -1.8, 10, 1)
      break
    case 'shotgun':
      g.fillStyle = '#6a4a2a'
      g.fillRect(handX - 8, -2, 9, 4)
      g.fillStyle = '#1e1f22'
      g.fillRect(handX, -1.5, 20, 3)
      g.fillStyle = '#3a3c40'
      g.fillRect(handX + 3, 1, 9, 1.5)
      break
  }
  g.restore()
}

export { HAIRS }
