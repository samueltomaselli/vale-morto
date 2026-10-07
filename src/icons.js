const cache = {}
const S = 40
const OUT = '#141210'

function rr(g, x, y, w, h, r, fill, stroke = OUT, lw = 1.6) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  g.fillStyle = fill
  g.fill()
  if (stroke) {
    g.lineWidth = lw
    g.strokeStyle = stroke
    g.stroke()
  }
}

function el(g, x, y, rx, ry, fill, stroke = OUT, lw = 1.6, rot = 0) {
  g.beginPath()
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  g.fillStyle = fill
  g.fill()
  if (stroke) {
    g.lineWidth = lw
    g.strokeStyle = stroke
    g.stroke()
  }
}

function shine(g, x, y, w, h) {
  g.fillStyle = 'rgba(255,255,255,0.35)'
  g.fillRect(x, y, w, h)
}

function can(label, band) {
  return g => {
    rr(g, 11, 8, 18, 25, 3, '#b8bcbe')
    rr(g, 11, 13, 18, 14, 0, label, null)
    g.fillStyle = band
    g.fillRect(11, 18, 18, 4)
    g.strokeStyle = OUT
    g.lineWidth = 1.6
    g.strokeRect(11, 13, 18, 14)
    el(g, 20, 8.5, 9, 2.5, '#d6dadc', OUT, 1.2)
    shine(g, 13, 10, 2.5, 20)
  }
}

function bottle(body, cap, liquid) {
  return g => {
    g.beginPath()
    g.moveTo(16, 8)
    g.lineTo(24, 8)
    g.lineTo(24, 12)
    g.quadraticCurveTo(29, 14, 29, 19)
    g.lineTo(29, 33)
    g.quadraticCurveTo(29, 35, 27, 35)
    g.lineTo(13, 35)
    g.quadraticCurveTo(11, 35, 11, 33)
    g.lineTo(11, 19)
    g.quadraticCurveTo(11, 14, 16, 12)
    g.closePath()
    g.fillStyle = body
    g.fill()
    if (liquid) {
      g.save()
      g.clip()
      g.fillStyle = liquid
      g.fillRect(10, 18, 20, 18)
      g.restore()
    }
    g.lineWidth = 1.6
    g.strokeStyle = OUT
    g.stroke()
    rr(g, 15.5, 5, 9, 4, 1, cap)
    shine(g, 13.5, 17, 2.5, 14)
  }
}

function pills(col, lid) {
  return g => {
    rr(g, 12, 13, 16, 21, 3, col)
    rr(g, 11, 8, 18, 6, 2, lid)
    rr(g, 14, 18, 12, 10, 1, '#f0ede4', null)
    g.fillStyle = '#c84a3a'
    g.fillRect(19, 19.5, 2, 7)
    g.fillRect(16.5, 22, 7, 2)
    shine(g, 13.5, 15, 2, 16)
  }
}

function book(col) {
  return g => {
    rr(g, 9, 7, 22, 27, 2, col)
    g.fillStyle = 'rgba(0,0,0,0.3)'
    g.fillRect(9, 7, 4, 27)
    rr(g, 15, 12, 12, 8, 1, '#e8e2d0', null)
    g.fillStyle = '#e8e2d0'
    g.fillRect(28, 9, 2, 24)
    g.strokeStyle = OUT
    g.lineWidth = 1.6
    g.strokeRect(9, 7, 22, 27)
  }
}

function blade(handle, len) {
  return g => {
    g.save()
    g.translate(20, 20)
    g.rotate(-0.75)
    rr(g, -15, -2.5, 11, 5, 2, handle)
    g.beginPath()
    g.moveTo(-4, -3)
    g.lineTo(-4 + len, -1)
    g.lineTo(-4 + len - 3, 3)
    g.lineTo(-4, 3)
    g.closePath()
    g.fillStyle = '#d6dadc'
    g.fill()
    g.strokeStyle = OUT
    g.lineWidth = 1.6
    g.stroke()
    g.restore()
  }
}

function stick(col, len, w, head) {
  return g => {
    g.save()
    g.translate(20, 20)
    g.rotate(-0.78)
    rr(g, -len / 2, -w / 2, len, w, w / 2, col)
    if (head) head(g, len)
    g.restore()
  }
}

