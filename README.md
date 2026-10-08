# Vale Morto

Jogo de sobrevivência zumbi em visão de cima, feito para rodar no navegador. Inspirado no gênero de sobrevivência sandbox: saqueie casas, barrique janelas, trate ferimentos e dure o máximo possível. A morte é permanente.

## Como jogar

- `W A S D` mover, `Shift` correr, `C` agachar
- Mouse para mirar, clique para atacar ou atirar, `Espaço` empurra
- `E` interage com portas, janelas, móveis, camas, pias e corpos
- `B` barrica (martelo + tábua + 2 pregos), `Shift+B` remove tábua
- `R` recarrega, `Q` troca de arma, `F` lanterna, `G` cava canteiro
- `Tab` inventário, `J` saúde, `K` habilidades, `O` criação, `M` mapa, `Esc` pausa

## Mecânicas

- Mundo procedural com casas, mercado, farmácia, loja de ferragens, delegacia, parque e fazendas
- Fome, sede, cansaço, fôlego, pânico, dor, enjoo e carga
- Ferimentos por região do corpo, sangramento, curativos, desinfecção e infecção bacteriana
- Infecção zumbi por mordida (e às vezes arranhões), sem cura
- Zumbis que ouvem barulho, enxergam em linha de visão, perseguem por caminhos e arrombam portas e janelas
- Dia e noite, chuva, lanterna, corte de água e energia, helicóptero e alarmes
- Profissões, traços, 10 habilidades com experiência e livros
- Criação: trapos, bandagens, tábuas, lança, fogueira, coletor de chuva, caixote e parede de madeira
- Plantio, cozinha, fervura de água e saves automáticos no navegador

## Rodando localmente

É um site estático sem build. Sirva a pasta com qualquer servidor:

```
python3 -m http.server 8000
```

## Mapa de Jaraguá do Sul

O mapa "Jaraguá do Sul — Centro" é gerado a partir de dados do OpenStreetMap (© colaboradores do OpenStreetMap, licença ODbL). Os prédios aparecem com nomes genéricos (Colégio, Shopping, Igreja); as ruas mantêm os nomes reais.

Para regenerar: `node tools/osm2map.mjs data/jaragua-centro.osm maps/jaragua.json --max=1000`
