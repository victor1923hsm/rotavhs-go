// MODELO DE TESTE · dados FICTÍCIOS (G11). Nenhum dado real: endereços inventados, códigos inventados.
// ~60 paradas numa área urbana genérica, com: Stops de vários pacotes, um Stop dividido,
// uma parada "?" (Stop ausente na planilha) e uma "casa sem nº".

import type { Ponto } from '@/core/geo'
import type { Parada } from '@/core/parada'

/** Gerador determinístico (mulberry32): os mesmos dados em toda execução. */
function rng(semente: number) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RUAS = [
  'Rua das Acácias', 'Rua dos Ipês', 'Av. das Palmeiras', 'Rua Sete Lagoas', 'Rua do Cerrado', 'Rua Buriti',
  'Rua Jatobá', 'Av. Central', 'Rua Pequi', 'Rua das Orquídeas', 'Rua Aroeira', 'Travessa do Sol',
  'Rua Canela', 'Rua Jacarandá', 'Rua Manacá', 'Rua Sucupira',
]
const BAIRROS = ['Jardim Modelo', 'Vila Exemplo', 'Parque Teste']

/** Centro da área genérica de teste. */
export const CENTRO: Ponto = { lat: -16.6869, lon: -49.2648 }
/** Posição de teste (simulada), rotulada assim na tela. Não é GPS. */
export const POSICAO_TESTE: Ponto = { lat: -16.6952, lon: -49.2771 }

function gerar(): Parada[] {
  const r = rng(20261119)
  const paradas: Parada[] = []
  let tn = 4821
  const total = 58
  for (let s = 1; s <= total; s++) {
    // Serpentina pela área (a ordem da SPX segue mais ou menos o número do Stop), com ruído.
    const linha = Math.floor((s - 1) / 10)
    const col = linha % 2 === 0 ? (s - 1) % 10 : 9 - ((s - 1) % 10)
    const lat = CENTRO.lat - 0.012 + linha * 0.0042 + (r() - 0.5) * 0.0034
    const lon = CENTRO.lon - 0.014 + col * 0.0029 + (r() - 0.5) * 0.0034
    const nPac = r() < 0.62 ? 1 : r() < 0.7 ? 2 : r() < 0.75 ? 3 : 4
    const pacotes = Array.from({ length: nPac }, () => `BR26${String(++tn).padStart(9, '0')}X`)
    const semNumero = s === 31
    const rua = RUAS[Math.floor(r() * RUAS.length)]!
    const endereco = semNumero ? `${rua}, s/n` : `${rua}, ${10 + Math.floor(r() * 990)}`
    const bairro = BAIRROS[linha % BAIRROS.length]!
    if (s === 23) {
      // Stop dividido: mesmo número em dois endereços diferentes (~350 m), nunca unidos.
      paradas.push({ id: 'p23a', stop: 23, parte: { i: 1, n: 2 }, pacotes: pacotes.slice(0, 1), endereco, bairro, semNumero, lat, lon })
      paradas.push({
        id: 'p23b', stop: 23, parte: { i: 2, n: 2 }, pacotes: [`BR26${String(++tn).padStart(9, '0')}X`],
        endereco: `Rua Ingá, ${200 + Math.floor(r() * 300)}`, bairro, semNumero: false, lat: lat + 0.0031, lon: lon - 0.0006,
      })
      continue
    }
    paradas.push({ id: `p${s}`, stop: s, pacotes, endereco, bairro, semNumero, lat, lon })
  }
  // Parada "?": o Stop não veio na planilha. Nunca recebe número inventado.
  paradas.push({
    id: 'p-sem-stop', stop: null, pacotes: [`BR26${String(++tn).padStart(9, '0')}X`],
    endereco: 'Rua Ipê Roxo, 77', bairro: BAIRROS[1]!, semNumero: false, lat: CENTRO.lat + 0.0015, lon: CENTRO.lon - 0.0042,
  })
  return paradas
}

export const PARADAS: readonly Parada[] = gerar()
/** Ordem original da SPX (Sequence): pelo número do Stop; o "?" fica no fim. */
export const ORDEM_SPX: readonly string[] = [...PARADAS]
  .sort((a, b) => (a.stop ?? Infinity) - (b.stop ?? Infinity) || (a.parte?.i ?? 0) - (b.parte?.i ?? 0))
  .map((p) => p.id)
export const ARQUIVO_EXEMPLO = 'Rotas_exemplo.xlsx'
