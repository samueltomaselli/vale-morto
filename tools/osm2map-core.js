export function convert(xml, opt = {}) {
const M = +(opt.m || 1.25)
const MAX = +(opt.max || 900)
const T = { GRASS: 0, ROAD: 1, SIDEWALK: 2, TREE: 7, WATER: 8, DIRT: 10, PARKING: 12, PLAZA: 14 }

const attr = (s, k) => {
  const m = s.match(new RegExp(`\\b${k}="([^"]*)"`))
  return m ? m[1] : null
}
const unesc = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const tagsOf = body => {
  const t = {}
  for (const m of body.matchAll(/<tag\s+k="([^"]*)"\s+v="([^"]*)"\s*\/>/g)) t[unesc(m[1])] = unesc(m[2])
  return t
}

const nodes = new Map()
const poiNodes = []
for (const m of xml.matchAll(/<node\b([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)) {
  const id = attr(m[1], 'id')
  const lat = +attr(m[1], 'lat')
  const lon = +attr(m[1], 'lon')
  nodes.set(id, [lat, lon])
  if (m[3]) {
    const tags = tagsOf(m[3])
    if (Object.keys(tags).length) poiNodes.push({ lat, lon, tags })
  }
}
const ways = new Map()
for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
  const id = attr(m[1], 'id')
  const nds = [...m[2].matchAll(/<nd\s+ref="(\d+)"/g)].map(x => x[1])
  ways.set(id, { id, nds, tags: tagsOf(m[2]) })
}
const relations = []
for (const m of xml.matchAll(/<relation\b([^>]*)>([\s\S]*?)<\/relation>/g)) {
  const members = [...m[2].matchAll(/<member\s+([^>]*)\/>/g)].map(x => ({ type: attr(x[1], 'type'), ref: attr(x[1], 'ref'), role: attr(x[1], 'role') }))
  relations.push({ members, tags: tagsOf(m[2]) })
}

let minlat, minlon, maxlat, maxlon
const bm = xml.match(/<bounds\b([^>]*)\/>/)
if (bm) {
  minlat = +attr(bm[1], 'minlat')
  minlon = +attr(bm[1], 'minlon')
  maxlat = +attr(bm[1], 'maxlat')
  maxlon = +attr(bm[1], 'maxlon')
} else {
  minlat = minlon = Infinity
  maxlat = maxlon = -Infinity
  for (const [lat, lon] of nodes.values()) {
    minlat = Math.min(minlat, lat)
    maxlat = Math.max(maxlat, lat)
    minlon = Math.min(minlon, lon)
    maxlon = Math.max(maxlon, lon)
  }
}
const lat0 = (minlat + maxlat) / 2
const kx = Math.cos((lat0 * Math.PI) / 180) * 111320
const ky = 110540
let W = Math.round(((maxlon - minlon) * kx) / M)
let H = Math.round(((maxlat - minlat) * ky) / M)
let ox = 0
let oy = 0
if (opt.center) {
  const [clat, clon] = opt.center.split(',').map(Number)
  const cx = ((clon - minlon) * kx) / M
  const cy = ((maxlat - clat) * ky) / M
  const nw = Math.min(W, MAX)
  const nh = Math.min(H, MAX)
  ox = Math.max(0, Math.min(W - nw, Math.round(cx - nw / 2)))
  oy = Math.max(0, Math.min(H - nh, Math.round(cy - nh / 2)))
  W = nw
  H = nh
} else if (W > MAX || H > MAX) {
  ox = Math.max(0, Math.round((W - MAX) / 2))
  oy = Math.max(0, Math.round((H - MAX) / 2))
  W = Math.min(W, MAX)
  H = Math.min(H, MAX)
}
const proj = ([lat, lon]) => [((lon - minlon) * kx) / M - ox, ((maxlat - lat) * ky) / M - oy]

const base = new Uint8Array(W * H).fill(T.GRASS)
const flags = new Uint8Array(W * H)
const bld = new Int32Array(W * H)
const idx = (x, y) => y * W + x

function fillRings(rings, fn) {
  const edges = []
  let y0 = Infinity
  let y1 = -Infinity
  for (const r of rings) {
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i]
      const b = r[i + 1]
      if (a[1] === b[1]) continue
      edges.push([a[0], a[1], b[0], b[1]])
      y0 = Math.min(y0, a[1], b[1])
      y1 = Math.max(y1, a[1], b[1])
    }
  }
  const ys = Math.max(0, Math.floor(y0))
  const ye = Math.min(H - 1, Math.ceil(y1))
  for (let y = ys; y <= ye; y++) {
    const yc = y + 0.5
    const xs = []
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax))
    }
    xs.sort((p, q) => p - q)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5))
      const xb = Math.min(W - 1, Math.floor(xs[i + 1] - 0.5))
      for (let x = xa; x <= xb; x++) fn(x, y)
    }
  }
}

