export const T = {
  GRASS: 0, ROAD: 1, SIDEWALK: 2, FLOOR: 3, WALL: 4, DOOR: 5, WINDOW: 6, TREE: 7, WATER: 8, FURN: 9, DIRT: 10, WOODWALL: 11, PARKING: 12, CAR: 13, PLAZA: 14
}

export const CAR_COLORS = ['#8a2f2a', '#2f4f7a', '#c9c3b5', '#3c3f44', '#5d6e4a', '#a7742f', '#6b2f5a', '#e0ddd5', '#2a5a5a']

export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createWorld(seed, size = 128) {
  const rng = mulberry32(seed)
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1))
  const pick = arr => arr[Math.floor(rng() * arr.length)]
  const W = size
  const H = size
  const N = W * H
  const world = {
    seed, w: W, h: H,
    tiles: new Uint8Array(N),
    floor: new Uint8Array(N),
    bld: new Int16Array(N).fill(-1),
    shade: new Uint8Array(N),
    doors: {},
    windows: {},
    furn: {},
    plots: {},
    buildings: [],
    spawn: null
  }
  const idx = (x, y) => y * W + x
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H
  const set = (x, y, t) => { if (inb(x, y)) world.tiles[idx(x, y)] = t }
  const get = (x, y) => (inb(x, y) ? world.tiles[idx(x, y)] : T.TREE)

  for (let i = 0; i < N; i++) world.shade[i] = Math.floor(rng() * 4)

  const roads = []
  for (let r = 10; r + 4 < W - 8; r += 26) roads.push(r)
  const lo = roads[0] - 1
  const hi = roads[roads.length - 1] + 3
  for (const r of roads) {
    for (let t = lo; t <= hi; t++) {
      for (let k = 0; k < 3; k++) {
        set(t, r + k, T.ROAD)
        set(r + k, t, T.ROAD)
      }
    }
  }
  for (const r of roads) {
    for (let t = lo; t <= hi; t++) {
      if (get(t, r - 1) !== T.ROAD) set(t, r - 1, T.SIDEWALK)
      if (get(t, r + 3) !== T.ROAD) set(t, r + 3, T.SIDEWALK)
      if (get(r - 1, t) !== T.ROAD) set(r - 1, t, T.SIDEWALK)
      if (get(r + 3, t) !== T.ROAD) set(r + 3, t, T.SIDEWALK)
    }
  }

  const blocks = []
  for (let i = 0; i < roads.length - 1; i++) {
    for (let j = 0; j < roads.length - 1; j++) {
      const x0 = roads[i] + 4
      const y0 = roads[j] + 4
      const x1 = roads[i + 1] - 2
      const y1 = roads[j + 1] - 2
      blocks.push({ i, j, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 })
    }
  }

  const n = roads.length - 1
  const mid = Math.floor(n / 2)
  const typeOf = {}
  typeOf[`${mid - 1},${mid - 1}`] = 'downtownA'
  typeOf[`${mid},${mid - 1}`] = 'downtownB'
  typeOf[`${mid - 1},${mid}`] = 'park'
  typeOf[`${n - 1},${n - 1}`] = 'farm'
  typeOf[`0,${n - 1}`] = 'farm'

  function addBuilding(x, y, w, h, type) {
    const b = { id: world.buildings.length, x, y, w, h, type, rooms: [] }
    world.buildings.push(b)
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const edge = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1
        set(xx, yy, edge ? T.WALL : T.FLOOR)
        world.bld[idx(xx, yy)] = b.id
      }
    }
    return b
  }

  function placeDoor(x, y, locked, open = false) {
    set(x, y, T.DOOR)
    world.doors[idx(x, y)] = { open, hp: 100, locked: !!locked, bar: 0, broken: false }
  }

  function placeWindow(x, y) {
    set(x, y, T.WINDOW)
    world.windows[idx(x, y)] = { state: 'closed', hp: 30, bar: 0, curtain: rng() < 0.4 }
  }

  function placeFurn(x, y, kind) {
    set(x, y, T.FURN)
    world.furn[idx(x, y)] = { kind, items: null }
  }

  function isEdgeCorner(b, x, y) {
    const cx = x === b.x || x === b.x + b.w - 1
    const cy = y === b.y || y === b.y + b.h - 1
    return cx && cy
  }

  function reachableAll(b, startX, startY) {
    const seen = new Set()
    const q = [[startX, startY]]
    seen.add(idx(startX, startY))
    while (q.length) {
      const [x, y] = q.pop()
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx <= b.x || ny <= b.y || nx >= b.x + b.w - 1 || ny >= b.y + b.h - 1) continue
        const k = idx(nx, ny)
        if (seen.has(k)) continue
        const t = world.tiles[k]
        if (t === T.FLOOR || t === T.DOOR) {
          seen.add(k)
          q.push([nx, ny])
        }
      }
    }
    for (let yy = b.y + 1; yy < b.y + b.h - 1; yy++) {
      for (let xx = b.x + 1; xx < b.x + b.w - 1; xx++) {
        const t = get(xx, yy)
        if ((t === T.FLOOR || t === T.DOOR) && !seen.has(idx(xx, yy))) return false
      }
    }
    return true
  }

  function nearOpening(x, y) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = get(x + dx, y + dy)
      if (t === T.DOOR || t === T.WINDOW) return true
    }
    return false
  }

  function furnishRoom(b, room, kinds, start) {
    const cand = []
    for (let yy = room.y; yy < room.y + room.h; yy++) {
      for (let xx = room.x; xx < room.x + room.w; xx++) {
        if (get(xx, yy) !== T.FLOOR) continue
        const againstWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const t = get(xx + dx, yy + dy)
          return t === T.WALL || t === T.WINDOW
        })
        if (againstWall && !nearOpening(xx, yy)) cand.push([xx, yy])
      }
    }
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[cand[i], cand[j]] = [cand[j], cand[i]]
    }
    for (const kind of kinds) {
      while (cand.length) {
        const [x, y] = cand.pop()
        if (get(x, y) !== T.FLOOR) continue
        placeFurn(x, y, kind)
        if (reachableAll(b, start[0], start[1])) break
        set(x, y, T.FLOOR)
        delete world.furn[idx(x, y)]
      }
    }
  }

  function addWindows(b, freq, skip) {
    for (let xx = b.x + 1; xx < b.x + b.w - 1; xx++) {
      for (const yy of [b.y, b.y + b.h - 1]) {
        if (get(xx, yy) === T.WALL && rng() < freq && !nearOpening(xx, yy) && !skip(xx, yy)) placeWindow(xx, yy)
      }
    }
    for (let yy = b.y + 1; yy < b.y + b.h - 1; yy++) {
      for (const xx of [b.x, b.x + b.w - 1]) {
        if (get(xx, yy) === T.WALL && rng() < freq && !nearOpening(xx, yy) && !skip(xx, yy)) placeWindow(xx, yy)
      }
    }
  }

  function innerWallBlocked(x, y) {
    let c = 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (get(x + dx, y + dy) === T.WALL) c++
    return c >= 3
  }

  function doorPos(b, side) {
    if (side === 'n' || side === 's') {
      const y = side === 'n' ? b.y : b.y + b.h - 1
      return [ri(b.x + 2, b.x + b.w - 3), y]
    }
    const x = side === 'w' ? b.x : b.x + b.w - 1
    return [x, ri(b.y + 2, b.y + b.h - 3)]
  }

  const inward = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }
  const opposite = { n: 's', s: 'n', w: 'e', e: 'w' }

  function makeHouse(lot, side) {
    const w = ri(8, Math.min(10, lot.w - 1))
    const h = ri(8, Math.min(10, lot.h - 1))
    let x = lot.x + Math.floor((lot.w - w) / 2)
    let y = lot.y + Math.floor((lot.h - h) / 2)
    if (side === 'w') x = lot.x + 1
    if (side === 'e') x = lot.x + lot.w - w - 1
    if (side === 'n') y = lot.y + 1
    if (side === 's') y = lot.y + lot.h - h - 1
    const b = addBuilding(x, y, w, h, 'house')
    const rooms = []
    const vertical = rng() < 0.5 ? w >= h : w > h
    if (vertical) {
      const sx = x + Math.floor(w / 2)
      for (let yy = y + 1; yy < y + h - 1; yy++) set(sx, yy, T.WALL)
      placeDoor(sx, ri(y + 2, y + h - 3), false, true)
      rooms.push({ x: x + 1, y: y + 1, w: sx - x - 1, h: h - 2 })
      rooms.push({ x: sx + 1, y: y + 1, w: x + w - sx - 2, h: h - 2 })
    } else {
      const sy = y + Math.floor(h / 2)
      for (let xx = x + 1; xx < x + w - 1; xx++) set(xx, sy, T.WALL)
      placeDoor(ri(x + 2, x + w - 3), sy, false, true)
      rooms.push({ x: x + 1, y: y + 1, w: w - 2, h: sy - y - 1 })
      rooms.push({ x: x + 1, y: sy + 1, w: w - 2, h: y + h - sy - 2 })
    }
    let [dx, dy] = doorPos(b, side)
    let tries = 0
    while ((innerWallBlocked(dx + inward[side][0], dy + inward[side][1]) || get(dx + inward[side][0], dy + inward[side][1]) !== T.FLOOR) && tries++ < 20) [dx, dy] = doorPos(b, side)
    placeDoor(dx, dy, rng() < 0.3)
    if (rng() < 0.5) {
      const bs = opposite[side]
      let [bx, by] = doorPos(b, bs)
      let t2 = 0
      while (get(bx + inward[bs][0], by + inward[bs][1]) !== T.FLOOR && t2++ < 20) [bx, by] = doorPos(b, bs)
      if (get(bx + inward[bs][0], by + inward[bs][1]) === T.FLOOR) placeDoor(bx, by, rng() < 0.5)
    }
    const onPerimeter = (px, py) => px === b.x || py === b.y || px === b.x + b.w - 1 || py === b.y + b.h - 1
    addWindows(b, 0.45, (xx, yy) => isEdgeCorner(b, xx, yy) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => get(xx + a, yy + c) === T.WALL && !onPerimeter(xx + a, yy + c)))
    const start = [dx + inward[side][0], dy + inward[side][1]]
    const kitchenFirst = rng() < 0.5
    const kitchen = kitchenFirst ? rooms[0] : rooms[1]
    const bedroom = kitchenFirst ? rooms[1] : rooms[0]
    for (let yy = kitchen.y; yy < kitchen.y + kitchen.h; yy++) for (let xx = kitchen.x; xx < kitchen.x + kitchen.w; xx++) world.floor[idx(xx, yy)] = 1
    furnishRoom(b, kitchen, ['fridge', 'counter', 'stove', 'sink', 'counter', ...(rng() < 0.5 ? ['sofa'] : [])], start)
    const extra = rng() < 0.3 ? ['toolbox'] : []
    furnishRoom(b, bedroom, ['bed', 'wardrobe', 'cabinet', 'shelf', ...extra], start)
    b.rooms = rooms
    return b
  }

  function makeShed(x, y) {
    const b = addBuilding(x, y, 5, 5, 'shed')
    placeDoor(x + 2, y + 4, rng() < 0.3)
    placeFurn(x + 1, y + 1, 'shedbox')
    placeFurn(x + 3, y + 1, 'shedbox')
    for (let yy = y + 1; yy < y + 4; yy++) for (let xx = x + 1; xx < x + 4; xx++) if (get(xx, yy) === T.FLOOR) world.floor[idx(xx, yy)] = 3
    return b
  }

  function makeStore(x, y, w, h, type, side) {
    const b = addBuilding(x, y, w, h, type)
    for (let yy = y + 1; yy < y + h - 1; yy++) for (let xx = x + 1; xx < x + w - 1; xx++) world.floor[idx(xx, yy)] = type === 'police' ? 3 : 1
    let [dx, dy] = doorPos(b, side)
    placeDoor(dx, dy, rng() < 0.4)
    const bs = opposite[side]
    const [bx, by] = doorPos(b, bs)
    placeDoor(bx, by, true)
    addWindows(b, 0.7, (xx, yy) => isEdgeCorner(b, xx, yy))
    const rack = { market: 'rack', pharmacy: 'medrack', hardware: 'toolrack', police: 'locker' }[type]
    const start = [dx + inward[side][0], dy + inward[side][1]]
    const horiz = side === 'n' || side === 's'
    if (horiz) {
      for (let yy = y + 2; yy < y + h - 2; yy += 2) {
        for (let xx = x + 2; xx < x + w - 2; xx++) {
          if ((xx - x) % 6 === 0) continue
          if (get(xx, yy) !== T.FLOOR || nearOpening(xx, yy)) continue
          placeFurn(xx, yy, rack)
          if (!reachableAll(b, start[0], start[1])) { set(xx, yy, T.FLOOR); delete world.furn[idx(xx, yy)] }
        }
      }
    } else {
      for (let xx = x + 2; xx < x + w - 2; xx += 2) {
        for (let yy = y + 2; yy < y + h - 2; yy++) {
          if ((yy - y) % 6 === 0) continue
          if (get(xx, yy) !== T.FLOOR || nearOpening(xx, yy)) continue
          placeFurn(xx, yy, rack)
          if (!reachableAll(b, start[0], start[1])) { set(xx, yy, T.FLOOR); delete world.furn[idx(xx, yy)] }
        }
      }
    }
    const room = { x: x + 1, y: y + 1, w: w - 2, h: h - 2 }
    furnishRoom(b, room, type === 'police' ? ['cabinet', 'counter', 'locker', 'sink'] : ['counter', 'cabinet', 'sink'], start)
    return b
  }

  function makePark(bl) {
    const cx = bl.x + bl.w / 2
    const cy = bl.y + bl.h / 2
    const rx = bl.w * 0.28
    const ry = bl.h * 0.22
    for (let yy = bl.y; yy < bl.y + bl.h; yy++) {
      for (let xx = bl.x; xx < bl.x + bl.w; xx++) {
        const d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
        if (d < 1) set(xx, yy, T.WATER)
        else if (rng() < 0.12) set(xx, yy, T.TREE)
      }
    }
  }

  function makeFarm(bl) {
    makeShed(bl.x + 1, bl.y + 1)
    for (let yy = bl.y + 8; yy < bl.y + bl.h - 1; yy++) {
      for (let xx = bl.x + 1; xx < bl.x + bl.w - 1; xx++) {
        if ((yy - bl.y) % 3 === 2) continue
        set(xx, yy, T.DIRT)
        if (rng() < 0.35) world.plots[idx(xx, yy)] = { stage: 3, planted: 0 }
      }
    }
    for (let xx = bl.x + 8; xx < bl.x + bl.w - 1; xx++) for (let yy = bl.y + 1; yy < bl.y + 6; yy++) if (rng() < 0.15) set(xx, yy, T.TREE)
  }

  const houses = []
  for (const bl of blocks) {
    const type = typeOf[`${bl.i},${bl.j}`] || 'res'
    if (type === 'park') { makePark(bl); continue }
    if (type === 'farm') { makeFarm(bl); continue }
    if (type === 'downtownA' || type === 'downtownB') {
      const half = Math.floor(bl.h / 2)
      const t1 = type === 'downtownA' ? 'market' : 'hardware'
      const t2 = type === 'downtownA' ? 'pharmacy' : 'police'
      for (let yy = bl.y; yy < bl.y + bl.h; yy++) for (let xx = bl.x; xx < bl.x + bl.w; xx++) set(xx, yy, T.PARKING)
      makeStore(bl.x + 1, bl.y + 1, bl.w - 2, half - 2, t1, 'n')
      makeStore(bl.x + 1, bl.y + half + 1, bl.w - 2, bl.h - half - 2, t2, 's')
      continue
    }
    const lw = Math.floor(bl.w / 2)
    const lh = Math.floor(bl.h / 2)
    for (let qx = 0; qx < 2; qx++) {
      for (let qy = 0; qy < 2; qy++) {
        const lot = { x: bl.x + qx * (lw + 1), y: bl.y + qy * (lh + 1), w: lw, h: lh }
        const sides = [qx === 0 ? 'w' : 'e', qy === 0 ? 'n' : 's']
        if (rng() < 0.82) houses.push(makeHouse(lot, pick(sides)))
        else if (rng() < 0.5) makeShed(lot.x + 2, lot.y + 2)
        else for (let yy = lot.y; yy < lot.y + lot.h; yy++) for (let xx = lot.x; xx < lot.x + lot.w; xx++) if (rng() < 0.18) set(xx, yy, T.TREE)
      }
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (get(x, y) !== T.GRASS) continue
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y)
      const nearBuilding = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const t = get(x + dx, y + dy)
        return t === T.DOOR || t === T.WALL || t === T.WINDOW
      })
      if (nearBuilding) continue
      if (edge < 8 && rng() < 0.55 - edge * 0.04) set(x, y, T.TREE)
      else if (rng() < 0.025) set(x, y, T.TREE)
    }
  }

  world.roads = roads
  world.cars = []
  world.carAt = {}
  world.carBase = {}
  const roadBand = r => (k => roads.some(rr => k >= rr && k <= rr + 2))(r)
  const freeRoad = (x, y) => get(x, y) === T.ROAD
  function placeCar(x, y, horiz) {
    const x2 = horiz ? x + 1 : x
    const y2 = horiz ? y : y + 1
    if (!freeRoad(x, y) && get(x, y) !== T.PARKING) return false
    if (!freeRoad(x2, y2) && get(x2, y2) !== T.PARKING) return false
    for (let yy = y - 1; yy <= y2 + 1; yy++) for (let xx = x - 1; xx <= x2 + 1; xx++) if (get(xx, yy) === T.CAR) return false
    const id = world.cars.length
    world.cars.push({ x, y, horiz, color: Math.floor(rng() * CAR_COLORS.length), wreck: rng() < 0.35, items: null, rot: (rng() - 0.5) * 0.12 })
    for (const [cx, cy] of [[x, y], [x2, y2]]) {
      world.carBase[idx(cx, cy)] = get(cx, cy)
      set(cx, cy, T.CAR)
      world.carAt[idx(cx, cy)] = id
    }
    return true
  }
  for (const r of roads) {
    for (let t = lo + 2; t < hi - 2; t++) {
      if (roadBand(t) || roadBand(t + 1)) continue
      if (rng() < 0.06) placeCar(t, r + (rng() < 0.5 ? 0 : 2), true)
      if (rng() < 0.06) placeCar(r + (rng() < 0.5 ? 0 : 2), t, false)
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) === T.PARKING && get(x, y + 1) === T.PARKING && x % 3 === 1 && rng() < 0.12) placeCar(x, y, false)
  }
  world.lamps = []
  for (const r of roads) {
    for (let t = lo; t <= hi; t++) {
      if (t % 11 === 5 && get(t, r - 1) === T.SIDEWALK) world.lamps.push({ x: t + 0.5, y: r - 1 + 0.5 })
      if (t % 11 === 0 && get(t, r + 3) === T.SIDEWALK) world.lamps.push({ x: t + 0.5, y: r + 3 + 0.5 })
      if (t % 11 === 5 && get(r - 1, t) === T.SIDEWALK) world.lamps.push({ x: r - 1 + 0.5, y: t + 0.5 })
      if (t % 11 === 0 && get(r + 3, t) === T.SIDEWALK) world.lamps.push({ x: r + 3 + 0.5, y: t + 0.5 })
    }
  }

  const center = W / 2
  houses.sort((a, b) => Math.hypot(a.x - center, a.y - center) - Math.hypot(b.x - center, b.y - center))
  const home = houses[Math.min(houses.length - 1, ri(2, 6))]
  world.home = home.id
  let sp = null
  for (const r of home.rooms) {
    for (let yy = r.y; yy < r.y + r.h && !sp; yy++) for (let xx = r.x; xx < r.x + r.w && !sp; xx++) if (get(xx, yy) === T.FLOOR) sp = { x: xx + 0.5, y: yy + 0.5 }
    if (sp) break
  }
  for (const k in world.doors) {
    const d = world.doors[k]
    if (world.bld[k] === home.id) d.locked = false
  }
  world.spawn = sp
  return world
}

export function rollLoot(rng, table, rolls, LOOT, ITEMS, STACK_AMOUNTS) {
  const list = LOOT[table]
  if (!list) return []
  const out = []
  const total = list.reduce((a, b) => a + b[1], 0)
  const n = rolls[0] + Math.floor(rng() * (rolls[1] - rolls[0] + 1))
  for (let i = 0; i < n; i++) {
    let r = rng() * total
    for (const [id, wgt] of list) {
      r -= wgt
      if (r <= 0) {
        const def = ITEMS[id]
        let qty = 1
        if (STACK_AMOUNTS[id]) qty = STACK_AMOUNTS[id][0] + Math.floor(rng() * (STACK_AMOUNTS[id][1] - STACK_AMOUNTS[id][0] + 1))
        else if (def.kind === 'med' && id === 'disinfectant') qty = 1
        out.push({ id, qty })
        break
      }
    }
  }
  return out
}
