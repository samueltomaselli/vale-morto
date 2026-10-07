export const ITEMS = {
  beans: { name: 'Feijão enlatado', w: 0.6, kind: 'food', hunger: 35, thirst: 5, stack: true },
  soup: { name: 'Sopa enlatada', w: 0.6, kind: 'food', hunger: 25, thirst: -10, stack: true },
  chips: { name: 'Salgadinho', w: 0.2, kind: 'food', hunger: 12, thirst: 8, stack: true },
  peanut: { name: 'Pasta de amendoim', w: 0.5, kind: 'food', hunger: 30, thirst: 10, stack: true },
  crackers: { name: 'Bolachas', w: 0.2, kind: 'food', hunger: 14, thirst: 6, stack: true },
  apple: { name: 'Maçã', w: 0.2, kind: 'food', hunger: 12, thirst: -5, perish: 5 },
  bread: { name: 'Pão', w: 0.3, kind: 'food', hunger: 20, thirst: 5, perish: 3 },
  milk: { name: 'Leite', w: 1, kind: 'food', hunger: 10, thirst: -30, perish: 2 },
  meat: { name: 'Carne crua', w: 0.5, kind: 'food', hunger: 25, thirst: 0, perish: 2, raw: true },
  cooked_meat: { name: 'Carne assada', w: 0.4, kind: 'food', hunger: 40, thirst: 5, perish: 3 },
  veggie: { name: 'Legumes da horta', w: 0.3, kind: 'food', hunger: 18, thirst: -5, perish: 6 },
  water: { name: 'Garrafa de água', w: 1, kind: 'drink', thirst: 45, leaves: 'bottle', stack: true },
  tainted: { name: 'Água contaminada', w: 1, kind: 'drink', thirst: 45, leaves: 'bottle', tainted: true, stack: true },
  soda: { name: 'Refrigerante', w: 0.4, kind: 'drink', thirst: 25, hunger: 3, stack: true },
  bottle: { name: 'Garrafa vazia', w: 0.1, kind: 'misc', stack: true },
  bandage: { name: 'Bandagem estéril', w: 0.05, kind: 'med', stack: true },
  rag: { name: 'Trapo', w: 0.05, kind: 'med', stack: true },
  disinfectant: { name: 'Desinfetante', w: 0.3, kind: 'med', stack: true },
  painkillers: { name: 'Analgésicos', w: 0.1, kind: 'med', stack: true },
  calm: { name: 'Calmantes', w: 0.1, kind: 'med', stack: true },
  antibiotics: { name: 'Antibióticos', w: 0.1, kind: 'med', stack: true },
  vitamins: { name: 'Vitaminas', w: 0.1, kind: 'med', stack: true },
  knife: { name: 'Faca de cozinha', w: 0.4, kind: 'weapon', cat: 'blade', dmg: 1.1, range: 1.0, speed: 0.45, dur: 25, stam: 4 },
  bat: { name: 'Taco de beisebol', w: 1.2, kind: 'weapon', cat: 'blunt', dmg: 1.6, range: 1.4, speed: 0.75, dur: 45, stam: 9 },
  crowbar: { name: 'Pé de cabra', w: 1.5, kind: 'weapon', cat: 'blunt', dmg: 1.7, range: 1.3, speed: 0.8, dur: 90, stam: 10, pry: true },
  axe: { name: 'Machado', w: 2, kind: 'weapon', cat: 'blade', dmg: 2.8, range: 1.4, speed: 1.0, dur: 60, stam: 14, chop: true },
  hammer: { name: 'Martelo', w: 1, kind: 'weapon', cat: 'blunt', dmg: 1.0, range: 1.0, speed: 0.55, dur: 50, stam: 6, tool: 'hammer' },
  pan: { name: 'Frigideira', w: 1.2, kind: 'weapon', cat: 'blunt', dmg: 1.3, range: 1.1, speed: 0.7, dur: 30, stam: 8 },
  spear: { name: 'Lança improvisada', w: 1.3, kind: 'weapon', cat: 'blade', dmg: 1.5, range: 1.9, speed: 0.7, dur: 18, stam: 8 },
  plank: { name: 'Tábua', w: 1.5, kind: 'weapon', cat: 'blunt', dmg: 0.9, range: 1.3, speed: 0.75, dur: 8, stam: 9, mat: true },
  pistol: { name: 'Pistola 9mm', w: 1, kind: 'weapon', cat: 'gun', dmg: 3.5, range: 14, speed: 0.4, dur: 400, ammo: 'ammo9', mag: 15, noise: 38 },
  shotgun: { name: 'Espingarda', w: 3.5, kind: 'weapon', cat: 'gun', dmg: 3, range: 8, speed: 1.0, dur: 300, ammo: 'shells', mag: 6, noise: 50, pellets: 6 },
  ammo9: { name: 'Munição 9mm', w: 0.01, kind: 'ammo', stack: true },
  shells: { name: 'Cartuchos', w: 0.03, kind: 'ammo', stack: true },
  nails: { name: 'Pregos', w: 0.01, kind: 'mat', stack: true },
  saw: { name: 'Serrote', w: 0.8, kind: 'tool' },
  shovel: { name: 'Pá', w: 2, kind: 'tool' },
  seeds: { name: 'Sementes', w: 0.05, kind: 'mat', stack: true },
  log: { name: 'Tora de madeira', w: 6, kind: 'mat', stack: true },
  sheet: { name: 'Lençol', w: 0.6, kind: 'mat', stack: true },
  lighter: { name: 'Isqueiro', w: 0.05, kind: 'tool' },
  flashlight: { name: 'Lanterna', w: 0.4, kind: 'tool', battery: true },
  battery: { name: 'Pilha', w: 0.05, kind: 'mat', stack: true },
  backpack: { name: 'Mochila', w: 0.5, kind: 'bag', cap: 12 },
  dufflebag: { name: 'Bolsa de lona', w: 0.8, kind: 'bag', cap: 9 },
  book_carp: { name: 'Revista de carpintaria', w: 0.2, kind: 'book', skill: 'carpentry' },
  book_aid: { name: 'Manual de primeiros socorros', w: 0.2, kind: 'book', skill: 'firstAid' },
  book_blunt: { name: 'Livro de autodefesa', w: 0.2, kind: 'book', skill: 'blunt' },
  book_farm: { name: 'Almanaque de horta', w: 0.2, kind: 'book', skill: 'farming' },
  watch: { name: 'Relógio de pulso', w: 0.05, kind: 'misc' },
  cigarettes: { name: 'Cigarros', w: 0.05, kind: 'misc', stack: true },
  magazine: { name: 'Revista de fofoca', w: 0.1, kind: 'fun', stack: true }
}