const P = {
  beans: can('#8a3a28', '#e0b44a'),
  soup: can('#c84a3a', '#f0ede4'),
  peanut: g => {
    rr(g, 10, 13, 20, 21, 4, '#c8964a')
    rr(g, 10, 8, 20, 6, 2, '#c83a32')
    rr(g, 13, 18, 14, 9, 1, '#f0ede4', null)
    shine(g, 12, 15, 2, 16)
  },
  chips: g => {
    g.beginPath()
    g.moveTo(10, 8)
    g.lineTo(30, 8)
    g.lineTo(31, 34)
    g.lineTo(9, 34)
    g.closePath()
    g.fillStyle = '#e8b42a'
    g.fill()
    g.lineWidth = 1.6
    g.strokeStyle = OUT
    g.stroke()
    g.fillStyle = '#c83a32'
    g.fillRect(10, 15, 20, 7)
    el(g, 20, 27, 5, 3, '#f0d070', null)
  },
  crackers: g => {
    rr(g, 8, 10, 24, 20, 2, '#3a6aa0')
    for (let i = 0; i < 3; i++) el(g, 14 + i * 6, 20, 3.2, 3.2, '#e8c070', OUT, 1)
  },
  apple: g => {
    el(g, 20, 23, 11, 10, '#c8302a')
    g.strokeStyle = '#4a321f'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(20, 13)
    g.lineTo(21, 8)
    g.stroke()
    el(g, 25, 10, 4, 2, '#5a8a2a', OUT, 1, -0.4)
    el(g, 15, 19, 2.5, 3.5, 'rgba(255,255,255,0.45)', null)
  },
  bread: g => {
    el(g, 20, 22, 14, 9, '#c88a3a')
    g.strokeStyle = 'rgba(80,40,10,0.6)'
    g.lineWidth = 1.5
    for (let i = -1; i <= 1; i++) {
      g.beginPath()
      g.moveTo(16 + i * 6, 16)
      g.lineTo(20 + i * 6, 28)
      g.stroke()
    }
  },
  milk: g => {
    g.beginPath()
    g.moveTo(12, 14)
    g.lineTo(20, 7)
    g.lineTo(28, 14)
    g.lineTo(28, 34)
    g.lineTo(12, 34)
    g.closePath()
    g.fillStyle = '#f0ede4'
    g.fill()
    g.lineWidth = 1.6
    g.strokeStyle = OUT
    g.stroke()
    g.fillStyle = '#3a6aa0'
    g.fillRect(13, 20, 14, 7)
  },
  meat: g => {
    el(g, 20, 22, 13, 9, '#b8443a', OUT, 1.6, -0.3)
    el(g, 18, 21, 7, 4, '#e88a7a', null, 0, -0.3)
    el(g, 30, 17, 3, 3, '#f0ede4')
  },
  cooked_meat: g => {
    el(g, 20, 22, 13, 9, '#6e3a1e', OUT, 1.6, -0.3)
    el(g, 18, 21, 7, 4, '#9a5a2e', null, 0, -0.3)
    el(g, 30, 17, 3, 3, '#f0ede4')
  },
  veggie: g => {
    el(g, 16, 23, 8, 8, '#d85a2a')
    el(g, 25, 24, 7, 7, '#c83a2a')
    g.fillStyle = '#5a8a2a'
    g.fillRect(14, 12, 3, 6)
    g.fillRect(24, 14, 3, 5)
  },
  water: bottle('rgba(170,210,230,0.8)', '#3a7ac8', 'rgba(90,160,220,0.6)'),
  tainted: bottle('rgba(170,190,160,0.8)', '#6a6a3a', 'rgba(110,120,60,0.75)'),
  soda: can('#c8302a', '#f0ede4'),
  bottle: bottle('rgba(200,220,230,0.55)', '#8a8a8a'),
  bandage: g => {
    el(g, 20, 21, 12, 12, '#f0ede4')
    el(g, 20, 21, 4.5, 4.5, '#d6d0c0')
    g.fillStyle = '#c84a3a'
    g.fillRect(28, 12, 3, 8)
    g.fillRect(25.5, 14.5, 8, 3)
  },
  rag: g => {
    g.beginPath()
    g.moveTo(9, 14)
    g.lineTo(31, 10)
    g.lineTo(29, 30)
    g.lineTo(12, 32)
    g.closePath()
    g.fillStyle = '#b8a888'
    g.fill()
    g.lineWidth = 1.6
    g.strokeStyle = OUT
    g.stroke()
    g.strokeStyle = 'rgba(0,0,0,0.25)'
    g.beginPath()
    g.moveTo(12, 20)
    g.lineTo(28, 17)
    g.stroke()
  },
  disinfectant: bottle('#e8e4d8', '#c83a32', 'rgba(220,140,60,0.5)'),
  painkillers: pills('#f0ede4', '#3a7ac8'),
  calm: pills('#e8d8f0', '#7a4aa0'),
  antibiotics: pills('#f0e8d0', '#3aa06a'),
  vitamins: pills('#f0c84a', '#e07a2a'),
  knife: blade('#2a2a2a', 20),
  bat: stick('#b08452', 32, 6, (g, len) => rr(g, len / 2 - 12, -4, 12, 8, 4, '#b08452')),
  crowbar: stick('#4a5058', 30, 4, (g, len) => {
    g.strokeStyle = '#4a5058'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(len / 2 - 1, 0)
    g.quadraticCurveTo(len / 2 + 4, -1, len / 2 + 2, -6)
    g.stroke()
  }),
  axe: stick('#8a6438', 30, 4, (g, len) => {
    g.beginPath()
    g.moveTo(len / 2 - 9, -2)
    g.lineTo(len / 2 - 2, -2)
    g.lineTo(len / 2, -12)
    g.lineTo(len / 2 - 12, -10)
    g.closePath()
    g.fillStyle = '#a8b0b6'
    g.fill()
    g.strokeStyle = OUT
    g.lineWidth = 1.6
    g.stroke()
  }),
  hammer: stick('#9a7448', 26, 4, (g, len) => rr(g, len / 2 - 5, -7, 7, 14, 1.5, '#5e646a')),
  pan: g => {
    g.save()
    g.translate(20, 20)
    g.rotate(-0.78)
    rr(g, -17, -2, 13, 4, 2, '#2a2a2a')
    el(g, 6, 0, 11, 11, '#3c3e42')
    el(g, 6, 0, 8, 8, '#26282a', null)
    g.restore()
  },
  spear: stick('#9a7448', 34, 3, (g, len) => {
    g.beginPath()
    g.moveTo(len / 2 - 2, -3)
    g.lineTo(len / 2 + 6, 0)
    g.lineTo(len / 2 - 2, 3)
    g.fillStyle = '#d0d4d8'
    g.fill()
    g.strokeStyle = OUT
    g.stroke()
  }),
  plank: stick('#a8804c', 34, 8),
  pistol: g => {
    g.beginPath()
    g.moveTo(8, 13)
    g.lineTo(32, 13)
    g.lineTo(32, 19)
    g.lineTo(19, 19)
    g.lineTo(17, 31)
    g.lineTo(11, 31)
    g.lineTo(12, 19)
    g.lineTo(8, 19)
    g.closePath()
    g.fillStyle = '#2e3034'
    g.fill()
    g.lineWidth = 1.6
    g.strokeStyle = OUT
    g.stroke()
    shine(g, 10, 14, 20, 1.5)
  },
  shotgun: g => {
    g.save()
    g.translate(20, 20)
    g.rotate(-0.5)
    rr(g, -18, -3, 13, 7, 2, '#6e4a2a')
    rr(g, -6, -2.5, 24, 4, 1, '#2e3034')
    rr(g, 0, 1.5, 10, 3, 1, '#4a4e54')
    g.restore()
  },
  ammo9: g => {
    rr(g, 8, 14, 24, 18, 2, '#c8a83a')
    for (let i = 0; i < 4; i++) {
      rr(g, 10 + i * 5.5, 7, 4, 9, 2, '#d8a84a', OUT, 1)
    }
    g.fillStyle = OUT
    g.font = 'bold 8px monospace'
    g.fillText('9mm', 12, 27)
  },
  shells: g => {
    for (let i = 0; i < 3; i++) {
      rr(g, 9 + i * 8, 10, 6, 20, 1.5, '#c8302a', OUT, 1.2)
      rr(g, 9 + i * 8, 26, 6, 6, 1, '#d8b44a', OUT, 1.2)
    }
  },
  nails: g => {
    for (let i = 0; i < 4; i++) {
      g.save()
      g.translate(12 + i * 5, 20)
      g.rotate(0.3 - i * 0.15)
      g.fillStyle = '#9aa0a4'
      g.fillRect(-1, -10, 2, 20)
      g.fillRect(-3, -11, 6, 2)
      g.restore()
    }
  },
  saw: g => {
    g.beginPath()
    g.moveTo(8, 26)
    g.lineTo(30, 14)
    g.lineTo(32, 20)
    g.lineTo(12, 32)
    g.closePath()
    g.fillStyle = '#b8bec2'
    g.fill()
    g.lineWidth = 1.6
    g.strokeStyle = OUT
    g.stroke()
    rr(g, 26, 8, 10, 12, 3, '#c83a2a')
  },
  shovel: stick('#8a6438', 28, 3, (g, len) => rr(g, len / 2 - 2, -6, 12, 12, 3, '#7a8086')),
  seeds: g => {
    rr(g, 10, 8, 20, 25, 2, '#e8dcc0')
    el(g, 20, 18, 6, 6, '#e07a2a', null)
    g.fillStyle = '#5a8a2a'
    g.fillRect(19, 22, 2, 7)
  },
  log: g => {
    rr(g, 7, 13, 26, 14, 7, '#7a5634')
    el(g, 29, 20, 6, 7, '#c8a070')
    el(g, 29, 20, 3, 3.5, '#a07a4a', null)
  },
  sheet: g => {
    rr(g, 8, 12, 24, 18, 2, '#d8d4e8')
    g.fillStyle = 'rgba(80,80,140,0.3)'
    g.fillRect(8, 18, 24, 3)
    g.fillRect(8, 24, 24, 3)
  },
  lighter: g => {
    rr(g, 14, 12, 12, 22, 2, '#c8302a')
    rr(g, 14, 8, 12, 5, 1, '#b8bcbe')
    el(g, 20, 5, 2.5, 4, '#f2b42a', null)
  },
  flashlight: g => {
    g.save()
    g.translate(20, 20)
    g.rotate(-0.6)
    rr(g, -14, -4, 20, 8, 3, '#2e3034')
    rr(g, 5, -6, 9, 12, 2, '#4a4e54')
    el(g, 14, 0, 2, 5, '#f2e6a0', null)
    g.restore()
  },
  battery: g => {
    rr(g, 11, 10, 18, 24, 2, '#2e3034')
    rr(g, 11, 10, 18, 9, 2, '#e8b42a', null)
    rr(g, 16, 6, 8, 4, 1, '#9aa0a4')
  },
  backpack: g => {
    rr(g, 9, 9, 22, 26, 6, '#5a6a3a')
    rr(g, 12, 21, 16, 10, 3, '#4a5a2e')
    rr(g, 15, 5, 10, 6, 3, '#3a4426', OUT, 1.2)
  },
  dufflebag: g => {
    rr(g, 6, 13, 28, 18, 8, '#3a4a6a')
    g.strokeStyle = '#1e2638'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(14, 13)
    g.quadraticCurveTo(20, 4, 26, 13)
    g.stroke()
  },
  book_carp: book('#8a5a2a'),
  book_aid: book('#c83a32'),
  book_blunt: book('#3a4a6a'),
  book_farm: book('#4a7a2a'),
  watch: g => {
    rr(g, 16, 5, 8, 30, 2, '#4a3a2a')
    el(g, 20, 20, 8, 8, '#d6dadc')
    el(g, 20, 20, 6, 6, '#f0ede4', null)
    g.strokeStyle = OUT
    g.lineWidth = 1.2
    g.beginPath()
    g.moveTo(20, 20)
    g.lineTo(20, 16)
    g.moveTo(20, 20)
    g.lineTo(23, 21)
    g.stroke()
  },
  cigarettes: g => {
    rr(g, 11, 10, 18, 24, 2, '#f0ede4')
    rr(g, 11, 10, 18, 8, 2, '#c83a32', null)
    for (let i = 0; i < 3; i++) rr(g, 13 + i * 5, 5, 4, 7, 1, '#e8a060', OUT, 1)
  },
  magazine: g => {
    rr(g, 9, 6, 22, 29, 1, '#d84a8a')
    rr(g, 12, 13, 16, 12, 1, '#f0d070', null)
    g.fillStyle = '#f0ede4'
    g.fillRect(12, 8, 16, 3)
  }
}

export function iconURL(id) {
  if (cache[id]) return cache[id]
  const c = document.createElement('canvas')
  c.width = S * 2
  c.height = S * 2
  const g = c.getContext('2d')
  g.scale(2, 2)
  g.lineJoin = 'round'
  const fn = P[id]
  if (fn) fn(g)
  else rr(g, 10, 10, 20, 20, 4, '#7a7a7a')
  cache[id] = c.toDataURL()
  return cache[id]
}
