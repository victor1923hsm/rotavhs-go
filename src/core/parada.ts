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
