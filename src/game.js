import { ITEMS, SKILLS, PROFESSIONS, TRAITS, RECIPES, LOOT, STACK_AMOUNTS, FURN } from './data.js'
import { T, createWorld, rollLoot } from './world.js'
import { sfx, unlockAudio, setAmbience, setVolumes, getVolumes } from './audio.js'
import { Ground, TS, WALL_H, FURN_LIFT, hash, shade, makeCanvas, furnSprite, treeSprite, carSprite, roofSprite, splatSprite, wallFace } from './gfx.js'
import { drawChar, HAIRS, OUTFITS } from './chars.js'
import { iconURL } from './icons.js'

const SAVE_KEY = 'vale-morto-save-v2'
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
let zoom = 1.6
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
  if (t === T.WALL || t === T.FURN || t === T.WATER || t === T.WOODWALL || t === T.CAR) return true
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
      look: opts.look,
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
  dressZombie(S.zombies[S.zombies.length - 1])
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
  const test = (nx, ny) => {
    const x0 = Math.floor(nx - r)
    const x1 = Math.floor(nx + r)
    const y0 = Math.floor(ny - r)
    const y1 = Math.floor(ny + r)
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!inb(tx, ty)) return { k: -1, rect: [tx, ty, tx + 1, ty + 1] }
        const k = idx(tx, ty)
        if (!blocks(k, isZombie)) continue
        const rc = blockRect(k, tx, ty)
        if (nx + r > rc[0] && nx - r < rc[2] && ny + r > rc[1] && ny - r < rc[3]) return { k, rect: rc }
      }
    }
    return null
  }
  if (dx) {
    const nx = e.x + dx
    const res = test(nx, e.y)
    if (!res) e.x = nx
    else {
      hit = res.k
      const fx = dx > 0 ? res.rect[0] - r - 0.001 : res.rect[2] + r + 0.001
      if (Math.abs(fx - e.x) <= Math.abs(dx) + 0.001 && !test(fx, e.y)) e.x = fx
    }
  }
  if (dy) {
    const ny = e.y + dy
    const res = test(e.x, ny)
    if (!res) e.y = ny
    else {
      hit = res.k
      const fy = dy > 0 ? res.rect[1] - r - 0.001 : res.rect[3] + r + 0.001
      if (Math.abs(fy - e.y) <= Math.abs(dy) + 0.001 && !test(e.x, fy)) e.y = fy
    }
  }
  return hit
}

function surfaceAt(x, y) {
  const k = idx(Math.floor(x), Math.floor(y))
  let t = W.tiles[k]
  if (t === T.CAR) t = W.carBase[k]
  if (t === T.WATER) return 'water'
  if (t === T.GRASS || t === T.TREE) return 'grass'
  if (t === T.DIRT) return 'dirt'
  if (t === T.SIDEWALK) return 'sidewalk'
  if (t === T.ROAD || t === T.PARKING) return 'road'
  if (W.bld[k] >= 0) return W.floor[k] === 1 ? 'tile' : W.floor[k] === 3 ? 'concrete' : 'wood'
  return 'grass'
}