function strokeLine(pts, width, fn) {
  const r = width / 2 / M
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1))
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1))
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1))
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1))
    const dx = bx - ax
    const dy = by - ay
    const L = dx * dx + dy * dy || 1e-9
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L))
        const qx = ax + t * dx - px
        const qy = ay + t * dy - py
        if (qx * qx + qy * qy <= r * r) fn(x, y)
      }
    }
  }
}

const wayPts = w => w.nds.map(n => nodes.get(n)).filter(Boolean).map(proj)
const closed = w => w.nds.length > 3 && w.nds[0] === w.nds[w.nds.length - 1]

function assembleRings(memberWays) {
  const segs = memberWays.map(w => w.nds.slice()).filter(s => s.length > 1)
  const rings = []
  while (segs.length) {
    let ring = segs.shift()
    let grew = true
    while (ring[0] !== ring[ring.length - 1] && grew) {
      grew = false
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        const end = ring[ring.length - 1]
        if (s[0] === end) ring = ring.concat(s.slice(1))
        else if (s[s.length - 1] === end) ring = ring.concat(s.slice(0, -1).reverse())
        else if (s[s.length - 1] === ring[0]) ring = s.concat(ring.slice(1))
        else if (s[0] === ring[0]) ring = s.slice(1).reverse().concat(ring)
        else continue
        segs.splice(i, 1)
        grew = true
        break
      }
    }
    if (ring[0] === ring[ring.length - 1]) rings.push(ring.map(n => nodes.get(n)).filter(Boolean).map(proj))
  }
  return rings
}

const areas = []
for (const w of ways.values()) if (closed(w)) areas.push({ tags: w.tags, rings: [wayPts(w)] })
for (const r of relations) {
  if (r.tags.type !== 'multipolygon' && r.tags.type !== 'building') continue
  const mem = r.members.filter(m => m.type === 'way' && ways.has(m.ref)).map(m => ways.get(m.ref))
  const rings = assembleRings(mem)
  if (!rings.length) continue
  const tags = { ...r.tags }
  if (!Object.keys(tags).some(k => k !== 'type')) {
    const outer = r.members.find(m => m.role === 'outer' && ways.has(m.ref))
    if (outer) Object.assign(tags, ways.get(outer.ref).tags)
  }
  areas.push({ tags, rings })
}

const isWaterArea = t => t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.water
const isForest = t => t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub'
const isPark = t => ['park', 'garden', 'playground', 'pitch', 'common'].includes(t.leisure) || ['grass', 'recreation_ground', 'village_green', 'meadow'].includes(t.landuse)
const isParking = t => t.amenity === 'parking' && t.parking !== 'underground' && t.parking !== 'multi-storey'

for (const a of areas) {
  if (a.tags.building) continue
  if (isForest(a.tags)) fillRings(a.rings, (x, y) => (flags[idx(x, y)] = 2))
  else if (isPark(a.tags)) fillRings(a.rings, (x, y) => (flags[idx(x, y)] = Math.max(flags[idx(x, y)], 1)))
  else if (a.tags.landuse === 'farmland' || a.tags.landuse === 'orchard') fillRings(a.rings, (x, y) => (base[idx(x, y)] = T.DIRT))
}
for (const a of areas) {
  if (a.tags.building) continue
  if (isParking(a.tags)) fillRings(a.rings, (x, y) => (base[idx(x, y)] = T.PARKING))
}

