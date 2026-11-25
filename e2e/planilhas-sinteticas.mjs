// Planilhas SPX SINTÉTICAS para o teste de ponta a ponta da importação (nenhum dado real).
// Formato real da SPX (CLAUDE.md): uma linha por pacote. Endereços "Rua Teste N", bairro e cidade fictícios.
const CAB = 'AT ID,Sequence,Stop,SPX TN,Destination Address,Bairro,City,Zipcode/Postal code,Latitude,Longitude'
const C = { lat: -15.8, lon: -47.9 }

function linha(seq, stop, tn, rua, lat, lon) {
  return ['AT0000TESTE', seq, stop, `BR26${String(tn).padStart(10, '0')}X`, `"Rua Teste ${rua}, ${10 + (rua % 90)}"`, 'Bairro Ficticio', 'Cidade Teste', `70000-${String(rua % 1000).padStart(3, '0')}`, lat, lon].join(',')
}

/** n pacotes; ~20% das paradas com 2 pacotes. */
function basica(n, mut = () => {}) {
  const linhas = []
  let stop = 0
  for (let i = 0; i < n; i++) {
    if (i === 0 || i % 5 !== 1) stop++ // a cada 5 pacotes, um vai junto com o anterior
    const lat = (C.lat + (stop % 17) * 0.0011 + Math.floor(stop / 17) * 0.0007).toFixed(5)
    const lon = (C.lon + Math.floor(stop / 17) * 0.0013 + (stop % 7) * 0.0004).toFixed(5)
    const l = { seq: i + 1, stop, tn: 1000 + i, rua: stop, lat, lon }
    mut(l, i)
    linhas.push(linha(l.seq, l.stop, l.tn, l.rua, l.lat, l.lon))
  }
  return { csv: [CAB, ...linhas].join('\n') + '\n', pacotes: n }
}

export function casos() {
  return [
    { nome: '10 encomendas', arquivo: 'spx-10.csv', ...basica(10) },
    { nome: '50 encomendas', arquivo: 'spx-50.csv', ...basica(50) },
    { nome: '100 encomendas', arquivo: 'spx-100.csv', ...basica(100) },
    { nome: '200 encomendas', arquivo: 'spx-200.csv', ...basica(200) },
    {
      nome: 'Endereços repetidos (paradas diferentes no mesmo endereço e parada dividida)',
      arquivo: 'spx-enderecos-repetidos.csv',
      ...basica(20, (l, i) => {
        if (i === 6 || i === 7 || i === 8) {
          l.rua = 3 // paradas 5, 6 e 7 com o endereço da parada 3
          l.lat = (C.lat + 3 * 0.0011).toFixed(5)
          l.lon = (C.lon + 3 * 0.0004).toFixed(5)
        }
        if (i === 12) l.rua = 77 // mesma parada do pacote anterior, outro endereço (parada dividida)
      }),
    },
    {
      // Parada 5 dividida (Rua Teste 5 e Rua Teste 8); a parte da Rua Teste 8 é a mesma porta da parada 8.
      // Juntar as partes + "São o mesmo local" cruzam na mesma parte: não pode contar pacote duas vezes.
      nome: 'Escolhas "juntar" que se cruzam (parada dividida + mesmo local)',
      arquivo: 'spx-juntar-cruzado.csv',
      juntar: true,
      ...basica(20, (l, i) => {
        if (i === 6) {
          l.rua = 8
          l.lat = (C.lat + 8 * 0.0011).toFixed(5)
          l.lon = (C.lon + (8 % 7) * 0.0004).toFixed(5)
        }
      }),
    },
    {
      nome: 'Coordenadas ausentes',
      arquivo: 'spx-sem-coordenadas.csv',
      ...basica(15, (l, i) => {
        if (i % 4 === 2) {
          l.lat = ''
          l.lon = ''
        }
      }),
    },
    {
      nome: 'Coordenadas inválidas (texto, fora do mundo, zero e muito longe)',
      arquivo: 'spx-coordenadas-invalidas.csv',
      ...basica(15, (l, i) => {
        if (i === 2) { l.lat = 'abc'; l.lon = 'xyz' }
        if (i === 5) { l.lat = '999'; l.lon = '-999' }
        if (i === 8) { l.lat = '0'; l.lon = '0' }
        if (i === 11) { l.lat = '-3.1'; l.lon = '-60.0' } // ~2.000 km do resto: suspeita
      }),
    },
    {
      nome: 'Pacote repetido (o mesmo código duas vezes)',
      arquivo: 'spx-pacote-repetido.csv',
      repetido: true,
      ...basica(12, (l, i) => {
        if (i === 9) l.tn = 1003
      }),
      pacotes: 11,
    },
  ]
}
