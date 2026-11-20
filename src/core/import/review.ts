// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\import\\review.ts (versão de 2026-11-19).
/**
 * Revisão da importação: duplicidades e conflitos (CA-4.04). Nada é removido sozinho:
 * cada ação é uma DECISÃO registrada (com horário) que pode ser desfeita. O número original nunca muda.
 */
import { doorKey } from '../address/address'
import type { DraftStop, ImportResult } from './build'

export type Finding =
  | { kind: 'pacote_repetido'; id: string; trackingCode: string; rows: number[] }
  | { kind: 'mesma_porta'; id: string; stopKeys: string[]; numbers: (number | null)[] }
  /**
   * D1: o mesmo número em locais diferentes. As partes ficam SEPARADAS; "São o mesmo local" só as liga
   * (`agrupar_paradas` → `groupedWith`), sem fundir pacotes, apagar endereços ou mudar números.
   */
  | { kind: 'stop_dividido'; id: string; number: number; stopKeys: string[]; rows: number[][] }

export type Decision =
  | { type: 'remover_linha'; row: number; findingId: string; at: number }
  | { type: 'manter_todas'; findingId: string; at: number }
  | { type: 'agrupar_paradas'; findingId: string; stopKeys: string[]; at: number }

/** Uma porta só é comparável se houver rua+número ou quadra+lote (evita juntar endereços vagos). */
export function comparableDoor(s: Pick<DraftStop, 'norm'>): string | null {
  const n = s.norm
  const hasStreet = n.streetKey && n.number && n.number !== 'sn'
  const hasLot = n.quadra && n.lote
  return hasStreet || hasLot ? doorKey(n) : null
}

export function findDuplicates(r: ImportResult): Finding[] {
  const out: Finding[] = []
  const byCode = new Map<string, number[]>()
  for (const p of r.packages) if (p.trackingCode) byCode.set(p.trackingCode, [...(byCode.get(p.trackingCode) ?? []), p.sourceRow])
  for (const [code, rows] of byCode) if (rows.length > 1) out.push({ kind: 'pacote_repetido', id: `pac:${code}`, trackingCode: code, rows })

  const byDoor = new Map<string, DraftStop[]>()
  for (const s of r.stops) {
    const k = comparableDoor(s)
    if (k) byDoor.set(k, [...(byDoor.get(k) ?? []), s])
  }
  for (const [k, ss] of byDoor) {
    // partes de um MESMO Stop dividido já aparecem como stop_dividido (não repete como "mesma porta")
    if (ss.length > 1 && new Set(ss.map((s) => s.originalNumber ?? s.key)).size > 1)
      out.push({ kind: 'mesma_porta', id: `porta:${k}`, stopKeys: ss.map((s) => s.key), numbers: ss.map((s) => s.originalNumber) })
  }

  const divididos = new Map<number, DraftStop[]>()
  for (const s of r.stops)
    if (s.originalNumber !== null && s.issues.some((i) => i.code === 'stop_dividido')) divididos.set(s.originalNumber, [...(divididos.get(s.originalNumber) ?? []), s])
  for (const [n, partes] of divididos) out.push({ kind: 'stop_dividido', id: `div:${n}`, number: n, stopKeys: partes.map((s) => s.key), rows: partes.map((s) => s.rows) })
  return out
}

/** Linhas removidas por decisão (e só por decisão). */
export const removedRows = (ds: readonly Decision[]): Set<number> => new Set(ds.flatMap((d) => (d.type === 'remover_linha' ? [d.row] : [])))

/** Remover uma linha repetida exige que reste pelo menos uma linha daquele pacote. */
export function removeRow(ds: readonly Decision[], f: Finding, row: number, at: number): Decision[] {
  if (f.kind !== 'pacote_repetido' || !f.rows.includes(row)) return [...ds]
  const removed = removedRows(ds)
  const restantes = f.rows.filter((r) => r !== row && !removed.has(r))
  if (restantes.length === 0) return [...ds]
  return [...ds, { type: 'remover_linha', row, findingId: f.id, at }]
}

