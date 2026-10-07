import { ITEMS, SKILLS, PROFESSIONS, TRAITS, RECIPES, LOOT, STACK_AMOUNTS, FURN } from './data.js'
import { T, createWorld, rollLoot } from './world.js'
import { sfx, unlockAudio } from './audio.js'

const TS = 32
const SAVE_KEY = 'vale-morto-save-v1'
const START_TIME = 9 * 60
const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')
const dark = document.createElement('canvas')
const dctx = dark.getContext('2d')
const $ = id => document.getElementById(id)
const rand = (a, b) => a + Math.random() * (b - a)
const randi = (a, b) => Math.floor(rand(a, b + 1))
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)
const angDiff = (a, b) => {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

let S = null
let W = null
let zoom = 1.25
let cw = 0
let ch = 0
let camX = 0
let camY = 0
const keys = {}
const mouse = { sx: 0, sy: 0, wx: 0, wy: 0, down: false }
let lastFrame = performance.now()
let hudTimer = 0
let target = null

const FIST = { name: 'Mãos', cat: 'blunt', dmg: 0.35, range: 0.9, speed: 0.5, stam: 4 }
const SHIRTS = ['#4b5a6b', '#6b4b4b', '#5a6b4b', '#6b634b', '#4b4b6b', '#7a7a7a', '#3c3c3c', '#7a5a3c', '#5c3c5c', '#2f4f4f']
const SIDING = [['#9a8f80', '#5d544a'], ['#8f9a92', '#525a54'], ['#a08a7a', '#5e4a3e'], ['#8a8fa0', '#4b4f5e'], ['#a49a78', '#5f5842'], ['#9c7f74', '#5a443d']]
const BODY = ['Mão esquerda', 'Mão direita', 'Antebraço esquerdo', 'Antebraço direito', 'Braço esquerdo', 'Braço direito', 'Pescoço', 'Ombro', 'Perna esquerda', 'Perna direita', 'Tronco']

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cw = window.innerWidth
  ch = window.innerHeight
  canvas.width = cw * dpr
  canvas.height = ch * dpr
  canvas.style.width = cw + 'px'
  canvas.style.height = ch + 'px'
  dark.width = Math.ceil(cw / 2)
  dark.height = Math.ceil(ch / 2)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  canvas.dpr = dpr
}
window.addEventListener('resize', resize)
resize()

const idx = (x, y) => y * W.w + x
const inb = (x, y) => x >= 0 && y >= 0 && x < W.w && y < W.h
const tileAt = (x, y) => (inb(x, y) ? W.tiles[idx(x, y)] : T.TREE)

function opaque(k) {
  const t = W.tiles[k]
  if (t === T.WALL || t === T.WOODWALL) return true
  if (t === T.DOOR) {
    const d = W.doors[k]
    return d && !d.open && !d.broken
  }
  if (t === T.WINDOW) {
    const w = W.windows[k]
    return w && (w.bars.length >= 2 || (w.curtain && w.state === 'closed'))
  }
  return false
}

function blocks(k, zombie) {
  const t = W.tiles[k]
  if (t === T.WALL || t === T.FURN || t === T.WATER || t === T.WOODWALL) return true
  if (t === T.DOOR) {
    const d = W.doors[k]
    if (d.bars.length) return true
    return !d.open && !d.broken
  }
  if (t === T.WINDOW) {
    const w = W.windows[k]
    if (w.bars.length) return true
    return w.state === 'closed'
  }
  return false
}

function bashable(k) {
  const t = W.tiles[k]
  return t === T.DOOR || t === T.WINDOW || t === T.WOODWALL
}

function los(x0, y0, x1, y1) {
  const d = dist(x0, y0, x1, y1)
  const steps = Math.ceil(d / 0.3)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = Math.floor(x0 + (x1 - x0) * t)
    const y = Math.floor(y0 + (y1 - y0) * t)
    if (!inb(x, y)) return false
    if (opaque(idx(x, y))) return false
  }
  return true
}

function hasTrait(id) {
  return S.player.traits.includes(id)
}

function lvl(skill) {
  return S.player.skills[skill].lvl
}

function xpNeed(l) {
  return Math.round(40 * Math.pow(l + 1, 1.6))
}

function addXP(skill, amt) {
  const s = S.player.skills[skill]
  if (s.lvl >= 10) return
  let m = hasTrait('fastLearner') ? 1.3 : 1
  if (S.player.booked[skill]) m *= 2
  s.xp += amt * m
  while (s.lvl < 10 && s.xp >= xpNeed(s.lvl)) {
    s.xp -= xpNeed(s.lvl)
    s.lvl++
    log(`Você melhorou em ${SKILLS[skill]} (nível ${s.lvl}).`, 'good')
    sfx.level()
  }
}

function log(text, kind = '') {
  S.log.push({ text, kind, t: performance.now() })
  if (S.log.length > 7) S.log.shift()
  hudTimer = 0
}

function mkItem(id, qty = 1, opts = {}) {
  const d = ITEMS[id]
  const it = { id, qty }
  if (d.dur) it.dur = opts.full ? d.dur : Math.max(1, Math.round(d.dur * rand(0.45, 1)))
  if (d.mag) it.ammo = opts.ammo ?? (Math.random() < 0.35 ? randi(1, d.mag) : 0)
  if (d.perish) it.spoil = opts.spoil ?? S.time + d.perish * 1440 * rand(0.6, 1.1)
  if (id === 'disinfectant') it.uses = 4
  if (d.battery) it.charge = opts.charge ?? rand(30, 100)
  return it
}

function addTo(list, it) {
  const d = ITEMS[it.id]
  if (d.stack) {
    const ex = list.find(i => i.id === it.id)
    if (ex) {
      ex.qty += it.qty
      return ex
    }
  }
  list.push(it)
  return it
}

function invCount(id) {
  return S.player.inv.filter(i => i.id === id).reduce((a, b) => a + b.qty, 0)
}

function invFind(id) {
  return S.player.inv.find(i => i.id === id)
}

function removeQty(list, id, qty) {
  for (let i = list.length - 1; i >= 0 && qty > 0; i--) {
    const it = list[i]
    if (it.id !== id) continue
    const take = Math.min(qty, it.qty)
    it.qty -= take
    qty -= take
    if (it.qty <= 0) {
      if (S.player.equip === it) S.player.equip = null
      list.splice(i, 1)
    }
  }
}

function removeItem(list, it) {
  const i = list.indexOf(it)
  if (i >= 0) list.splice(i, 1)
  if (S.player.equip === it) S.player.equip = null
}

function useDisinfectant() {
  const it = invFind('disinfectant')
  if (!it) return false
  it.uses--
  if (it.uses <= 0) removeItem(S.player.inv, it)
  return true
}

function weight(list) {
  return list.reduce((a, i) => a + ITEMS[i.id].w * i.qty, 0)
}

function capacity() {
  let c = 12 + lvl('strength') * 0.8
  if (hasTrait('strong')) c += 3
  if (hasTrait('weak')) c -= 3
  if (hasTrait('organized')) c *= 1.3
  let bag = 0
  for (const i of S.player.inv) if (ITEMS[i.id].kind === 'bag') bag = Math.max(bag, ITEMS[i.id].cap)
  return c + bag
}

function isSpoiled(it) {
  return it.spoil && S.time > it.spoil
}

function daylight() {
  const h = (S.time / 60) % 24
  if (h >= 7 && h < 19) return 1
  if (h >= 5 && h < 7) return (h - 5) / 2
  if (h >= 19 && h < 21) return 1 - (h - 19) / 2
  return 0
}

function dayNum() {
  return Math.floor(S.time / 1440) + 1
}

function clockStr() {
  const m = Math.floor(S.time % 1440)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function newState(opts) {
  const seed = opts.seed || Math.floor(Math.random() * 1e9)
  W = createWorld(seed)
  for (const k in W.doors) W.doors[k].bars = []
  for (const k in W.windows) {
    W.windows[k].bars = []
    W.windows[k].cleared = false
  }
  for (const b of W.buildings) b.alarm = b.type !== 'shed' && b.id !== W.home && Math.random() < 0.07
  W.woodwalls = {}
  W.treeHp = {}
  const prof = PROFESSIONS.find(p => p.id === opts.prof)
  const skills = {}
  for (const k in SKILLS) skills[k] = { lvl: prof.skills[k] || 0, xp: 0 }
  if (opts.traits.includes('athletic')) skills.fitness.lvl += 2
  if (opts.traits.includes('strong')) skills.strength.lvl += 2
  if (opts.traits.includes('weak')) skills.strength.lvl = Math.max(0, skills.strength.lvl - 1)
  S = {
    seed,
    settings: opts.settings,
    time: START_TIME,
    player: {
      name: opts.name || 'Sobrevivente',
      prof: prof.id,
      traits: opts.traits,
      x: W.spawn.x, y: W.spawn.y, dir: 0,
      skills,
      booked: {},
      stats: { health: 100, hunger: 10, thirst: 10, fatigue: 15, stamina: 100, panic: 0, sick: 0 },
      wounds: [],
      infected: false, infT: 0,
      inv: [],
      equip: null,
      light: false,
      sneak: false,
      atkCd: 0,
      action: null,
      painkill: 0,
      calm: 0,
      stepT: 0,
      hurtFlash: 0,
      lastWin: -1
    },
    zombies: [],
    corpses: [],
    ground: {},
    noises: [],
    rings: [],
    blood: [],
    tracers: [],
    flashes: [],
    log: [],
    kills: 0,
    vis: new Uint8Array(W.w * W.h),
    seen: new Uint8Array(W.w * W.h),
    flow: new Int16Array(W.w * W.h),
    flowT: 0,
    powerOff: false,
    waterOff: false,
    powerOffAt: (opts.settings.utilDays + rand(-0.5, 1)) * 1440,
    waterOffAt: (opts.settings.utilDays + rand(0, 1.5)) * 1440,
    heli: { at: (randi(4, 8)) * 1440 + randi(10, 15) * 60, active: false, done: false, t: 0, ang: 0 },
    rain: { on: false, next: START_TIME + randi(6, 30) * 60 },
    alarms: [],
    spawnT: 0,
    saveT: 0,
    sleeping: false,
    over: false,
    cause: ''
  }
  const p = S.player
  p.inv.push(mkItem('water', 1))
  p.inv.push(mkItem('crackers', 1))
  const kits = {
    fire: [['axe', 1]],
    police: [['pistol', 1]],
    carpenter: [['hammer', 1], ['nails', 12], ['saw', 1]],
    nurse: [['bandage', 4], ['disinfectant', 1]],
    lumberjack: [['axe', 1]],
    farmer: [['seeds', 10], ['shovel', 1]],
    burglar: [['crowbar', 1]],
    unemployed: [['bat', 1]]
  }
  for (const [id, q] of kits[prof.id] || []) {
    const it = mkItem(id, q, { full: true, ammo: id === 'pistol' ? 8 : undefined })
    addTo(p.inv, it)
    if (ITEMS[id].kind === 'weapon' && !p.equip) p.equip = it
  }
  spawnInitialZombies()
  log(`Dia 1. ${p.name}, ${prof.name.toLowerCase()}. A cidade de Vale Morto caiu há poucos dias.`, 'warn')
  log('Pressione H para ver os controles.', '')
}

function walkable(x, y) {
  if (!inb(x, y)) return false
  const t = tileAt(x, y)
  return t === T.GRASS || t === T.ROAD || t === T.SIDEWALK || t === T.FLOOR || t === T.PARKING || t === T.DIRT
}

function spawnZombie(x, y) {
  const set = S.settings
  let spd = rand(0.6, 1.0)
  let sprinter = false
  if (set.speed === 'fast' || (set.speed === 'mixed' && Math.random() < 0.12)) {
    sprinter = true
    spd = rand(2.7, 3.4)
  }
  const hp = rand(2.6, 4.6)
  S.zombies.push({
    x, y, hp, mhp: hp, spd, sprinter,
    st: 'idle', tx: x, ty: y, lx: x, ly: y, mem: 0, cd: 0, stun: 0, down: 0, wt: rand(0, 6),
    dir: rand(0, Math.PI * 2), shirt: randi(0, SHIRTS.length - 1), skin: randi(0, 2), bashT: 0, groan: rand(3, 15), hit: 0, fem: Math.random() < 0.45
  })
}

function spawnInitialZombies() {
  const target = S.settings.pop
  const p = S.player
  let tries = 0
  while (S.zombies.length < target && tries++ < 20000) {
    const cx = randi(4, W.w - 5)
    const cy = randi(4, W.h - 5)
    if (!walkable(cx, cy)) continue
    if (dist(cx, cy, p.x, p.y) < 16) continue
    const indoor = W.bld[idx(cx, cy)] >= 0
    if (indoor && W.bld[idx(cx, cy)] === W.home) continue
    const n = indoor ? randi(1, 2) : randi(1, 5)
    for (let i = 0; i < n && S.zombies.length < target; i++) {
      const x = cx + randi(-2, 2)
      const y = cy + randi(-2, 2)
      if (!walkable(x, y)) continue
      if (indoor !== (W.bld[idx(x, y)] >= 0)) continue
      spawnZombie(x + 0.5, y + 0.5)
    }
  }
}

function respawn() {
  const p = S.player
  let tries = 0
  let made = 0
  while (made < 4 && tries++ < 300) {
    const x = randi(2, W.w - 3)
    const y = randi(2, W.h - 3)
    if (!walkable(x, y) || W.bld[idx(x, y)] >= 0) continue
    if (dist(x, y, p.x, p.y) < 38 || S.vis[idx(x, y)]) continue
    spawnZombie(x + 0.5, y + 0.5)
    made++
  }
}

function makeNoise(x, y, r, show = false) {
  S.noises.push({ x, y, r })
  if (show && r >= 8) S.rings.push({ x, y, r, t: 0 })
}

function moveEntity(e, dx, dy, r, isZombie) {
  let hit = -1
  const tryAxis = (nx, ny, axis) => {
    const x0 = Math.floor(nx - r)
    const x1 = Math.floor(nx + r)
    const y0 = Math.floor(ny - r)
    const y1 = Math.floor(ny + r)
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!inb(tx, ty)) return { ok: false, k: -1, tx, ty }
        const k = idx(tx, ty)
        if (blocks(k, isZombie)) return { ok: false, k, tx, ty }
      }
    }
    return { ok: true }
  }
  if (dx) {
    const nx = e.x + dx
    const res = tryAxis(nx, e.y, 'x')
    if (res.ok) e.x = nx
    else {
      hit = res.k
      e.x = dx > 0 ? res.tx - r - 0.001 : res.tx + 1 + r + 0.001
      if (Math.abs(e.x - (nx - dx)) > Math.abs(dx)) e.x = nx - dx
    }
  }
  if (dy) {
    const ny = e.y + dy
    const res = tryAxis(e.x, ny, 'y')
    if (res.ok) e.y = ny
    else {
      hit = res.k
      e.y = dy > 0 ? res.ty - r - 0.001 : res.ty + 1 + r + 0.001
      if (Math.abs(e.y - (ny - dy)) > Math.abs(dy)) e.y = ny - dy
    }
  }
  return hit
}

function speedMod(x, y, zombie) {
  const k = idx(Math.floor(x), Math.floor(y))
  const t = W.tiles[k]
  if (t === T.TREE) return 0.65
  if (t === T.WINDOW) return zombie ? 0.25 : 0.4
  if (t === T.DIRT) return 0.85
  return 1
}

function computeFlow() {
  const f = S.flow
  f.fill(32767)
  const p = S.player
  const sx = Math.floor(p.x)
  const sy = Math.floor(p.y)
  const R = 34
  const q = new Int32Array(W.w * W.h)
  let qh = 0
  let qt = 0
  f[idx(sx, sy)] = 0
  q[qt++] = idx(sx, sy)
  while (qh < qt) {
    const k = q[qh++]
    const x = k % W.w
    const y = (k / W.w) | 0
    const d = f[k]
    if (Math.abs(x - sx) > R || Math.abs(y - sy) > R) continue
    const nb = [k - 1, k + 1, k - W.w, k + W.w]
    for (let i = 0; i < 4; i++) {
      const n = nb[i]
      if (i === 0 && x === 0) continue
      if (i === 1 && x === W.w - 1) continue
      if (n < 0 || n >= f.length) continue
      if (f[n] <= d + 1) continue
      const t = W.tiles[n]
      if (t === T.WALL || t === T.FURN || t === T.WATER) continue
      f[n] = d + 1
      q[qt++] = n
    }
  }
}

