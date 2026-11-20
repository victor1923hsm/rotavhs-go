// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\route\\conference-list.ts (versão de 2026-11-19).
/**
 * 4.12 — Lista da Conferência para rotas longas. Só APRESENTAÇÃO: não muda número, ordem planejada,
 * pacotes nem paradas (nada é unido, removido ou renumerado).
 *  - ordem "planilha" (a planejada até a Fase 5) ou "etiqueta" (pelo número do Stop, só para conferir);
 *  - as partes de um Stop dividido aparecem JUNTAS, na posição da primeira, sob "Parada 12 · 2 endereços";
 *  - na ordem por etiqueta: cabeçalhos por faixa (1–10, 11–20…) e as paradas sem número no fim.
 */
import type { NormalizedAddress } from '../address/address'
import type { StopIssue } from '../import/build'
import { comparableDoor } from '../import/review'
import { numberBand, splitPart, stopTitle } from './labels'

export type ConferenceOrder = 'planilha' | 'etiqueta'

export interface ListStop {
  id: string
  originalNumber: number | null
  plannedIndex: number
  issues: StopIssue[]
}

export type ListItem<S extends ListStop> =
  | { type: 'faixa'; key: string; label: string }
  | { type: 'dividido'; key: string; label: string }
  | { type: 'parada'; key: string; stop: S }

const partOf = (s: ListStop) => splitPart(s.issues)?.part ?? 0

export function buildConferenceList<S extends ListStop>(stops: readonly S[], order: ConferenceOrder): ListItem<S>[] {
  const base = [...stops].sort((a, b) =>
    order === 'etiqueta'
      ? (a.originalNumber === null ? 1 : 0) - (b.originalNumber === null ? 1 : 0) || (a.originalNumber ?? 0) - (b.originalNumber ?? 0) || a.plannedIndex - b.plannedIndex
      : a.plannedIndex - b.plannedIndex,
  )
  // partes de cada Stop dividido presentes nesta lista (o filtro pode ter deixado só algumas)
  const partes = new Map<number, S[]>()
  for (const s of base) if (s.originalNumber !== null && splitPart(s.issues)) partes.set(s.originalNumber, [...(partes.get(s.originalNumber) ?? []), s])

  const out: ListItem<S>[] = []
  const emitidos = new Set<number>()
  let faixa: string | null = null
  for (const s of base) {
    if (order === 'etiqueta') {
      const f = numberBand(s.originalNumber)
      if (f !== faixa) (out.push({ type: 'faixa', key: `faixa:${f}`, label: f }), (faixa = f))
    }
    const grupo = s.originalNumber !== null ? partes.get(s.originalNumber) : undefined
    if (!grupo) {
      out.push({ type: 'parada', key: s.id, stop: s })
      continue
    }
    if (emitidos.has(s.originalNumber!)) continue
    emitidos.add(s.originalNumber!)
    const total = splitPart(grupo[0]!.issues)!.parts
    out.push({ type: 'dividido', key: `div:${s.originalNumber}`, label: `${stopTitle(s.originalNumber)} · ${total} endereços` })
    for (const p of [...grupo].sort((a, b) => partOf(a) - partOf(b))) out.push({ type: 'parada', key: p.id, stop: p })
  }
  return out
}

export interface RelStop extends ListStop {
  norm: NormalizedAddress
  groupedWith?: string[]
}

/**
 * Relações de cada parada, em texto curto (sempre com o número da etiqueta):
 *  - "ligada ao endereço 2" (São o mesmo local) / "agrupada com parada 13" (Agrupar, mesma porta);
 *  - "mesma porta que parada 13" (mesma porta, números diferentes, sem decisão de agrupar).
 */
export function stopRelations(stops: readonly RelStop[]): Map<string, string[]> {
  const porId = new Map(stops.map((s) => [s.id, s]))
  const porPorta = new Map<string, RelStop[]>()
  for (const s of stops) {
    const k = comparableDoor(s)
    if (k) porPorta.set(k, [...(porPorta.get(k) ?? []), s])
  }
  const out = new Map<string, string[]>()
  for (const s of stops) {
    const rel: string[] = []
    const ligadas = new Set(s.groupedWith ?? [])
    for (const id of ligadas) {
      const o = porId.get(id)
      if (!o) continue
      const parte = splitPart(o.issues)
      rel.push(o.originalNumber === s.originalNumber && parte ? `ligada ao endereço ${parte.part}` : `agrupada com ${stopTitle(o.originalNumber).toLowerCase()}`)
    }
    const k = comparableDoor(s)
    const vizinhas = (k ? porPorta.get(k) ?? [] : []).filter((o) => o.id !== s.id && !ligadas.has(o.id) && o.originalNumber !== s.originalNumber)
    if (vizinhas.length) rel.push(`mesma porta que ${vizinhas.map((o) => stopTitle(o.originalNumber).toLowerCase()).join(', ')}`)
    if (rel.length) out.set(s.id, rel)
  }
  return out
}
