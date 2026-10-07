import { readFileSync, writeFileSync } from 'node:fs'
import { convert } from './osm2map-core.js'

const [, , input, output = 'maps/jaragua.json', ...rest] = process.argv
const opt = Object.fromEntries(rest.map(a => a.replace(/^--/, '').split('=')))
const data = convert(readFileSync(input, 'utf8'), opt)
writeFileSync(output, JSON.stringify(data))
const counts = {}
for (const b of data.buildings) counts[b.t] = (counts[b.t] || 0) + 1
console.log(`${data.w}x${data.h} tiles, ${data.buildings.length} prédios`, counts, `${data.lamps.length} postes, ${data.trees.length} árvores, ${data.labels.length} ruas`)
console.log(`arquivo: ${output} (${(JSON.stringify(data).length / 1024).toFixed(0)} KB)`)