function flowDir(z) {
  const x = Math.floor(z.x)
  const y = Math.floor(z.y)
  const k = idx(x, y)
  const cur = S.flow[k]
  if (cur >= 32767) return null
  let best = cur
  let bx = 0
  let by = 0
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = x + dx
    const ny = y + dy
    if (!inb(nx, ny)) continue
    const v = S.flow[idx(nx, ny)]
    if (dx && dy) {
      if (S.flow[idx(x + dx, y)] >= 32767 || S.flow[idx(x, y + dy)] >= 32767) continue
      if (blocks(idx(x + dx, y), true) || blocks(idx(x, y + dy), true)) continue
    }
    if (v < best) {
      best = v
      bx = dx
      by = dy
    }
  }
  if (!bx && !by) return null
  const tx = x + bx + 0.5
  const ty = y + by + 0.5
  const d = dist(z.x, z.y, tx, ty) || 1
  return [(tx - z.x) / d, (ty - z.y) / d]
}

function triggerAlarm(k) {
  const b = W.buildings[W.bld[k]]
  if (!b || !b.alarm || S.powerOff) return
  b.alarm = false
  S.alarms.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, until: S.time + 90, t: 0 })
  if (!S.powerOff) log('Um alarme disparou! Todos os mortos da região ouviram.', 'bad')
}

function damageStructure(k, dmg, byPlayer) {
  const t = W.tiles[k]
  const x = (k % W.w) + 0.5
  const y = Math.floor(k / W.w) + 0.5
  if (t === T.DOOR || t === T.WINDOW) {
    const o = t === T.DOOR ? W.doors[k] : W.windows[k]
    if (o.bars.length) {
      o.bars[o.bars.length - 1] -= dmg
      if (o.bars[o.bars.length - 1] <= 0) {
        o.bars.pop()
        makeNoise(x, y, 10)
        if (near(x, y, 18)) sfx.bang(0.8)
      }
      return
    }
    if (t === T.DOOR) {
      if (o.open || o.broken) return
      o.hp -= dmg
      if (o.hp <= 0) {
        o.broken = true
        o.open = true
        makeNoise(x, y, 12, byPlayer)
        if (near(x, y, 18)) sfx.bang(1)
        if (byPlayer) triggerAlarm(k)
        if (near(x, y, 14)) log('Uma porta foi arrombada.', 'warn')
      }
    } else if (o.state === 'closed' || o.state === 'open') {
      o.hp -= dmg
      if (o.hp <= 0 || byPlayer) {
        o.state = 'broken'
        makeNoise(x, y, 16, true)
        if (near(x, y, 22)) sfx.glass()
        triggerAlarm(k)
      }
    }
  } else if (t === T.WOODWALL) {
    const w = W.woodwalls[k]
    w.hp -= dmg
    if (w.hp <= 0) {
      W.tiles[k] = w.base
      delete W.woodwalls[k]
      makeNoise(x, y, 10)
    }
  }
}

function near(x, y, r) {
  return dist(x, y, S.player.x, S.player.y) < r
}

function zombieSight() {
  const dl = daylight()
  let r = 5 + dl * 9
  const p = S.player
  if (p.light && invFind('flashlight')) r = Math.max(r, 11)
  if (p.sneak) r *= 0.55 - lvl('sneak') * 0.025
  if (S.rain.on) r *= 0.8
  return r
}

function updateZombies(dt) {
  const p = S.player
  const sight = zombieSight()
  const Z = S.zombies
  for (const z of Z) {
    z.hit = Math.max(0, z.hit - dt)
    if (z.down > 0) {
      z.down -= dt
      if (z.down <= 0) z.stun = 0.6
      continue
    }
    if (z.stun > 0) {
      z.stun -= dt
      continue
    }
    z.cd -= dt
    const dx = p.x - z.x
    const dy = p.y - z.y
    const d = Math.hypot(dx, dy)
    if (d > 70 && z.st === 'idle') {
      z.wt -= dt
      continue
    }
    let sees = false
    if (!S.over && d < sight && (d < 1.3 || los(z.x, z.y, p.x, p.y))) sees = true
    if (sees) {
      if (z.st !== 'chase' && d < 12) {
        z.groan = 0
      }
      z.st = 'chase'
      z.lx = p.x
      z.ly = p.y
      z.mem = 10
    } else if (z.st === 'chase') {
      z.mem -= dt
      if (z.mem <= 0) {
        z.st = 'investigate'
        z.tx = z.lx
        z.ty = z.ly
      }
    }
    if (z.st !== 'chase') {
      for (const n of S.noises) {
        if (dist(z.x, z.y, n.x, n.y) < n.r) {
          z.st = 'investigate'
          z.tx = n.x + rand(-1.5, 1.5)
          z.ty = n.y + rand(-1.5, 1.5)
          z.mem = 30
          break
        }
      }
    }
    z.groan -= dt
    if (z.groan <= 0) {
      z.groan = rand(6, 18)
      if (d < 14) sfx.groan(clamp(0.35 - d * 0.02, 0.04, 0.35))
    }
    let mx = 0
    let my = 0
    let spd = z.spd
    if (z.st === 'chase') {
      if (sees) {
        mx = dx / d
        my = dy / d
      } else {
        const f = d < 34 ? flowDir(z) : null
        if (f) [mx, my] = f
        else {
          const dd = dist(z.x, z.y, z.lx, z.ly)
          if (dd > 0.3) {
            mx = (z.lx - z.x) / dd
            my = (z.ly - z.y) / dd
          }
        }
      }
      if (sees && d < 0.85 && z.cd <= 0) {
        attackPlayer(z)
        z.cd = rand(1.1, 1.6)
      }
      if (d < 0.62) {
        mx = 0
        my = 0
      }
    } else if (z.st === 'investigate') {
      const dd = dist(z.x, z.y, z.tx, z.ty)
      z.mem -= dt
      if (dd < 0.7 || z.mem <= 0) {
        z.st = 'idle'
        z.wt = rand(4, 12)
      } else {
        const f = d < 34 && dist(z.tx, z.ty, p.x, p.y) < 4 ? flowDir(z) : null
        if (f) [mx, my] = f
        else {
          mx = (z.tx - z.x) / dd
          my = (z.ty - z.y) / dd
        }
      }
      spd *= z.sprinter ? 0.5 : 0.85
    } else {
      z.wt -= dt
      if (z.wt <= 0) {
        z.wt = rand(5, 16)
        if (Math.random() < 0.55) {
          z.tx = z.x + rand(-5, 5)
          z.ty = z.y + rand(-5, 5)
          z.st = 'idle'
          z.walking = true
        } else z.walking = false
      }
      if (z.walking) {
        const dd = dist(z.x, z.y, z.tx, z.ty)
        if (dd > 0.4) {
          mx = (z.tx - z.x) / dd
          my = (z.ty - z.y) / dd
        } else z.walking = false
      }
      spd *= z.sprinter ? 0.3 : 0.45
    }
    if (mx || my) {
      z.dir = Math.atan2(my, mx)
      spd *= speedMod(z.x, z.y, true)
      const hit = moveEntity(z, mx * spd * dt, my * spd * dt, 0.28, true)
      if (hit >= 0 && z.st !== 'idle' && bashable(hit)) {
        z.bashT -= dt
        if (z.bashT <= 0) {
          z.bashT = rand(0.9, 1.4)
          damageStructure(hit, rand(3, 7), false)
          const hx = (hit % W.w) + 0.5
          const hy = Math.floor(hit / W.w) + 0.5
          makeNoise(hx, hy, 7)
          if (near(hx, hy, 16)) sfx.bang(clamp(1 - dist(hx, hy, p.x, p.y) / 16, 0.1, 1))
        }
      } else if (hit >= 0 && z.st === 'idle') {
        z.walking = false
      }
    }
  }
  const active = Z.filter(z => Math.abs(z.x - p.x) < 25 && Math.abs(z.y - p.y) < 25)
  for (let i = 0; i < active.length; i++) {
    const a = active[i]
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dd = dx * dx + dy * dy
      if (dd < 0.36 && dd > 0.0001) {
        const d = Math.sqrt(dd)
        const push = (0.6 - d) * 0.5
        const nx = dx / d
        const ny = dy / d
        if (!a.down) moveEntity(a, -nx * push, -ny * push, 0.28, true)
        if (!b.down) moveEntity(b, nx * push, ny * push, 0.28, true)
      }
    }
    const dx = a.x - p.x
    const dy = a.y - p.y
    const d = Math.hypot(dx, dy)
    if (d < 0.55 && d > 0.001 && !a.down) moveEntity(a, (dx / d) * (0.55 - d), (dy / d) * (0.55 - d), 0.28, true)
  }
}

function attackPlayer(z) {
  const p = S.player
  if (S.over) return
  const crowd = S.zombies.filter(o => !o.down && o.stun <= 0 && dist(o.x, o.y, p.x, p.y) < 1.4).length
  let chance = 0.42 + (crowd - 1) * 0.12
  if (p.action) chance += 0.15
  if (S.sleeping) chance = 0.9
  if (S.sleeping) wake('Você acordou com algo agarrando você!')
  if (p.action) cancelAction()
  if (Math.random() > Math.min(0.9, chance)) return
  p.stats.panic = clamp(p.stats.panic + 12, 0, 100)
  p.hurtFlash = 0.35
  sfx.hurt()
  const protect = hasTrait('thickSkin') ? 0.45 : 0.32
  if (Math.random() < protect) {
    p.stats.health -= 2
    log('Um zumbi te agarrou, mas não rasgou a pele.', 'warn')
    return
  }
  const r = Math.random()
  const biteP = 0.1 + (crowd - 1) * 0.08
  const type = r < biteP ? 'bite' : r < biteP + 0.3 ? 'laceration' : 'scratch'
  addWound(type, true)
}

function addWound(type, fromZombie) {
  const p = S.player
  const part = BODY[randi(0, BODY.length - 1)]
  const heal = { scratch: 24, laceration: 48, bite: 72, glass: 30 }[type]
  const w = { type, part, bleed: type !== 'scratch' || Math.random() < 0.5, bandage: null, dis: false, t: 0, heal, inf: false }
  p.wounds.push(w)
  p.stats.health -= { scratch: 4, laceration: 8, bite: 14, glass: 5 }[type]
  const names = { scratch: 'um arranhão', laceration: 'uma laceração', bite: 'uma MORDIDA', glass: 'um corte de vidro' }
  log(`Você sofreu ${names[type]} (${part.toLowerCase()}).`, 'bad')
  if (fromZombie && S.settings.infection && !p.infected) {
    const c = { scratch: 0.07, laceration: 0.25, bite: 1 }[type]
    if (Math.random() < c) {
      p.infected = true
      p.infT = S.time
    }
  }
  S.blood.push({ x: p.x + rand(-0.3, 0.3), y: p.y + rand(-0.3, 0.3), r: rand(0.15, 0.3) })
}

function killZombie(z, byPlayer = true) {
  const i = S.zombies.indexOf(z)
  if (i >= 0) S.zombies.splice(i, 1)
  if (byPlayer) S.kills++
  const items = []
  if (Math.random() < 0.35) for (const it of rollLoot(Math.random, 'corpse', [1, 2], LOOT, ITEMS, STACK_AMOUNTS)) addTo(items, mkItem(it.id, it.qty))
  S.corpses.push({ x: z.x, y: z.y, dir: z.dir, shirt: z.shirt, items, t: S.time })
  if (S.corpses.length > 300) S.corpses.shift()
  for (let k = 0; k < 3; k++) S.blood.push({ x: z.x + rand(-0.5, 0.5), y: z.y + rand(-0.5, 0.5), r: rand(0.15, 0.4) })
  if (S.blood.length > 500) S.blood.splice(0, S.blood.length - 500)
  if (near(z.x, z.y, 20)) sfx.kill()
}

function currentWeapon() {
  const p = S.player
  if (p.equip && p.inv.includes(p.equip)) return { item: p.equip, def: ITEMS[p.equip.id] }
  p.equip = null
  return { item: null, def: FIST }
}

function playerAttack(shove = false) {
  const p = S.player
  if (p.atkCd > 0 || p.action || S.sleeping || S.over) return
  const { item, def } = shove ? { item: null, def: { ...FIST, dmg: 0.1, stam: 5, speed: 0.6 } } : currentWeapon()
  if (def.cat === 'gun') return shoot(item, def)
  const tired = p.stats.stamina < 15
  p.atkCd = def.speed * (tired ? 1.6 : 1) * (p.stats.fatigue > 80 ? 1.2 : 1)
  p.stats.stamina = Math.max(0, p.stats.stamina - def.stam * (hasTrait('strong') ? 0.85 : 1) * (1 - lvl('fitness') * 0.04))
  p.swing = 0.18
  sfx.swing()
  makeNoise(p.x, p.y, 3)
  const reach = def.range + 0.4
  const cands = S.zombies
    .map(z => ({ z, d: dist(z.x, z.y, p.x, p.y), a: Math.atan2(z.y - p.y, z.x - p.x) }))
    .filter(o => o.d < reach + 0.25 && (angDiff(o.a, p.dir) < 0.95 || o.d < 0.55) && (o.d < 1 || los(p.x, p.y, o.z.x, o.z.y)))
    .sort((a, b) => a.d - b.d)
  const maxT = shove ? 2 : def.cat === 'blunt' && def.w >= 1.2 ? 2 : def.chop ? 2 : 1
  const targets = cands.slice(0, maxT)
  if (!targets.length) {
    if (shove) return
    const tx = Math.floor(p.x + Math.cos(p.dir) * 0.95)
    const ty = Math.floor(p.y + Math.sin(p.dir) * 0.95)
    if (!inb(tx, ty)) return
    const k = idx(tx, ty)
    const t = W.tiles[k]
    if (t === T.TREE && def.chop) {
      W.treeHp[k] = (W.treeHp[k] ?? 10) - def.dmg * (1 + lvl('blade') * 0.08) * (S.player.prof === 'lumberjack' ? 1.6 : 1)
      sfx.chop()
      makeNoise(p.x, p.y, 9)
      addXP('blade', 0.5)
      addXP('strength', 0.3)
      wearWeapon(item, def, 0.4)
      if (W.treeHp[k] <= 0) {
        W.tiles[k] = T.GRASS
        delete W.treeHp[k]
        dropGround(tx, ty, mkItem('log', randi(1, 2)))
        log('A árvore caiu. Há toras no chão.', 'good')
      }
    } else if ((t === T.WINDOW || t === T.DOOR || t === T.WOODWALL) && item) {
      const mult = def.pry ? 1.6 : def.chop ? 2 : 1
      damageStructure(k, def.dmg * 9 * mult * (1 + lvl('strength') * 0.05), true)
      sfx.bang(0.7)
      makeNoise(p.x, p.y, 9, true)
      wearWeapon(item, def, 0.3)
    } else if (t === T.WINDOW && !item) {
      damageStructure(k, 50, true)
      if (Math.random() < 0.5) addWound('glass', false)
    }
    return
  }
  const skill = def.cat === 'blade' ? 'blade' : 'blunt'
  for (const { z } of targets) {
    const hitChance = 0.82 + lvl(skill) * 0.015 - p.stats.panic * 0.002 - (p.stats.fatigue > 80 ? 0.1 : 0)
    if (Math.random() > hitChance) continue
    let dmg = def.dmg * (1 + lvl(skill) * 0.12) * (1 + lvl('strength') * 0.04) * rand(0.8, 1.2)
    if (hasTrait('strong')) dmg *= 1.2
    if (hasTrait('weak')) dmg *= 0.8
    if (tired) dmg *= 0.5
    if (z.down > 0) dmg *= 2.5
    if (Math.random() < 0.05 + lvl(skill) * 0.025) dmg *= 2
    if (!shove) z.hp -= dmg
    z.hit = 0.2
    const kb = shove ? 0.55 : def.cat === 'blunt' ? 0.35 : 0.15
    const a = Math.atan2(z.y - p.y, z.x - p.x)
    moveEntity(z, Math.cos(a) * kb, Math.sin(a) * kb, 0.28, true)
    z.stun = Math.max(z.stun, shove ? 0.8 : 0.45)
    const kd = shove ? 0.35 : def.cat === 'blunt' ? 0.18 + lvl('blunt') * 0.02 : 0.05
    if (Math.random() < kd) z.down = rand(1.5, 3)
    z.st = 'chase'
    z.lx = p.x
    z.ly = p.y
    z.mem = 10
    sfx.hit()
    makeNoise(p.x, p.y, 5)
    S.blood.push({ x: z.x + rand(-0.2, 0.2), y: z.y + rand(-0.2, 0.2), r: rand(0.08, 0.18) })
    if (!shove) {
      addXP(skill, 1.5)
      addXP('strength', 0.3)
      wearWeapon(item, def, 1)
    }
    if (z.hp <= 0) {
      killZombie(z)
      if (!shove) addXP(skill, 4)
    }
  }
}

