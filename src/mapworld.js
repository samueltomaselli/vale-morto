import { T, mulberry32 } from './world.js'

const W4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function unrle(s, n, Ctor) {
  const out = new Ctor(n)
  let i = 0
  for (const part of s.split(',')) {
    const star = part.indexOf('*')
    if (star < 0) out[i++] = +part
    else {
      const v = +part.slice(0, star)
      const c = +part.slice(star + 1)
      out.fill(v, i, i + c)
      i += c
    }
  }
  return out
}

const FLOOR_OF = { house: 0, apartments: 0, shed: 3, store: 1, market: 1, pharmacy: 1, hardware: 3, police: 3, clinic: 1, school: 1, church: 0, mall: 1, bakery: 1, restaurant: 1, office: 0, industrial: 3, fuel: 1 }
const WINDOW_P = { house: 0.4, apartments: 0.45, shed: 0.05, store: 0.55, market: 0.4, pharmacy: 0.5, hardware: 0.35, police: 0.3, clinic: 0.35, school: 0.45, church: 0.3, mall: 0.12, bakery: 0.55, restaurant: 0.55, office: 0.45, industrial: 0.08, fuel: 0.5 }
const ROOM_MIN = { house: 4, apartments: 4, shed: 99, store: 7, market: 12, pharmacy: 9, hardware: 10, police: 5, clinic: 5, school: 6, church: 99, mall: 7, bakery: 7, restaurant: 7, office: 5, industrial: 10, fuel: 7 }
const ROOM_MAX = { house: 7, apartments: 6, shed: 99, store: 14, market: 40, pharmacy: 18, hardware: 24, police: 8, clinic: 8, school: 10, church: 99, mall: 13, bakery: 12, restaurant: 12, office: 8, industrial: 22, fuel: 12 }
export const LABELS = { school: 'COLÉGIO', church: '', mall: 'SHOPPING', market: 'MERCADO', pharmacy: 'FARMÁCIA', hardware: 'FERRAGENS', police: 'DELEGACIA', clinic: 'POSTO DE SAÚDE', bakery: 'PADARIA', fuel: 'POSTO', restaurant: 'LANCHONETE', office: '', store: '', industrial: '' }

const MALL_UNITS = ['market', 'pharmacy', 'clothes', 'food', 'store', 'clothes', 'store', 'hardware']