export const SKILLS = {
  blunt: 'Contundente',
  blade: 'Lâmina',
  gun: 'Armas de fogo',
  carpentry: 'Carpintaria',
  firstAid: 'Primeiros socorros',
  sprint: 'Corrida',
  sneak: 'Furtividade',
  fitness: 'Condicionamento',
  strength: 'Força',
  farming: 'Agricultura'
}

export const PROFESSIONS = [
  { id: 'unemployed', name: 'Desempregado', points: 8, desc: 'Sem talentos, mais pontos para traços.', skills: {} },
  { id: 'fire', name: 'Bombeiro', points: 0, desc: 'Machado +2, Corrida +1, Condicionamento +1.', skills: { blade: 2, sprint: 1, fitness: 1 } },
  { id: 'police', name: 'Policial', points: -4, desc: 'Armas de fogo +3, Corrida +1.', skills: { gun: 3, sprint: 1 } },
  { id: 'carpenter', name: 'Carpinteiro', points: 2, desc: 'Carpintaria +3, Contundente +1. Barricadas mais fortes.', skills: { carpentry: 3, blunt: 1 } },
  { id: 'nurse', name: 'Enfermeira(o)', points: 2, desc: 'Primeiros socorros +3, Furtividade +1.', skills: { firstAid: 3, sneak: 1 } },
  { id: 'lumberjack', name: 'Lenhador', points: 0, desc: 'Lâmina +2, Força +1. Corta árvores mais rápido.', skills: { blade: 2, strength: 1 } },
  { id: 'farmer', name: 'Agricultor', points: 2, desc: 'Agricultura +3, Força +1.', skills: { farming: 3, strength: 1 } },
  { id: 'burglar', name: 'Arrombador', points: -2, desc: 'Furtividade +2, Corrida +2. Abre portas trancadas sem ferramenta.', skills: { sneak: 2, sprint: 2 } }
]