function wearWeapon(item, def, mult) {
  if (!item || !def.dur) return
  const skill = def.cat === 'blade' ? 'blade' : def.cat === 'gun' ? 'gun' : 'blunt'
  if (Math.random() < (0.6 - lvl(skill) * 0.04) * mult) item.dur--
  if (item.dur <= 0) {
    log(`Seu(sua) ${def.name.toLowerCase()} quebrou!`, 'bad')
    removeItem(S.player.inv, item)
    sfx.bang(0.4)
  }
}

function shoot(item, def) {
  const p = S.player
  if (item.ammo <= 0) {
    sfx.click()
    p.atkCd = 0.35
    log('Sem munição carregada. Pressione R para recarregar.', 'warn')
    return
  }
  item.ammo--
  p.atkCd = def.speed
  def.pellets ? sfx.shotgun() : sfx.gun()
  makeNoise(p.x, p.y, def.noise, true)
  S.flashes.push({ x: p.x + Math.cos(p.dir) * 0.6, y: p.y + Math.sin(p.dir) * 0.6, t: 0.08 })
  const n = def.pellets || 1
  const g = lvl('gun')
  for (let i = 0; i < n; i++) {
    const spread = n > 1 ? 0.36 : Math.max(0.02, 0.14 - g * 0.012 + p.stats.panic * 0.0015 + (p.stats.fatigue > 80 ? 0.05 : 0))
    const a = p.dir + (Math.random() - 0.5) * spread
    let x = p.x
    let y = p.y
    let hitZ = null
    let len = 0
    for (len = 0; len < def.range; len += 0.2) {
      x = p.x + Math.cos(a) * len
      y = p.y + Math.sin(a) * len
      const tx = Math.floor(x)
      const ty = Math.floor(y)
      if (!inb(tx, ty)) break
      const k = idx(tx, ty)
      if (W.tiles[k] === T.WINDOW && W.windows[k].state === 'closed' && len > 0.6) damageStructure(k, 99, true)
      if (opaque(k) && len > 0.6) break
      hitZ = S.zombies.find(z => Math.abs(z.x - x) < 0.36 && Math.abs(z.y - y) < 0.36)
      if (hitZ) break
    }
    S.tracers.push({ x0: p.x, y0: p.y, x1: x, y1: y, t: 0.07 })
    if (hitZ) {
      let dmg = def.dmg * (1 + g * 0.06) * rand(0.8, 1.2)
      if (n > 1) dmg *= 0.55
      if (Math.random() < 0.1 + g * 0.03) dmg *= 3
      hitZ.hp -= dmg
      hitZ.hit = 0.2
      hitZ.stun = 0.3
      hitZ.st = 'chase'
      hitZ.lx = p.x
      hitZ.ly = p.y
      hitZ.mem = 10
      S.blood.push({ x: hitZ.x + Math.cos(a) * 0.4, y: hitZ.y + Math.sin(a) * 0.4, r: rand(0.1, 0.25) })
      addXP('gun', 2)
      if (hitZ.hp <= 0) {
        killZombie(hitZ)
        addXP('gun', 4)
      }
    }
  }
  wearWeapon(item, def, 0.3)
}

function reload() {
  const p = S.player
  const { item, def } = currentWeapon()
  if (!item || def.cat !== 'gun') return
  const need = def.mag - item.ammo
  const have = invCount(def.ammo)
  if (need <= 0) return log('A arma já está carregada.')
  if (!have) return log(`Você não tem ${ITEMS[def.ammo].name.toLowerCase()}.`, 'warn')
  const n = Math.min(need, have)
  const time = def.pellets ? 0.45 * n : 1.6
  startAction('Recarregando', time, () => {
    removeQty(p.inv, def.ammo, n)
    item.ammo += n
    sfx.click()
  })
}

function startAction(label, dur, done, opts = {}) {
  const p = S.player
  if (p.action) return false
  p.action = { label, t: 0, dur, done, noise: opts.noise || 0, noiseT: 0, sound: opts.sound }
  return true
}

function cancelAction() {
  const p = S.player
  if (p.action) {
    log(`Ação interrompida: ${p.action.label.toLowerCase()}.`, 'warn')
    p.action = null
  }
}

function dropGround(x, y, it) {
  const k = idx(x, y)
  if (!S.ground[k]) S.ground[k] = []
  addTo(S.ground[k], it)
}

function tileCenter(k) {
  return [(k % W.w) + 0.5, Math.floor(k / W.w) + 0.5]
}

function getTarget() {
  const p = S.player
  const near1 = S.corpses
    .filter(c => dist(c.x, c.y, mouse.wx, mouse.wy) < 0.8 && dist(c.x, c.y, p.x, p.y) < 1.8)
    .sort((a, b) => dist(a.x, a.y, mouse.wx, mouse.wy) - dist(b.x, b.y, mouse.wx, mouse.wy))[0]
  if (near1) return { kind: 'corpse', c: near1, label: 'Revistar corpo', x: near1.x, y: near1.y }
  let tx = Math.floor(mouse.wx)
  let ty = Math.floor(mouse.wy)
  if (!inb(tx, ty) || dist(tx + 0.5, ty + 0.5, p.x, p.y) > 1.75) {
    tx = Math.floor(p.x + Math.cos(p.dir) * 0.9)
    ty = Math.floor(p.y + Math.sin(p.dir) * 0.9)
  }
  if (!inb(tx, ty)) return null
  const k = idx(tx, ty)
  const t = W.tiles[k]
  const base = { k, x: tx + 0.5, y: ty + 0.5 }
  if (S.ground[k] && S.ground[k].length && t !== T.FURN) return { ...base, kind: 'ground', label: 'Itens no chão' }
  if (t === T.FURN) {
    const f = W.furn[k]
    const def = FURN[f.kind]
    if (def.bed) return { ...base, kind: 'bed', label: `Dormir (${def.name.toLowerCase()})` }
    if (def.sink) return { ...base, kind: 'sink', label: 'Pia: beber e encher garrafas' }
    if (def.collector) return { ...base, kind: 'collector', label: `Coletor (${Math.floor(f.water || 0)} porções)` }
    if (def.fire) return { ...base, kind: 'fire', label: f.fuel > 0 ? 'Fogueira: cozinhar / ferver água' : 'Fogueira apagada: reacender' }
    if (def.cook && f.kind === 'stove') return { ...base, kind: 'stove', label: 'Fogão: abrir / cozinhar', container: true }
    return { ...base, kind: 'container', label: `Abrir ${def.name.toLowerCase()}` }
  }
  if (t === T.DOOR) {
    const d = W.doors[k]
    if (d.bars.length) return { ...base, kind: 'door', label: `Porta barricada (${d.bars.length} tábuas)` }
    if (d.broken) return { ...base, kind: 'door', label: 'Porta arrombada' }
    if (d.locked && !d.open) return { ...base, kind: 'door', label: 'Porta trancada' }
    return { ...base, kind: 'door', label: d.open ? 'Fechar porta' : 'Abrir porta' }
  }
  if (t === T.WINDOW) {
    const w = W.windows[k]
    if (w.bars.length) return { ...base, kind: 'window', label: `Janela barricada (${w.bars.length} tábuas)` }
    if (w.state === 'broken') return { ...base, kind: 'window', label: w.cleared ? 'Janela quebrada (sem vidro)' : 'Remover cacos de vidro' }
    return { ...base, kind: 'window', label: w.state === 'open' ? 'Fechar janela' : 'Abrir janela' }
  }
  if (t === T.WATER) return { ...base, kind: 'water', label: 'Lago: beber / encher (contaminada)' }
  if (t === T.DIRT) {
    const pl = W.plots[k]
    if (!pl) return { ...base, kind: 'plot', label: invCount('seeds') ? 'Plantar sementes' : 'Canteiro vazio (precisa de sementes)' }
    if (pl.stage >= 3) return { ...base, kind: 'plot', label: 'Colher legumes' }
    return { ...base, kind: 'plot', label: `Plantação crescendo (${['semeada', 'brotando', 'quase pronta'][pl.stage]})` }
  }
  if (t === T.TREE) return { ...base, kind: 'tree', label: currentWeapon().def.chop ? 'Golpeie para cortar a árvore' : 'Árvore (precisa de machado)' }
  if (t === T.GRASS && invFind('shovel')) return { ...base, kind: 'dig', label: 'G: cavar canteiro' }
  return null
}

function interact() {
  const p = S.player
  if (p.action || S.sleeping || S.over) return
  const tg = target
  if (!tg) return
  if (tg.kind === 'corpse') return openContainer({ type: 'corpse', c: tg.c })
  if (tg.kind === 'ground') return openContainer({ type: 'ground', k: tg.k })
  if (tg.kind === 'container' || tg.kind === 'stove') {
    if (tg.kind === 'stove' && !S.powerOff && hasCookables()) {
      return startAction('Cozinhando', 4, () => cook())
    }
    return openContainer({ type: 'furn', k: tg.k })
  }
  if (tg.kind === 'fire') {
    const f = W.furn[tg.k]
    if (f.fuel <= 0 || f.fuel < 60) {
      if (invCount('plank') && invFind('lighter')) {
        removeQty(p.inv, 'plank', 1)
        f.fuel = (f.fuel || 0) + 180
        log('Você colocou uma tábua na fogueira.', 'good')
        if (!hasCookables()) return
      } else if (f.fuel <= 0) return log('Precisa de uma tábua e um isqueiro para acender.', 'warn')
    }
    if (hasCookables()) return startAction('Cozinhando', 4, () => cook())
    return log('Nada para cozinhar ou ferver.')
  }
  if (tg.kind === 'bed') return trySleep(tg.k)
  if (tg.kind === 'sink') return useWaterSource(tg.k, 'sink')
  if (tg.kind === 'collector') return useWaterSource(tg.k, 'collector')
  if (tg.kind === 'water') return useWaterSource(tg.k, 'pond')
  if (tg.kind === 'door') {
    const d = W.doors[tg.k]
    if (d.bars.length || d.broken) return
    if (d.locked && !d.open) {
      if (p.prof === 'burglar') {
        return startAction('Destrancando', 2.5, () => { d.locked = false; log('Você destrancou a porta.', 'good') })
      }
      if (invFind('crowbar')) {
        return startAction('Forçando a porta', 3, () => {
          d.locked = false
          makeNoise(tg.x, tg.y, 10, true)
          triggerAlarm(tg.k)
          const cb = invFind('crowbar')
          if (cb) wearWeapon(cb, ITEMS.crowbar, 1)
          log('A porta cedeu.', 'good')
        }, { noise: 6 })
      }
      return log('A porta está trancada. Use um pé de cabra, arrombe-a ou entre pela janela.', 'warn')
    }
    if (d.open) {
      const [cx, cy] = tileCenter(tg.k)
      if (S.zombies.some(z => dist(z.x, z.y, cx, cy) < 0.7) || dist(p.x, p.y, cx, cy) < 0.75) return
    }
    d.open = !d.open
    sfx.door()
    makeNoise(tg.x, tg.y, 4)
    return
  }
  if (tg.kind === 'window') {
    const w = W.windows[tg.k]
    if (w.bars.length) return
    if (w.state === 'broken') {
      if (!w.cleared) startAction('Removendo cacos', 2, () => { w.cleared = true })
      return
    }
    const [cx, cy] = tileCenter(tg.k)
    if (w.state === 'open' && dist(p.x, p.y, cx, cy) < 0.75) return
    startAction(w.state === 'open' ? 'Fechando janela' : 'Abrindo janela', 0.8, () => {
      w.state = w.state === 'open' ? 'closed' : 'open'
      makeNoise(tg.x, tg.y, 3)
      sfx.door()
    })
    return
  }
  if (tg.kind === 'plot') {
    const pl = W.plots[tg.k]
    if (!pl) {
      if (!invCount('seeds')) return log('Você precisa de sementes.', 'warn')
      return startAction('Plantando', 2, () => {
        removeQty(p.inv, 'seeds', 1)
        W.plots[tg.k] = { stage: 0, g: 0 }
        addXP('farming', 3)
      })
    }
    if (pl.stage >= 3) {
      return startAction('Colhendo', 2, () => {
        const n = randi(2, 3) + Math.floor(lvl('farming') / 3)
        addTo(p.inv, mkItem('veggie', 1))
        for (let i = 1; i < n; i++) addTo(p.inv, mkItem('veggie', 1))
        if (Math.random() < 0.6) addTo(p.inv, mkItem('seeds', randi(1, 2)))
        delete W.plots[tg.k]
        addXP('farming', 6)
        log(`Você colheu ${n} legumes.`, 'good')
      })
    }
  }
}

function hasCookables() {
  return invCount('tainted') > 0 || invCount('meat') > 0
}

function cook() {
  const p = S.player
  const t = invCount('tainted')
  const m = invCount('meat')
  if (t) {
    removeQty(p.inv, 'tainted', t)
    addTo(p.inv, mkItem('water', t))
  }
  const meats = p.inv.filter(i => i.id === 'meat')
  for (const it of meats) {
    removeItem(p.inv, it)
    addTo(p.inv, mkItem('cooked_meat', 1))
  }
  log(`Pronto: ${t ? t + ' garrafa(s) fervida(s)' : ''}${t && m ? ', ' : ''}${m ? m + ' carne(s) assada(s)' : ''}.`, 'good')
}

function useWaterSource(k, kind) {
  const p = S.player
  const f = W.furn[k]
  let avail = Infinity
  if (kind === 'sink' && S.waterOff) avail = f.water || 0
  if (kind === 'collector') avail = Math.floor(f.water || 0)
  if (avail <= 0) return log(kind === 'sink' ? 'A torneira só solta ar. A água foi cortada.' : 'O coletor está vazio.', 'warn')
  const tainted = kind === 'pond'
  startAction('Bebendo', 1.5, () => {
    let used = 0
    while (p.stats.thirst > 5 && used < avail) {
      p.stats.thirst = Math.max(0, p.stats.thirst - 30)
      used++
    }
    if (tainted && used) {
      p.stats.sick = clamp(p.stats.sick + 35, 0, 100)
      log('A água do lago tinha um gosto estranho...', 'warn')
    }
    const bottles = invCount('bottle')
    const fill = Math.min(bottles, avail - used)
    if (fill > 0) {
      removeQty(p.inv, 'bottle', fill)
      addTo(p.inv, mkItem(tainted ? 'tainted' : 'water', fill))
      used += fill
    }
    if (kind === 'sink' && S.waterOff) f.water -= used
    if (kind === 'collector') f.water -= used
    log(`Você bebeu${fill > 0 ? ` e encheu ${fill} garrafa(s)` : ''}.`, 'good')
  })
}

function zombiesNear(r) {
  const p = S.player
  return S.zombies.some(z => dist(z.x, z.y, p.x, p.y) < r && (z.st === 'chase' || los(z.x, z.y, p.x, p.y)))
}

function trySleep(k) {
  const p = S.player
  if (zombiesNear(10)) return log('Não dá para dormir com mortos tão perto.', 'warn')
  if (p.stats.fatigue < 30) return log('Você não está cansado o bastante para dormir.')
  if (p.stats.panic > 50) return log('Você está nervoso demais para dormir.', 'warn')
  S.sleeping = { sofa: FURN[W.furn[k].kind].sofa }
  closePanels()
  log('Você se deitou e fechou os olhos...', '')
}

function wake(msg) {
  if (!S.sleeping) return
  S.sleeping = false
  if (msg) log(msg, 'bad')
  else log(`Você acordou. ${clockStr()} do dia ${dayNum()}.`, 'good')
  save()
}