const WATERLINE = { river: 18, canal: 7, stream: 4, drain: 2, ditch: 2 }
for (const a of areas) if (!a.tags.building && isWaterArea(a.tags)) fillRings(a.rings, (x, y) => (base[idx(x, y)] = T.WATER))
for (const w of ways.values()) {
  const ww = w.tags.waterway
  if (!WATERLINE[ww] || w.tags.tunnel) continue
  const width = +w.tags.width || WATERLINE[ww]
  strokeLine(wayPts(w), width, (x, y) => (base[idx(x, y)] = T.WATER))
}

const ROADW = { motorway: 12, trunk: 11, primary: 10, secondary: 9, tertiary: 8, unclassified: 6.5, residential: 6.5, living_street: 6, service: 4.5, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6.5, road: 6 }
const roadLines = []
const labels = []
const carWays = []
const footWays = []
const plazaWays = []
for (const w of ways.values()) {
  const h = w.tags.highway
  if (!h || w.tags.tunnel === 'yes' || +w.tags.layer < 0) continue
  if (w.tags.area === 'yes' && h !== 'pedestrian') continue
  if (ROADW[h]) carWays.push(w)
  else if (h === 'pedestrian') plazaWays.push(w)
  else if (['footway', 'path', 'cycleway', 'steps', 'track', 'bridleway'].includes(h)) footWays.push(w)
}
const notWaterOrRoad = k => base[k] !== T.ROAD && base[k] !== T.PLAZA
for (const w of carWays) {
  const pts = wayPts(w)
  const width = (+w.tags.width || ROADW[w.tags.highway]) + 5
  strokeLine(pts, width, (x, y) => {
    const k = idx(x, y)
    if (base[k] === T.WATER && w.tags.bridge !== 'yes') return
    if (notWaterOrRoad(k)) base[k] = T.SIDEWALK
  })
}
for (const w of footWays) {
  const pts = wayPts(w)
  const isTrack = w.tags.highway === 'track'
  strokeLine(pts, isTrack ? 3 : 2.5, (x, y) => {
    const k = idx(x, y)
    if (base[k] === T.WATER && w.tags.bridge !== 'yes') return
    if (base[k] === T.GRASS || base[k] === T.DIRT || base[k] === T.WATER) base[k] = isTrack ? T.DIRT : T.SIDEWALK
  })
}
for (const a of areas) if (!a.tags.building && (a.tags.highway === 'pedestrian' || a.tags.place === 'square' || a.tags['area:highway'] === 'pedestrian')) fillRings(a.rings, (x, y) => (base[idx(x, y)] = T.PLAZA))
for (const w of plazaWays) {
  if (w.tags.name) labels.push({ n: w.tags.name, k: 'pedestrian', p: wayPts(w).flat().map(p => Math.round(p * 10) / 10) })
  if (closed(w) && w.tags.area === 'yes') continue
  strokeLine(wayPts(w), +w.tags.width || 9, (x, y) => {
    const k = idx(x, y)
    if (base[k] === T.WATER && w.tags.bridge !== 'yes') return
    if (base[k] !== T.ROAD) base[k] = T.PLAZA
  })
}
for (const w of carWays) {
  const pts = wayPts(w)
  const width = +w.tags.width || ROADW[w.tags.highway]
  strokeLine(pts, width, (x, y) => {
    const k = idx(x, y)
    if (base[k] === T.WATER && w.tags.bridge !== 'yes') return
    base[k] = T.ROAD
  })
  const round = p => Math.round(p * 10) / 10
  if (width >= 7.5 && !['service'].includes(w.tags.highway) && w.tags.oneway !== 'yes') roadLines.push(pts.flat().map(round))
  if (w.tags.name) labels.push({ n: w.tags.name, k: w.tags.highway, p: pts.flat().map(round) })
}

