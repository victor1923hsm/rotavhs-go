// Entrega parcial (R1, Etapa 3): a situação de cada pacote é a fonte da verdade; a da visita é derivada.
// Regras: a visita fica PENDENTE enquanto houver pacote pendente; só conclui quando todos tiverem situação
// final. Cada pacote mantém o código SPX e a visita (Stop) originais.

import type { Status } from './parada'

export type SituacaoVisita =
  | 'pendente' // nenhum pacote marcado
  | 'em-andamento' // parte marcada, parte pendente: a visita continua pendente
  | 'entregue' // todos com situação final e todos entregues
  | 'falha' // todos sem sucesso
  | 'parcial' // concluída com entregue + sem sucesso

/** Status da visita para a rota: pendente enquanto houver pacote pendente. */
export function statusDaVisita(pacotes: readonly Status[]): Status {
  if (pacotes.length === 0 || pacotes.includes('pendente')) return 'pendente'
  return pacotes.includes('entregue') ? 'entregue' : 'falha'
}

export function situacaoDaVisita(pacotes: readonly Status[]): SituacaoVisita {
  const c = contar(pacotes)
  if (c.pendentes === pacotes.length) return 'pendente'
  if (c.pendentes > 0) return 'em-andamento'
  if (c.falhas === 0) return 'entregue'
  if (c.entregues === 0) return 'falha'
  return 'parcial'
}

export function contar(pacotes: readonly Status[]) {
  let entregues = 0
  let falhas = 0
  let pendentes = 0
  for (const s of pacotes) {
    if (s === 'entregue') entregues++
    else if (s === 'falha') falhas++
    else pendentes++
  }
  return { entregues, falhas, pendentes, total: pacotes.length }
}

/** Texto curto, ex.: "2 de 3 entregues · 1 pendente". */
export function textoPacotes(pacotes: readonly Status[]): string {
  const c = contar(pacotes)
  const partes = [`${c.entregues} de ${c.total} entregue${c.total === 1 ? '' : 's'}`]
  if (c.falhas) partes.push(`${c.falhas} sem sucesso`)
  if (c.pendentes) partes.push(`${c.pendentes} pendente${c.pendentes === 1 ? '' : 's'}`)
  return partes.join(' · ')
}