function barricade(remove = false) {
  const p = S.player
  if (p.action) return
  const tg = target
  if (!tg || (tg.kind !== 'door' && tg.kind !== 'window')) return log('Mire em uma porta ou janela para barricar.', 'warn')
  const o = tg.kind === 'door' ? W.doors[tg.k] : W.windows[tg.k]
  if (remove) {
    if (!o.bars.length) return
    if (!invFind('hammer') && !invFind('crowbar')) return log('Você precisa de um martelo ou pé de cabra.', 'warn')
    return startAction('Removendo tábua', 3, () => {
      o.bars.pop()
      addTo(p.inv, mkItem('plank', 1, { full: true }))
      makeNoise(tg.x, tg.y, 8)
    }, { noise: 8 })
  }
  if (tg.kind === 'door' && (o.open || o.broken)) {
    if (o.broken) return log('Não dá para barricar uma porta arrombada. Construa uma parede.', 'warn')
    return log('Feche a porta antes de barricar.', 'warn')
  }
  if (o.bars.length >= 4) return log('Já está totalmente barricada.')
  if (!invFind('hammer')) return log('Você precisa de um martelo.', 'warn')
  if (invCount('plank') < 1 || invCount('nails') < 2) return log('Você precisa de 1 tábua e 2 pregos.', 'warn')
  if (tg.kind === 'window' && o.state === 'open') o.state = 'closed'
  startAction('Pregando tábua', 3, () => {
    if (invCount('plank') < 1 || invCount('nails') < 2) return
    removeQty(p.inv, 'plank', 1)
    removeQty(p.inv, 'nails', 2)
    o.bars.push(30 * (1 + lvl('carpentry') * 0.15) * (p.prof === 'carpenter' ? 1.25 : 1))
    addXP('carpentry', 6)
    log('Tábua pregada.', 'good')
  }, { noise: 16, sound: 'hammer' })
}

function dig() {
  const tg = target
  if (!tg || tg.kind !== 'dig') return
  if (!invFind('shovel')) return
  startAction('Cavando', 4, () => {
    W.tiles[tg.k] = T.DIRT
    addXP('farming', 2)
  }, { sound: 'dig' })
}

function closePanels() {
  $('panel').classList.add('hidden')
  $('container').classList.add('hidden')
  $('mapview').classList.add('hidden')
  S && (S.openCont = null)
  S && (S.panelTab = S.panelTab || 'inv')
}

function openContainer(ref) {
  const p = S.player
  if (ref.type === 'furn') {
    const f = W.furn[ref.k]
    const def = FURN[f.kind]
    if (!f.items) {
      f.items = []
      if (def.loot) {
        const mult = S.settings.loot
        let r0 = def.rolls[0]
        let r1 = def.rolls[1]
        r0 = Math.floor(r0 * mult + Math.random())
        r1 = Math.floor(r1 * mult + Math.random())
        for (const it of rollLoot(Math.random, def.loot, [r0, Math.max(r0, r1)], LOOT, ITEMS, STACK_AMOUNTS)) {
          const opts = {}
          if (f.kind === 'fridge' && ITEMS[it.id].perish && !S.powerOff) opts.spoil = Math.max(S.powerOffAt, S.time) + ITEMS[it.id].perish * 1440 * rand(0.3, 0.8)
          addTo(f.items, mkItem(it.id, it.qty, opts))
        }
      }
    }
  }
  S.openCont = ref
  $('container').classList.remove('hidden')
  renderContainer()
}

function contItems(ref) {
  if (ref.type === 'furn') return W.furn[ref.k].items
  if (ref.type === 'corpse') return ref.c.items
  if (ref.type === 'ground') return S.ground[ref.k] || (S.ground[ref.k] = [])
  return []
}

function contName(ref) {
  if (ref.type === 'furn') return FURN[W.furn[ref.k].kind].name
  if (ref.type === 'corpse') return 'Corpo'
  return 'Chão'
}

function contPos(ref) {
  if (ref.type === 'corpse') return [ref.c.x, ref.c.y]
  return tileCenter(ref.k)
}

function itemLabel(it) {
  const d = ITEMS[it.id]
  let s = d.name
  if (it.qty > 1) s += ` ×${it.qty}`
  const tags = []
  if (it.dur !== undefined && d.dur) tags.push(`${Math.round((it.dur / d.dur) * 100)}%`)
  if (d.mag) tags.push(`${it.ammo}/${d.mag}`)
  if (it.uses !== undefined) tags.push(`${it.uses} usos`)
  if (it.charge !== undefined) tags.push(`bateria ${Math.round(it.charge)}%`)
  if (it.spoil) tags.push(isSpoiled(it) ? 'estragado' : it.spoil - S.time < 1440 ? 'passando' : 'fresco')
  if (S.player.equip === it) tags.push('em mãos')
  if (tags.length) s += ` <em>${tags.join(' · ')}</em>`
  return s
}

function transfer(from, to, it, qty) {
  const d = ITEMS[it.id]
  if (d.stack && qty < it.qty) {
    it.qty -= qty
    addTo(to, { ...it, qty })
  } else {
    removeItem(from, it)
    addTo(to, it)
  }
}

function renderContainer() {
  const ref = S.openCont
  if (!ref) return
  const items = contItems(ref)
  const p = S.player
  const el = $('container')
  const wgt = weight(p.inv)
  const cap = capacity()
  el.innerHTML = `
    <div class="ph"><b>${contName(ref)}</b><button data-a="close">✕</button></div>
    <div class="cols">
      <div class="col">
        <div class="sub">Conteúdo <button data-a="takeall" ${items.length ? '' : 'disabled'}>Pegar tudo</button></div>
        <ul>${items.length ? items.map((it, i) => `<li><span>${itemLabel(it)}</span><button data-a="take" data-i="${i}">Pegar</button></li>`).join('') : '<li class="empty">Vazio</li>'}</ul>
      </div>
      <div class="col">
        <div class="sub">Sua mochila <span class="${wgt > cap ? 'bad' : ''}">${wgt.toFixed(1)} / ${cap.toFixed(1)}</span></div>
        <ul>${p.inv.map((it, i) => `<li><span>${itemLabel(it)}</span><button data-a="put" data-i="${i}">Guardar</button></li>`).join('')}</ul>
      </div>
    </div>`
  el.onclick = e => {
    const b = e.target.closest('button')
    if (!b) return
    const a = b.dataset.a
    const i = +b.dataset.i
    if (a === 'close') return closePanels()
    if (a === 'take') {
      const it = items[i]
      if (it) takeFromContainer(ref, it, it.qty)
    }
    if (a === 'takeall') for (const it of [...items]) takeFromContainer(ref, it, it.qty)
    if (a === 'put') {
      const it = p.inv[i]
      if (it) transfer(p.inv, items, it, it.qty)
    }
    sfx.pickup()
    renderContainer()
    renderHud(true)
  }
}

function takeFromContainer(ref, it, qty) {
  if (ref.type === 'furn' && W.furn[ref.k].kind === 'fridge' && it.spoil && !S.powerOff) {
    it.spoil = Math.min(it.spoil, S.time + ITEMS[it.id].perish * 1440 * 0.8)
  }
  transfer(contItems(ref), S.player.inv, it, qty)
}

function togglePanel(tab) {
  const el = $('panel')
  if (!el.classList.contains('hidden') && (!tab || tab === S.panelTab)) {
    el.classList.add('hidden')
    return
  }
  S.panelTab = tab || S.panelTab || 'inv'
  el.classList.remove('hidden')
  renderPanel()
}