const TYPES = []
const buildings = []
function typeOf(t) {
  const a = t.amenity
  const s = t.shop
  const b = t.building
  if (a === 'school' || a === 'college' || a === 'university' || a === 'kindergarten' || b === 'school') return 'school'
  if (a === 'place_of_worship' || b === 'church' || b === 'cathedral' || b === 'chapel') return 'church'
  if (s === 'mall' || s === 'department_store' || b === 'retail' && +t['building:levels'] >= 3) return 'mall'
  if (s === 'supermarket' || s === 'convenience' || s === 'greengrocer') return 'market'
  if (a === 'pharmacy' || s === 'chemist') return 'pharmacy'
  if (s === 'hardware' || s === 'doityourself' || s === 'trade') return 'hardware'
  if (a === 'police' || a === 'fire_station') return 'police'
  if (a === 'hospital' || a === 'clinic' || a === 'doctors' || a === 'dentist') return 'clinic'
  if (a === 'fuel') return 'fuel'
  if (s === 'bakery') return 'bakery'
  if (a === 'restaurant' || a === 'fast_food' || a === 'cafe' || a === 'bar' || a === 'pub' || a === 'ice_cream') return 'restaurant'
  if (a === 'bank' || a === 'townhall' || a === 'courthouse' || a === 'post_office' || a === 'library' || b === 'government' || b === 'public' || b === 'civic' || b === 'office' || t.office) return 'office'
  if (s) return 'store'
  if (b === 'commercial' || b === 'retail') return 'store'
  if (b === 'industrial' || b === 'warehouse' || b === 'manufacture') return 'industrial'
  if (b === 'apartments' || +t['building:levels'] >= 4) return 'apartments'
  if (b === 'garage' || b === 'garages' || b === 'shed' || b === 'hut' || b === 'carport') return 'shed'
  return 'house'
}
for (const a of areas) {
  const b = a.tags.building
  if (!b || b === 'roof' || b === 'no' || b === 'construction' || b === 'ruins') continue
  if (a.tags.location === 'underground') continue
  const id = buildings.length + 1
  let count = 0
  fillRings(a.rings, (x, y) => {
    const k = idx(x, y)
    if (base[k] === T.ROAD || base[k] === T.WATER) return
    if (bld[k] && bld[k] !== id) return
    bld[k] = id
    count++
  })
  if (!count) continue
  buildings.push({ t: typeOf(a.tags), n: a.tags.name || '', lv: +a.tags['building:levels'] || 0, a: count })
}

const prio = ['school', 'church', 'mall', 'police', 'clinic', 'pharmacy', 'market', 'hardware', 'bakery', 'fuel', 'restaurant', 'office', 'store']
const lamps = []
const trees = []
for (const p of poiNodes) {
  const [x, y] = proj([p.lat, p.lon])
  const tx = Math.floor(x)
  const ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
  const k = idx(tx, ty)
  if (p.tags.highway === 'street_lamp') {
    lamps.push([tx, ty])
    continue
  }
  if (p.tags.natural === 'tree') {
    trees.push([tx, ty])
    continue
  }
  const id = bld[k]
  if (!id) continue
  if (!p.tags.amenity && !p.tags.shop && !p.tags.office) continue
  const t = typeOf({ ...p.tags, building: 'yes' })
  const cur = buildings[id - 1]
  const small = ['pharmacy', 'bakery', 'restaurant', 'store', 'fuel', 'market', 'hardware', 'office', 'clinic']
  if (cur.a > 1100 && small.includes(t) && cur.t !== 'school' && cur.t !== 'church') {
    cur.t = cur.t === 'industrial' ? 'industrial' : 'mall'
    continue
  }
  const better = prio.indexOf(t) >= 0 && (prio.indexOf(cur.t) < 0 || prio.indexOf(t) < prio.indexOf(cur.t))
  if (better) cur.t = t
  if (!cur.n && p.tags.name) cur.n = p.tags.name
}

function rle(arr) {
  const out = []
  let prev = arr[0]
  let n = 0
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === prev) n++
    else {
      out.push(n === 1 ? `${prev}` : `${prev}*${n}`)
      prev = arr[i]
      n = 1
    }
  }
  out.push(n === 1 ? `${prev}` : `${prev}*${n}`)
  return out.join(',')
}

const counts = {}
for (const b of buildings) counts[b.t] = (counts[b.t] || 0) + 1
const data = {
  v: 1,
  name: opt.name || 'Jaraguá do Sul — Centro',
  credit: '© colaboradores do OpenStreetMap (ODbL)',
  m: M, w: W, h: H,
  base: rle(base),
  flags: rle(flags),
  bld: rle(bld),
  buildings,
  roadLines,
  labels,
  lamps,
  trees
}
  return data
}