let ambT = 0
function updateAudio(dt) {
  ambT -= dt
  if (ambT > 0) return
  ambT = 0.25
  const p = S.player
  let chasers = 0
  for (const z of S.zombies) if (z.st === 'chase' && Math.abs(z.x - p.x) < 16 && Math.abs(z.y - p.y) < 16) chasers++
  setAmbience({ indoor: playerBuilding() >= 0, rain: S.rain.on, night: daylight() < 0.5, tension: S.over || S.sleeping ? 0 : clamp(chasers / 4, 0, 1) })
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
      if (t === T.WALL || t === T.FURN || t === T.WATER || t === T.CAR) continue
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
        emit('chip', x, y, 6, { min: 0.5, max: 2 })
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
        emit('chip', x, y, 10, { min: 0.6, max: 2.5 })
        makeNoise(x, y, 12, byPlayer)
        if (near(x, y, 18)) sfx.bang(1)
        if (byPlayer) triggerAlarm(k)
        if (near(x, y, 14)) log('Uma porta foi arrombada.', 'warn')
      }
    } else if (o.state === 'closed' || o.state === 'open') {
      o.hp -= dmg
      if (o.hp <= 0 || byPlayer) {
        o.state = 'broken'
        emit('glass', x, y, 12, { min: 0.5, max: 2.5, vz0: 0.5, vz1: 2 })
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
    if (z.stag > 0) z.stag -= dt
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
      z.groan = z.st === 'chase' ? rand(3, 8) : rand(8, 22)
      if (d < 26 && !S.sleeping) sfx.groan(clamp(0.34 * (1 - d / 26) ** 1.4, 0.015, 0.34), clamp(dx / -14, -0.9, 0.9))
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
      const ox = z.x
      const oy = z.y
      const hit = moveEntity(z, mx * spd * dt, my * spd * dt, 0.28, true)
      const moved = Math.hypot(z.x - ox, z.y - oy)
      if (z.st === 'chase' && d < 9 && !S.sleeping) {
        z.stepAcc = (z.stepAcc || 0) + moved
        if (z.stepAcc > (z.sprinter ? 0.5 : 0.75)) {
          z.stepAcc = 0
          sfx.zstep(clamp(1 - d / 9, 0.1, 1), clamp(-dx / 8, -0.9, 0.9))
        }
      }
      z.phase = (z.phase || 0) + moved * 4
      z.mv = moved > 0.0005 ? 0.15 : Math.max(0, (z.mv || 0) - dt)
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
  impact('hurt', Math.atan2(p.y - z.y, p.x - z.x))
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
  S.blood.push({ x: p.x + rand(-0.3, 0.3), y: p.y + rand(-0.3, 0.3), r: rand(0.12, 0.22), v: randi(0, 999) })
  emit('blood', p.x, p.y, 6, { min: 0.4, max: 1.8 })
}

function knockDown(z, a, pose) {
  z.down = rand(1.5, 3)
  setTimeout(() => sfx.thud(0.8), 260)
  z.fallDir = a
  z.fallT0 = performance.now()
  z.pose = pose
  emit('dust', z.x + Math.cos(a) * 0.4, z.y + Math.sin(a) * 0.4, 3, { min: 0.1, max: 0.5, vz0: 0, vz1: 0, l0: 0.4, l1: 0.7, s0: 1.5, s1: 3 })
}

function impact(kind, a) {
  const strong = kind === 'kill'
  S.hitstop = Math.max(S.hitstop || 0, strong ? 0.085 : kind === 'gun' ? 0.02 : 0.045)
  S.shake = Math.max(S.shake || 0, strong ? 5.5 : kind === 'gun' ? 3.5 : kind === 'hurt' ? 6 : 2.6)
  S.shakeDir = a ?? rand(0, Math.PI * 2)
}

function killZombie(z, byPlayer = true, pose, a) {
  const i = S.zombies.indexOf(z)
  if (i >= 0) S.zombies.splice(i, 1)
  if (byPlayer) S.kills++
  const items = []
  if (Math.random() < 0.35) for (const it of rollLoot(Math.random, 'corpse', [1, 2], LOOT, ITEMS, STACK_AMOUNTS)) addTo(items, mkItem(it.id, it.qty))
  const dir = a ?? z.dir + Math.PI
  const wasDown = z.down > 0
  S.corpses.push({
    x: z.x, y: z.y, dir: wasDown ? z.fallDir ?? dir : dir, shirt: z.shirt, pants: z.pants, skin: z.skin, hair: z.hair, hc: z.hc, gore: z.gore,
    outfit: z.outfit, missingArm: z.missingArm, pose: wasDown ? z.pose : pose ?? randi(0, 2), items, t: S.time, born: wasDown ? 0 : performance.now()
  })
  if (byPlayer) impact('kill', a)
  if (!wasDown) setTimeout(() => sfx.thud(1), 280)
  if (S.corpses.length > 300) S.corpses.shift()
  for (let k = 0; k < 2; k++) S.blood.push({ x: z.x + rand(-0.4, 0.4), y: z.y + rand(-0.4, 0.4), r: rand(0.14, 0.3), v: randi(0, 999) })
  emit('blood', z.x, z.y, 6, { min: 0.3, max: 1.5, vz0: 0.5, vz1: 1.8 })
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
      emit('chip', tx + 0.5, ty + 0.5, 5, { ang: p.dir + Math.PI, spread: 1.2, min: 0.5, max: 2 })
      makeNoise(p.x, p.y, 9)
      addXP('blade', 0.5)
      addXP('strength', 0.3)
      wearWeapon(item, def, 0.4)
      if (W.treeHp[k] <= 0) {
        W.tiles[k] = T.GRASS
        ground.dirty(tx, ty)
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
    const kb = shove ? 0.55 : def.cat === 'blunt' ? 0.4 * (def.w >= 1.2 ? 1.25 : 1) : def.chop ? 0.3 : 0.15
    const a = Math.atan2(z.y - p.y, z.x - p.x)
    moveEntity(z, Math.cos(a) * kb, Math.sin(a) * kb, 0.28, true)
    z.stun = Math.max(z.stun, shove ? 0.8 : 0.45)
    z.stag = 0.3
    z.kbm = kb / 0.35
    const kd = shove ? 0.35 : def.cat === 'blunt' ? 0.18 + lvl('blunt') * 0.02 : 0.05
    if (Math.random() < kd && !(z.down > 0)) knockDown(z, a, shove || def.cat === 'blunt' ? 0 : 2)
    if (z.hp > 0) impact('hit', a)
    z.st = 'chase'
    z.lx = p.x
    z.ly = p.y
    z.mem = 10
    sfx.hit()
    makeNoise(p.x, p.y, 5)
    emit('blood', z.x, z.y, randi(5, 9), { ang: a, spread: 0.7, min: 0.8, max: 3, vz0: 0.5, vz1: 2.5, s0: 1, s1: 2.2 })
    if (!shove) {
      addXP(skill, 1.5)
      addXP('strength', 0.3)
      wearWeapon(item, def, 1)
    }
    if (z.hp <= 0) {
      killZombie(z, true, def.cat === 'blunt' ? 0 : def.chop ? randi(0, 2) : 2, a)
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
  impact('gun', p.dir + Math.PI)
  emit('spark', p.x + Math.cos(p.dir) * 0.3, p.y + Math.sin(p.dir) * 0.3, 1, { ang: p.dir + Math.PI / 2, spread: 0.3, min: 1, max: 2, l0: 0.6, l1: 0.8 })
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
      hitZ.stag = 0.3
      hitZ.kbm = 1.2
      moveEntity(hitZ, Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.28, true)
      if (Math.random() < 0.15 && !(hitZ.down > 0)) knockDown(hitZ, a, 1)
      hitZ.st = 'chase'
      hitZ.lx = p.x
      hitZ.ly = p.y
      hitZ.mem = 10
      emit('blood', hitZ.x, hitZ.y, randi(7, 12), { ang: a, spread: 0.5, min: 1.5, max: 4.5, vz0: 0.3, vz1: 2, s0: 1, s1: 2.4 })
      S.blood.push({ x: hitZ.x + Math.cos(a) * 0.6, y: hitZ.y + Math.sin(a) * 0.6, r: rand(0.12, 0.22), v: randi(0, 999) })
      addXP('gun', 2)
      if (hitZ.hp <= 0) {
        killZombie(hitZ, true, 1, a)
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
  if (t === T.CAR) return { ...base, kind: 'car', car: W.carAt[k], label: W.cars[W.carAt[k]].wreck ? 'Revistar carro destruído' : 'Revistar porta-malas' }
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
  if (tg.kind === 'car') return startAction('Abrindo porta-malas', 1, () => openContainer({ type: 'car', i: tg.car }))
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
    if (d.open) sfx.creak()
    else sfx.door()
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
    ground.dirty(tg.k % W.w, Math.floor(tg.k / W.w))
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
  if (ref.type === 'car') {
    const c = W.cars[ref.i]
    if (!c.items) {
      c.items = []
      for (const it of rollLoot(Math.random, 'car', [0, Math.round(3 * S.settings.loot)], LOOT, ITEMS, STACK_AMOUNTS)) addTo(c.items, mkItem(it.id, it.qty))
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
  if (ref.type === 'car') return W.cars[ref.i].items
  return []
}

function contName(ref) {
  if (ref.type === 'furn') return FURN[W.furn[ref.k].kind].name
  if (ref.type === 'corpse') return 'Corpo'
  if (ref.type === 'car') return 'Carro'
  return 'Chão'
}

function contPos(ref) {
  if (ref.type === 'corpse') return [ref.c.x, ref.c.y]
  if (ref.type === 'car') {
    const c = W.cars[ref.i]
    return c.horiz ? [c.x + 1, c.y + 0.5] : [c.x + 0.5, c.y + 1]
  }
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
  const hk = S.player.hot ? S.player.hot.indexOf(it) : -1
  return `<span class="itrow"><img class="ic" src="${iconURL(it.id)}" alt="">${hk >= 0 ? `<i class="hk">${hk + 1}</i>` : ''}<span class="nm">${s}</span></span>`
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
        <ul>${items.length ? items.map((it, i) => `<li data-ci="${i}">${itemLabel(it)}<button data-a="take" data-i="${i}">Pegar</button></li>`).join('') : '<li class="empty">Vazio</li>'}</ul>
      </div>
      <div class="col">
        <div class="sub">Sua mochila <span class="${wgt > cap ? 'bad' : ''}">${wgt.toFixed(1)} / ${cap.toFixed(1)}</span></div>
        <ul>${p.inv.map((it, i) => `<li data-pi="${i}">${itemLabel(it)}<button data-a="put" data-i="${i}">Guardar</button></li>`).join('')}</ul>
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
      return `<li data-pi="${i}">${itemLabel(it)}<span class="btns">${btns.map(([a, l]) => `<button data-a="${a}" data-i="${i}">${l}</button>`).join('')}</span></li>`
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
  p.moving = moving
  p.running = running
  if (moving) {
    const before = Math.sin(p.phase || 0)
    p.phase = (p.phase || 0) + spd * dt * 3.4
    if (Math.sign(Math.sin(p.phase)) !== Math.sign(before) && dt > 0) sfx.step(surfaceAt(p.x, p.y), running ? 1.25 : p.sneak ? 0.3 : 0.7)
  }
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
      if (running) emit('dust', p.x - Math.cos(p.dir) * 0.2, p.y + 0.2, 1, { min: 0, max: 0.1, vz0: 0, vz1: 0, l0: 0.4, l1: 0.6, s0: 1, s1: 2 })
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
  S.overT = performance.now()
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
  updateParts(S.sleeping ? 0 : realDt)
  updateAudio(realDt)
  ambientParticles(realDt)
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

const PANTS = ['#2f3440', '#3a3a30', '#4a3a2a', '#2a2a2a', '#3a4a5a', '#5a4a3a']
const ZSKINS = ['#8a9a78', '#9a9a7c', '#7a8a72', '#a09a84', '#6e7a66']
const SIDING_FACE = ['#a89c8a', '#97a39a', '#ab9584', '#959aab', '#b0a582', '#a68a7e', '#c4bca8', '#8a9a8a']
let ground = null
const fogC = makeCanvas(1, 1)
const fogG = fogC.getContext('2d')
const roofFade = {}
let rainDrops = []

function initGfx() {
  ground = new Ground(W)
  for (const b of W.buildings) b.lit = b.type === 'house' ? hash(b.id, 7, 7) < 0.5 : b.type !== 'shed'
  for (const z of S.zombies) dressZombie(z)
  S.parts = []
  for (const b of S.blood) if (b.v === undefined) b.v = Math.floor(Math.random() * 1000)
}

function dressZombie(z) {
  if (z.pants !== undefined) return
  z.pants = randi(0, PANTS.length - 1)
  z.hair = Math.random() < 0.2 ? 0 : z.fem ? 2 : 1
  z.hc = randi(0, HAIRS.length - 1)
  z.gore = randi(1, 999)
  z.phase = rand(0, 6)
  z.skin = randi(0, ZSKINS.length - 1)
  const r = Math.random()
  z.outfit = r < 0.28 ? 'tshirt' : r < 0.45 ? 'jacket' : r < 0.58 ? 'hoodie' : r < 0.66 ? 'flannel' : r < 0.72 ? 'tank' : r < 0.77 ? 'worker' : r < 0.82 ? 'suit' : r < 0.86 ? 'medic' : r < 0.9 ? 'police' : z.fem ? 'dress' : 'tshirt'
  if (z.hair === 1 && Math.random() < 0.25) z.hair = 3
  z.missingArm = Math.random() < 0.06 ? randi(1, 2) : 0
  z.pose = randi(0, 2)
}

function wl(x, y) {
  const t = tileAt(x, y)
  return t === T.WALL || t === T.WINDOW || t === T.DOOR || t === T.WOODWALL
}

function orient(x, y) {
  return wl(x - 1, y) || wl(x + 1, y) ? 'h' : 'v'
}

function wallLook(k) {
  if (W.tiles[k] === T.WOODWALL) return ['#9a7a4c', 'plank', '#6e5634']
  const b = W.bld[k]
  if (b < 0) return ['#9a8f80', 'clap', '#5d544a']
  const bd = W.buildings[b]
  if (bd.type === 'shed') return ['#8a6a48', 'plank', '#4f3c28']
  if (bd.type === 'police') return ['#7f8a96', 'concrete', '#4a525c']
  if (bd.type !== 'house') return ['#8e5a46', 'brick', '#5a4a40']
  const f = SIDING_FACE[Math.floor(hash(b, 2, 71) * SIDING_FACE.length)]
  return [f, 'clap', shade(f, -0.45)]
}

function isNight() {
  return daylight() < 0.6
}

function buildingLit(k) {
  const b = W.bld[k]
  return b >= 0 && W.buildings[b].lit && !S.powerOff && isNight()
}

const WA = 11
const WB = 21

function wallArms(x, y) {
  return { l: wl(x - 1, y), r: wl(x + 1, y), u: wl(x, y - 1), d: wl(x, y + 1) }
}

function faceSegs(a) {
  const s = []
  if (a.l) s.push([0, WA])
  if (!a.d) s.push([WA, WB])
  if (a.r) s.push([WB, TS])
  if (!a.l && !a.r && a.d) return s
  return s
}

function drawFaces(px, py, a, tex) {
  const H = WALL_H
  for (const [x0, x1] of faceSegs(a)) ctx.drawImage(tex, x0 * 2, 0, (x1 - x0) * 2, H * 2, px + x0, py + WB - H, x1 - x0, H)
}

function capRects(a, skipCenter) {
  const r = []
  if (!skipCenter) r.push([WA, WA, WB, WB])
  if (a.l) r.push([0, WA, WA, WB])
  if (a.r) r.push([WB, WA, TS, WB])
  if (a.u) r.push([WA, 0, WB, WA])
  if (a.d) r.push([WA, WB, WB, TS])
  return r
}

function drawCaps(px, py, a, col, rects) {
  const H = WALL_H
  const oy = py - H
  ctx.fillStyle = col
  for (const [x0, y0, x1, y1] of rects) ctx.fillRect(px + x0, oy + y0, x1 - x0, y1 - y0)
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  if (a.l) ctx.fillRect(px, oy + WA, WA, 1.2)
  if (!a.u) ctx.fillRect(px + WA, oy + WA, WB - WA, 1.2)
  if (a.r) ctx.fillRect(px + WB, oy + WA, TS - WB, 1.2)
  if (a.u) ctx.fillRect(px + WA, oy, 1.2, WA)
  if (a.d) ctx.fillRect(px + WA, oy + WB, 1.2, TS - WB)
  if (!a.l) ctx.fillRect(px + WA, oy + WA, 1.2, WB - WA)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  if (a.u) ctx.fillRect(px + WB - 1, oy, 1, WA)
  if (a.d) ctx.fillRect(px + WB - 1, oy + WB, 1, TS - WB)
  if (!a.r) ctx.fillRect(px + WB - 1, oy + WA, 1, WB - WA)
}

function drawPlanks(px, py, n, w, h, vertical) {
  for (let i = 0; i < n; i++) {
    ctx.save()
    ctx.translate(px + w / 2, py + h / 2)
    if (vertical) ctx.rotate(Math.PI / 2)
    ctx.translate(0, (i - (n - 1) / 2) * ((vertical ? w : h) / 5))
    ctx.rotate(i % 2 ? 0.22 : -0.22)
    const L = (vertical ? h : w) * 0.6
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(-L + 1, -2, L * 2, 5)
    ctx.fillStyle = i % 2 ? '#a8824e' : '#9a7444'
    ctx.fillRect(-L, -3, L * 2, 5)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(-L, -3, L * 2, 1)
    ctx.fillStyle = '#3a3a3a'
    ctx.fillRect(-L * 0.85, -1.5, 1.5, 1.5)
    ctx.fillRect(L * 0.85 - 1.5, -1.5, 1.5, 1.5)
    ctx.restore()
  }
}

function glassFill(x, y, w, h, lit, state) {
  if (state === 'broken') {
    ctx.fillStyle = '#121518'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = 'rgba(190,215,230,0.55)'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w * 0.35, y)
    ctx.lineTo(x + w * 0.15, y + h * 0.45)
    ctx.lineTo(x, y + h * 0.7)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x + w, y + h)
    ctx.lineTo(x + w * 0.7, y + h)
    ctx.lineTo(x + w, y + h * 0.5)
    ctx.fill()
    return
  }
  const gr = ctx.createLinearGradient(x, y, x + w, y + h)
  if (lit) {
    gr.addColorStop(0, '#ffe6a8')
    gr.addColorStop(1, '#e8a050')
  } else {
    gr.addColorStop(0, '#a6c6d6')
    gr.addColorStop(0.5, '#5a7a8c')
    gr.addColorStop(1, '#2c4250')
  }
  ctx.fillStyle = gr
  ctx.fillRect(x, y, w, h)
  if (state === 'open') {
    ctx.fillStyle = lit ? 'rgba(255,220,150,0.6)' : '#141a1e'
    ctx.fillRect(x, y + h / 2, w, h / 2)
  }
  if (!lit) {
    ctx.fillStyle = 'rgba(255,255,255,0.32)'
    ctx.beginPath()
    ctx.moveTo(x + w * 0.15, y + h)
    ctx.lineTo(x + w * 0.4, y)
    ctx.lineTo(x + w * 0.52, y)
    ctx.lineTo(x + w * 0.27, y + h)
    ctx.fill()
  }
}

function drawWallTile(x, y, k) {
  const px = x * TS
  const py = y * TS
  const [face, style, cap] = wallLook(k)
  const a = wallArms(x, y)
  drawFaces(px, py, a, wallFace(style, face))
  drawCaps(px, py, a, cap, capRects(a))
}

function drawWindowTile(x, y, k) {
  const w = W.windows[k]
  const px = x * TS
  const py = y * TS
  const H = WALL_H
  const [face, style, cap] = wallLook(k)
  const a = wallArms(x, y)
  const o = orient(x, y)
  const lit = buildingLit(k)
  drawFaces(px, py, a, wallFace(style, face))
  if (o === 'h') {
    const gx = px + 5
    const gy = py + WB - H + 4
    const gw = TS - 10
    const gh = H - 10
    ctx.fillStyle = '#e4ded0'
    ctx.fillRect(gx - 2, gy - 2, gw + 4, gh + 4)
    glassFill(gx, gy, gw, gh, lit, w.state)
    if (w.state !== 'broken') {
      ctx.fillStyle = '#e4ded0'
      ctx.fillRect(gx + gw / 2 - 0.75, gy, 1.5, gh)
      ctx.fillRect(gx, gy + gh / 2 - 0.75, gw, 1.5)
    }
    if (w.curtain && w.state !== 'broken') {
      const cc = ['#8a3a32', '#3a5a7a', '#7a6a3a', '#5a3a5a'][k % 4]
      ctx.fillStyle = cc
      ctx.fillRect(gx, gy, 4, gh)
      ctx.fillRect(gx + gw - 4, gy, 4, gh)
      if (w.state === 'closed') {
        ctx.globalAlpha = 0.85
        ctx.fillRect(gx + 4, gy, gw - 8, gh)
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(0,0,0,0.2)'
        for (let i = gx + 6; i < gx + gw - 4; i += 3) ctx.fillRect(i, gy, 0.8, gh)
      }
    }
    ctx.fillStyle = '#cfc8b8'
    ctx.fillRect(gx - 3, gy + gh + 2, gw + 6, 2.5)
    drawCaps(px, py, a, cap, capRects(a))
    ctx.fillStyle = w.state === 'broken' ? '#151a1e' : 'rgba(165,200,215,0.95)'
    ctx.fillRect(px + 3, py - H + WA + 3, TS - 6, WB - WA - 6)
    if (w.bars.length) drawPlanks(px, py + WB - H, w.bars.length, TS, H)
  } else {
    drawCaps(px, py, a, cap, capRects(a))
    ctx.fillStyle = '#e4ded0'
    ctx.fillRect(px + WA, py - H + 3, WB - WA, TS - 6)
    glassFill(px + WA + 2, py - H + 4, WB - WA - 4, TS - 8, lit, w.state)
    if (w.bars.length) drawPlanks(px + WA - 4, py - H, w.bars.length, WB - WA + 8, TS, true)
  }
}

function drawDoorTile(x, y, k) {
  const d = W.doors[k]
  const px = x * TS
  const py = y * TS
  const H = WALL_H
  const [face, style, cap] = wallLook(k)
  const a = wallArms(x, y)
  const o = orient(x, y)
  const wood = '#6e4a2c'
  if (o === 'h') {
    const fy = py + WB - H
    ctx.fillStyle = shade(face, -0.3)
    ctx.fillRect(px, fy, 3, H)
    ctx.fillRect(px + TS - 3, fy, 3, H)
    if (!d.open && !d.broken) {
      ctx.fillStyle = wood
      ctx.fillRect(px + 3, fy, TS - 6, H)
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.lineWidth = 0.8
      ctx.strokeRect(px + 6, fy + 5, TS - 12, H / 2 - 5)
      ctx.strokeRect(px + 6, fy + H / 2 + 2, TS - 12, H / 2 - 5)
      ctx.fillStyle = '#d6b45a'
      ctx.beginPath()
      ctx.arc(px + TS - 8, fy + H / 2 + 1, 1.6, 0, Math.PI * 2)
      ctx.fill()
      if (d.bars.length) drawPlanks(px, fy, d.bars.length, TS, H)
    } else if (d.broken) {
      ctx.fillStyle = '#5a3c22'
      ctx.save()
      ctx.translate(px + 10, py + 26)
      ctx.rotate(0.6)
      ctx.fillRect(-6, -1.5, 12, 3)
      ctx.restore()
      ctx.fillRect(px + 18, py + 28, 8, 2.5)
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fillRect(px + 5, py + WB + 2, 5, 14)
      ctx.fillStyle = wood
      ctx.fillRect(px + 3, py + WB - H + 14, 4, H)
      ctx.fillStyle = shade(wood, 0.2)
      ctx.fillRect(px + 3, py + WB - H, 4, 14)
    }
    drawCaps(px, py, a, cap, [[0, WA, TS, WA + 4]])
  } else {
    const jambs = []
    if (a.u) jambs.push([WA, 0, WB, 4])
    if (a.d) jambs.push([WA, TS - 4, WB, TS])
    ctx.fillStyle = cap
    for (const [x0, y0, x1, y1] of jambs) ctx.fillRect(px + x0, py - H + y0, x1 - x0, y1 - y0)
    if (!d.open && !d.broken) {
      ctx.fillStyle = shade(wood, -0.2)
      ctx.fillRect(px + WA + 2, py + TS - 4 - H, WB - WA - 4, H)
      ctx.fillStyle = shade(wood, 0.2)
      ctx.fillRect(px + WA + 2, py - H + 4, WB - WA - 4, TS - 8)
      ctx.fillStyle = '#d6b45a'
      ctx.fillRect(px + TS / 2 - 1, py - H + TS / 2, 2, 2)
      if (d.bars.length) drawPlanks(px + WA - 4, py - H, d.bars.length, WB - WA + 8, TS, true)
    } else if (!d.broken) {
      ctx.fillStyle = shade(wood, -0.2)
      ctx.fillRect(px + WB, py + 8 - H + 3, 13, H)
      ctx.fillStyle = shade(wood, 0.2)
      ctx.fillRect(px + WB, py + 4 - H, 13, 4)
    }
  }
}

function blockRect(k, tx, ty) {
  const t = W.tiles[k]
  if (t === T.WALL || t === T.WOODWALL || t === T.WINDOW || t === T.DOOR) {
    const I = 0.33
    return [tx + (wl(tx - 1, ty) ? 0 : I), ty + (wl(tx, ty - 1) ? 0 : I), tx + 1 - (wl(tx + 1, ty) ? 0 : I), ty + 1 - (wl(tx, ty + 1) ? 0 : I)]
  }
  if (t === T.FURN) return [tx + 0.06, ty + 0.06, tx + 0.94, ty + 0.94]
  return [tx, ty, tx + 1, ty + 1]
}

function playerBuilding() {
  const p = S.player
  const x = Math.floor(p.x)
  const y = Math.floor(p.y)
  const k = idx(x, y)
  const t = W.tiles[k]
  if (t === T.WALL || t === T.WINDOW || t === T.WOODWALL) {
    let nx = x
    let ny = y
    if (orient(x, y) === 'h') ny = p.y % 1 < 0.5 ? y - 1 : y + 1
    else nx = p.x % 1 < 0.5 ? x - 1 : x + 1
    return inb(nx, ny) ? W.bld[idx(nx, ny)] : -1
  }
  if (t === T.DOOR) return W.bld[k]
  const b = W.bld[k]
  return b >= 0 && t !== T.GRASS && t !== T.DIRT ? b : -1
}

function drawCampfire(px, py, f, now) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(px + 17, py + 18, 13, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = f.fuel > 0 ? '#2a1a12' : '#3a3a38'
  ctx.beginPath()
  ctx.ellipse(px + 16, py + 16, 8, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const sx = px + 16 + Math.cos(a) * 11
    const sy = py + 16 + Math.sin(a) * 8.5
    ctx.fillStyle = '#6a6862'
    ctx.beginPath()
    ctx.ellipse(sx, sy, 3.6, 2.8, a, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.ellipse(sx - 1, sy - 1, 1.6, 1.1, a, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = '#5a3a20'
  ctx.lineWidth = 3.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(px + 9, py + 20)
  ctx.lineTo(px + 23, py + 12)
  ctx.moveTo(px + 9, py + 12)
  ctx.lineTo(px + 23, py + 20)
  ctx.stroke()
  ctx.lineCap = 'butt'
  if (f.fuel > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const gl = ctx.createRadialGradient(px + 16, py + 14, 1, px + 16, py + 14, 18)
    gl.addColorStop(0, 'rgba(255,150,50,0.55)')
    gl.addColorStop(1, 'rgba(255,90,20,0)')
    ctx.fillStyle = gl
    ctx.fillRect(px - 4, py - 6, 40, 40)
    ctx.restore()
    for (let i = 0; i < 3; i++) {
      const fl = Math.sin(now * (11 + i * 3) + i) * 2
      const s = 1 - i * 0.28
      const gr = ctx.createLinearGradient(0, py + 18, 0, py + 2)
      gr.addColorStop(0, i === 2 ? '#fff4c0' : '#ff8a2a')
      gr.addColorStop(1, i === 0 ? 'rgba(200,40,10,0.2)' : '#ffd25a')
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.moveTo(px + 16 - 7 * s, py + 18)
      ctx.quadraticCurveTo(px + 16 - 6 * s, py + 9, px + 16 + fl, py + 1 + i * 4)
      ctx.quadraticCurveTo(px + 16 + 6 * s, py + 9, px + 16 + 7 * s, py + 18)
      ctx.fill()
    }
  }
}

function drawFurnTile(x, y, k, now) {
  const f = W.furn[k]
  const px = x * TS
  const py = y * TS
  if (f.kind === 'campfire') return drawCampfire(px, py, f, now)
  const v = (x * 7 + y * 13) % 5
  ctx.drawImage(furnSprite(f.kind, v), px, py - FURN_LIFT, TS, TS + FURN_LIFT)
  if (f.kind === 'collector' && f.water > 0.5) {
    ctx.fillStyle = 'rgba(120,170,200,0.75)'
    ctx.beginPath()
    ctx.ellipse(px + 16, py + 4, 8 * Math.min(1, f.water / 40 + 0.3), 2.6, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawTreeBase(x, y) {
  const px = x * TS + 16
  const py = y * TS + 16
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(px + 12, py + 9, 24, 13, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3e2e20'
  ctx.fillRect(px - 3, py - 10, 6, 14)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(px - 3, py - 10, 2, 14)
}

function drawCanopy(x, y, now) {
  const k = idx(x, y)
  const v = Math.floor(hash(x, y, 5) * 6)
  const p = S.player
  const px = x * TS + 16
  const py = y * TS + 16
  const sway = Math.sin(now * 0.9 + x * 0.7 + y * 0.3) * 1.3
  const near = Math.abs(p.x - (x + 0.5)) < 1.6 && p.y < y + 0.9 && p.y > y - 2.6
  const zNear = S.vis[k] && S.zombies.some(z => Math.abs(z.x - (x + 0.5)) < 1.3 && z.y < y + 0.9 && z.y > y - 2.4)
  ctx.globalAlpha = near || zNear ? 0.42 : 1
  const s = 84 * (0.85 + hash(x, y, 6) * 0.3)
  ctx.drawImage(treeSprite(v), px - s / 2 + sway, py - s / 2 - 20, s, s)
  ctx.globalAlpha = 1
}

function drawCar(c) {
  const sp = carSprite(c.color, c.wreck, c.horiz)
  const w = sp.width / 2
  const h = sp.height / 2
  const cx = (c.horiz ? c.x + 1 : c.x + 0.5) * TS
  const cy = (c.horiz ? c.y + 0.5 : c.y + 1) * TS
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(c.rot || 0)
  ctx.drawImage(sp, -w / 2, -h / 2 - 3, w, h)
  ctx.restore()
}

function drawLampPole(l) {
  const x = l.x * TS
  const y = l.y * TS
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 26, y + 16)
  ctx.stroke()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(x, y + 1, 4, 2.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a3e42'
  ctx.fillRect(x - 1.5, y - 40, 3, 40)
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(x - 1.5, y - 40, 1, 40)
}

function drawLampHead(l) {
  const x = l.x * TS
  const y = l.y * TS
  const on = !S.powerOff && isNight()
  ctx.fillStyle = '#3a3e42'
  ctx.fillRect(x - 1, y - 42, 10, 2.5)
  ctx.fillStyle = '#2a2d30'
  ctx.beginPath()
  ctx.ellipse(x + 9, y - 40, 5, 3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = on ? '#ffe2a0' : '#8a8a80'
  ctx.beginPath()
  ctx.ellipse(x + 9, y - 39.5, 3, 1.6, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawPlants(x0, y0, x1, y1, now) {
  for (const key in W.plots) {
    const k = +key
    const x = k % W.w
    const y = Math.floor(k / W.w)
    if (x < x0 || x > x1 || y < y0 || y > y1 || !S.seen[k]) continue
    const st = W.plots[key].stage
    for (const [ox, oy] of [[8, 9], [24, 9], [8, 25], [24, 25]]) {
      const px = x * TS + ox
      const py = y * TS + oy
      const sw = Math.sin(now * 1.5 + px * 0.1) * 0.6
      const n = 2 + st * 2
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + px
        const l = 2 + st * 2.2
        ctx.fillStyle = i % 2 ? '#5e8a32' : '#78a43e'
        ctx.beginPath()
        ctx.ellipse(px + Math.cos(a) * l * 0.5 + sw, py + Math.sin(a) * l * 0.5 - st, l * 0.6, l * 0.3, a, 0, Math.PI * 2)
        ctx.fill()
      }
      if (st >= 3) {
        ctx.fillStyle = (x + y + ox) % 2 ? '#d8582a' : '#c83a2a'
        ctx.beginPath()
        ctx.arc(px + 2, py - 2, 2.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(px + 1, py - 4, 1, 1)
      }
    }
  }
}

function drawWater(x0, y0, x1, y1, now) {
  ctx.strokeStyle = 'rgba(170,210,225,0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = idx(x, y)
    if (W.tiles[k] !== T.WATER || !S.seen[k]) continue
    const ph = now * 0.6 + hash(x, y, 9) * 6
    const ox = ((ph * 6) % 40) - 6
    const oy = 8 + hash(x, y, 10) * 16
    ctx.moveTo(x * TS + ox, y * TS + oy)
    ctx.quadraticCurveTo(x * TS + ox + 5, y * TS + oy - 2, x * TS + ox + 10, y * TS + oy)
  }
  ctx.stroke()
}

function charLook(z) {
  return {
    shirt: SHIRTS[z.shirt] || '#4b5a6b',
    pants: PANTS[z.pants || 0],
    skin: ZSKINS[z.skin || 0],
    hair: z.hair ?? 1,
    hairColor: HAIRS[z.hc || 0],
    gore: z.gore || 7,
    outfit: z.outfit || 'tshirt',
    missingArm: z.missingArm || 0,
    pose: z.pose || 0,
    zombie: true
  }
}

function drawZombie(z) {
  const l = charLook(z)
  const now = performance.now()
  drawChar(ctx, {
    ...l,
    x: z.x * TS, y: z.y * TS, dir: z.down > 0 ? z.fallDir ?? z.dir : z.dir, phase: z.phase || 0, moving: z.mv > 0, down: z.down > 0,
    fall: z.down > 0 ? Math.min(1, (now - (z.fallT0 || 0)) / 320) : 1, struggle: z.down > 0 ? now / 1000 + z.gore : 0,
    reach: z.st === 'chase', run: z.sprinter && z.st === 'chase', hit: z.hit, lean: z.stag > 0 ? (z.stag / 0.3) * (z.kbm || 1) : 0,
    wobble: Math.sin((z.phase || 0) * 0.5) * 0.14 + (z.stag > 0 ? Math.sin(now / 40) * 0.08 : 0)
  })
}

function drawPlayerChar(p) {
  const { item } = currentWeapon()
  const look = p.look || { shirt: '#3d5f7a', pants: '#2f3440', skin: '#d2a882', hair: 1, hairColor: '#3a2a1c', outfit: 'jacket' }
  const bag = p.inv.some(i => ITEMS[i.id].kind === 'bag')
  drawChar(ctx, {
    x: p.x * TS, y: p.y * TS, dir: p.dir, phase: p.phase || 0, moving: !!p.moving, down: S.over, run: p.running, outfit: look.outfit || 'jacket', pose: 0, gore: 3,
    scale: p.sneak ? 1.1 : 1.18, fall: S.over ? Math.min(1, (performance.now() - (S.overT || 0)) / 400) : 1,
    shirt: look.shirt, pants: look.pants, skin: look.skin, hair: look.hair, hairColor: look.hairColor,
    weapon: item ? item.id : null, swing: p.swing > 0 ? p.swing / 0.18 : 0, bag, bagColor: '#4a4a32', hit: 0
  })
}

function drawCorpse(c) {
  const age = Math.max(0, S.time - c.t)
  const r = Math.min(0.62, 0.18 + age / 90) * TS
  const gr = ctx.createRadialGradient(c.x * TS, c.y * TS, 2, c.x * TS, c.y * TS, r)
  gr.addColorStop(0, 'rgba(70,8,6,0.85)')
  gr.addColorStop(0.75, 'rgba(70,8,6,0.6)')
  gr.addColorStop(1, 'rgba(70,8,6,0)')
  ctx.fillStyle = gr
  ctx.beginPath()
  ctx.ellipse(c.x * TS, c.y * TS, r * 1.25, r, c.dir || 0, 0, Math.PI * 2)
  ctx.fill()
  const l = charLook(c)
  drawChar(ctx, { ...l, x: c.x * TS, y: c.y * TS, dir: c.dir || 0, down: true, fall: c.born ? Math.min(1, (performance.now() - c.born) / 320) : 1 })
}

function drawSack(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(x + 2, y + 4, 8, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  const gr = ctx.createLinearGradient(x - 7, y - 8, x + 7, y + 5)
  gr.addColorStop(0, '#c8aa72')
  gr.addColorStop(1, '#7a6440')
  ctx.fillStyle = gr
  ctx.beginPath()
  ctx.moveTo(x - 7, y + 4)
  ctx.quadraticCurveTo(x - 9, y - 4, x - 3, y - 7)
  ctx.lineTo(x + 3, y - 7)
  ctx.quadraticCurveTo(x + 9, y - 4, x + 7, y + 4)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.fillStyle = '#5a4428'
  ctx.fillRect(x - 3, y - 8, 6, 2)
}

function emit(type, x, y, n, opts = {}) {
  if (!S.parts) S.parts = []
  for (let i = 0; i < n; i++) {
    const a = opts.ang !== undefined ? opts.ang + rand(-opts.spread || -0.6, opts.spread || 0.6) : rand(0, Math.PI * 2)
    const sp = rand(opts.min ?? 0.6, opts.max ?? 2.4)
    S.parts.push({
      type, x, y, z: opts.z ?? 0.35,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(opts.vz0 ?? 0.5, opts.vz1 ?? 2.2),
      life: rand(opts.l0 ?? 0.5, opts.l1 ?? 1.0), max: 1, size: rand(opts.s0 ?? 0.8, opts.s1 ?? 1.8),
      col: opts.col
    })
    S.parts[S.parts.length - 1].max = S.parts[S.parts.length - 1].life
  }
  if (S.parts.length > 500) S.parts.splice(0, S.parts.length - 500)
}

function updateParts(dt) {
  if (!S.parts) S.parts = []
  for (const p of S.parts) {
    p.life -= dt
    if (p.type === 'smoke') {
      p.x += p.vx * dt * 0.1 + Math.sin(p.life * 3) * 0.003
      p.z += dt * 0.7
      p.size += dt * 2.5
      continue
    }
    if (p.type === 'dust' || p.type === 'splash') {
      p.size += dt * (p.type === 'splash' ? 14 : 6)
      continue
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vz -= 9 * dt
    p.z += p.vz * dt
    if (p.z <= 0) {
      p.z = 0
      if (p.type === 'blood') {
        S.blood.push({ x: p.x, y: p.y, r: rand(0.03, 0.07), v: randi(0, 999) })
        p.life = 0
      } else {
        p.vx *= 0.3
        p.vy *= 0.3
        p.vz = Math.abs(p.vz) * 0.25
      }
    }
  }
  S.parts = S.parts.filter(p => p.life > 0)
  if (S.blood.length > 700) S.blood.splice(0, S.blood.length - 700)
}

function drawParts() {
  for (const p of S.parts) {
    const k = idx(Math.floor(p.x), Math.floor(p.y))
    if (k < 0 || k >= W.tiles.length || !S.vis[k]) continue
    const x = p.x * TS
    const y = (p.y - p.z) * TS
    const a = Math.max(0, p.life / p.max)
    switch (p.type) {
      case 'blood':
        ctx.fillStyle = '#7a0e0a'
        ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size)
        break
      case 'chip':
        ctx.fillStyle = `rgba(160,120,70,${a})`
        ctx.fillRect(x - 1.5, y - 0.8, 3, 1.6)
        break
      case 'glass':
        ctx.fillStyle = `rgba(200,225,240,${a})`
        ctx.fillRect(x - 1, y - 1, 2, 2)
        break
      case 'smoke':
        ctx.fillStyle = `rgba(120,120,120,${a * 0.25})`
        ctx.beginPath()
        ctx.arc(x, y, p.size * 3, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'dust':
        ctx.fillStyle = `rgba(150,140,120,${a * 0.25})`
        ctx.beginPath()
        ctx.arc(x, y, p.size * 2, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'splash':
        ctx.strokeStyle = `rgba(190,210,225,${a * 0.5})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.ellipse(x, y, p.size, p.size * 0.5, 0, 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'spark':
        ctx.fillStyle = `rgba(255,${180 + Math.random() * 60},80,${a})`
        ctx.fillRect(x - 1, y - 1, 2, 2)
        break
    }
  }
}

function drawFog(x0, y0, x1, y1) {
  const fx0 = x0 - 1
  const fy0 = y0 - 1
  const w = x1 - x0 + 3
  const h = y1 - y0 + 3
  if (fogC.width !== w || fogC.height !== h) {
    fogC.width = w
    fogC.height = h
  }
  const img = fogG.createImageData(w, h)
  const d = img.data
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tx = fx0 + x
    const ty = fy0 + y
    const o = (y * w + x) * 4
    d[o] = 5
    d[o + 1] = 7
    d[o + 2] = 11
    if (!inb(tx, ty)) {
      d[o + 3] = 255
      continue
    }
    const k = idx(tx, ty)
    d[o + 3] = !S.seen[k] ? 255 : S.vis[k] ? 0 : 150
  }
  fogG.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(fogC, fx0 * TS - TS / 2, fy0 * TS - TS / 2 - 6, w * TS, h * TS)
}

function buildingSeen(b) {
  for (const [x, y] of [[b.x, b.y], [b.x + b.w - 1, b.y], [b.x, b.y + b.h - 1], [b.x + b.w - 1, b.y + b.h - 1], [b.x + (b.w >> 1), b.y], [b.x + (b.w >> 1), b.y + b.h - 1], [b.x, b.y + (b.h >> 1)], [b.x + b.w - 1, b.y + (b.h >> 1)]]) {
    if (S.seen[idx(x, y)]) return true
  }
  return false
}

function buildingVisible(b) {
  for (let x = b.x; x < b.x + b.w; x++) if (S.vis[idx(x, b.y)] || S.vis[idx(x, b.y + b.h - 1)]) return true
  for (let y = b.y; y < b.y + b.h; y++) if (S.vis[idx(b.x, y)] || S.vis[idx(b.x + b.w - 1, y)]) return true
  return false
}

function drawRoofs(x0, y0, x1, y1) {
  const p = S.player
  const inside = playerBuilding()
  for (const b of W.buildings) {
    if (b.x > x1 + 1 || b.y > y1 + 2 || b.x + b.w < x0 - 1 || b.y + b.h < y0 - 1) continue
    if (!buildingSeen(b)) continue
    const target = b.id === inside ? 0 : 1
    const cur = roofFade[b.id] ?? target
    const a = cur + (target - cur) * 0.18
    roofFade[b.id] = a
    if (a < 0.02) continue
    const sp = roofSprite(b)
    const rx = b.x * TS - 5
    const ry = b.y * TS - WALL_H - 5
    const w = b.w * TS + 10
    const h = b.h * TS + 10
    ctx.globalAlpha = a
    ctx.drawImage(sp, rx, ry, w, h)
    if (!buildingVisible(b)) {
      ctx.fillStyle = 'rgba(5,7,11,0.5)'
      ctx.fillRect(rx, ry, w, h)
    }
    ctx.globalAlpha = 1
  }
}

function drawTargetMark() {
  if (!target || S.sleeping) return
  const t = performance.now() / 1000
  ctx.strokeStyle = `rgba(240,215,140,${0.65 + Math.sin(t * 5) * 0.25})`
  ctx.lineWidth = 1.6
  if (target.kind === 'corpse') {
    ctx.beginPath()
    ctx.arc(target.x * TS, target.y * TS, 15, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  let x = (target.x - 0.5) * TS
  let y = (target.y - 0.5) * TS
  let w = TS
  let h = TS
  if (target.kind === 'car') {
    const c = W.cars[target.car]
    x = c.x * TS
    y = c.y * TS
    w = c.horiz ? TS * 2 : TS
    h = c.horiz ? TS : TS * 2
  }
  const tall = ['container', 'stove', 'door', 'window', 'sink', 'bed', 'collector'].includes(target.kind)
  if (tall) {
    y -= 10
    h += 10
  }
  const L = 7
  ctx.beginPath()
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.moveTo(cx + dx * L, cy)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx, cy + dy * L)
  }
  ctx.stroke()
}

function ambientParticles(dt) {
  if (S.sleeping) return
  const p = S.player
  for (const k in W.furn) {
    const f = W.furn[k]
    if (f.kind !== 'campfire' || f.fuel <= 0) continue
    const [fx, fy] = tileCenter(+k)
    if (Math.abs(fx - p.x) > 25 || Math.abs(fy - p.y) > 18) continue
    if (Math.random() < dt * 6) S.parts.push({ type: 'smoke', x: fx + rand(-0.1, 0.1), y: fy, z: 0.4, vx: 0, vy: 0, vz: 0, life: 2.5, max: 2.5, size: 1 })
    if (Math.random() < dt * 8) S.parts.push({ type: 'spark', x: fx, y: fy, z: 0.3, vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), vz: rand(1.5, 3), life: 0.7, max: 0.7, size: 1 })
  }
  if (S.rain.on) {
    for (let i = 0; i < 6; i++) {
      const x = p.x + rand(-cw / 2, cw / 2) / zoom / TS
      const y = p.y + rand(-ch / 2, ch / 2) / zoom / TS
      if (!inb(Math.floor(x), Math.floor(y)) || W.bld[idx(Math.floor(x), Math.floor(y))] >= 0) continue
      S.parts.push({ type: 'splash', x, y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.3, max: 0.3, size: 0.5 })
    }
  }
}

function render() {
  const dpr = canvas.dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#05070a'
  ctx.fillRect(0, 0, cw, ch)
  if (!S || !ground) return
  const p = S.player
  const lookX = clamp((mouse.sx - cw / 2) / zoom, -cw, cw) * 0.12
  const lookY = clamp((mouse.sy - ch / 2) / zoom, -ch, ch) * 0.12
  camX += (p.x * TS + (S.sleeping ? 0 : lookX) - camX) * 0.12
  camY += (p.y * TS + (S.sleeping ? 0 : lookY) - camY) * 0.12
  if (Math.abs(camX - p.x * TS) > 600 || Math.abs(camY - p.y * TS) > 600) {
    camX = p.x * TS
    camY = p.y * TS
  }
  const sh = S.shake > 0.15 ? S.shake : 0
  const shx = sh ? Math.cos(S.shakeDir || 0) * sh * 0.6 + (Math.random() - 0.5) * sh : 0
  const shy = sh ? Math.sin(S.shakeDir || 0) * sh * 0.6 + (Math.random() - 0.5) * sh : 0
  const sx = Math.round((cw / 2 - camX * zoom + shx) * dpr) / dpr
  const sy = Math.round((ch / 2 - camY * zoom + shy) * dpr) / dpr
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * sx, dpr * sy)
  ctx.imageSmoothingEnabled = true
  const x0 = Math.max(0, Math.floor((camX - cw / 2 / zoom) / TS) - 1)
  const y0 = Math.max(0, Math.floor((camY - ch / 2 / zoom) / TS) - 1)
  const x1 = Math.min(W.w - 1, Math.ceil((camX + cw / 2 / zoom) / TS) + 1)
  const y1 = Math.min(W.h - 1, Math.ceil((camY + ch / 2 / zoom) / TS) + 2)
  const now = performance.now() / 1000
  ground.draw(ctx, x0, y0, x1, y1, S.warm ? 2 : 999)
  S.warm = true
  drawWater(x0, y0, x1, y1, now)
  drawPlants(x0, y0, x1, y1, now)
  for (const b of S.blood) {
    if (b.x < x0 - 1 || b.x > x1 + 1 || b.y < y0 - 1 || b.y > y1 + 1) continue
    if (!S.seen[idx(Math.floor(b.x), Math.floor(b.y))]) continue
    if (b.r >= 0.11) {
      const s = b.r * TS * 2.8
      ctx.save()
      ctx.translate(b.x * TS, b.y * TS)
      ctx.rotate((b.v || 0) * 0.37)
      ctx.globalAlpha = 0.85
      ctx.drawImage(splatSprite((b.v || 0) % 6), -s / 2, -s / 2, s, s)
      ctx.restore()
    } else {
      ctx.fillStyle = 'rgba(90,12,10,0.8)'
      ctx.beginPath()
      ctx.arc(b.x * TS, b.y * TS, Math.max(0.8, b.r * TS), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  for (const k in S.ground) {
    if (!S.ground[k].length || !S.seen[k]) continue
    const [gx, gy] = tileCenter(+k)
    if (gx < x0 || gx > x1 + 1 || gy < y0 || gy > y1 + 1) continue
    drawSack(gx * TS, gy * TS + 4)
  }
  for (const c of S.corpses) {
    if (c.x < x0 - 1 || c.x > x1 + 1 || c.y < y0 - 1 || c.y > y1 + 1) continue
    if (!S.vis[idx(Math.floor(c.x), Math.floor(c.y))]) continue
    drawCorpse(c)
  }
  const rows = {}
  const push = (y, fn) => {
    const r = Math.floor(y)
    ;(rows[r] || (rows[r] = [])).push([y, fn])
  }
  for (const z of S.zombies) {
    if (z.x < x0 - 1 || z.x > x1 + 1 || z.y < y0 - 1 || z.y > y1 + 2) continue
    if (!S.vis[idx(Math.floor(z.x), Math.floor(z.y))]) continue
    push(z.y, () => drawZombie(z))
  }
  if (!(S.over && S.player.infected)) push(p.y, () => drawPlayerChar(p))
  const lampRows = {}
  for (const l of W.lamps) {
    if (l.x < x0 - 1 || l.x > x1 + 1 || l.y < y0 || l.y > y1 + 2) continue
    if (!S.seen[idx(Math.floor(l.x), Math.floor(l.y))]) continue
    push(l.y, () => drawLampPole(l))
    ;(lampRows[Math.floor(l.y)] || (lampRows[Math.floor(l.y)] = [])).push(l)
  }
  const drawnCars = new Set()
  const trees = []
  for (let y = y0; y <= y1 + 1 && y < W.h; y++) {
    const list = rows[y]
    if (list) {
      list.sort((a, b) => a[0] - b[0])
      for (const [, fn] of list) fn()
    }
    for (let x = x0; x <= x1; x++) {
      const k = idx(x, y)
      if (!S.seen[k]) continue
      const t = W.tiles[k]
      if (t === T.WALL || t === T.WOODWALL) drawWallTile(x, y, k)
      else if (t === T.WINDOW) drawWindowTile(x, y, k)
      else if (t === T.DOOR) drawDoorTile(x, y, k)
      else if (t === T.FURN) drawFurnTile(x, y, k, now)
      else if (t === T.TREE) {
        drawTreeBase(x, y)
        trees.push([x, y])
      } else if (t === T.CAR) {
        const ci = W.carAt[k]
        if (!drawnCars.has(ci)) {
          const c = W.cars[ci]
          const lastY = c.horiz ? c.y : c.y + 1
          if (y === lastY) {
            drawnCars.add(ci)
            drawCar(c)
          }
        }
      }
    }
  }
  drawParts()
  for (const [x, y] of trees) drawCanopy(x, y, now)
  for (const r in lampRows) for (const l of lampRows[r]) drawLampHead(l)
  for (const t of S.tracers) {
    ctx.strokeStyle = `rgba(255,230,160,${t.t * 10})`
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(t.x0 * TS, t.y0 * TS)
    ctx.lineTo(t.x1 * TS, t.y1 * TS)
    ctx.stroke()
  }
  for (const f of S.flashes) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(f.x * TS, f.y * TS, 0, f.x * TS, f.y * TS, 16)
    g.addColorStop(0, 'rgba(255,240,180,1)')
    g.addColorStop(1, 'rgba(255,160,40,0)')
    ctx.fillStyle = g
    ctx.fillRect(f.x * TS - 16, f.y * TS - 16, 32, 32)
    ctx.restore()
  }
  drawFog(x0, y0, x1, y1)
  drawRoofs(x0, y0, x1, y1)
  drawTargetMark()
  drawMarkers(now)
  for (const r of S.rings) {
    ctx.strokeStyle = `rgba(230,200,140,${(1 - r.t / 0.8) * 0.3})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(r.x * TS, r.y * TS, (r.t / 0.8) * Math.min(r.r, 14) * TS, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (S.heli.active) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.save()
    ctx.translate(S.heli.x * TS, S.heli.y * TS)
    ctx.rotate(S.heli.ang)
    ctx.beginPath()
    ctx.ellipse(0, 0, 40, 13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(30, -3, 30, 6)
    ctx.rotate(now * 20)
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(-60, -3, 120, 6)
    ctx.restore()
  }
  if (p.action) {
    const w = 42
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.beginPath()
    ctx.roundRect(p.x * TS - w / 2 - 1, p.y * TS - 33, w + 2, 7, 3)
    ctx.fill()
    ctx.fillStyle = '#d8b25a'
    ctx.fillRect(p.x * TS - w / 2 + 1, p.y * TS - 31, (w - 2) * clamp(p.action.t / p.action.dur, 0, 1), 3)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawLighting(now)
  grade()
  if (S.rain.on) drawRain(now)
  post(now)
}

function lightList() {
  const p = S.player
  const L = []
  const night = isNight()
  const power = !S.powerOff
  for (const k in W.furn) {
    const f = W.furn[k]
    if (f.kind === 'campfire' && f.fuel > 0) {
      const [fx, fy] = tileCenter(+k)
      if (Math.abs(fx - p.x) < 40 && Math.abs(fy - p.y) < 30) L.push({ x: fx, y: fy - 0.2, r: 6 + Math.sin(performance.now() / 90) * 0.25, i: 0.95, c: [255, 140, 50] })
    }
  }
  if (night && power) {
    for (const l of W.lamps) {
      if (Math.abs(l.x - p.x) < 30 && Math.abs(l.y - p.y) < 22) L.push({ x: l.x + 0.3, y: l.y - 0.6, r: 5.2, i: 0.9, c: [255, 200, 110] })
    }
    const inside = playerBuilding()
    for (const b of W.buildings) {
      if (!b.lit || Math.abs(b.x - p.x) > 36 || Math.abs(b.y - p.y) > 26) continue
      if (b.id === inside) {
        for (const r of b.rooms.length ? b.rooms : [{ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }]) L.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, r: Math.max(r.w, r.h) * 0.85, i: 0.92, c: [255, 210, 150] })
      }
      if (b.id === inside) continue
      const y = b.y + b.h - 1
      for (let x = b.x; x < b.x + b.w; x++) {
        const k = idx(x, y)
        if (W.tiles[k] === T.WINDOW && W.windows[k].bars.length < 2 && !(W.windows[k].curtain && W.windows[k].state === 'closed')) L.push({ x: x + 0.5, y: y + 1, r: 1.9, i: 0.5, c: [255, 196, 120] })
      }
    }
  }
  for (const f of S.flashes) L.push({ x: f.x, y: f.y, r: 7, i: 1, c: [255, 210, 120] })
  return L
}

function drawLighting(now) {
  const dl = daylight()
  const p = S.player
  let a = (1 - dl) * 0.93
  if (S.rain.on) a = Math.max(a, 0.22)
  if (a <= 0.01) return
  const sc = 0.5
  dctx.setTransform(1, 0, 0, 1, 0, 0)
  dctx.globalCompositeOperation = 'source-over'
  dctx.clearRect(0, 0, dark.width, dark.height)
  dctx.fillStyle = `rgba(6,9,22,${a})`
  dctx.fillRect(0, 0, dark.width, dark.height)
  dctx.globalCompositeOperation = 'destination-out'
  const toS = (wx, wy) => [((wx * TS - camX) * zoom + cw / 2) * sc, ((wy * TS - camY) * zoom + ch / 2) * sc]
  const hole = (wx, wy, r, inten) => {
    const [sx, sy] = toS(wx, wy)
    const rr = r * TS * zoom * sc
    const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, rr)
    g.addColorStop(0, `rgba(0,0,0,${inten})`)
    g.addColorStop(0.5, `rgba(0,0,0,${inten * 0.6})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    dctx.fillStyle = g
    dctx.fillRect(sx - rr, sy - rr, rr * 2, rr * 2)
  }
  hole(p.x, p.y, hasTrait('catEyes') ? 5.5 : 4, 0.8)
  const fl = p.light && invFind('flashlight')
  if (fl) {
    const [sx, sy] = toS(p.x, p.y)
    const rr = 15 * TS * zoom * sc
    const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, rr)
    g.addColorStop(0, 'rgba(0,0,0,0.98)')
    g.addColorStop(0.65, 'rgba(0,0,0,0.8)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    dctx.fillStyle = g
    dctx.beginPath()
    dctx.moveTo(sx, sy)
    dctx.arc(sx, sy, rr, p.dir - 0.42, p.dir + 0.42)
    dctx.closePath()
    dctx.fill()
  }
  const lights = lightList()
  for (const l of lights) hole(l.x, l.y, l.r, l.i)
  dctx.globalCompositeOperation = 'source-over'
  const col = a * 0.17
  for (const l of lights) {
    const [sx, sy] = toS(l.x, l.y)
    const rr = l.r * TS * zoom * sc
    if (sx < -rr || sy < -rr || sx > dark.width + rr || sy > dark.height + rr) continue
    const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, rr)
    g.addColorStop(0, `rgba(${l.c[0]},${l.c[1]},${l.c[2]},${col})`)
    g.addColorStop(1, `rgba(${l.c[0]},${l.c[1]},${l.c[2]},0)`)
    dctx.fillStyle = g
    dctx.fillRect(sx - rr, sy - rr, rr * 2, rr * 2)
  }
  if (fl) {
    const [sx, sy] = toS(p.x, p.y)
    const rr = 15 * TS * zoom * sc
    const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, rr)
    g.addColorStop(0, `rgba(255,240,200,${a * 0.18})`)
    g.addColorStop(1, 'rgba(255,240,200,0)')
    dctx.fillStyle = g
    dctx.beginPath()
    dctx.moveTo(sx, sy)
    dctx.arc(sx, sy, rr, p.dir - 0.42, p.dir + 0.42)
    dctx.fill()
  }
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(dark, 0, 0, cw, ch)
  ctx.restore()
}

let vigC = null
function vignette() {
  if (vigC && vigC.width === Math.ceil(cw / 2) && vigC.height === Math.ceil(ch / 2)) return vigC
  vigC = makeCanvas(cw / 2, ch / 2)
  const g = vigC.getContext('2d')
  const w = vigC.width
  const h = vigC.height
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = v
  g.fillRect(0, 0, w, h)
  return vigC
}

function grade() {
  const dl = daylight()
  if (dl > 0 && dl < 1) {
    ctx.fillStyle = `rgba(255,140,70,${(1 - Math.abs(dl - 0.5) * 2) * 0.16})`
    ctx.fillRect(0, 0, cw, ch)
  }
  ctx.fillStyle = S.rain.on ? 'rgba(60,80,100,0.16)' : `rgba(255,220,170,${0.05 * dl})`
  ctx.fillRect(0, 0, cw, ch)
}

function drawRain(now) {
  if (rainDrops.length < 320) for (let i = 0; i < 320; i++) rainDrops.push({ x: Math.random(), y: Math.random(), s: rand(0.8, 1.3), l: rand(10, 18) })
  ctx.strokeStyle = 'rgba(180,200,220,0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const d of rainDrops) {
    const y = ((d.y + now * d.s * 1.5) % 1) * (ch + 40) - 20
    const x = ((d.x + now * 0.06 * d.s) % 1) * (cw + 40) - 20
    ctx.moveTo(x, y)
    ctx.lineTo(x - 3.5, y + d.l)
  }
  ctx.stroke()
}

function post(now) {
  const p = S.player
  ctx.drawImage(vignette(), 0, 0, cw, ch)
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
    ctx.font = '22px "Special Elite", monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`Dormindo... ${clockStr()}`, cw / 2, ch / 2)
    ctx.font = '14px "IBM Plex Mono", monospace'
    ctx.fillStyle = '#8f877a'
    ctx.fillText('Esc para acordar', cw / 2, ch / 2 + 28)
    ctx.textAlign = 'left'
  }
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

function syncHot() {
  const p = S.player
  if (!p.hot) p.hot = [null, null, null, null, null]
  for (let i = 0; i < 5; i++) if (p.hot[i] && !p.inv.includes(p.hot[i])) {
    const same = p.inv.find(x => x.id === p.hot[i].id && !p.hot.includes(x))
    p.hot[i] = same || null
  }
  for (const it of p.inv) {
    const d = ITEMS[it.id]
    if ((d.kind === 'weapon' || it.id === 'flashlight') && !p.hot.includes(it)) {
      const free = p.hot.indexOf(null)
      if (free >= 0) p.hot[free] = it
    }
  }
}

function useHot(i) {
  const p = S.player
  syncHot()
  const it = p.hot[i]
  if (!it) return log(`Atalho ${i + 1} vazio. Clique com o botão direito em um item para atribuir.`)
  sfx.ui()
  quickUse(it)
}

function quickUse(it) {
  const p = S.player
  const d = ITEMS[it.id]
  if (d.kind === 'weapon') {
    p.equip = p.equip === it ? null : it
    return
  }
  if (it.id === 'flashlight') return toggleLight()
  if (['food', 'drink', 'book', 'fun'].includes(d.kind) || ['painkillers', 'calm', 'antibiotics', 'vitamins', 'cigarettes', 'battery'].includes(it.id)) return consume(it)
  if (it.id === 'bandage' || it.id === 'rag') {
    const w = p.wounds.find(w => !w.bandage && w.bleed) || p.wounds.find(w => !w.bandage)
    if (!w) return log('Nenhum ferimento precisando de curativo.')
    return startAction('Fazendo curativo', Math.max(1, 3 - lvl('firstAid') * 0.2), () => {
      if (!invCount(it.id)) return
      removeQty(p.inv, it.id, 1)
      w.bandage = it.id === 'bandage' ? 'clean' : 'dirty'
      w.bleed = false
      addXP('firstAid', 4)
    })
  }
  if (it.id === 'disinfectant') {
    const w = p.wounds.find(w => !w.dis)
    if (!w) return log('Nenhum ferimento para desinfetar.')
    return startAction('Desinfetando', 2, () => {
      if (!useDisinfectant()) return
      w.dis = true
      w.inf = false
      addXP('firstAid', 3)
    })
  }
  log(`${d.name} não tem uso rápido.`)
}

function renderHotbar() {
  const p = S.player
  syncHot()
  const el = $('hotbar')
  el.innerHTML = p.hot.map((it, i) => {
    if (!it) return `<div class="slot empty"><i>${i + 1}</i></div>`
    const d = ITEMS[it.id]
    let bar = ''
    if (it.dur !== undefined && d.dur) bar = `<b style="width:${(it.dur / d.dur) * 100}%"></b>`
    else if (it.charge !== undefined) bar = `<b style="width:${it.charge}%"></b>`
    const q = d.mag ? `${it.ammo}/${d.mag}` : it.qty > 1 ? it.qty : ''
    const on = p.equip === it || (it.id === 'flashlight' && p.light)
    return `<div class="slot ${on ? 'on' : ''}" data-h="${i}" title="${d.name}"><i>${i + 1}</i><img src="${iconURL(it.id)}" alt=""><u>${q}</u>${bar ? `<s>${bar}</s>` : ''}</div>`
  }).join('')
}

function hideCtx() {
  $('ctx').classList.add('hidden')
}

function showCtx(x, y, title, entries) {
  const el = $('ctx')
  el.innerHTML = (title ? `<div class="ct">${title}</div>` : '') + entries.map((e, i) => e.hot ? `<div class="hotpick"><span>Atalho</span>${[0, 1, 2, 3, 4].map(n => `<button data-hk="${n}" class="${e.cur === n ? 'on' : ''}">${n + 1}</button>`).join('')}</div>` : `<button data-e="${i}" ${e.off ? 'disabled' : ''}>${e.key ? `<kbd>${e.key}</kbd>` : ''}${e.label}</button>`).join('')
  el.classList.remove('hidden')
  const r = el.getBoundingClientRect()
  el.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px'
  el.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px'
  el.onclick = ev => {
    const b = ev.target.closest('button')
    if (!b) return
    if (b.dataset.hk !== undefined) {
      const h = entries.find(e => e.hot)
      h.fn(+b.dataset.hk)
    } else entries[+b.dataset.e].fn()
    hideCtx()
    renderPanel()
    if (S.openCont) renderContainer()
    renderHotbar()
  }
}

function itemCtx(it, x, y, list) {
  const p = S.player
  const d = ITEMS[it.id]
  const E = []
  if (d.kind === 'food') E.push({ label: 'Comer', fn: () => consume(it) })
  if (d.kind === 'drink') E.push({ label: 'Beber', fn: () => consume(it) })
  if (['painkillers', 'calm', 'antibiotics', 'vitamins'].includes(it.id)) E.push({ label: 'Tomar', fn: () => consume(it) })
  if (d.kind === 'book' || d.kind === 'fun') E.push({ label: 'Ler', fn: () => consume(it) })
  if (it.id === 'cigarettes') E.push({ label: 'Fumar', fn: () => consume(it) })
  if (d.kind === 'weapon') E.push({ label: p.equip === it ? 'Guardar arma' : 'Equipar', fn: () => { p.equip = p.equip === it ? null : it } })
  if (list === p.inv && (it.id === 'bandage' || it.id === 'rag')) E.push({ label: 'Fazer curativo', fn: () => quickUse(it) })
  if (list === p.inv && it.id === 'disinfectant') E.push({ label: 'Desinfetar ferimento', fn: () => quickUse(it) })
  if (list === p.inv && it.id === 'battery' && invFind('flashlight')) E.push({ label: 'Trocar pilha da lanterna', fn: () => consume(it) })
  if (it.id === 'flashlight') E.push({ label: p.light ? 'Desligar lanterna' : 'Ligar lanterna', fn: toggleLight })
  if (list === p.inv) {
    E.push({ hot: true, cur: p.hot ? p.hot.indexOf(it) : -1, fn: n => { syncHot(); const j = p.hot.indexOf(it); if (j >= 0) p.hot[j] = null; p.hot[n] = it } })
    E.push({ label: 'Largar no chão', fn: () => { removeItem(p.inv, it); dropGround(Math.floor(p.x), Math.floor(p.y), it) } })
    if (S.openCont) E.push({ label: 'Guardar no recipiente', fn: () => transfer(p.inv, contItems(S.openCont), it, it.qty) })
  } else {
    E.push({ label: 'Pegar', fn: () => takeFromContainer(S.openCont, it, it.qty) })
    if (ITEMS[it.id].stack && it.qty > 1) E.push({ label: 'Pegar 1', fn: () => takeFromContainer(S.openCont, it, 1) })
  }
  showCtx(x, y, d.name, E)
}

function worldCtx(x, y) {
  const tg = target
  const E = []
  if (tg) {
    E.push({ key: 'E', label: tg.label, fn: interact })
    if (tg.kind === 'door' || tg.kind === 'window') {
      E.push({ key: 'B', label: 'Barricar (martelo, tábua e 2 pregos)', fn: () => barricade(false), off: !invFind('hammer') })
      const o = tg.kind === 'door' ? W.doors[tg.k] : W.windows[tg.k]
      if (o.bars.length) E.push({ label: 'Remover tábua', fn: () => barricade(true) })
    }
    if (tg.kind === 'dig') E.push({ key: 'G', label: 'Cavar canteiro', fn: dig })
  }
  E.push({ key: 'Tab', label: 'Inventário', fn: () => togglePanel('inv') })
  E.push({ key: 'J', label: 'Saúde', fn: () => togglePanel('health') })
  E.push({ key: 'O', label: 'Criação', fn: () => togglePanel('craft') })
  showCtx(x, y, tg ? null : 'Ações', E)
}

const MINI_COL = {}
let miniT = 0
function renderMinimap(dt) {
  miniT -= dt
  if (miniT > 0) return
  miniT = 0.2
  const c = $('minimap')
  const hidden = !$('panel').classList.contains('hidden') || !$('container').classList.contains('hidden')
  c.style.opacity = hidden ? 0 : 1
  if (hidden) return
  const g = c.getContext('2d')
  const N = 46
  const s = c.width / N
  const p = S.player
  const ox = Math.floor(p.x) - N / 2
  const oy = Math.floor(p.y) - N / 2
  if (!MINI_COL.ok) {
    Object.assign(MINI_COL, { [T.GRASS]: '#3a4a2c', [T.TREE]: '#24331e', [T.ROAD]: '#2a2b2e', [T.SIDEWALK]: '#5c5952', [T.PARKING]: '#333438', [T.WATER]: '#2a4a60', [T.DIRT]: '#5a4430', [T.FLOOR]: '#7a6650', [T.FURN]: '#6a5a46', [T.WALL]: '#c8bca8', [T.WINDOW]: '#8ab0c8', [T.DOOR]: '#a07a4a', [T.WOODWALL]: '#a07c4e', [T.CAR]: '#8a7a6a', ok: true })
  }
  g.fillStyle = '#07090c'
  g.fillRect(0, 0, c.width, c.height)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tx = ox + x
    const ty = oy + y
    if (!inb(tx, ty)) continue
    const k = idx(tx, ty)
    if (!S.seen[k]) continue
    g.fillStyle = MINI_COL[W.tiles[k]] || '#444'
    g.fillRect(x * s, y * s, s + 0.5, s + 0.5)
    if (!S.vis[k]) {
      g.fillStyle = 'rgba(7,9,12,0.45)'
      g.fillRect(x * s, y * s, s + 0.5, s + 0.5)
    }
  }
  const hb = W.buildings[W.home]
  g.strokeStyle = '#f0d070'
  g.lineWidth = 1.5
  g.strokeRect((hb.x - ox) * s, (hb.y - oy) * s, hb.w * s, hb.h * s)
  g.fillStyle = '#e0483a'
  for (const z of S.zombies) {
    const zx = (z.x - ox) * s
    const zy = (z.y - oy) * s
    if (zx < 0 || zy < 0 || zx > c.width || zy > c.height) continue
    if (!S.vis[idx(Math.floor(z.x), Math.floor(z.y))]) continue
    g.beginPath()
    g.arc(zx, zy, 2.2, 0, Math.PI * 2)
    g.fill()
  }
  const px = (p.x - ox) * s
  const py = (p.y - oy) * s
  g.save()
  g.translate(px, py)
  g.rotate(p.dir)
  g.fillStyle = '#f0d070'
  g.beginPath()
  g.moveTo(6, 0)
  g.lineTo(-4, -4)
  g.lineTo(-2, 0)
  g.lineTo(-4, 4)
  g.closePath()
  g.fill()
  g.restore()
}

function drawMarkers(now) {
  const p = S.player
  const inside = playerBuilding()
  const pulse = 0.6 + Math.sin(now * 4) * 0.4
  const R = 8
  const mark = (x, y, fresh) => {
    if (fresh) {
      ctx.fillStyle = `rgba(255,214,110,${0.55 + pulse * 0.45})`
      ctx.beginPath()
      ctx.moveTo(x, y - 4)
      ctx.lineTo(x + 3, y)
      ctx.lineTo(x, y + 4)
      ctx.lineTo(x - 3, y)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(40,30,10,0.7)'
      ctx.lineWidth = 0.8
      ctx.stroke()
    } else {
      ctx.fillStyle = 'rgba(240,236,224,0.75)'
      ctx.beginPath()
      ctx.arc(x, y, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const x0 = Math.floor(p.x - R)
  const y0 = Math.floor(p.y - R)
  for (let y = y0; y <= y0 + R * 2; y++) for (let x = x0; x <= x0 + R * 2; x++) {
    if (!inb(x, y)) continue
    const k = idx(x, y)
    if (!S.vis[k] || W.tiles[k] !== T.FURN) continue
    const b = W.bld[k]
    if (b >= 0 && b !== inside) continue
    const f = W.furn[k]
    const def = FURN[f.kind]
    if (!def.loot && f.kind !== 'crate') continue
    if (f.items && !f.items.length) continue
    mark(x * TS + 16, y * TS - FURN_LIFT + 2 - Math.sin(now * 3 + x) * 1.5, f.items === null)
  }
  for (const c of W.cars) {
    const cx = c.horiz ? c.x + 1 : c.x + 0.5
    const cy = c.horiz ? c.y + 0.5 : c.y + 1
    if (Math.abs(cx - p.x) > R || Math.abs(cy - p.y) > R || !S.vis[idx(c.x, c.y)]) continue
    if (c.items && !c.items.length) continue
    mark(cx * TS, cy * TS - 12, c.items === null)
  }
  for (const c of S.corpses) {
    if (!c.items.length || Math.abs(c.x - p.x) > R || Math.abs(c.y - p.y) > R) continue
    if (!S.vis[idx(Math.floor(c.x), Math.floor(c.y))]) continue
    mark(c.x * TS, c.y * TS - 14, false)
  }
  if (target && !S.sleeping && !p.action) {
    const tx = target.x * TS
    const ty = target.y * TS - (target.kind === 'corpse' ? 24 : 34)
    ctx.fillStyle = 'rgba(14,16,20,0.85)'
    ctx.beginPath()
    ctx.roundRect(tx - 7, ty - 7, 14, 14, 3)
    ctx.fill()
    ctx.strokeStyle = 'rgba(216,178,90,0.9)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#f0e6c8'
    ctx.font = 'bold 9px "IBM Plex Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('E', tx, ty + 0.5)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
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
  renderHotbar()
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
    [T.CAR]: '#7a6a5a', [T.GRASS]: '#33402a', [T.ROAD]: '#25262a', [T.SIDEWALK]: '#55534d', [T.FLOOR]: '#6a5a48', [T.WALL]: '#a09484', [T.DOOR]: '#8a6a42', [T.WINDOW]: '#7aa0b8', [T.TREE]: '#1f2e1a', [T.WATER]: '#2a4a60', [T.FURN]: '#6a5a48', [T.DIRT]: '#5a4430', [T.WOODWALL]: '#a07c4e', [T.PARKING]: '#333438'
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
    cars: W.cars.map(c => c.items),
    S: {
      settings: S.settings, time: S.time, zombies: S.zombies.map(z => ({ ...z, hit: 0 })), corpses: S.corpses.slice(-150), ground: S.ground,
      blood: S.blood.filter(b => b.r >= 0.1).slice(-250), kills: S.kills, powerOff: S.powerOff, waterOff: S.waterOff, powerOffAt: S.powerOffAt, waterOffAt: S.waterOffAt,
      heli: S.heli, rain: S.rain, alarms: S.alarms,
      player: { ...p, action: null, equipIdx: p.inv.indexOf(p.equip), equip: null, hot: null, hotIdx: (p.hot || []).map(h => p.inv.indexOf(h)) }
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
  if (data.cars) W.cars.forEach((c, i) => (c.items = data.cars[i] || null))
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
  p.hot = (p.hotIdx || []).map(i => (i >= 0 ? p.inv[i] || null : null))
  while (p.hot.length < 5) p.hot.push(null)
  delete p.hotIdx
  delete p.equipIdx
  log(`Bem-vindo de volta. Dia ${dayNum()}, ${clockStr()}.`, 'warn')
  return true
}

function startGame() {
  $('menu').classList.add('hidden')
  $('hud').classList.remove('hidden')
  camX = S.player.x * TS
  camY = S.player.y * TS
  initGfx()
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
  const SHIRT_OPTS = ['#3d5f7a', '#7a3a32', '#4a6a3a', '#8a7a4a', '#5a4a6a', '#2e2e32', '#b8b2a4']
  const HAIR_OPTS = ['#3a2a1c', '#1a1a1a', '#6e4a2a', '#b08a50', '#8a3a1a', '#9a9a92']
  const SKIN_OPTS = ['#f0c8a0', '#d2a882', '#b07a52', '#8a5a3a', '#5e3c26']
  const sel = { prof: 'unemployed', traits: [], look: { shirt: SHIRT_OPTS[0], pants: '#2f3440', skin: SKIN_OPTS[1], hair: 1, hairColor: HAIR_OPTS[0], outfit: 'jacket' } }
  const draw = () => {
    const prof = PROFESSIONS.find(p => p.id === sel.prof)
    const pts = prof.points - sel.traits.reduce((a, t) => a + TRAITS.find(x => x.id === t).cost, 0)
    m.innerHTML = `
      <div class="creator">
        <h2>Novo sobrevivente</h2>
        <div class="grid">
          <section>
            <label>Nome<input id="cname" maxlength="24" value="${sel.name || ''}" placeholder="Sobrevivente"></label>
            <h3>Aparência</h3>
            <canvas id="preview" width="240" height="160"></canvas>
            <div class="looks">
              <div><span>Estilo</span>${[['Jaqueta', 'jacket'], ['Moletom', 'hoodie'], ['Camiseta', 'tshirt'], ['Flanela', 'flannel'], ['Regata', 'tank']].map(([n, v]) => `<button class="${sel.look.outfit === v ? 'on' : ''}" data-of="${v}">${n}</button>`).join('')}</div>
              <div><span>Cor</span>${SHIRT_OPTS.map(c => `<button class="sw ${sel.look.shirt === c ? 'on' : ''}" data-shirt="${c}" style="background:${c}"></button>`).join('')}</div>
              <div><span>Pele</span>${SKIN_OPTS.map(c => `<button class="sw ${sel.look.skin === c ? 'on' : ''}" data-skin="${c}" style="background:${c}"></button>`).join('')}</div>
              <div><span>Cabelo</span>${HAIR_OPTS.map(c => `<button class="sw ${sel.look.hairColor === c ? 'on' : ''}" data-hc="${c}" style="background:${c}"></button>`).join('')}</div>
              <div><span>Corte</span>${[['Raspado', 0], ['Curto', 1], ['Bagunçado', 3], ['Longo', 2]].map(([n, v]) => `<button class="${sel.look.hair === v ? 'on' : ''}" data-hs="${v}">${n}</button>`).join('')}</div>
            </div>
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
    const pv = $('preview')
    const pg = pv.getContext('2d')
    let pvT = 0
    const drawPv = () => {
      if (!document.body.contains(pv)) return
      pvT += 0.12
      pg.setTransform(1, 0, 0, 1, 0, 0)
      pg.clearRect(0, 0, pv.width, pv.height)
      pg.setTransform(2.6, 0, 0, 2.6, 70, 80)
      drawChar(pg, { x: 0, y: 0, dir: Math.PI / 2, phase: pvT, moving: true, outfit: sel.look.outfit, shirt: sel.look.shirt, pants: sel.look.pants, skin: sel.look.skin, hair: sel.look.hair, hairColor: sel.look.hairColor, gore: 3, weapon: null })
      pg.setTransform(2.6, 0, 0, 2.6, 170, 80)
      drawChar(pg, { x: 0, y: 0, dir: Math.PI / 2 + 0.3, phase: pvT * 0.6, moving: true, reach: true, zombie: true, outfit: 'flannel', shirt: '#5a4b4b', pants: '#3a3a30', skin: '#8a9a78', hair: 3, hairColor: '#4a3220', gore: 77 })
      requestAnimationFrame(drawPv)
    }
    if (!pv.dataset.on) {
      pv.dataset.on = '1'
      requestAnimationFrame(drawPv)
    }
    m.querySelectorAll('[data-of]').forEach(b => (b.onclick = () => { sel.name = $('cname').value; sel.look.outfit = b.dataset.of; draw() }))
    m.querySelectorAll('[data-shirt]').forEach(b => (b.onclick = () => { sel.name = $('cname').value; sel.look.shirt = b.dataset.shirt; draw() }))
    m.querySelectorAll('[data-skin]').forEach(b => (b.onclick = () => { sel.name = $('cname').value; sel.look.skin = b.dataset.skin; draw() }))
    m.querySelectorAll('[data-hc]').forEach(b => (b.onclick = () => { sel.name = $('cname').value; sel.look.hairColor = b.dataset.hc; draw() }))
    m.querySelectorAll('[data-hs]').forEach(b => (b.onclick = () => { sel.name = $('cname').value; sel.look.hair = +b.dataset.hs; draw() }))
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
        look: sel.look,
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
          <li><kbd>1</kbd>–<kbd>5</kbd> barra rápida · <kbd>Botão direito</kbd> menu de ações</li>
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
  const v = getVolumes()
  el.innerHTML = `<div class="card small-card"><h2>Pausado</h2>
    <div class="vols">
      <label>Volume geral<input type="range" id="vmaster" min="0" max="1" step="0.05" value="${v.master}"></label>
      <label>Música<input type="range" id="vmusic" min="0" max="1" step="0.05" value="${v.music}"></label>
      <label>Efeitos<input type="range" id="vsfx" min="0" max="1" step="0.05" value="${v.sfx}"></label>
    </div>
    <div class="mbtns">
    <button id="resume" class="primary">Continuar</button>
    <button id="psave">Salvar</button>
    <button id="phelp">Como jogar</button>
    <button id="pquit">Salvar e sair</button></div></div>`
  for (const [id, key] of [['vmaster', 'master'], ['vmusic', 'music'], ['vsfx', 'sfx']]) $(id).oninput = e => setVolumes({ [key]: +e.target.value })
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
    if (!$('ctx').classList.contains('hidden')) return hideCtx()
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
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
    case 'Digit4':
    case 'Digit5': useHot(+e.code.slice(5) - 1); break
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
  if (!$('ctx').classList.contains('hidden')) return
  if (e.button === 0) {
    mouse.down = true
    playerAttack(false)
  }
})
window.addEventListener('mouseup', () => { mouse.down = false })
canvas.addEventListener('contextmenu', e => {
  e.preventDefault()
  if (!S || S.over || paused()) return
  mouse.sx = e.clientX
  mouse.sy = e.clientY
  worldCtx(e.clientX, e.clientY)
})
document.addEventListener('mousedown', e => {
  if (!e.target.closest('#ctx')) hideCtx()
})
for (const id of ['panel', 'container']) {
  document.getElementById(id).addEventListener('contextmenu', e => {
    const li = e.target.closest('li')
    if (!li || !S) return
    e.preventDefault()
    if (li.dataset.pi !== undefined) {
      const it = S.player.inv[+li.dataset.pi]
      if (it) itemCtx(it, e.clientX, e.clientY, S.player.inv)
    } else if (li.dataset.ci !== undefined && S.openCont) {
      const it = contItems(S.openCont)[+li.dataset.ci]
      if (it) itemCtx(it, e.clientX, e.clientY, null)
    }
  })
}
document.getElementById('hotbar').addEventListener('mousedown', e => {
  const sl = e.target.closest('[data-h]')
  if (!sl || !S) return
  e.preventDefault()
  e.stopPropagation()
  if (e.button === 2) {
    const it = S.player.hot[+sl.dataset.h]
    if (it) itemCtx(it, e.clientX, e.clientY - 120, S.player.inv)
  } else useHot(+sl.dataset.h)
})
document.getElementById('hotbar').addEventListener('contextmenu', e => e.preventDefault())
canvas.addEventListener('wheel', e => {
  e.preventDefault()
  zoom = clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.7, 2.8)
}, { passive: false })
window.addEventListener('beforeunload', () => save())
document.addEventListener('visibilitychange', () => { if (document.hidden) save() })

function frame(t) {
  const realDt = Math.min(0.05, (t - lastFrame) / 1000)
  lastFrame = t
  if (S && !paused()) {
    if (mouse.down && !S.player.action && currentWeapon().def.cat !== 'gun') playerAttack(false)
    if (S.hitstop > 0) S.hitstop -= realDt
    else update(realDt)
    S.shake = (S.shake || 0) * Math.exp(-realDt * 13)
  }
  render()
  hudTimer -= realDt
  if (S && hudTimer <= 0) {
    hudTimer = 0.15
    renderHud(false)
  }
  if (S && !S.over) renderMinimap(realDt)
  requestAnimationFrame(frame)
}

if (location.search.includes('debug')) window.__vm = { get S() { return S }, get W() { return W }, save }
showMenu()
requestAnimationFrame(frame)