function renderPanel() {
  const el = $('panel')
  if (el.classList.contains('hidden')) return
  const p = S.player
  const tab = S.panelTab || 'inv'
  const tabs = [['inv', 'Inventário'], ['health', 'Saúde'], ['skills', 'Habilidades'], ['craft', 'Criação']]
  let body = ''
  if (tab === 'inv') {
    const wgt = weight(p.inv)
    const cap = capacity()
    body = `<div class="sub">Peso <span class="${wgt > cap ? 'bad' : ''}">${wgt.toFixed(1)} / ${cap.toFixed(1)}</span></div><ul>` + p.inv.map((it, i) => {
      const d = ITEMS[it.id]
      const btns = []
      if (d.kind === 'food') btns.push(['eat', 'Comer'])
      if (d.kind === 'drink') btns.push(['eat', 'Beber'])
      if (['painkillers', 'calm', 'antibiotics', 'vitamins'].includes(it.id)) btns.push(['eat', 'Tomar'])
      if (d.kind === 'book') btns.push(['eat', p.booked[d.skill] ? 'Reler' : 'Ler'])
      if (d.kind === 'fun' || it.id === 'cigarettes') btns.push(['eat', it.id === 'cigarettes' ? 'Fumar' : 'Ler'])
      if (it.id === 'battery' && invFind('flashlight')) btns.push(['eat', 'Trocar pilha'])
      if (d.kind === 'weapon') btns.push(['equip', p.equip === it ? 'Guardar' : 'Equipar'])
      if (it.id === 'flashlight') btns.push(['light', p.light ? 'Desligar' : 'Ligar'])
      btns.push(['drop', 'Largar'])
      return `<li><span>${itemLabel(it)}</span><span class="btns">${btns.map(([a, l]) => `<button data-a="${a}" data-i="${i}">${l}</button>`).join('')}</span></li>`
    }).join('') + '</ul>'
  } else if (tab === 'health') {
    const st = p.stats
    const rows = [
      ['Saúde', st.health], ['Fome', st.hunger], ['Sede', st.thirst], ['Cansaço', st.fatigue], ['Pânico', st.panic], ['Enjoo', st.sick]
    ]
    body = `<div class="statgrid">${rows.map(([n, v]) => `<div><span>${n}</span><div class="mbar"><i style="width:${clamp(v, 0, 100)}%"></i></div></div>`).join('')}</div>`
    body += '<div class="sub">Ferimentos</div><ul>'
    if (!p.wounds.length) body += '<li class="empty">Nenhum ferimento.</li>'
    const names = { scratch: 'Arranhão', laceration: 'Laceração', bite: 'Mordida', glass: 'Corte' }
    p.wounds.forEach((w, i) => {
      const tags = []
      if (w.bleed) tags.push('<b class="bad">sangrando</b>')
      if (w.bandage) tags.push(w.bandage === 'clean' ? 'bandagem limpa' : 'trapo')
      if (w.dis) tags.push('desinfetado')
      if (w.inf) tags.push('<b class="bad">infeccionado</b>')
      tags.push(`${Math.round((w.t / w.heal) * 100)}% cicatrizado`)
      const btns = []
      if (!w.bandage) {
        if (invCount('bandage')) btns.push(['bandage', 'Bandagem'])
        if (invCount('rag')) btns.push(['rag', 'Trapo'])
      }
      if (!w.dis && invFind('disinfectant')) btns.push(['disinfect', 'Desinfetar'])
      body += `<li><span>${names[w.type]} — ${w.part} <em>${tags.join(' · ')}</em></span><span class="btns">${btns.map(([a, l]) => `<button data-a="${a}" data-i="${i}">${l}</button>`).join('')}</span></li>`
    })
    body += '</ul>'
  } else if (tab === 'skills') {
    body = '<ul class="skills">' + Object.keys(SKILLS).map(k => {
      const s = p.skills[k]
      const pct = s.lvl >= 10 ? 100 : (s.xp / xpNeed(s.lvl)) * 100
      return `<li><span>${SKILLS[k]}${p.booked[k] ? ' <em>📖</em>' : ''}</span><span class="pips">${Array.from({ length: 10 }, (_, i) => `<i class="${i < s.lvl ? 'on' : ''}"></i>`).join('')}</span><div class="mbar thin"><i style="width:${pct}%"></i></div></li>`
    }).join('') + '</ul>'
    body += `<div class="sub">Traços</div><p class="small">${p.traits.length ? p.traits.map(t => TRAITS.find(x => x.id === t).name).join(', ') : 'Nenhum'}</p>`
  } else if (tab === 'craft') {
    body = '<ul>' + RECIPES.map((r, i) => {
      const parts = []
      let ok = true
      for (const [id, q] of Object.entries(r.needs)) {
        const has = id === 'disinfectant' ? (invFind('disinfectant') ? 1 : 0) : invCount(id)
        const need = id === 'disinfectant' ? 1 : q
        if (has < need) ok = false
        parts.push(`<span class="${has >= need ? '' : 'bad'}">${ITEMS[id].name}${id === 'disinfectant' ? ' (1 uso)' : ` ×${q}`}</span>`)
      }
      for (const t of r.tools || []) {
        const has = !!invFind(t)
        if (!has) ok = false
        parts.push(`<span class="${has ? '' : 'bad'}">🔧 ${ITEMS[t].name}</span>`)
      }
      if (r.minSkill) for (const [sk, l] of Object.entries(r.minSkill)) {
        const has = lvl(sk) >= l
        if (!has) ok = false
        parts.push(`<span class="${has ? '' : 'bad'}">${SKILLS[sk]} ${l}</span>`)
      }
      return `<li><span><b>${r.name}</b><em>${parts.join(' · ')}</em></span><button data-a="craft" data-i="${i}" ${ok ? '' : 'disabled'}>Criar</button></li>`
    }).join('') + '</ul><p class="small">Construções (fogueira, coletor, caixote, parede) são colocadas no ladrilho para onde você está olhando.</p>'
  }
  el.innerHTML = `<div class="ph"><div class="tabs">${tabs.map(([id, n]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${n}</button>`).join('')}</div><button data-a="close">✕</button></div><div class="pb">${body}</div>`
  el.onclick = e => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.tab) {
      S.panelTab = b.dataset.tab
      return renderPanel()
    }
    const a = b.dataset.a
    const i = +b.dataset.i
    if (a === 'close') return el.classList.add('hidden')
    if (tab === 'inv') {
      const it = p.inv[i]
      if (!it) return
      if (a === 'eat') consume(it)
      if (a === 'equip') {
        p.equip = p.equip === it ? null : it
        sfx.pickup()
      }
      if (a === 'light') toggleLight()
      if (a === 'drop') {
        removeItem(p.inv, it)
        dropGround(Math.floor(p.x), Math.floor(p.y), it)
      }
    } else if (tab === 'health') {
      const w = p.wounds[i]
      if (!w) return
      const fa = lvl('firstAid')
      const time = Math.max(1, 3 - fa * 0.2)
      if (a === 'bandage' || a === 'rag') {
        startAction('Fazendo curativo', time, () => {
          if (!invCount(a)) return
          removeQty(p.inv, a, 1)
          w.bandage = a === 'bandage' ? 'clean' : 'dirty'
          w.bleed = false
          addXP('firstAid', 4)
        })
      }
      if (a === 'disinfect') {
        startAction('Desinfetando', time, () => {
          if (!useDisinfectant()) return
          w.dis = true
          w.inf = false
          addXP('firstAid', 3)
        })
      }
    } else if (tab === 'craft' && a === 'craft') craft(RECIPES[i])
    renderPanel()
    renderHud(true)
  }
}

function toggleLight() {
  const p = S.player
  const fl = invFind('flashlight')
  if (!fl) return log('Você não tem uma lanterna.', 'warn')
  if (!p.light && fl.charge <= 0) return log('A lanterna está sem pilha.', 'warn')
  p.light = !p.light
  sfx.click()
}

function consume(it) {
  const p = S.player
  const d = ITEMS[it.id]
  const st = p.stats
  if (d.kind === 'food' || d.kind === 'drink') {
    startAction(d.kind === 'food' ? 'Comendo' : 'Bebendo', d.kind === 'food' ? 2.5 : 1.2, () => {
      if (!p.inv.includes(it)) return
      const spoiled = isSpoiled(it)
      if (d.kind === 'food') {
        st.hunger = Math.max(0, st.hunger - d.hunger * (spoiled ? 0.5 : 1))
        st.thirst = clamp(st.thirst + (d.thirst || 0), 0, 100)
      } else {
        st.thirst = Math.max(0, st.thirst - d.thirst)
        if (d.hunger) st.hunger = Math.max(0, st.hunger - d.hunger)
      }
      if (spoiled) {
        st.sick = clamp(st.sick + 45, 0, 100)
        log('Isso estava estragado...', 'bad')
      }
      if (d.raw) {
        st.sick = clamp(st.sick + 30, 0, 100)
        log('Carne crua não foi uma boa ideia.', 'bad')
      }
      if (d.tainted) {
        st.sick = clamp(st.sick + 40, 0, 100)
        log('A água tinha gosto de lama.', 'bad')
      }
      if (d.stack && it.qty > 1) it.qty--
      else removeItem(p.inv, it)
      if (d.leaves) addTo(p.inv, mkItem(d.leaves, 1))
      sfx.eat()
    })
    return
  }
  if (d.kind === 'book') {
    return startAction('Lendo', 15, () => {
      if (!p.inv.includes(it)) return
      const first = !p.booked[d.skill]
      p.booked[d.skill] = true
      if (first) {
        addXP(d.skill, 30)
        log(`Você aprendeu muito com o livro. ${SKILLS[d.skill]} agora evolui em dobro.`, 'good')
      } else log('Você já conhecia esse conteúdo.')
      st.panic = Math.max(0, st.panic - 10)
    })
  }
  if (d.kind === 'fun' || it.id === 'cigarettes') {
    return startAction(it.id === 'cigarettes' ? 'Fumando' : 'Lendo', 4, () => {
      st.panic = Math.max(0, st.panic - (it.id === 'cigarettes' ? 18 : 12))
      if (it.id === 'cigarettes') st.health -= 0.5
      removeQty(p.inv, it.id, 1)
    })
  }
  if (it.id === 'battery') {
    const fl = invFind('flashlight')
    if (!fl) return
    fl.charge = 100
    removeQty(p.inv, 'battery', 1)
    return log('Pilha trocada.', 'good')
  }
  startAction('Tomando remédio', 1, () => {
    if (!p.inv.includes(it)) return
    if (it.id === 'painkillers') {
      p.painkill = 180
      log('A dor diminuiu.', 'good')
    }
    if (it.id === 'calm') {
      p.calm = 240
      st.panic = Math.max(0, st.panic - 40)
      log('Você se sente mais calmo.', 'good')
    }
    if (it.id === 'antibiotics') {
      for (const w of p.wounds) w.inf = false
      st.sick = Math.max(0, st.sick - 20)
      log('Os antibióticos devem ajudar com as infecções.', 'good')
    }
    if (it.id === 'vitamins') {
      st.fatigue = Math.max(0, st.fatigue - 12)
      log('Você se sente um pouco mais disposto.', 'good')
    }
    removeQty(p.inv, it.id, 1)
  })
}

function craft(r) {
  const p = S.player
  let place = null
  if (r.place) {
    const tx = Math.floor(p.x + Math.cos(p.dir) * 1.0)
    const ty = Math.floor(p.y + Math.sin(p.dir) * 1.0)
    const k = idx(tx, ty)
    if (!inb(tx, ty) || !walkable(tx, ty) || W.tiles[k] === T.DIRT || (tx === Math.floor(p.x) && ty === Math.floor(p.y))) return log('Olhe para um espaço livre ao lado para construir.', 'warn')
    if (S.zombies.some(z => Math.floor(z.x) === tx && Math.floor(z.y) === ty)) return log('Tem algo no caminho.', 'warn')
    place = k
  }
  startAction(r.name, r.time, () => {
    for (const [id, q] of Object.entries(r.needs)) {
      if (id === 'disinfectant') {
        if (!invFind('disinfectant')) return
      } else if (invCount(id) < q) return
    }
    for (const [id, q] of Object.entries(r.needs)) {
      if (id === 'disinfectant') useDisinfectant()
      else removeQty(p.inv, id, q)
    }
    if (r.gives) for (const [id, q] of Object.entries(r.gives)) {
      if (ITEMS[id].stack) addTo(p.inv, mkItem(id, q, { full: true }))
      else for (let i = 0; i < q; i++) addTo(p.inv, mkItem(id, 1, { full: true }))
    }
    if (place !== null) {
      if (r.place === 'woodwall') {
        W.woodwalls[place] = { hp: 120 * (1 + lvl('carpentry') * 0.15), base: W.tiles[place] }
        W.tiles[place] = T.WOODWALL
      } else {
        W.furn[place] = { kind: r.place, items: r.place === 'crate' ? [] : null, fuel: r.place === 'campfire' ? 240 : 0, water: 0, base: W.tiles[place] }
        W.tiles[place] = T.FURN
      }
    }
    if (r.skill) addXP(r.skill, r.xp)
    log(`${r.name}: feito.`, 'good')
    renderPanel()
  }, { sound: r.tools && r.tools.includes('hammer') ? 'hammer' : null, noise: r.tools && r.tools.includes('hammer') ? 12 : 0 })
}

function updatePlayer(dt, realDt) {
  const p = S.player
  const st = p.stats
  p.atkCd = Math.max(0, p.atkCd - dt)
  p.hurtFlash = Math.max(0, p.hurtFlash - realDt)
  p.swing = Math.max(0, (p.swing || 0) - realDt)
  if (!S.sleeping) {
    const sx = (mouse.sx - cw / 2) / zoom + camX
    const sy = (mouse.sy - ch / 2) / zoom + camY
    mouse.wx = sx / TS
    mouse.wy = sy / TS
    p.dir = Math.atan2(mouse.wy - p.y, mouse.wx - p.x)
  }
  let mx = 0
  let my = 0
  if (!S.sleeping && !S.over && !typing()) {
    if (keys.KeyW || keys.ArrowUp) my -= 1
    if (keys.KeyS || keys.ArrowDown) my += 1
    if (keys.KeyA || keys.ArrowLeft) mx -= 1
    if (keys.KeyD || keys.ArrowRight) mx += 1
  }
  const moving = mx || my
  if (moving && p.action && !p.action.stay) cancelAction()
  const wgt = weight(p.inv)
  const cap = capacity()
  const over = Math.max(0, wgt - cap)
  let running = moving && (keys.ShiftLeft || keys.ShiftRight) && st.stamina > 3 && !p.sneak
  let spd = p.sneak ? 1.25 : 2.4
  if (running) spd = 3.9 * (1 + lvl('sprint') * 0.04) * (hasTrait('athletic') ? 1.1 : 1)
  if (st.fatigue > 85) spd *= 0.75
  const pain = painLevel()
  if (pain > 40) spd *= 0.85
  if (over) spd *= Math.max(0.4, 1 - over * 0.07)
  spd *= speedMod(p.x, p.y, false)
  if (moving) {
    const l = Math.hypot(mx, my)
    const before = Math.floor(p.y) * W.w + Math.floor(p.x)
    moveEntity(p, (mx / l) * spd * dt, (my / l) * spd * dt, 0.3, false)
    const after = Math.floor(p.y) * W.w + Math.floor(p.x)
    if (after !== before && W.tiles[after] === T.WINDOW) {
      const w = W.windows[after]
      if (w.state === 'broken' && !w.cleared && p.lastWin !== after && Math.random() < 0.35) addWound('glass', false)
      p.lastWin = after
      makeNoise(p.x, p.y, 4)
    }
    p.stepT -= dt
    if (p.stepT <= 0) {
      p.stepT = 0.4
      let r = running ? 10 : p.sneak ? Math.max(0.8, 2.2 - lvl('sneak') * 0.2) : 4.5
      if (hasTrait('lightFoot')) r *= 0.6
      if (hasTrait('clumsy')) r *= 1.4
      makeNoise(p.x, p.y, r)
      if (p.sneak && S.zombies.some(z => dist(z.x, z.y, p.x, p.y) < 8)) addXP('sneak', 0.6)
    }
  }
  if (running) {
    st.stamina = Math.max(0, st.stamina - 9 * realDt * (hasTrait('athletic') ? 0.75 : 1) * (hasTrait('unfit') ? 1.5 : 1) * (1 - lvl('fitness') * 0.04))
    addXP('sprint', 0.15 * realDt)
    addXP('fitness', 0.1 * realDt)
  } else {
    let regen = moving ? 6 : 12
    if (st.hunger > 70) regen *= 0.5
    if (st.fatigue > 80) regen *= 0.5
    if (hasTrait('unfit')) regen *= 0.7
    st.stamina = Math.min(100, st.stamina + regen * realDt)
  }
  if (p.action) {
    p.action.t += realDt
    p.action.noiseT -= realDt
    if (p.action.noiseT <= 0 && (p.action.noise || p.action.sound)) {
      p.action.noiseT = 0.6
      if (p.action.noise) makeNoise(p.x, p.y, p.action.noise, p.action.noise >= 12)
      if (p.action.sound && sfx[p.action.sound]) sfx[p.action.sound]()
    }
    if (p.action.t >= p.action.dur) {
      const a = p.action
      p.action = null
      a.done()
      renderPanel()
      if (S.openCont) renderContainer()
    }
  }
  const fl = invFind('flashlight')
  if (p.light) {
    if (!fl) p.light = false
    else {
      fl.charge -= 0.05 * dt
      if (fl.charge <= 0) {
        fl.charge = 0
        p.light = false
        log('A pilha da lanterna acabou.', 'warn')
      }
    }
  }
}

function painLevel() {
  const p = S.player
  let pain = 0
  for (const w of p.wounds) pain += { scratch: 8, laceration: 18, bite: 28, glass: 12 }[w.type] * (1 - w.t / w.heal) + (w.inf ? 15 : 0)
  if (p.infected && S.time - p.infT > 12 * 60) pain += 15
  if (p.painkill > 0) pain *= 0.3
  return pain
}

function updateNeeds(dt) {
  const p = S.player
  const st = p.stats
  const sleeping = !!S.sleeping
  let hr = 0.05
  if (hasTrait('heartyAppetite')) hr *= 1.35
  if (hasTrait('lowAppetite')) hr *= 0.7
  if (sleeping) hr *= 0.5
  st.hunger = clamp(st.hunger + hr * dt, 0, 100)
  st.thirst = clamp(st.thirst + (sleeping ? 0.04 : 0.075) * dt, 0, 100)
  if (sleeping) st.fatigue = Math.max(0, st.fatigue - (S.sleeping.sofa ? 0.12 : 0.18) * dt)
  else st.fatigue = clamp(st.fatigue + 0.05 * dt, 0, 100)
  st.sick = Math.max(0, st.sick - 0.04 * dt)
  p.painkill = Math.max(0, p.painkill - dt)
  p.calm = Math.max(0, p.calm - dt)
  const seen = S.zombies.filter(z => S.vis[idx(Math.floor(z.x), Math.floor(z.y))] && dist(z.x, z.y, p.x, p.y) < 9).length
  if (seen && !sleeping) {
    let rate = seen * 1.6 * (hasTrait('cowardly') ? 1.6 : 1) * (p.calm > 0 ? 0.3 : 1)
    if (S.kills > 50) rate *= 0.5
    st.panic = clamp(st.panic + rate * dt, 0, 100)
  } else st.panic = Math.max(0, st.panic - 2.5 * dt)
  let dh = 0
  for (const w of p.wounds) {
    if (w.bleed) dh -= w.type === 'bite' ? 0.11 : 0.07
    if (w.inf) dh -= 0.015
    let rate = (w.bandage ? 1.6 : 1) * (hasTrait('slowHealer') ? 0.6 : 1) * (1 + lvl('firstAid') * 0.06)
    if (w.bandage === 'dirty') rate *= 0.85
    w.t += (dt / 60) * rate
    if (w.type === 'scratch' && w.bleed && w.t > 0.5) w.bleed = false
    if (!w.dis && !w.inf && Math.random() < dt * 0.0004 * (hasTrait('prone') ? 2 : 1) * (w.bandage === 'clean' ? 0.5 : w.bandage === 'dirty' ? 1.3 : 1)) {
      w.inf = true
      log(`O ferimento (${w.part.toLowerCase()}) parece infeccionado.`, 'bad')
    }
  }
  p.wounds = p.wounds.filter(w => w.t < w.heal || w.inf)
  if (st.hunger > 85) dh -= 0.02
  if (st.thirst > 85) dh -= 0.04
  if (st.sick > 40) dh -= 0.03
  if (p.infected) {
    const h = (S.time - p.infT) / 60
    if (h > 18) dh -= 0.03 * (1 + (h - 18) / 24)
    if (h > 12) st.sick = Math.max(st.sick, 30 + Math.min(60, (h - 12) * 1.2))
  }
  const bleeding = p.wounds.some(w => w.bleed)
  if (!bleeding && !p.infected && st.hunger < 65 && st.thirst < 65 && st.sick < 40) dh += sleeping ? 0.06 : 0.02
  st.health = clamp(st.health + dh * dt, 0, 100)
  if (st.health <= 0) die()
}

function cause() {
  const p = S.player
  if (p.infected) return 'A infecção da mordida venceu. Você se levantou de novo, faminto.'
  if (p.stats.thirst > 85) return 'Morreu de sede.'
  if (p.stats.hunger > 85) return 'Morreu de fome.'
  if (p.wounds.some(w => w.bleed)) return 'Sangrou até a morte.'
  if (p.wounds.some(w => w.inf)) return 'Uma infecção comum fez o trabalho dos mortos.'
  return 'Os mortos te alcançaram.'
}

function die() {
  if (S.over) return
  S.over = true
  S.sleeping = false
  S.player.action = null
  S.cause = cause()
  localStorage.removeItem(SAVE_KEY)
  closePanels()
  const days = ((S.time - START_TIME) / 1440)
  const p = S.player
  if (p.infected) spawnZombie(p.x, p.y)
  setTimeout(() => {
    $('death').innerHTML = `
      <div class="card">
        <h1>Fim da linha</h1>
        <p class="lead">${p.name} sobreviveu ${days < 1 ? `${Math.round(days * 24)} horas` : `${days.toFixed(1)} dias`} em Vale Morto.</p>
        <p>${S.cause}</p>
        <div class="stats"><div><b>${S.kills}</b><span>zumbis abatidos</span></div><div><b>${dayNum()}</b><span>último dia</span></div><div><b>${Object.values(p.skills).reduce((a, s) => a + s.lvl, 0)}</b><span>níveis de habilidade</span></div></div>
        <button id="again" class="primary">Novo sobrevivente</button>
      </div>`
    $('death').classList.remove('hidden')
    $('again').onclick = () => {
      $('death').classList.add('hidden')
      showMenu()
    }
  }, 1800)
}

function updateWorld(dt) {
  const before = S.time
  S.time += dt
  if (!S.powerOff && S.time >= S.powerOffAt) {
    S.powerOff = true
    log('As luzes se apagaram. A energia da cidade acabou.', 'bad')
  }
  if (!S.waterOff && S.time >= S.waterOffAt) {
    S.waterOff = true
    for (const k in W.furn) if (W.furn[k].kind === 'sink') W.furn[k].water = randi(0, 5)
    log('Os canos gemeram e silenciaram. A água foi cortada.', 'bad')
  }
  const r = S.rain
  if (S.time >= r.next) {
    r.on = !r.on
    r.next = S.time + (r.on ? randi(60, 300) : randi(480, 2400))
    if (r.on && !S.sleeping) log('Começou a chover.', '')
  }
  for (const k in W.furn) {
    const f = W.furn[k]
    if (f.kind === 'campfire' && f.fuel > 0) {
      f.fuel -= dt
      if (r.on) f.fuel -= dt * 0.5
    }
    if (f.kind === 'collector' && r.on) f.water = Math.min(40, (f.water || 0) + dt * 0.08)
  }
  for (const k in W.plots) {
    const pl = W.plots[k]
    if (pl.stage >= 3) continue
    pl.g += (dt / 60) * (1 + lvl('farming') * 0.1) * (r.on ? 1.3 : 1)
    if (pl.g >= 22) {
      pl.g = 0
      pl.stage++
    }
  }
  const h = S.heli
  if (!h.done && !h.active && S.time >= h.at) {
    h.active = true
    h.t = 0
    h.ang = rand(0, Math.PI * 2)
    log('Um helicóptero passa baixo sobre a cidade. Isso vai atrair uma multidão.', 'bad')
  }
  if (h.active) {
    h.t += dt
    h.ang += dt * 0.012
    h.x = S.player.x + Math.cos(h.ang) * 18
    h.y = S.player.y + Math.sin(h.ang) * 18
    h.noiseT = (h.noiseT || 0) - dt
    if (h.noiseT <= 0) {
      h.noiseT = 5
      makeNoise(h.x, h.y, 34)
      if (!S.sleeping) sfx.heli()
    }
    if (h.t > 150) {
      h.active = false
      h.done = true
      log('O som do helicóptero se afasta.', '')
    }
  }
  for (const a of S.alarms) {
    a.t -= dt
    if (a.t <= 0) {
      a.t = 4
      makeNoise(a.x, a.y, 40)
      if (near(a.x, a.y, 40)) sfx.alarm()
    }
  }
  S.alarms = S.alarms.filter(a => S.time < a.until)
  S.spawnT += dt
  if (S.spawnT > 60) {
    S.spawnT = 0
    if (S.zombies.length < S.settings.pop * 0.85) respawn()
  }
  S.saveT += dt
  if (S.saveT > 240 && !S.sleeping) {
    S.saveT = 0
    save()
  }
  if (Math.floor(before / 1440) !== Math.floor(S.time / 1440) && !S.sleeping) log(`Dia ${dayNum()}.`, 'warn')
}

function updateVision() {
  const p = S.player
  const vis = S.vis
  vis.fill(0)
  const dl = daylight()
  let R = 7 + dl * 17
  if (hasTrait('catEyes')) R += (1 - dl) * 3
  if (hasTrait('shortSighted')) R *= 0.75
  if (p.stats.fatigue > 85) R *= 0.85
  if (S.rain.on) R *= 0.85
  const lightOn = p.light && invFind('flashlight')
  const rays = 540
  const px = p.x
  const py = p.y
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    let r = R
    if (lightOn && angDiff(a, p.dir) < 0.5) r = Math.max(R, 17)
    for (let d = 0; d < r; d += 0.25) {
      const x = Math.floor(px + c * d)
      const y = Math.floor(py + s * d)
      if (!inb(x, y)) break
      const k = y * W.w + x
      vis[k] = 1
      S.seen[k] = 1
      if (opaque(k) && d > 0.2) break
    }
  }
  for (const k in W.furn) {
    const f = W.furn[k]
    if (f.kind === 'campfire' && f.fuel > 0) {
      const [fx, fy] = tileCenter(+k)
      if (dist(fx, fy, px, py) < 30 && los(px, py, fx, fy)) {
        for (let y = Math.floor(fy - 4); y <= fy + 4; y++) for (let x = Math.floor(fx - 4); x <= fx + 4; x++) if (inb(x, y) && dist(x + 0.5, y + 0.5, fx, fy) < 4.5 && los(fx, fy, x + 0.5, y + 0.5)) { vis[idx(x, y)] = 1; S.seen[idx(x, y)] = 1 }
      }
    }
  }
}

function update(realDt) {
  if (!S) return
  let simDt = realDt
  if (S.sleeping) simDt = realDt * 45
  const steps = Math.ceil(simDt / 0.05)
  const sdt = simDt / steps
  for (let i = 0; i < steps; i++) {
    S.flowT -= sdt
    if (S.flowT <= 0) {
      S.flowT = 0.45
      computeFlow()
    }
    if (!S.over) updatePlayer(sdt, S.sleeping ? 0 : realDt / steps)
    updateZombies(sdt)
    S.noises.length = 0
    if (!S.over) {
      updateNeeds(sdt)
      updateWorld(sdt)
    }
    if (S.sleeping) {
      if (S.player.stats.fatigue <= 3) wake()
      else if (S.zombies.some(z => z.st === 'chase' && dist(z.x, z.y, S.player.x, S.player.y) < 6)) wake('Um barulho te acordou. Algo está vindo!')
      else if (S.player.stats.thirst > 90 || S.player.stats.hunger > 90) wake('Você acordou com fome e sede.')
    }
  }
  updateVision()
  for (const r of S.rings) r.t += realDt
  S.rings = S.rings.filter(r => r.t < 0.8)
  for (const t of S.tracers) t.t -= realDt
  S.tracers = S.tracers.filter(t => t.t > 0)
  for (const f of S.flashes) f.t -= realDt
  S.flashes = S.flashes.filter(f => f.t > 0)
  target = S.over || S.sleeping ? null : getTarget()
  if (S.openCont) {
    const [x, y] = contPos(S.openCont)
    if (dist(x, y, S.player.x, S.player.y) > 2.2) closePanels()
  }
}

function render() {
  const dpr = canvas.dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#05070a'
  ctx.fillRect(0, 0, cw, ch)
  if (!S) return
  const p = S.player
  const lookX = clamp((mouse.sx - cw / 2) / zoom, -cw, cw) * 0.12
  const lookY = clamp((mouse.sy - ch / 2) / zoom, -ch, ch) * 0.12
  camX += (p.x * TS + (S.sleeping ? 0 : lookX) - camX) * 0.15
  camY += (p.y * TS + (S.sleeping ? 0 : lookY) - camY) * 0.15
  if (Math.abs(camX - p.x * TS) > 600) { camX = p.x * TS; camY = p.y * TS }
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (cw / 2 - camX * zoom), dpr * (ch / 2 - camY * zoom))
  const x0 = Math.max(0, Math.floor((camX - cw / 2 / zoom) / TS) - 1)
  const y0 = Math.max(0, Math.floor((camY - ch / 2 / zoom) / TS) - 1)
  const x1 = Math.min(W.w - 1, Math.ceil((camX + cw / 2 / zoom) / TS) + 1)
  const y1 = Math.min(W.h - 1, Math.ceil((camY + ch / 2 / zoom) / TS) + 2)
  const now = performance.now() / 1000
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = idx(x, y)
    if (!S.seen[k]) continue
    drawGround(x, y, k, now)
  }
  for (const b of S.blood) {
    if (!S.vis[idx(Math.floor(b.x), Math.floor(b.y))]) continue
    ctx.fillStyle = 'rgba(92,14,12,0.75)'
    ctx.beginPath()
    ctx.ellipse(b.x * TS, b.y * TS, b.r * TS, b.r * TS * 0.7, b.x, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const k in S.ground) {
    const items = S.ground[k]
    if (!items.length || !S.vis[k]) continue
    const [gx, gy] = tileCenter(+k)
    ctx.fillStyle = '#b89a62'
    ctx.fillRect(gx * TS - 6, gy * TS - 4, 12, 9)
    ctx.fillStyle = '#7a6440'
    ctx.fillRect(gx * TS - 6, gy * TS - 4, 12, 3)
  }
  for (const c of S.corpses) {
    if (!S.vis[idx(Math.floor(c.x), Math.floor(c.y))]) continue
    drawBody(c.x, c.y, c.dir, SHIRTS[c.shirt], '#6f7a62', true, false)
  }
  const ents = []
  for (const z of S.zombies) {
    if (z.x < x0 - 1 || z.x > x1 + 1 || z.y < y0 - 1 || z.y > y1 + 1) continue
    if (!S.vis[idx(Math.floor(z.x), Math.floor(z.y))]) continue
    ents.push(z)
  }
  ents.sort((a, b) => a.y - b.y)
  for (const z of ents) {
    const skins = ['#7d8a6c', '#8a8c70', '#6c7a68']
    drawBody(z.x, z.y, z.dir, z.hit > 0 ? '#c24a3a' : SHIRTS[z.shirt], skins[z.skin], z.down > 0, z.st === 'chase', z)
  }
  if (!S.over || S.player.infected === false) drawPlayer(p)
  for (const t of S.tracers) {
    ctx.strokeStyle = `rgba(255,230,160,${t.t * 10})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(t.x0 * TS, t.y0 * TS)
    ctx.lineTo(t.x1 * TS, t.y1 * TS)
    ctx.stroke()
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = idx(x, y)
    if (!S.seen[k]) continue
    drawStructure(x, y, k, now)
  }
  ctx.fillStyle = 'rgba(6,8,12,0.62)'
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = idx(x, y)
    if (S.seen[k] && !S.vis[k]) ctx.fillRect(x * TS, y * TS - (opaqueTall(k) ? 10 : 0), TS, TS + (opaqueTall(k) ? 10 : 0))
  }
  if (target && !S.sleeping) {
    ctx.strokeStyle = 'rgba(240,220,160,0.75)'
    ctx.lineWidth = 1.5
    if (target.kind === 'corpse') {
      ctx.beginPath()
      ctx.arc(target.x * TS, target.y * TS, 14, 0, Math.PI * 2)
      ctx.stroke()
    } else ctx.strokeRect((target.x - 0.5) * TS + 1, (target.y - 0.5) * TS + 1, TS - 2, TS - 2)
  }
  for (const r of S.rings) {
    ctx.strokeStyle = `rgba(230,200,140,${(1 - r.t / 0.8) * 0.35})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(r.x * TS, r.y * TS, (r.t / 0.8) * Math.min(r.r, 14) * TS, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (S.heli.active) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(S.heli.x * TS, S.heli.y * TS, 40, 16, S.heli.ang, 0, Math.PI * 2)
    ctx.fill()
  }
  if (p.action) {
    const w = 40
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(p.x * TS - w / 2, p.y * TS - 30, w, 6)
    ctx.fillStyle = '#d8b25a'
    ctx.fillRect(p.x * TS - w / 2 + 1, p.y * TS - 29, (w - 2) * clamp(p.action.t / p.action.dur, 0, 1), 4)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawDarkness(now)
  if (S.rain.on) drawRain(now)
  if (p.hurtFlash > 0) {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.65)
    g.addColorStop(0, 'rgba(150,0,0,0)')
    g.addColorStop(1, `rgba(150,0,0,${p.hurtFlash * 1.6})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, cw, ch)
  }
  const hp = p.stats.health
  if (hp < 35 && !S.over) {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7)
    g.addColorStop(0, 'rgba(80,0,0,0)')
    g.addColorStop(1, `rgba(80,0,0,${(35 - hp) / 50 + Math.sin(now * 3) * 0.05})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, cw, ch)
  }
  if (S.sleeping) {
    ctx.fillStyle = 'rgba(0,0,0,0.82)'
    ctx.fillRect(0, 0, cw, ch)
    ctx.fillStyle = '#d8cfbf'
    ctx.font = '600 22px "Special Elite", monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`Dormindo... ${clockStr()}`, cw / 2, ch / 2)
    ctx.font = '14px "IBM Plex Mono", monospace'
    ctx.fillStyle = '#8f877a'
    ctx.fillText('Esc para acordar', cw / 2, ch / 2 + 28)
    ctx.textAlign = 'left'
  }
}

function opaqueTall(k) {
  const t = W.tiles[k]
  return t === T.WALL || t === T.WOODWALL || t === T.DOOR || t === T.WINDOW
}

const GRASS = ['#3b4a2b', '#3f4e2e', '#38462a', '#425231']
const WOOD = ['#6b5137', '#6f553a', '#684e35', '#725839']

function floorColor(x, y, k) {
  const f = W.floor[k]
  if (f === 1) return (x + y) % 2 ? '#8e908a' : '#9a9c95'
  if (f === 3) return '#5f605b'
  return WOOD[W.shade[k]]
}

function drawGround(x, y, k, now) {
  let t = W.tiles[k]
  const px = x * TS
  const py = y * TS
  if (t === T.FURN && W.furn[k] && W.furn[k].base !== undefined) t = W.furn[k].base
  if (t === T.WOODWALL && W.woodwalls[k]) t = W.woodwalls[k].base
  if (W.bld[k] >= 0 && t !== T.GRASS && t !== T.DIRT) {
    ctx.fillStyle = floorColor(x, y, k)
    ctx.fillRect(px, py, TS, TS)
    if (W.floor[k] === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(px, py + 10, TS, 1)
      ctx.fillRect(px, py + 21, TS, 1)
    }
    return
  }
  switch (t) {
    case T.ROAD:
      ctx.fillStyle = W.shade[k] === 0 ? '#2a2b2e' : '#2d2e31'
      ctx.fillRect(px, py, TS, TS)
      if (W.shade[k] === 3 && (x * 7 + y * 13) % 11 === 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.beginPath()
        ctx.moveTo(px + 6, py + 8)
        ctx.lineTo(px + 18, py + 14)
        ctx.lineTo(px + 22, py + 26)
        ctx.stroke()
      }
      break
    case T.SIDEWALK:
      ctx.fillStyle = '#69665f'
      ctx.fillRect(px, py, TS, TS)
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.fillRect(px, py, TS, 1)
      ctx.fillRect(px, py, 1, TS)
      break
    case T.PARKING:
      ctx.fillStyle = '#3a3b3e'
      ctx.fillRect(px, py, TS, TS)
      if (x % 3 === 0) {
        ctx.fillStyle = 'rgba(220,220,200,0.25)'
        ctx.fillRect(px, py, 2, TS)
      }
      break
    case T.WATER: {
      ctx.fillStyle = '#26465a'
      ctx.fillRect(px, py, TS, TS)
      ctx.fillStyle = `rgba(160,200,220,${0.06 + 0.05 * Math.sin(now * 1.5 + x * 0.7 + y * 0.5)})`
      ctx.fillRect(px + 4, py + 10 + Math.sin(now + x) * 3, 14, 2)
      break
    }
    case T.DIRT:
      ctx.fillStyle = '#56402d'
      ctx.fillRect(px, py, TS, TS)
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      for (let i = 4; i < TS; i += 8) ctx.fillRect(px + 2, py + i, TS - 4, 2)
      if (W.plots[k]) drawPlant(px, py, W.plots[k].stage)
      break
    default:
      ctx.fillStyle = GRASS[W.shade[k]]
      ctx.fillRect(px, py, TS, TS)
      if (W.shade[k] === 2) {
        ctx.fillStyle = 'rgba(90,110,60,0.5)'
        ctx.fillRect(px + 8, py + 12, 2, 4)
        ctx.fillRect(px + 20, py + 22, 2, 4)
      }
  }
}

function drawPlant(px, py, stage) {
  const colors = ['#6e8a3a', '#7aa040', '#86b04a', '#9cc050']
  ctx.fillStyle = colors[stage]
  const s = 3 + stage * 3
  for (const [ox, oy] of [[9, 9], [23, 9], [9, 23], [23, 23]]) {
    ctx.beginPath()
    ctx.arc(px + ox, py + oy, s / 2, 0, Math.PI * 2)
    ctx.fill()
    if (stage >= 3) {
      ctx.fillStyle = '#c0603a'
      ctx.beginPath()
      ctx.arc(px + ox + 2, py + oy + 1, 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = colors[stage]
    }
  }
}

function siding(k) {
  const b = W.bld[k]
  if (b < 0) return ['#7a6a55', '#4a3f32']
  const t = W.buildings[b].type
  if (t === 'market' || t === 'pharmacy' || t === 'hardware') return ['#9a9a94', '#55554f']
  if (t === 'police') return ['#7f8a9a', '#454c57']
  if (t === 'shed') return ['#8a6a48', '#4f3c28']
  return SIDING[b % SIDING.length]
}

function wallOrient(x, y) {
  const l = tileAt(x - 1, y)
  const r = tileAt(x + 1, y)
  const isW = t => t === T.WALL || t === T.WINDOW || t === T.DOOR || t === T.WOODWALL
  return isW(l) || isW(r) ? 'h' : 'v'
}

function drawBars(px, py, n, orient) {
  ctx.fillStyle = '#9c7a4c'
  ctx.strokeStyle = '#5a4428'
  ctx.lineWidth = 1
  for (let i = 0; i < n; i++) {
    ctx.save()
    ctx.translate(px + TS / 2, py + TS / 2 - 5)
    ctx.rotate((i % 2 ? 0.35 : -0.35) + (orient === 'v' ? Math.PI / 2 : 0))
    ctx.fillRect(-TS * 0.6, -3 + (i - 1.5) * 4, TS * 1.2, 5)
    ctx.strokeRect(-TS * 0.6, -3 + (i - 1.5) * 4, TS * 1.2, 5)
    ctx.restore()
  }
}

function drawStructure(x, y, k, now) {
  const t = W.tiles[k]
  const px = x * TS
  const py = y * TS
  const H = 10
  if (t === T.WALL || t === T.WOODWALL) {
    const [top, front] = t === T.WOODWALL ? ['#a07c4e', '#6a5032'] : siding(k)
    ctx.fillStyle = front
    ctx.fillRect(px, py + TS - H, TS, H)
    ctx.fillStyle = top
    ctx.fillRect(px, py - H, TS, TS)
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.fillRect(px, py - H, TS, 2)
    if (t === T.WOODWALL) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      for (let i = 6; i < TS; i += 8) ctx.fillRect(px, py - H + i, TS, 1)
    }
    return
  }
  if (t === T.DOOR) {
    const d = W.doors[k]
    const o = wallOrient(x, y)
    const [top, front] = siding(k)
    if (o === 'h') {
      ctx.fillStyle = front
      ctx.fillRect(px, py + TS - H, 3, H)
      ctx.fillRect(px + TS - 3, py + TS - H, 3, H)
      ctx.fillStyle = top
      ctx.fillRect(px, py - H, 3, TS)
      ctx.fillRect(px + TS - 3, py - H, 3, TS)
    } else {
      ctx.fillStyle = top
      ctx.fillRect(px, py - H, TS, 3)
      ctx.fillRect(px, py + TS - H - 3, TS, 3)
    }
    if (d.broken) {
      ctx.fillStyle = '#5a3f26'
      ctx.fillRect(px + 4, py + 6, 8, 3)
      ctx.fillRect(px + 16, py + 18, 10, 3)
    } else if (!d.open) {
      ctx.fillStyle = '#6a4a2c'
      if (o === 'h') ctx.fillRect(px + 3, py + TS / 2 - 8, TS - 6, 10)
      else ctx.fillRect(px + TS / 2 - 5, py - H + 3, 10, TS - 6)
      ctx.fillStyle = '#c9a85a'
      if (o === 'h') ctx.fillRect(px + TS - 9, py + TS / 2 - 4, 3, 3)
      else ctx.fillRect(px + TS / 2 - 1, py + TS - H - 9, 3, 3)
    } else {
      ctx.fillStyle = '#5c4126'
      if (o === 'h') ctx.fillRect(px + 3, py - 4, 4, TS - 6)
      else ctx.fillRect(px + 3, py + TS - H - 7, TS - 6, 4)
    }
    if (d.bars.length) drawBars(px, py, d.bars.length, o)
    return
  }
  if (t === T.WINDOW) {
    const w = W.windows[k]
    const [top, front] = siding(k)
    ctx.fillStyle = front
    ctx.fillRect(px, py + TS - H, TS, H)
    ctx.fillStyle = top
    ctx.fillRect(px, py - H, TS, TS)
    const o = wallOrient(x, y)
    const gx = o === 'h' ? px + 4 : px + TS / 2 - 5
    const gy = o === 'h' ? py + TS / 2 - 10 : py - H + 4
    const gw = o === 'h' ? TS - 8 : 10
    const gh = o === 'h' ? 10 : TS - 8
    if (w.state === 'broken') {
      ctx.fillStyle = '#1a1f24'
      ctx.fillRect(gx, gy, gw, gh)
      if (!w.cleared) {
        ctx.fillStyle = 'rgba(180,210,230,0.6)'
        ctx.beginPath()
        ctx.moveTo(gx, gy)
        ctx.lineTo(gx + gw * 0.3, gy + gh * 0.6)
        ctx.lineTo(gx, gy + gh)
        ctx.fill()
      }
    } else {
      ctx.fillStyle = w.state === 'open' ? '#1a1f24' : 'rgba(150,190,210,0.85)'
      ctx.fillRect(gx, gy, gw, gh)
      if (w.state === 'open') {
        ctx.fillStyle = 'rgba(150,190,210,0.7)'
        if (o === 'h') ctx.fillRect(gx, gy, gw / 2, gh)
        else ctx.fillRect(gx, gy, gw, gh / 2)
      }
      if (w.curtain && w.state === 'closed') {
        ctx.fillStyle = 'rgba(140,60,50,0.85)'
        if (o === 'h') ctx.fillRect(gx, gy + gh - 4, gw, 4)
        else ctx.fillRect(gx + gw - 4, gy, 4, gh)
      }
    }
    if (w.bars.length) drawBars(px, py, w.bars.length, o)
    return
  }
  if (t === T.FURN) {
    const f = W.furn[k]
    drawFurn(px, py, f, now)
    return
  }
  if (t === T.TREE) {
    const p = S.player
    const near = dist(x + 0.5, y + 0.5, p.x, p.y) < 2.2 && p.y < y + 0.6
    const s = W.shade[k]
    ctx.globalAlpha = near ? 0.4 : 1
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(px + TS / 2 + 4, py + TS / 2 + 4, 17, 13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#4a3828'
    ctx.fillRect(px + TS / 2 - 3, py + TS / 2 - 2, 6, 12)
    ctx.fillStyle = ['#24361f', '#2a3d22', '#22331c', '#2e4426'][s]
    ctx.beginPath()
    ctx.arc(px + TS / 2, py + TS / 2 - 8, 17 + s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(120,150,80,0.18)'
    ctx.beginPath()
    ctx.arc(px + TS / 2 - 5, py + TS / 2 - 14, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

function drawFurn(px, py, f, now) {
  const def = FURN[f.kind]
  const tall = ['fridge', 'wardrobe', 'shelf', 'rack', 'medrack', 'toolrack', 'locker'].includes(f.kind)
  const lift = tall ? 8 : 3
  if (f.kind === 'campfire') {
    ctx.fillStyle = '#3a3a3a'
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(px + TS / 2 + Math.cos(a) * 10, py + TS / 2 + Math.sin(a) * 10, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#4a3020'
    ctx.fillRect(px + 9, py + 14, 14, 4)
    if (f.fuel > 0) {
      const fl = Math.sin(now * 12) * 2
      ctx.fillStyle = '#e07a2a'
      ctx.beginPath()
      ctx.moveTo(px + 10, py + 20)
      ctx.lineTo(px + 16, py + 4 + fl)
      ctx.lineTo(px + 22, py + 20)
      ctx.fill()
      ctx.fillStyle = '#f2c14a'
      ctx.beginPath()
      ctx.moveTo(px + 13, py + 20)
      ctx.lineTo(px + 16, py + 10 - fl)
      ctx.lineTo(px + 19, py + 20)
      ctx.fill()
    }
    return
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(px + 3, py + 5, TS - 4, TS - 6)
  ctx.fillStyle = def.color
  ctx.fillRect(px + 2, py + 2 - lift, TS - 4, TS - 4)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(px + 2, py + 2 - lift, TS - 4, 3)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  const k = f.kind
  if (k === 'bed' || k === 'sofa') {
    ctx.fillStyle = k === 'bed' ? '#d9d4c7' : 'rgba(0,0,0,0.2)'
    ctx.fillRect(px + 5, py + 4 - lift, TS - 10, 8)
  } else if (k === 'fridge') {
    ctx.fillRect(px + 2, py + 12 - lift, TS - 4, 2)
    ctx.fillRect(px + TS - 8, py + 5 - lift, 2, 6)
  } else if (k === 'stove') {
    ctx.fillStyle = '#2a2c2e'
    for (const [ox, oy] of [[9, 9], [21, 9], [9, 21], [21, 21]]) {
      ctx.beginPath()
      ctx.arc(px + ox, py + oy - lift, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (k === 'sink') {
    ctx.fillStyle = '#6f8794'
    ctx.fillRect(px + 7, py + 7 - lift, TS - 14, TS - 14)
  } else if (k === 'shelf' || k === 'rack' || k === 'medrack' || k === 'toolrack') {
    for (let i = 8; i < TS - 4; i += 7) ctx.fillRect(px + 2, py + i - lift, TS - 4, 2)
  } else if (k === 'wardrobe' || k === 'locker') {
    ctx.fillRect(px + TS / 2 - 1, py + 4 - lift, 2, TS - 8)
  } else if (k === 'toolbox') {
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(px + 10, py + 6 - lift, 12, 3)
  } else if (k === 'collector') {
    ctx.fillStyle = '#2a4a5e'
    ctx.fillRect(px + 6, py + 6 - lift, TS - 12, TS - 12)
    ctx.fillStyle = '#4a8aaa'
    const lvlw = clamp((f.water || 0) / 40, 0, 1)
    ctx.fillRect(px + 6, py + 6 - lift + (TS - 12) * (1 - lvlw), TS - 12, (TS - 12) * lvlw)
  } else if (k === 'crate' || k === 'shedbox') {
    ctx.fillRect(px + 2, py + TS / 2 - lift, TS - 4, 2)
  }
}

function drawBody(x, y, dir, shirt, skin, down, reaching, z) {
  const px = x * TS
  const py = y * TS
  ctx.save()
  ctx.translate(px, py)
  if (down) {
    ctx.rotate(dir)
    ctx.fillStyle = 'rgba(70,10,10,0.5)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 15, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = shirt
    ctx.fillRect(-10, -6, 16, 12)
    ctx.fillStyle = '#2b2b30'
    ctx.fillRect(-18, -5, 9, 4)
    ctx.fillRect(-18, 1, 9, 4)
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.arc(10, 0, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(2, 4, 11, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.rotate(dir)
  if (reaching) {
    ctx.fillStyle = skin
    ctx.fillRect(2, -9, 13, 4)
    ctx.fillRect(2, 5, 13, 4)
  }
  ctx.fillStyle = shirt
  ctx.beginPath()
  ctx.ellipse(0, 0, 7, 11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(1, 0, 6, 0, Math.PI * 2)
  ctx.fill()
  if (z) {
    ctx.fillStyle = 'rgba(60,20,15,0.6)'
    ctx.fillRect(-2, -3, 3, 2)
    if (z.fem) {
      ctx.fillStyle = '#3a2e22'
      ctx.beginPath()
      ctx.arc(-1, 0, 5.5, Math.PI * 0.5, Math.PI * 1.5)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawPlayer(p) {
  const px = p.x * TS
  const py = p.y * TS
  const { def } = currentWeapon()
  ctx.save()
  ctx.translate(px, py)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(2, 4, 11, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.rotate(p.dir + (p.swing > 0 ? (p.swing / 0.18 - 0.5) * 1.6 : 0))
  if (def !== FIST) {
    ctx.strokeStyle = def.cat === 'gun' ? '#1c1c1c' : def.cat === 'blade' ? '#b8b8b0' : '#8a6a42'
    ctx.lineWidth = def.cat === 'gun' ? 4 : 3
    ctx.beginPath()
    ctx.moveTo(6, 6)
    ctx.lineTo(6 + (def.cat === 'gun' ? 12 : 10 + def.range * 8), 6)
    ctx.stroke()
  }
  ctx.fillStyle = '#c9a07a'
  ctx.fillRect(4, 4, 7, 4)
  ctx.fillRect(4, -8, 6, 4)
  ctx.fillStyle = p.sneak ? '#3d4a3a' : '#3d5f7a'
  ctx.beginPath()
  ctx.ellipse(0, 0, 7.5, 11.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#d2a882'
  ctx.beginPath()
  ctx.arc(1, 0, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a2a1c'
  ctx.beginPath()
  ctx.arc(-1, 0, 5.8, Math.PI * 0.55, Math.PI * 1.45)
  ctx.fill()
  ctx.restore()
}

function drawDarkness(now) {
  const dl = daylight()
  const p = S.player
  let a = (1 - dl) * 0.9
  if (S.rain.on) a = Math.max(a, 0.25)
  if (a <= 0.01) return
  const sc = 0.5
  dctx.setTransform(1, 0, 0, 1, 0, 0)
  dctx.globalCompositeOperation = 'source-over'
  dctx.clearRect(0, 0, dark.width, dark.height)
  dctx.fillStyle = `rgba(4,7,14,${a})`
  dctx.fillRect(0, 0, dark.width, dark.height)
  dctx.globalCompositeOperation = 'destination-out'
  const toS = (wx, wy) => [((wx * TS - camX) * zoom + cw / 2) * sc, ((wy * TS - camY) * zoom + ch / 2) * sc]
  const light = (wx, wy, r, inten) => {
    const [sx, sy] = toS(wx, wy)
    const rr = r * TS * zoom * sc
    const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, rr)
    g.addColorStop(0, `rgba(0,0,0,${inten})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    dctx.fillStyle = g
    dctx.beginPath()
    dctx.arc(sx, sy, rr, 0, Math.PI * 2)
    dctx.fill()
  }
  light(p.x, p.y, hasTrait('catEyes') ? 5 : 3.5, 0.85)
  if (p.light && invFind('flashlight')) {
    const [sx, sy] = toS(p.x, p.y)
    const rr = 15 * TS * zoom * sc
    const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, rr)
    g.addColorStop(0, 'rgba(0,0,0,0.95)')
    g.addColorStop(0.7, 'rgba(0,0,0,0.75)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    dctx.fillStyle = g
    dctx.beginPath()
    dctx.moveTo(sx, sy)
    dctx.arc(sx, sy, rr, p.dir - 0.45, p.dir + 0.45)
    dctx.closePath()
    dctx.fill()
  }
  for (const k in W.furn) {
    const f = W.furn[k]
    if (f.kind === 'campfire' && f.fuel > 0) {
      const [fx, fy] = tileCenter(+k)
      if (Math.abs(fx - p.x) < 40 && Math.abs(fy - p.y) < 30) light(fx, fy, 5.5 + Math.sin(now * 9) * 0.2, 0.9)
    }
  }
  for (const f of S.flashes) light(f.x, f.y, 7, 0.9)
  ctx.save()
  ctx.setTransform(canvas.dpr, 0, 0, canvas.dpr, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(dark, 0, 0, cw, ch)
  ctx.restore()
  if (p.light && invFind('flashlight') && a > 0.2) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const [sx, sy] = [(p.x * TS - camX) * zoom + cw / 2, (p.y * TS - camY) * zoom + ch / 2]
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 15 * TS * zoom)
    g.addColorStop(0, 'rgba(60,50,25,0.15)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.arc(sx, sy, 15 * TS * zoom, p.dir - 0.45, p.dir + 0.45)
    ctx.fill()
    ctx.restore()
  }
}

