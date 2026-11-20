// Resultado da importação (módulos copiados do RotaVHS) → paradas do app.
// Regras: o número do Stop vem da planilha e nunca muda; nada some nem duplica; "são o mesmo local"
// só junta a VISITA (as partes continuam com seus pacotes e endereços, sem renumerar).

import { addressLine } from '@/core/address/address'
import type { DraftStop, ImportResult } from '@/core/import/build'
import { applyDecisions, type Decision } from '@/core/import/review'
import type { Parada } from '@/core/parada'

export interface RotaImportada {
  fonte: 'planilha' | 'exemplo'
  arquivo: string
  paradas: Parada[]
  /** Ordem original da SPX: pela menor Sequence de cada parada; sem Sequence no fim. */
  ordemSpx: string[]
  pacotes: number
  semCoordenada: number
}

const parteDe = (s: DraftStop) => {
  const i = s.issues.find((x) => x.code === 'stop_dividido')
  return i && i.code === 'stop_dividido' ? { i: i.part, n: i.parts } : undefined
}

export function rotaDaImportacao(r: ImportResult, decisoes: readonly Decision[], arquivo: string): RotaImportada {
  const ef = applyDecisions(r, decisoes)
  const tns = new Map<string, string[]>()
  const menorSeq = new Map<string, number>()
  for (const p of ef.packages) {
    tns.set(p.stopKey, [...(tns.get(p.stopKey) ?? []), p.trackingCode ?? `linha ${p.sourceRow}`])
    const n = p.sheetSequence?.number
    if (n !== null && n !== undefined) menorSeq.set(p.stopKey, Math.min(menorSeq.get(p.stopKey) ?? Infinity, n))
  }
  // "São o mesmo local": cada grupo vira UMA visita; a primeira parte (pela ordem da planilha) dá o nome.
  const grupoDe = new Map<string, string[]>()
  for (const g of ef.groups) for (const k of g) grupoDe.set(k, g)
  const porChave = new Map(ef.stops.map((s) => [s.key, s]))
  const feitas = new Set<string>()
  const paradas: Parada[] = []
  for (const s of [...ef.stops].sort((a, b) => a.order - b.order)) {
    if (feitas.has(s.key)) continue
    const membros = (grupoDe.get(s.key) ?? [s.key]).map((k) => porChave.get(k)).filter((x): x is DraftStop => !!x).sort((a, b) => a.order - b.order)
    membros.forEach((m) => feitas.add(m.key))
    const principal = membros[0]!
    const comPonto = membros.filter((m) => m.sheetPoint)
    const enderecos = [...new Set(membros.map((m) => addressLine(m.address) || '(sem endereço)'))]
    const seqs = membros.map((m) => menorSeq.get(m.key)).filter((n): n is number => n !== undefined)
    if (seqs.length) menorSeq.set(principal.key, Math.min(...seqs))
    paradas.push({
      id: principal.key,
      stop: principal.originalNumber,
      ...(membros.length === 1 && parteDe(principal) ? { parte: parteDe(principal)! } : {}),
      pacotes: membros.flatMap((m) => tns.get(m.key) ?? []),
      endereco: enderecos[0]!,
      ...(enderecos.length > 1 ? { outrosEnderecos: enderecos.slice(1) } : {}),
      bairro: principal.address.neighborhood ?? '',
      ...(principal.address.cep ? { cep: String(principal.address.cep) } : {}),
      semNumero: principal.norm.number === 'sn',
      lat: comPonto.length ? comPonto.reduce((t, m) => t + m.sheetPoint!.lat, 0) / comPonto.length : Number.NaN,
      lon: comPonto.length ? comPonto.reduce((t, m) => t + m.sheetPoint!.lng, 0) / comPonto.length : Number.NaN,
      ...(comPonto.length ? {} : { semCoordenada: true }),
    })
  }
  const ordem = new Map(ef.stops.map((s) => [s.key, s.order]))
  const ordemSpx = [...paradas]
    .sort((a, b) => (menorSeq.get(a.id) ?? Infinity) - (menorSeq.get(b.id) ?? Infinity) || (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0))
    .map((p) => p.id)
  return {
    fonte: 'planilha',
    arquivo,
    paradas,
    ordemSpx,
    pacotes: ef.packages.length,
    semCoordenada: paradas.filter((p) => p.semCoordenada).length,
  }
}
