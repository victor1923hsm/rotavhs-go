// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\route\\labels.ts (versão de 2026-11-19).
/**
 * Rótulos da parada para a interface (D1/D2, ajustes de leitura 4.12). Puros, sem dados pessoais.
 * O número exibido é SEMPRE o original da etiqueta; nunca a posição na rota otimizada.
 *
 * 4.12: "parada sem número" (sem Stop na etiqueta) e "endereço sem número" (casa S/N) são coisas
 * diferentes e nunca usam o mesmo texto. "S/N" fica reservado ao endereço, como no uso comum.
 */
import type { NormalizedAddress } from '../address/address'
import type { StopIssue } from '../import/build'

/** Texto curto da parada sem número de etiqueta (D2). */
export const SEM_NUMERO_PARADA = 'Sem nº de parada'

/** "Parada 12" ou "Sem nº de parada". */
export const stopTitle = (n: number | null): string => (n === null ? SEM_NUMERO_PARADA : `Parada ${n}`)

/** Rótulo acessível do número (o círculo `StopNumber` é decorativo). */
export const stopNumberA11y = (n: number | null): string => (n === null ? 'Parada sem número na etiqueta' : `Parada ${n}`)

/** D1: "endereço 1 de 2" quando o mesmo número aparece em locais diferentes; senão null. */
export function splitPartLabel(issues: readonly StopIssue[]): string | null {
  const p = splitPart(issues)
  return p ? `endereço ${p.part} de ${p.parts}` : null
}

export function splitPart(issues: readonly StopIssue[]): { part: number; parts: number } | null {
  const d = issues.find((i) => i.code === 'stop_dividido')
  return d && d.code === 'stop_dividido' ? { part: d.part, parts: d.parts } : null
}

/** "3 pacotes" (só quando houver mais de um). */
export const packagesLabel = (n: number): string | null => (n > 1 ? `${n} pacotes` : null)

/**
 * Endereço sem número da casa: "casa sem nº". null quando há número, ou quando a porta é
 * identificada por quadra e lote (que já aparecem no texto do endereço).
 */
export function addressNumberHint(n: Pick<NormalizedAddress, 'number' | 'quadra' | 'lote'>): string | null {
  if (n.number && n.number !== 'sn') return null
  return n.quadra && n.lote ? null : 'casa sem nº'
}

/** Faixa de números para os cabeçalhos da lista longa: 1–10, 11–20… (null = sem número). */
export function numberBand(n: number | null, size = 10): string {
  if (n === null) return SEM_NUMERO_PARADA
  const ini = Math.floor((Math.max(n, 1) - 1) / size) * size + 1
  return `${ini}–${ini + size - 1}`
}