let rainDrops = []
function drawRain(now) {
  if (rainDrops.length < 220) for (let i = 0; i < 220; i++) rainDrops.push({ x: Math.random(), y: Math.random(), s: rand(0.6, 1.2) })
  ctx.strokeStyle = 'rgba(170,190,210,0.28)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const d of rainDrops) {
    const y = ((d.y + now * d.s * 1.3) % 1) * ch
    const x = ((d.x + now * 0.05) % 1) * cw
    ctx.moveTo(x, y)
    ctx.lineTo(x - 3, y + 14)
  }
  ctx.stroke()
}

function moodles() {
  const p = S.player
  const st = p.stats
  const m = []
  if (st.hunger > 85) m.push(['Faminto', 'bad'])
  else if (st.hunger > 55) m.push(['Com fome', 'warn'])
  if (st.thirst > 85) m.push(['Desidratado', 'bad'])
  else if (st.thirst > 55) m.push(['Com sede', 'warn'])
  if (st.fatigue > 85) m.push(['Exausto', 'bad'])
  else if (st.fatigue > 60) m.push(['Cansado', 'warn'])
  if (st.stamina < 25) m.push(['Sem fôlego', 'warn'])
  if (st.panic > 65) m.push(['Em pânico', 'bad'])
  else if (st.panic > 30) m.push(['Nervoso', 'warn'])
  if (p.wounds.some(w => w.bleed)) m.push(['Sangrando', 'bad'])
  const pain = painLevel()
  if (pain > 40) m.push(['Muita dor', 'bad'])
  else if (pain > 12) m.push(['Dor', 'warn'])
  if (p.wounds.some(w => w.inf)) m.push(['Ferida infeccionada', 'bad'])
  if (p.infected && S.time - p.infT > 12 * 60) m.push(['Febre alta', 'bad'])
  else if (st.sick > 40) m.push(['Enjoado', 'warn'])
  if (weight(p.inv) > capacity()) m.push(['Sobrecarregado', 'warn'])
  if (p.sneak) m.push(['Agachado', ''])
  if (S.rain.on) m.push(['Chuva', ''])
  return m
}