/** Desfazer a última decisão de um achado. */
export function undo(ds: readonly Decision[], findingId: string): Decision[] {
  const i = ds.map((d) => d.findingId).lastIndexOf(findingId)
  return i < 0 ? [...ds] : [...ds.slice(0, i), ...ds.slice(i + 1)]
}

export const isResolved = (ds: readonly Decision[], f: Finding): boolean => ds.some((d) => d.findingId === f.id)

/**
 * 4.12 — Um cartão por LOCAL: junta "mesma porta" com os Stops divididos que têm parte naquela porta
 * (antes o mesmo lugar gerava dois cartões). Só muda a APRESENTAÇÃO: cada achado continua com a sua
 * própria decisão; nada é unido, removido ou renumerado. Ordem estável (a do primeiro achado do grupo).
 */
export function groupFindings(fs: readonly Finding[]): Finding[][] {
  const pai = fs.map((_, i) => i)
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i]!)))
  const donoDaChave = new Map<string, number>()
  fs.forEach((f, i) => {
    if (f.kind === 'pacote_repetido') return
    for (const k of f.stopKeys) {
      const j = donoDaChave.get(k)
      if (j === undefined) donoDaChave.set(k, i)
      else pai[raiz(i)] = raiz(j)
    }
  })
  const grupos = new Map<number, Finding[]>()
  fs.forEach((f, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), f]))
  return [...grupos.values()]
}

/**
 * Precisa da sua atenção? O Stop dividido já fica SEPARADO por padrão (D1), então é informativo;
 * pacote repetido e mesma porta com números diferentes pedem uma decisão.
 */
export const needsAttention = (f: Finding): boolean => f.kind !== 'stop_dividido'

/**
 * "Manter todas separadas": decisão explícita sua, registrada para cada achado ainda aberto de
 * mesma porta / Stop dividido, com o MESMO horário (para desfazer de uma vez com `undoBatch`).
 * Pacote repetido fica de fora: ali a escolha é qual linha remover.
 */
export function keepAllSeparate(ds: readonly Decision[], fs: readonly Finding[], at: number): { decisions: Decision[]; at: number; count: number } {
  let t = at
  while (ds.some((d) => d.at === t)) t++ // horário exclusivo do lote: o "Desfazer" não leva decisões de outro momento
  const novos = fs.filter((f) => f.kind !== 'pacote_repetido' && !isResolved(ds, f)).map((f): Decision => ({ type: 'manter_todas', findingId: f.id, at: t }))
  return { decisions: [...ds, ...novos], at: t, count: novos.length }
}

/** Desfaz o "Manter todas separadas" feito naquele horário (só as decisões dele). */
export const undoBatch = (ds: readonly Decision[], at: number): Decision[] => ds.filter((d) => !(d.type === 'manter_todas' && d.at === at))

/**
 * Aplica as decisões: devolve paradas e pacotes efetivos, SEM perder a contabilidade
 * (linhas removidas aparecem como "removida pelo usuário", com a decisão que as removeu).
 */
export function applyDecisions(r: ImportResult, ds: readonly Decision[]) {
  const removed = removedRows(ds)
  const packages = r.packages.filter((p) => !removed.has(p.sourceRow))
  const stops = r.stops
    .map((s) => ({ ...s, rows: s.rows.filter((x) => !removed.has(x)), packageCount: s.packageCount - s.rows.filter((x) => removed.has(x)).length }))
    .filter((s) => s.rows.length > 0)
  const groups = ds.flatMap((d) => (d.type === 'agrupar_paradas' ? [d.stopKeys] : []))
  return {
    stops,
    packages,
    groups,
    accounting: {
      ...r.accounting,
      packages: packages.length,
      removedByUser: removed.size,
      ok: packages.length + removed.size + r.ignored.length === r.accounting.dataRows,
    },
  }
}