export const TRAITS = [
  { id: 'athletic', name: 'Atlético', cost: 6, desc: 'Corre mais rápido e cansa menos.' },
  { id: 'strong', name: 'Forte', cost: 6, desc: 'Mais dano corpo a corpo e carga.' },
  { id: 'catEyes', name: 'Olhos de gato', cost: 2, desc: 'Enxerga melhor à noite.' },
  { id: 'lightFoot', name: 'Pés leves', cost: 4, desc: 'Faz menos barulho ao andar e correr.' },
  { id: 'fastLearner', name: 'Aprende rápido', cost: 6, desc: '+30% de experiência.' },
  { id: 'thickSkin', name: 'Pele grossa', cost: 6, desc: 'Ataques rasgam a pele com menos frequência.' },
  { id: 'lowAppetite', name: 'Pouco apetite', cost: 3, desc: 'Fica com fome mais devagar.' },
  { id: 'organized', name: 'Organizado', cost: 4, desc: '+30% de capacidade de carga.' },
  { id: 'shortSighted', name: 'Míope', cost: -2, desc: 'Visão reduzida.' },
  { id: 'clumsy', name: 'Desastrado', cost: -4, desc: 'Faz mais barulho.' },
  { id: 'heartyAppetite', name: 'Glutão', cost: -4, desc: 'Fica com fome mais rápido.' },
  { id: 'cowardly', name: 'Medroso', cost: -3, desc: 'Entra em pânico com facilidade.' },
  { id: 'weak', name: 'Fraco', cost: -5, desc: 'Menos dano e carga.' },
  { id: 'unfit', name: 'Sedentário', cost: -6, desc: 'Cansa muito rápido.' },
  { id: 'slowHealer', name: 'Cicatrização lenta', cost: -4, desc: 'Ferimentos demoram mais a sarar.' },
  { id: 'prone', name: 'Propenso a infecções', cost: -3, desc: 'Ferimentos infeccionam com facilidade.' }
]

export const RECIPES = [
  { id: 'rags', name: 'Rasgar lençol em trapos', needs: { sheet: 1 }, gives: { rag: 4 }, time: 2 },
  { id: 'bandage', name: 'Esterilizar trapo', needs: { rag: 1, disinfectant: 0.25 }, gives: { bandage: 1 }, time: 2 },
  { id: 'planks', name: 'Serrar tora em tábuas', needs: { log: 1 }, tools: ['saw'], gives: { plank: 3 }, time: 6, skill: 'carpentry', xp: 8 },
  { id: 'spear', name: 'Lança improvisada', needs: { plank: 1, knife: 1 }, gives: { spear: 1 }, time: 5, skill: 'carpentry', xp: 5 },
  { id: 'campfire', name: 'Montar fogueira', needs: { plank: 2 }, tools: ['lighter'], place: 'campfire', time: 6 },
  { id: 'collector', name: 'Coletor de chuva', needs: { plank: 4, nails: 4, sheet: 1 }, tools: ['hammer'], place: 'collector', time: 10, skill: 'carpentry', xp: 15, minSkill: { carpentry: 1 } },
  { id: 'crate', name: 'Caixote de madeira', needs: { plank: 3, nails: 4 }, tools: ['hammer'], place: 'crate', time: 8, skill: 'carpentry', xp: 10 },
  { id: 'wall', name: 'Parede de madeira', needs: { plank: 3, nails: 6 }, tools: ['hammer'], place: 'woodwall', time: 10, skill: 'carpentry', xp: 15, minSkill: { carpentry: 2 } }
]