function typing() {
  const a = document.activeElement
  return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT')
}

function renderHud(force) {
  if (!S) return
  const p = S.player
  const st = p.stats
  $('clock').innerHTML = `<b>Dia ${dayNum()}</b> <span>${clockStr()}</span><em>${S.powerOff ? 'sem energia' : 'energia ok'} · ${S.waterOff ? 'sem água' : 'água ok'}</em>`
  $('hpbar').style.width = `${st.health}%`
  $('hpbar').className = st.health < 35 ? 'low' : ''
  $('stbar').style.width = `${st.stamina}%`
  $('moodles').innerHTML = moodles().map(([n, c]) => `<span class="${c}">${n}</span>`).join('')
  const { item, def } = currentWeapon()
  let eq = `<b>${def.name}</b>`
  if (item && def.dur) eq += `<div class="mbar thin"><i style="width:${(item.dur / def.dur) * 100}%"></i></div>`
  if (item && def.mag) eq += `<span>${item.ammo}/${def.mag} · reserva ${invCount(def.ammo)}</span>`
  const fl = invFind('flashlight')
  if (fl) eq += `<span>Lanterna ${p.light ? 'ligada' : 'desligada'} · ${Math.round(fl.charge)}%</span>`
  $('equip').innerHTML = eq
  const now = performance.now()
  $('log').innerHTML = S.log.filter(l => now - l.t < 14000).map(l => `<div class="${l.kind}" style="opacity:${clamp(1 - (now - l.t - 10000) / 4000, 0, 1)}">${l.text}</div>`).join('')
  $('hint').innerHTML = target ? `<kbd>E</kbd> ${target.label}${target.kind === 'door' || target.kind === 'window' ? ' · <kbd>B</kbd> barricar' : ''}` : ''
  $('hint').style.display = target ? '' : 'none'
  if (force) {
    renderPanel()
  }
}