export function createWorldFromMap(data, seed) {
  const rng = mulberry32(seed)
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1))
  const pick = arr => arr[Math.floor(rng() * arr.length)]
  const W = data.w
  const H = data.h
  const N = W * H
  const base = unrle(data.base, N, Uint8Array)
  const flags = unrle(data.flags, N, Uint8Array)
  const bmask = unrle(data.bld, N, Int32Array)
  const world = {
    seed, w: W, h: H, map: data.name, credit: data.credit,
    tiles: new Uint8Array(N),
    floor: new Uint8Array(N),
    bld: new Int32Array(N).fill(-1),
    shade: new Uint8Array(N),
    doors: {}, windows: {}, furn: {}, plots: {},
    buildings: [], roadLines: data.roadLines || [], spawn: null,
    cars: [], carAt: {}, carBase: {}, lamps: []
  }
  const idx = (x, y) => y * W + x
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H
  const get = (x, y) => (inb(x, y) ? world.tiles[idx(x, y)] : T.TREE)
  const set = (x, y, t) => { if (inb(x, y)) world.tiles[idx(x, y)] = t }
  for (let i = 0; i < N; i++) world.shade[i] = Math.floor(rng() * 4)
  world.tiles.set(base)

  for (let k = 0; k < N; k++) {
    if (bmask[k] || world.tiles[k] !== T.GRASS) continue
    const f = flags[k]
    if (f === 2 && rng() < 0.42) world.tiles[k] = T.TREE
    else if (f === 1 && rng() < 0.035) world.tiles[k] = T.TREE
  }
  for (const [x, y] of data.trees || []) {
    const k = idx(x, y)
    if (!bmask[k] && (world.tiles[k] === T.GRASS || world.tiles[k] === T.PLAZA)) world.tiles[k] = T.TREE
  }

  const tilesOf = new Map()
  for (let k = 0; k < N; k++) {
    const id = bmask[k]
    if (!id) continue
    let a = tilesOf.get(id)
    if (!a) tilesOf.set(id, (a = []))
    a.push(k)
  }

  const outsideWalk = t => t === T.SIDEWALK || t === T.PLAZA || t === T.ROAD || t === T.PARKING || t === T.GRASS || t === T.DIRT
  const doorScore = t => (t === T.SIDEWALK || t === T.PLAZA ? 3 : t === T.PARKING ? 2.5 : t === T.ROAD ? 1.5 : 1)

  function placeFurn(x, y, kind) {
    set(x, y, T.FURN)
    world.furn[idx(x, y)] = { kind, items: null }
  }

  let bid = 0
  const order = [...tilesOf.keys()].sort((a, b) => a - b)
  for (const mid of order) {
    const list = tilesOf.get(mid)
    const meta = data.buildings[mid - 1]
    let type = meta.t
    let x0 = W
    let y0 = H
    let x1 = 0
    let y1 = 0
    for (const k of list) {
      const x = k % W
      const y = (k / W) | 0
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
    const inM = (x, y) => inb(x, y) && bmask[idx(x, y)] === mid
    if (list.length < 10) {
      for (const k of list) world.tiles[k] = T.WALL
      continue
    }
    if (type === 'house' && list.length > 260) type = 'apartments'
    if (type === 'house' && list.length < 30) type = 'shed'
    const id = bid++
    const b = { id, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, type, name: meta.n || '', rooms: [], area: list.length, real: true }
    world.buildings.push(b)
    const fl = FLOOR_OF[type] ?? 0
    for (const k of list) {
      const x = k % W
      const y = (k / W) | 0
      world.bld[k] = id
      let edge = false
      for (const [dx, dy] of W4) if (!inM(x + dx, y + dy)) edge = true
      world.tiles[k] = edge ? T.WALL : T.FLOOR
      world.floor[k] = fl
    }
    for (const k of list) {
      if (world.tiles[k] !== T.FLOOR) continue
      const x = k % W
      const y = (k / W) | 0
      let walls = 0
      for (const [dx, dy] of W4) if (get(x + dx, y + dy) === T.WALL) walls++
      if (walls >= 4) world.tiles[k] = T.WALL
    }
    const floorCount = list.reduce((a, k) => a + (world.tiles[k] === T.FLOOR ? 1 : 0), 0)
    if (floorCount < 4) {
      for (const k of list) world.tiles[k] = T.WALL
      b.solid = true
      continue
    }

    const straight = (x, y) => {
      const h = get(x - 1, y) === T.WALL && get(x + 1, y) === T.WALL && inM(x - 1, y) && inM(x + 1, y)
      const v = get(x, y - 1) === T.WALL && get(x, y + 1) === T.WALL && inM(x, y - 1) && inM(x, y + 1)
      return h || v
    }
    const cands = []
    for (const k of list) {
      if (world.tiles[k] !== T.WALL) continue
      const x = k % W
      const y = (k / W) | 0
      if (!straight(x, y)) continue
      for (const [dx, dy] of W4) {
        const ix = x - dx
        const iy = y - dy
        const ox = x + dx
        const oy = y + dy
        if (!inM(ix, iy) || get(ix, iy) !== T.FLOOR) continue
        if (inM(ox, oy) || !inb(ox, oy)) continue
        if (bmask[idx(ox, oy)]) continue
        const ot = get(ox, oy)
        if (!outsideWalk(ot)) continue
        cands.push({ x, y, k, in: [ix, iy], out: [ox, oy], s: doorScore(ot) + rng() * 0.4 })
      }
    }
    cands.sort((a, c) => c.s - a.s)
    const doors = []
    const wantDoors = type === 'mall' ? 4 : type === 'school' || type === 'industrial' || type === 'market' ? 3 : type === 'house' || type === 'shed' ? (rng() < 0.45 ? 2 : 1) : 2
    for (const c of cands) {
      if (doors.length >= wantDoors) break
      if (doors.some(d => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) < (doors.length ? Math.max(8, Math.sqrt(list.length) * 0.6) : 0))) continue
      doors.push(c)
    }
    const shopLock = type === 'house' || type === 'apartments' ? 0.3 : type === 'shed' ? 0.35 : 0.45
    doors.forEach((d, i) => {
      world.tiles[d.k] = T.DOOR
      world.doors[d.k] = { open: false, hp: type === 'mall' || type === 'police' ? 160 : 100, locked: rng() < (i === 0 ? shopLock : 0.6), bar: 0, broken: false, bars: [] }
    })
    if (!doors.length) b.sealed = true

    const nearOpen = (x, y) => W4.some(([dx, dy]) => {
      const t = get(x + dx, y + dy)
      return t === T.DOOR || t === T.WINDOW
    })
    const wp = WINDOW_P[type] ?? 0.3
    for (const c of cands) {
      if (world.tiles[c.k] !== T.WALL) continue
      if (nearOpen(c.x, c.y)) continue
      if (rng() < wp) {
        world.tiles[c.k] = T.WINDOW
        world.windows[c.k] = { state: 'closed', hp: 30, bar: 0, curtain: (type === 'house' || type === 'apartments') && rng() < 0.45, bars: [], cleared: false }
      }
    }

    const doorIn = new Set(doors.map(d => idx(d.in[0], d.in[1])))
    const rmin = ROOM_MIN[type] ?? 6
    const rmax = ROOM_MAX[type] ?? 10
    const rooms = []
    const split = (rx, ry, rw, rh, depth) => {
      const canV = rw >= rmin * 2 + 1
      const canH = rh >= rmin * 2 + 1
      const big = rw > rmax || rh > rmax
      if ((!canV && !canH) || (!big && rng() < 0.35) || depth > 9) {
        rooms.push({ x: rx, y: ry, w: rw, h: rh })
        return
      }
      const vert = canV && (!canH || rw > rh || (rw === rh && rng() < 0.5))
      if (vert) {
        const sx = rx + ri(rmin, rw - rmin - 1)
        let placed = 0
        const line = []
        for (let y = ry; y < ry + rh; y++) {
          const k = idx(sx, y)
          if (!inM(sx, y) || world.tiles[k] !== T.FLOOR || doorIn.has(k) || nearOpen(sx, y)) {
            line.push(null)
            continue
          }
          world.tiles[k] = T.WALL
          line.push(k)
          placed++
        }
        if (placed) {
          const opts = line.filter(k => k !== null && get((k % W) - 1, (k / W) | 0) === T.FLOOR && get((k % W) + 1, (k / W) | 0) === T.FLOOR)
          const n = opts.length > 14 ? 2 : 1
          for (let i = 0; i < n && opts.length; i++) {
            const k = opts.splice(Math.floor(rng() * opts.length), 1)[0]
            world.tiles[k] = T.DOOR
            world.doors[k] = { open: true, hp: 60, locked: false, bar: 0, broken: false, bars: [], inner: true }
          }
        }
        split(rx, ry, sx - rx, rh, depth + 1)
        split(sx + 1, ry, rx + rw - sx - 1, rh, depth + 1)
      } else {
        const sy = ry + ri(rmin, rh - rmin - 1)
        let placed = 0
        const line = []
        for (let x = rx; x < rx + rw; x++) {
          const k = idx(x, sy)
          if (!inM(x, sy) || world.tiles[k] !== T.FLOOR || doorIn.has(k) || nearOpen(x, sy)) {
            line.push(null)
            continue
          }
          world.tiles[k] = T.WALL
          line.push(k)
          placed++
        }
        if (placed) {
          const opts = line.filter(k => k !== null && get(k % W, ((k / W) | 0) - 1) === T.FLOOR && get(k % W, ((k / W) | 0) + 1) === T.FLOOR)
          const n = opts.length > 14 ? 2 : 1
          for (let i = 0; i < n && opts.length; i++) {
            const k = opts.splice(Math.floor(rng() * opts.length), 1)[0]
            world.tiles[k] = T.DOOR
            world.doors[k] = { open: true, hp: 60, locked: false, bar: 0, broken: false, bars: [], inner: true }
          }
        }
        split(rx, ry, rw, sy - ry, depth + 1)
        split(rx, sy + 1, rw, ry + rh - sy - 1, depth + 1)
      }
    }
    if (type !== 'church' && type !== 'shed') split(x0 + 1, y0 + 1, b.w - 2, b.h - 2, 0)
    else rooms.push({ x: x0 + 1, y: y0 + 1, w: b.w - 2, h: b.h - 2 })

    const floodFrom = starts => {
      const seen = new Set()
      const q = []
      for (const s of starts) {
        if (world.tiles[s] === T.FLOOR || world.tiles[s] === T.DOOR) {
          seen.add(s)
          q.push(s)
        }
      }
      while (q.length) {
        const k = q.pop()
        const x = k % W
        const y = (k / W) | 0
        for (const [dx, dy] of W4) {
          const nx = x + dx
          const ny = y + dy
          if (!inM(nx, ny)) continue
          const nk = idx(nx, ny)
          if (seen.has(nk)) continue
          const t = world.tiles[nk]
          if (t === T.FLOOR || (t === T.DOOR && world.doors[nk] && world.doors[nk].inner)) {
            seen.add(nk)
            q.push(nk)
          }
        }
      }
      return seen
    }
    const starts = doors.map(d => idx(d.in[0], d.in[1]))
    if (starts.length) {
      for (let guard = 0; guard < 60; guard++) {
        const reach = floodFrom(starts)
        const lost = list.find(k => world.tiles[k] === T.FLOOR && !reach.has(k))
        if (lost === undefined) break
        let fixed = false
        for (const k of list) {
          if (world.tiles[k] !== T.WALL) continue
          const x = k % W
          const y = (k / W) | 0
          const pairs = [[[x - 1, y], [x + 1, y]], [[x, y - 1], [x, y + 1]]]
          for (const [[ax, ay], [bx, by]] of pairs) {
            if (!inM(ax, ay) || !inM(bx, by)) continue
            const ka = idx(ax, ay)
            const kb = idx(bx, by)
            if (world.tiles[ka] !== T.FLOOR || world.tiles[kb] !== T.FLOOR) continue
            if (reach.has(ka) !== reach.has(kb)) {
              world.tiles[k] = T.DOOR
              world.doors[k] = { open: true, hp: 60, locked: false, bar: 0, broken: false, bars: [], inner: true }
              fixed = true
              break
            }
          }
          if (fixed) break
        }
        if (!fixed) {
          const reach2 = floodFrom(starts)
          for (const k of list) if (world.tiles[k] === T.FLOOR && !reach2.has(k)) world.tiles[k] = T.WALL
          break
        }
      }
    }

    const roomTiles = r => {
      const out = []
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (inM(x, y) && get(x, y) === T.FLOOR) out.push([x, y])
      return out
    }
    const against = (x, y) => W4.some(([dx, dy]) => {
      const t = get(x + dx, y + dy)
      return t === T.WALL || t === T.WINDOW
    })
    const reach0 = starts.length ? floodFrom(starts) : null
    const safePlace = (x, y, kind) => {
      if (get(x, y) !== T.FLOOR || nearOpen(x, y) || doorIn.has(idx(x, y))) return false
      placeFurn(x, y, kind)
      if (reach0) {
        const r = floodFrom(starts)
        let ok = true
        for (const k of list) if (world.tiles[k] === T.FLOOR && reach0.has(k) && !r.has(k)) {
          ok = false
          break
        }
        if (!ok) {
          set(x, y, T.FLOOR)
          delete world.furn[idx(x, y)]
          return false
        }
      }
      return true
    }
    const wallKit = (r, kinds) => {
      const t = roomTiles(r).filter(([x, y]) => against(x, y))
      for (let i = t.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[t[i], t[j]] = [t[j], t[i]]
      }
      for (const kind of kinds) {
        while (t.length) {
          const [x, y] = t.pop()
          if (safePlace(x, y, kind)) break
        }
      }
    }
    const rows = (r, kind, every = 2, fill = 0.85) => {
      const horiz = r.w >= r.h
      for (let y = r.y + 2; y < r.y + r.h - 2; y++) {
        for (let x = r.x + 2; x < r.x + r.w - 2; x++) {
          const line = horiz ? (y - r.y) % every === 0 : (x - r.x) % every === 0
          const gapTile = horiz ? (x - r.x) % 7 === 3 : (y - r.y) % 7 === 3
          if (!line || gapTile || rng() > fill) continue
          if (!inM(x, y) || get(x, y) !== T.FLOOR || nearOpen(x, y) || doorIn.has(idx(x, y))) continue
          if (W4.some(([dx, dy]) => get(x + dx, y + dy) === T.DOOR)) continue
          placeFurn(x, y, kind)
        }
      }
    }
    const kits = {
      house: [['fridge', 'counter', 'stove', 'sink', 'counter'], ['bed', 'wardrobe', 'cabinet', 'shelf'], ['sofa', 'shelf', 'table'], ['bed', 'wardrobe'], ['toolbox', 'shelf']],
      office: [['table', 'table', 'shelf', 'cabinet'], ['table', 'shelf'], ['counter', 'fridge', 'sink']],
      police: [['locker', 'locker', 'cabinet'], ['table', 'shelf'], ['locker', 'table'], ['bed', 'sink']],
      clinic: [['bed', 'medrack', 'cabinet'], ['medrack', 'medrack', 'counter'], ['bed', 'cabinet', 'sink'], ['table', 'shelf']],
      school: [['blackboard'], ['blackboard'], ['counter', 'fridge', 'stove', 'sink'], ['shelf', 'shelf', 'table', 'cabinet']]
    }
    const roomList = rooms.filter(r => roomTiles(r).length > 3)
    b.rooms = roomList
    roomList.sort((a, c) => c.w * c.h - a.w * a.h)
    const furnishMall = r => {
      const unit = pick(MALL_UNITS)
      if (unit === 'market') {
        rows(r, 'rack')
        wallKit(r, ['counter', 'fridge'])
      } else if (unit === 'pharmacy') {
        rows(r, 'medrack', 2, 0.7)
        wallKit(r, ['counter', 'cabinet'])
      } else if (unit === 'clothes') {
        rows(r, 'clothrack', 3, 0.7)
        wallKit(r, ['counter', 'wardrobe'])
      } else if (unit === 'food') {
        wallKit(r, ['counter', 'stove', 'fridge', 'sink', 'counter'])
        rows(r, 'table', 3, 0.6)
      } else if (unit === 'hardware') {
        rows(r, 'toolrack', 2, 0.7)
        wallKit(r, ['counter'])
      } else {
        rows(r, 'shelf', 3, 0.6)
        wallKit(r, ['counter', 'shelf'])
      }
    }
    roomList.forEach((r, i) => {
      switch (type) {
        case 'house':
        case 'apartments': {
          const kit = kits.house[i % kits.house.length]
          wallKit(r, kit)
          if (i === 0) for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) if (inM(x, y) && world.tiles[idx(x, y)] === T.FLOOR && world.floor[idx(x, y)] === 0) world.floor[idx(x, y)] = 1
          break
        }
        case 'shed':
          wallKit(r, ['shedbox', 'shedbox', 'toolbox'])
          break
        case 'market':
          rows(r, 'rack')
          wallKit(r, ['counter', 'fridge', 'fridge', 'counter'])
          break
        case 'pharmacy':
          rows(r, 'medrack', 2, 0.75)
          wallKit(r, ['counter', 'cabinet', 'sink'])
          break
        case 'hardware':
          rows(r, 'toolrack', 2, 0.75)
          wallKit(r, ['counter', 'toolbox'])
          break
        case 'bakery':
          wallKit(r, i === 0 ? ['breadrack', 'breadrack', 'counter', 'fridge', 'counter'] : ['stove', 'stove', 'sink', 'fridge'])
          if (i === 0) rows(r, 'table', 3, 0.5)
          break
        case 'restaurant':
          wallKit(r, i === 0 ? ['counter', 'fridge', 'counter'] : ['stove', 'stove', 'sink', 'fridge', 'counter'])
          if (i === 0) rows(r, 'table', 3, 0.6)
          break
        case 'fuel':
          rows(r, 'rack', 2, 0.6)
          wallKit(r, ['counter', 'fridge', 'fridge'])
          break
        case 'store':
          if (rng() < 0.5) rows(r, 'clothrack', 3, 0.7)
          else rows(r, 'shelf', 3, 0.6)
          wallKit(r, ['counter', 'shelf'])
          break
        case 'mall':
          furnishMall(r)
          break
        case 'industrial':
          rows(r, 'crate', 3, 0.5)
          wallKit(r, ['toolrack', 'shedbox', 'toolbox', 'shedbox'])
          break
        case 'church': {
          const horiz = r.w >= r.h
          for (let y = r.y + 2; y < r.y + r.h - 2; y++) {
            for (let x = r.x + 2; x < r.x + r.w - 2; x++) {
              const along = horiz ? x - r.x : y - r.y
              const across = horiz ? y - r.y : x - r.x
              const span = horiz ? r.h : r.w
              const mid = Math.floor(span / 2)
              if (along < 4 || along % 2) continue
              if (Math.abs(across - mid) <= 1) continue
              if (!inM(x, y) || get(x, y) !== T.FLOOR || nearOpen(x, y)) continue
              if (W4.some(([dx, dy]) => get(x + dx, y + dy) === T.DOOR)) continue
              placeFurn(x, y, 'pew')
            }
          }
          const ax = horiz ? r.x + 1 : r.x + Math.floor(r.w / 2)
          const ay = horiz ? r.y + Math.floor(r.h / 2) : r.y + 1
          if (get(ax, ay) === T.FLOOR) safePlace(ax, ay, 'altar')
          wallKit(r, ['cabinet', 'shelf'])
          break
        }
        case 'school': {
          if (r.w >= 6 && r.h >= 6 && i % 4 < 2) {
            for (let y = r.y + 2; y < r.y + r.h - 1; y += 2) for (let x = r.x + 2; x < r.x + r.w - 2; x += 2) {
              if (!inM(x, y) || get(x, y) !== T.FLOOR || nearOpen(x, y)) continue
              if (W4.some(([dx, dy]) => get(x + dx, y + dy) === T.DOOR)) continue
              placeFurn(x, y, 'desk')
            }
            wallKit(r, ['blackboard', 'locker'])
          } else wallKit(r, kits.school[i % kits.school.length])
          break
        }
        default: {
          const k = kits[type] || kits.office
          wallKit(r, k[i % k.length])
        }
      }
    })
  }

  for (const k in world.doors) if (world.tiles[k] !== T.DOOR) delete world.doors[k]
  for (const k in world.windows) if (world.tiles[k] !== T.WINDOW) delete world.windows[k]

  let hx = 0
  let hy = 0
  let hn = 0
  for (const b of world.buildings) {
    if (b.type === 'school' || b.type === 'church' || b.type === 'mall') {
      hx += (b.x + b.w / 2) * b.area
      hy += (b.y + b.h / 2) * b.area
      hn += b.area
    }
  }
  for (let k = 0; k < N; k++) if (world.tiles[k] === T.PLAZA) {
    hx += (k % W) * 4
    hy += ((k / W) | 0) * 4
    hn += 4
  }
  world.heart = hn ? { x: hx / hn, y: hy / hn } : { x: W / 2, y: H / 2 }

  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (get(x, y) !== T.PLAZA) continue
    let open = true
    for (let dy = -2; dy <= 2 && open; dy++) for (let dx = -2; dx <= 2 && open; dx++) {
      const t = get(x + dx, y + dy)
      if (t !== T.PLAZA && t !== T.TREE) open = false
    }
    if (!open) continue
    const r = rng()
    if (r < 0.012) placeFurn(x, y, 'planter')
    else if (r < 0.022) placeFurn(x, y, 'bench')
  }
  for (const k in world.furn) if (world.furn[k].base === undefined && (world.furn[k].kind === 'planter' || world.furn[k].kind === 'bench')) world.furn[k].base = T.PLAZA

  const lampGrid = new Set()
  const lampKey = (x, y) => `${Math.floor(x / 9)},${Math.floor(y / 9)}`
  for (const [x, y] of data.lamps || []) {
    if (!inb(x, y)) continue
    let lx = x
    let ly = y
    if (get(lx, ly) !== T.SIDEWALK && get(lx, ly) !== T.PLAZA) {
      let found = false
      for (let r = 1; r <= 3 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
        const t = get(x + dx, y + dy)
        if (t === T.SIDEWALK || t === T.PLAZA) {
          lx = x + dx
          ly = y + dy
          found = true
        }
      }
      if (!found) continue
    }
    world.lamps.push({ x: lx + 0.5, y: ly + 0.5 })
    lampGrid.add(lampKey(lx, ly))
  }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (get(x, y) !== T.SIDEWALK) continue
    if (!W4.some(([dx, dy]) => get(x + dx, y + dy) === T.ROAD)) continue
    if (lampGrid.has(lampKey(x, y))) continue
    if (rng() > 0.08) continue
    let close = false
    for (const l of world.lamps.slice(-40)) if (Math.abs(l.x - x) < 10 && Math.abs(l.y - y) < 10) close = true
    if (close) continue
    world.lamps.push({ x: x + 0.5, y: y + 0.5 })
    lampGrid.add(lampKey(x, y))
  }

  const freeCar = (x, y) => {
    const t = get(x, y)
    return (t === T.ROAD || t === T.PARKING) && !bmask[idx(x, y)]
  }
  function placeCar(x, y, horiz) {
    const x2 = horiz ? x + 1 : x
    const y2 = horiz ? y : y + 1
    if (!freeCar(x, y) || !freeCar(x2, y2)) return false
    for (let yy = y - 1; yy <= y2 + 1; yy++) for (let xx = x - 1; xx <= x2 + 1; xx++) if (get(xx, yy) === T.CAR) return false
    const cid = world.cars.length
    world.cars.push({ x, y, horiz, color: Math.floor(rng() * 9), wreck: rng() < 0.3, items: null, rot: (rng() - 0.5) * 0.14 })
    for (const [cx, cy] of [[x, y], [x2, y2]]) {
      world.carBase[idx(cx, cy)] = get(cx, cy)
      set(cx, cy, T.CAR)
      world.carAt[idx(cx, cy)] = cid
    }
    return true
  }
  for (let y = 2; y < H - 3; y++) for (let x = 2; x < W - 3; x++) {
    const t = get(x, y)
    if (t === T.ROAD) {
      if (rng() > 0.006) continue
      const horiz = get(x - 1, y) === T.ROAD && get(x + 1, y) === T.ROAD && get(x + 2, y) === T.ROAD
      const vert = get(x, y - 1) === T.ROAD && get(x, y + 1) === T.ROAD && get(x, y + 2) === T.ROAD
      const edgeH = get(x, y - 1) === T.SIDEWALK || get(x, y + 1) === T.SIDEWALK
      const edgeV = get(x - 1, y) === T.SIDEWALK || get(x + 1, y) === T.SIDEWALK
      if (horiz && edgeH) placeCar(x, y, true)
      else if (vert && edgeV) placeCar(x, y, false)
    } else if (t === T.PARKING) {
      if (rng() > 0.05) continue
      placeCar(x, y, rng() < 0.5)
    }
  }

  const homes = world.buildings.filter(b => b.type === 'house' && !b.sealed && b.area >= 40)
  const hd = b => Math.hypot(b.x + b.w / 2 - world.heart.x, b.y + b.h / 2 - world.heart.y)
  const ranked = homes.filter(b => hd(b) > 50).sort((a, c) => hd(a) - hd(c))
  const home = ranked.length ? ranked[Math.min(ranked.length - 1, ri(0, 7))] : world.buildings.find(b => !b.sealed)
  world.home = home.id
  let sp = null
  const homeTiles = []
  for (let y = home.y; y < home.y + home.h; y++) for (let x = home.x; x < home.x + home.w; x++) if (world.bld[idx(x, y)] === home.id && get(x, y) === T.FLOOR) homeTiles.push([x, y])
  homeTiles.sort((a, c) => Math.hypot(a[0] - home.x - home.w / 2, a[1] - home.y - home.h / 2) - Math.hypot(c[0] - home.x - home.w / 2, c[1] - home.y - home.h / 2))
  if (homeTiles.length) sp = { x: homeTiles[0][0] + 0.5, y: homeTiles[0][1] + 0.5 }
  for (const k in world.doors) if (world.bld[k] === home.id) world.doors[k].locked = false
  world.spawn = sp
  world.popScale = 6
  return world
}
