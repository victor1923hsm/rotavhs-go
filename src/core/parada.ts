// Parada: unidade de visita. O número do Stop é o da etiqueta e NUNCA é renumerado (CLAUDE.md).

import type { Ponto } from './geo'

export interface Parada extends Ponto {
  id: string
  /** Número Stop original da etiqueta. null = não veio na planilha → exibido como "?". */
  stop: number | null
  /** Stop dividido: mesmo número em endereços diferentes, mantidos separados e sinalizados. */
  parte?: { i: number; n: number }
  /** Códigos dos pacotes (SPX TN). */
  pacotes: string[]
  endereco: string
  /** Outros endereços escritos de outro jeito, ligados por decisão sua ("são o mesmo local"). */
  outrosEnderecos?: string[]
  bairro: string
  cep?: string
  semNumero: boolean
  /** Sem coordenada válida na planilha: fica na lista, mas fora do mapa e do cálculo de km. */
  semCoordenada?: boolean
  /**
   * A coordenada veio na planilha, mas fica longe demais do resto da rota (ex.: latitude e longitude trocadas).
   * Fica fora do mapa e do km, como `semCoordenada`, e a tela diz "localização não confirmada".
   */
  coordenadaSuspeita?: boolean
}

export const temCoordenada = (p: Pick<Parada, 'lat' | 'lon' | 'semCoordenada'>): boolean =>
  !p.semCoordenada && Number.isFinite(p.lat) && Number.isFinite(p.lon)

export type Status = 'pendente' | 'entregue' | 'falha'

export function rotuloStop(p: Pick<Parada, 'stop'>): string {
  return p.stop === null ? '?' : String(p.stop)
}

/** Busca rápida pelo Stop: todas as paradas com esse número (mais de uma = Stop dividido). */
export function buscarStop(paradas: readonly Parada[], texto: string): Parada[] {
  const t = texto.trim()
  if (t === '?') return paradas.filter((p) => p.stop === null)
  if (!/^\d+$/.test(t)) return []
  const n = Number(t)
  return paradas.filter((p) => p.stop === n)
}

/** Código do pacote para comparar: maiúsculas, sem espaços nem traços. */
const codigoBusca = (t: string) => t.toUpperCase().replace(/[\s-]/g, '')

/**
 * Busca pelo Stop (só dígitos, até 4, ou "?") ou por parte do código do pacote (SPX TN, 3+ caracteres).
 * Devolve também, por parada, os códigos que bateram.
 */
export function buscarParadas(paradas: readonly Parada[], texto: string): { paradas: Parada[]; codigos: Map<string, string[]>; tipo: 'stop' | 'codigo' | 'nada' } {
  const t = texto.trim()
  if (t === '?' || /^\d{1,4}$/.test(t)) return { paradas: buscarStop(paradas, t), codigos: new Map(), tipo: 'stop' }
  const c = codigoBusca(t)
  if (c.length < 3) return { paradas: [], codigos: new Map(), tipo: 'nada' }
  const codigos = new Map<string, string[]>()
  const achadas = paradas.filter((p) => {
    const bate = p.pacotes.filter((x) => codigoBusca(x).includes(c))
    if (bate.length) codigos.set(p.id, bate)
    return bate.length > 0
  })
  return { paradas: achadas, codigos, tipo: 'codigo' }
}