function drawMap() {
  const c = $('mapcanvas')
  const s = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.8 / W.w)
  c.width = W.w * s
  c.height = W.h * s
  const m = c.getContext('2d')
  m.fillStyle = '#0a0c10'
  m.fillRect(0, 0, c.width, c.height)
  const col = {
    [T.GRASS]: '#33402a', [T.ROAD]: '#25262a', [T.SIDEWALK]: '#55534d', [T.FLOOR]: '#6a5a48', [T.WALL]: '#a09484', [T.DOOR]: '#8a6a42', [T.WINDOW]: '#7aa0b8', [T.TREE]: '#1f2e1a', [T.WATER]: '#2a4a60', [T.FURN]: '#6a5a48', [T.DIRT]: '#5a4430', [T.WOODWALL]: '#a07c4e', [T.PARKING]: '#333438'
  }
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
    const k = idx(x, y)
    if (!S.seen[k]) continue
    m.fillStyle = col[W.tiles[k]] || '#333'
    m.fillRect(x * s, y * s, s, s)
  }
  m.fillStyle = '#f0d070'
  m.beginPath()
  m.arc(S.player.x * s, S.player.y * s, Math.max(3, s), 0, Math.PI * 2)
  m.fill()
  const hb = W.buildings[W.home]
  m.strokeStyle = '#f0d070'
  m.strokeRect(hb.x * s, hb.y * s, hb.w * s, hb.h * s)
  m.font = '12px "IBM Plex Mono", monospace'
  m.fillStyle = '#f0d070'
  m.fillText('casa', hb.x * s, hb.y * s - 4)
  const names = { market: 'Mercado', pharmacy: 'Farmácia', hardware: 'Ferragens', police: 'Delegacia' }
  for (const b of W.buildings) {
    if (!names[b.type]) continue
    if (!S.seen[idx(b.x + 1, b.y + 1)] && !S.seen[idx(b.x, b.y)]) continue
    m.fillStyle = '#e8e0d0'
    m.fillText(names[b.type], b.x * s + 4, b.y * s + 14)
  }
}

function serialize() {
  const p = S.player
  const enc = arr => {
    let s = ''
    const u = new Uint8Array(arr.buffer)
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000))
    return btoa(s)
  }
  const data = {
    v: 1,
    seed: S.seed,
    tiles: enc(W.tiles),
    seen: enc(S.seen),
    doors: W.doors,
    windows: W.windows,
    furn: W.furn,
    plots: W.plots,
    woodwalls: W.woodwalls,
    treeHp: W.treeHp,
    alarms: W.buildings.map(b => b.alarm ? 1 : 0),
    S: {
      settings: S.settings, time: S.time, zombies: S.zombies.map(z => ({ ...z, hit: 0 })), corpses: S.corpses.slice(-150), ground: S.ground,
      blood: S.blood.slice(-200), kills: S.kills, powerOff: S.powerOff, waterOff: S.waterOff, powerOffAt: S.powerOffAt, waterOffAt: S.waterOffAt,
      heli: S.heli, rain: S.rain, alarms: S.alarms,
      player: { ...p, action: null, equipIdx: p.inv.indexOf(p.equip), equip: null }
    }
  }
  return JSON.stringify(data)
}

function save() {
  if (!S || S.over) return
  try {
    localStorage.setItem(SAVE_KEY, serialize())
  } catch (e) {
    log('Não foi possível salvar o jogo.', 'bad')
  }
}

function load() {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return false
  const data = JSON.parse(raw)
  W = createWorld(data.seed)
  const dec = (s, Ctor) => {
    const bin = atob(s)
    const u = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
    return new Ctor(u.buffer)
  }
  W.tiles = dec(data.tiles, Uint8Array)
  W.doors = data.doors
  W.windows = data.windows
  W.furn = data.furn
  W.plots = data.plots
  W.woodwalls = data.woodwalls || {}
  W.treeHp = data.treeHp || {}
  W.buildings.forEach((b, i) => (b.alarm = !!data.alarms[i]))
  const d = data.S
  S = {
    ...d,
    seed: data.seed,
    noises: [], rings: [], tracers: [], flashes: [], log: [],
    vis: new Uint8Array(W.w * W.h),
    seen: dec(data.seen, Uint8Array),
    flow: new Int16Array(W.w * W.h),
    flowT: 0, spawnT: 0, saveT: 0, sleeping: false, over: false
  }
  const p = S.player
  p.equip = p.equipIdx >= 0 ? p.inv[p.equipIdx] : null
  delete p.equipIdx
  log(`Bem-vindo de volta. Dia ${dayNum()}, ${clockStr()}.`, 'warn')
  return true
}

function startGame() {
  $('menu').classList.add('hidden')
  $('hud').classList.remove('hidden')
  camX = S.player.x * TS
  camY = S.player.y * TS
  computeFlow()
  updateVision()
  renderHud(true)
}

function showMenu() {
  S = null
  $('hud').classList.add('hidden')
  closeAllScreens()
  const has = !!localStorage.getItem(SAVE_KEY)
  const m = $('menu')
  m.classList.remove('hidden')
  m.innerHTML = `
    <div class="title">
      <h1>VALE MORTO</h1>
      <p class="tag">Ninguém sai vivo do vale. A pergunta é quanto tempo você dura.</p>
      <div class="mbtns">
        ${has ? '<button id="cont" class="primary">Continuar</button>' : ''}
        <button id="new" class="${has ? '' : 'primary'}">Novo sobrevivente</button>
        <button id="helpbtn">Como jogar</button>
      </div>
      <p class="small">Teclado e mouse · o progresso é salvo neste navegador · a morte é permanente</p>
    </div>`
  if (has) $('cont').onclick = () => {
    unlockAudio()
    try {
      if (load()) startGame()
    } catch (e) {
      localStorage.removeItem(SAVE_KEY)
      showMenu()
    }
  }
  $('new').onclick = () => { unlockAudio(); showCreator() }
  $('helpbtn').onclick = () => toggleHelp(true)
}

function showCreator() {
  const m = $('menu')
  const sel = { prof: 'unemployed', traits: [] }
  const draw = () => {
    const prof = PROFESSIONS.find(p => p.id === sel.prof)
    const pts = prof.points - sel.traits.reduce((a, t) => a + TRAITS.find(x => x.id === t).cost, 0)
    m.innerHTML = `
      <div class="creator">
        <h2>Novo sobrevivente</h2>
        <div class="grid">
          <section>
            <label>Nome<input id="cname" maxlength="24" value="${sel.name || ''}" placeholder="Sobrevivente"></label>
            <h3>Profissão</h3>
            <div class="profs">${PROFESSIONS.map(p => `<button data-prof="${p.id}" class="${p.id === sel.prof ? 'on' : ''}"><b>${p.name}</b><span>${p.desc}</span><em>${p.points >= 0 ? '+' : ''}${p.points} pts</em></button>`).join('')}</div>
          </section>
          <section>
            <h3>Traços <span class="pts ${pts < 0 ? 'bad' : ''}">Pontos: ${pts}</span></h3>
            <div class="traits">${TRAITS.map(t => `<button data-trait="${t.id}" class="${sel.traits.includes(t.id) ? 'on' : ''} ${t.cost > 0 ? 'pos' : 'neg'}"><b>${t.name}</b><span>${t.desc}</span><em>${t.cost > 0 ? '−' : '+'}${Math.abs(t.cost)}</em></button>`).join('')}</div>
          </section>
          <section>
            <h3>Regras do mundo</h3>
            <label>População de zumbis<select id="spop"><option value="140">Baixa</option><option value="260" selected>Normal</option><option value="420">Alta</option><option value="650">Insana</option></select></label>
            <label>Velocidade dos zumbis<select id="sspeed"><option value="slow" selected>Arrastados</option><option value="mixed">Mistos (alguns correm)</option><option value="fast">Corredores</option></select></label>
            <label>Infecção<select id="sinf"><option value="1" selected>Mordidas e arranhões infectam</option><option value="0">Desligada</option></select></label>
            <label>Corte de água e luz<select id="sutil"><option value="2">Dia 2</option><option value="6" selected>Dia 6</option><option value="14">Dia 14</option><option value="40">Dia 40</option></select></label>
            <label>Quantidade de itens<select id="sloot"><option value="0.6">Raro</option><option value="1" selected>Normal</option><option value="1.6">Abundante</option></select></label>
            <label>Semente do mapa<input id="sseed" placeholder="aleatória"></label>
          </section>
        </div>
        <div class="mbtns row">
          <button id="back">Voltar</button>
          <button id="go" class="primary" ${pts < 0 ? 'disabled' : ''}>Começar</button>
        </div>
      </div>`
    m.querySelectorAll('[data-prof]').forEach(b => (b.onclick = () => { sel.name = $('cname').value; sel.prof = b.dataset.prof; draw() }))
    m.querySelectorAll('[data-trait]').forEach(b => (b.onclick = () => {
      sel.name = $('cname').value
      const id = b.dataset.trait
      const opp = { strong: 'weak', weak: 'strong', athletic: 'unfit', unfit: 'athletic', lowAppetite: 'heartyAppetite', heartyAppetite: 'lowAppetite', lightFoot: 'clumsy', clumsy: 'lightFoot' }
      if (sel.traits.includes(id)) sel.traits = sel.traits.filter(t => t !== id)
      else {
        sel.traits = sel.traits.filter(t => t !== opp[id])
        sel.traits.push(id)
      }
      draw()
    }))
    $('back').onclick = showMenu
    $('go').onclick = () => {
      const seedStr = $('sseed').value.trim()
      let seed = 0
      if (seedStr) for (const c of seedStr) seed = (seed * 31 + c.charCodeAt(0)) | 0
      newState({
        name: $('cname').value.trim(),
        prof: sel.prof,
        traits: sel.traits,
        seed: seed || undefined,
        settings: {
          pop: +$('spop').value,
          speed: $('sspeed').value,
          infection: $('sinf').value === '1',
          utilDays: +$('sutil').value,
          loot: +$('sloot').value
        }
      })
      save()
      startGame()
    }
  }
  draw()
}

function closeAllScreens() {
  for (const id of ['pause', 'death', 'help']) $(id).classList.add('hidden')
  $('panel').classList.add('hidden')
  $('container').classList.add('hidden')
  $('mapview').classList.add('hidden')
}

function toggleHelp(show) {
  const el = $('help')
  if (show === false || (!show && !el.classList.contains('hidden'))) return el.classList.add('hidden')
  el.classList.remove('hidden')
  el.innerHTML = `<div class="card help">
    <h2>Como sobreviver</h2>
    <div class="cols2">
      <div>
        <h3>Controles</h3>
        <ul class="keys">
          <li><kbd>W A S D</kbd> mover · <kbd>Shift</kbd> correr</li>
          <li><kbd>C</kbd> agachar (furtivo)</li>
          <li><kbd>Mouse</kbd> mirar · <kbd>Clique</kbd> atacar / atirar</li>
          <li><kbd>Espaço</kbd> empurrar zumbis</li>
          <li><kbd>E</kbd> interagir (portas, janelas, móveis, camas, pias)</li>
          <li><kbd>B</kbd> barricar · <kbd>Shift+B</kbd> remover tábua</li>
          <li><kbd>R</kbd> recarregar · <kbd>Q</kbd> trocar arma</li>
          <li><kbd>F</kbd> lanterna · <kbd>G</kbd> cavar canteiro</li>
          <li><kbd>Tab</kbd>/<kbd>I</kbd> inventário · <kbd>J</kbd> saúde · <kbd>K</kbd> habilidades · <kbd>O</kbd> criação</li>
          <li><kbd>M</kbd> mapa · <kbd>Roda</kbd> zoom · <kbd>Esc</kbd> pausa</li>
        </ul>
      </div>
      <div>
        <h3>Regras</h3>
        <ul>
          <li>Zumbis ouvem tudo: correr, tiros, vidro quebrando e martelo atraem multidões.</li>
          <li>Mordidas sempre infectam. Arranhões e lacerações às vezes. Não há cura.</li>
          <li>Faça curativos para parar sangramentos e desinfete para evitar infecções comuns.</li>
          <li>A água e a energia acabam após alguns dias. Encha garrafas e construa coletores de chuva.</li>
          <li>Barricadas com martelo, tábuas e pregos seguram os mortos por um tempo.</li>
          <li>Tábuas vêm de toras: corte árvores com machado e serre com serrote.</li>
          <li>Livros dobram a velocidade de aprendizado de uma habilidade.</li>
        </ul>
      </div>
    </div>
    <button id="closehelp" class="primary">Entendi</button>
  </div>`
  $('closehelp').onclick = () => el.classList.add('hidden')
}

function togglePause() {
  const el = $('pause')
  if (!el.classList.contains('hidden')) return el.classList.add('hidden')
  el.classList.remove('hidden')
  el.innerHTML = `<div class="card small-card"><h2>Pausado</h2><div class="mbtns">
    <button id="resume" class="primary">Continuar</button>
    <button id="psave">Salvar</button>
    <button id="phelp">Como jogar</button>
    <button id="pquit">Salvar e sair</button></div></div>`
  $('resume').onclick = () => el.classList.add('hidden')
  $('psave').onclick = () => { save(); log('Jogo salvo.', 'good'); el.classList.add('hidden') }
  $('phelp').onclick = () => toggleHelp(true)
  $('pquit').onclick = () => { save(); showMenu() }
}

function paused() {
  return !$('pause').classList.contains('hidden') || !$('help').classList.contains('hidden') || !$('mapview').classList.contains('hidden')
}

function cycleWeapon() {
  const p = S.player
  const ws = p.inv.filter(i => ITEMS[i.id].kind === 'weapon')
  if (!ws.length) return
  const i = ws.indexOf(p.equip)
  p.equip = i + 1 >= ws.length ? null : ws[i + 1]
  log(`Em mãos: ${p.equip ? ITEMS[p.equip.id].name : 'nada'}.`)
}

window.addEventListener('keydown', e => {
  if (typing()) return
  keys[e.code] = true
  if (!S || S.over) return
  if (e.code === 'Tab') e.preventDefault()
  if (e.code === 'Escape') {
    if (S.sleeping) return wake()
    if (!$('mapview').classList.contains('hidden')) return $('mapview').classList.add('hidden')
    if (!$('help').classList.contains('hidden')) return toggleHelp(false)
    if (!$('container').classList.contains('hidden') || !$('panel').classList.contains('hidden')) return closePanels()
    return togglePause()
  }
  if (paused() && e.code !== 'KeyM') return
  if (e.repeat) return
  switch (e.code) {
    case 'KeyE': interact(); break
    case 'KeyC': S.player.sneak = !S.player.sneak; break
    case 'KeyB': barricade(e.shiftKey); break
    case 'KeyR': reload(); break
    case 'KeyF': toggleLight(); break
    case 'KeyG': dig(); break
    case 'KeyQ': cycleWeapon(); break
    case 'Space': e.preventDefault(); playerAttack(true); break
    case 'Tab':
    case 'KeyI': togglePanel('inv'); break
    case 'KeyJ': togglePanel('health'); break
    case 'KeyK': togglePanel('skills'); break
    case 'KeyO': togglePanel('craft'); break
    case 'KeyH': toggleHelp(); break
    case 'KeyM': {
      const mv = $('mapview')
      if (mv.classList.contains('hidden')) {
        mv.classList.remove('hidden')
        drawMap()
      } else mv.classList.add('hidden')
      break
    }
  }
})
window.addEventListener('keyup', e => { keys[e.code] = false })
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false })
canvas.addEventListener('mousemove', e => { mouse.sx = e.clientX; mouse.sy = e.clientY })
canvas.addEventListener('mousedown', e => {
  unlockAudio()
  if (!S || S.over || paused()) return
  if (e.button === 0) {
    mouse.down = true
    playerAttack(false)
  }
})
window.addEventListener('mouseup', () => { mouse.down = false })
canvas.addEventListener('contextmenu', e => e.preventDefault())
canvas.addEventListener('wheel', e => {
  e.preventDefault()
  zoom = clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 2.2)
}, { passive: false })
window.addEventListener('beforeunload', () => save())
document.addEventListener('visibilitychange', () => { if (document.hidden) save() })

function frame(t) {
  const realDt = Math.min(0.05, (t - lastFrame) / 1000)
  lastFrame = t
  if (S && !paused()) {
    if (mouse.down && !S.player.action && currentWeapon().def.cat !== 'gun') playerAttack(false)
    update(realDt)
  }
  render()
  hudTimer -= realDt
  if (S && hudTimer <= 0) {
    hudTimer = 0.15
    renderHud(false)
  }
  requestAnimationFrame(frame)
}

showMenu()
requestAnimationFrame(frame)