export const LOOT = {
  fridge: [['apple', 4], ['bread', 3], ['milk', 3], ['meat', 2], ['soda', 3], ['water', 2]],
  counter: [['knife', 3], ['beans', 4], ['soup', 4], ['chips', 3], ['crackers', 3], ['peanut', 2], ['pan', 2], ['lighter', 2], ['water', 2], ['bottle', 2]],
  stove: [['pan', 2]],
  wardrobe: [['sheet', 6], ['backpack', 1], ['dufflebag', 1], ['watch', 1], ['magazine', 2]],
  shelf: [['magazine', 3], ['book_carp', 1], ['book_aid', 1], ['book_blunt', 1], ['book_farm', 1], ['battery', 2], ['flashlight', 1], ['cigarettes', 2]],
  cabinet: [['bandage', 2], ['rag', 3], ['disinfectant', 2], ['painkillers', 2], ['vitamins', 1], ['calm', 1], ['battery', 2], ['lighter', 1]],
  toolbox: [['hammer', 4], ['nails', 6], ['saw', 3], ['crowbar', 2], ['axe', 1], ['shovel', 1], ['seeds', 2], ['flashlight', 2], ['battery', 2]],
  market: [['beans', 6], ['soup', 6], ['chips', 5], ['crackers', 5], ['peanut', 4], ['water', 6], ['soda', 5], ['bottle', 2], ['battery', 2], ['lighter', 2]],
  pharmacy: [['bandage', 6], ['disinfectant', 5], ['painkillers', 5], ['antibiotics', 4], ['calm', 4], ['vitamins', 4], ['rag', 2]],
  hardware: [['hammer', 5], ['nails', 8], ['saw', 5], ['axe', 3], ['crowbar', 3], ['shovel', 3], ['seeds', 5], ['flashlight', 4], ['battery', 4], ['bat', 3]],
  police: [['pistol', 3], ['ammo9', 6], ['shotgun', 2], ['shells', 4], ['flashlight', 3], ['bandage', 2], ['bat', 1]],
  corpse: [['ammo9', 1], ['chips', 2], ['lighter', 2], ['cigarettes', 3], ['bandage', 1], ['knife', 1], ['watch', 1], ['water', 1], ['crackers', 1]],
  shed: [['hammer', 2], ['nails', 3], ['axe', 2], ['shovel', 2], ['seeds', 3], ['saw', 2], ['plank', 3], ['log', 1]]
}

export const STACK_AMOUNTS = {
  nails: [6, 20], ammo9: [5, 15], shells: [3, 8], seeds: [3, 8], rag: [1, 4], battery: [1, 3], cigarettes: [1, 5]
}

export const FURN = {
  fridge: { name: 'Geladeira', color: '#c9cfd2', loot: 'fridge', rolls: [2, 4] },
  counter: { name: 'Balcão', color: '#8a6a4a', loot: 'counter', rolls: [1, 3] },
  stove: { name: 'Fogão', color: '#55595c', loot: 'stove', rolls: [0, 1], cook: true },
  sink: { name: 'Pia', color: '#9fb6c2', sink: true },
  wardrobe: { name: 'Guarda-roupa', color: '#6b4a32', loot: 'wardrobe', rolls: [1, 3] },
  shelf: { name: 'Estante', color: '#7a5b3e', loot: 'shelf', rolls: [1, 3] },
  cabinet: { name: 'Armário do banheiro', color: '#d9d4c7', loot: 'cabinet', rolls: [1, 3] },
  toolbox: { name: 'Caixa de ferramentas', color: '#a8352b', loot: 'toolbox', rolls: [1, 3] },
  bed: { name: 'Cama', color: '#5e6f8f', bed: true },
  sofa: { name: 'Sofá', color: '#6d5a7a', bed: true, sofa: true },
  rack: { name: 'Prateleira', color: '#8b7d5c', loot: 'market', rolls: [2, 5] },
  medrack: { name: 'Prateleira da farmácia', color: '#b9c9c0', loot: 'pharmacy', rolls: [2, 4] },
  toolrack: { name: 'Expositor de ferramentas', color: '#8d4a32', loot: 'hardware', rolls: [2, 4] },
  locker: { name: 'Armário de armas', color: '#3e4a5a', loot: 'police', rolls: [1, 3] },
  crate: { name: 'Caixote', color: '#9a7343', container: true },
  campfire: { name: 'Fogueira', color: '#c25b26', cook: true, fire: true },
  collector: { name: 'Coletor de chuva', color: '#5a7f9a', collector: true },
  shedbox: { name: 'Caixa do galpão', color: '#7f6a48', loot: 'shed', rolls: [1, 3] }
}
