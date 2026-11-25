// Resultado da importação (módulos copiados do RotaVHS) → paradas do app.
// Regras: o número do Stop vem da planilha e nunca muda; nada some nem duplica; "são o mesmo local"
// só junta a VISITA (as partes continuam com seus pacotes e endereços, sem renumerar).

import { addressLine } from '@/core/address/address'
import type { DraftStop, ImportResult } from '@/core/import/build'
import { applyDecisions, type Decision } from '@/core/import/review'
import { linhaRetaKm } from '@/core/geo'
import type { Parada } from '@/core/parada'

/** Acima disso da mediana da rota, a coordenada da planilha não é confiável (uma rota SPX cabe numa cidade). */
export const RAIO_SUSPEITO_KM = 60

/**
 * Coordenadas muito longe da mediana das outras viram "não confirmadas" (saem do mapa e do km).
 * Precisa de pelo menos 3 pontos; nunca move nem inventa posição.
 */
export function marcarCoordenadasSuspeitas(paradas: Parada[]): number {
  const com = paradas.filter((p) => !p.semCoordenada && Number.isFinite(p.lat) && Number.isFinite(p.lon))
  if (com.length < 3) return 0
  const mediana = (v: number[]) => {
    const o = [...v].sort((a, b) => a - b)
    const m = o.length >> 1
    return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2
  }
  const centro = { lat: mediana(com.map((p) => p.lat)), lon: mediana(com.map((p) => p.lon)) }
  let n = 0
  for (const p of com)
    if (linhaRetaKm(p, centro) > RAIO_SUSPEITO_KM) {
      p.semCoordenada = true
      p.coordenadaSuspeita = true
      n++
    }
  return n
}

export interface RotaImportada {
  fonte: 'planilha' | 'exemplo'
  arquivo: string
  paradas: Parada[]
  /** Ordem original da SPX: pela menor Sequence de cada parada; sem Sequence no fim. */
  ordemSpx: string[]
  pacotes: number
  semCoordenada: number
  /** Quantas têm coordenada longe demais do resto (contadas também em `semCoordenada`). */
  coordenadasSuspeitas?: number
}

/** Une grupos com alguma parada em comum (união transitiva), na ordem em que aparecem. */
export function juntarGrupos(grupos: readonly (readonly string[])[]): string[][] {
  const pai = new Map<string, string>()
  const raiz = (k: string): string => {
    let r = k
    while (pai.get(r) !== r) r = pai.get(r)!
    pai.set(k, r)
    return r
  }
  for (const g of grupos) {
    for (const k of g) if (!pai.has(k)) pai.set(k, k)
    for (const k of g.slice(1)) pai.set(raiz(k), raiz(g[0]!))
  }
  const porRaiz = new Map<string, string[]>()
  for (const k of pai.keys()) {
    const r = raiz(k)
    porRaiz.set(r, [...(porRaiz.get(r) ?? []), k])
  }
  return [...porRaiz.values()].filter((g) => g.length > 1)
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
  // Escolhas que se cruzam (ex.: "juntar as partes da parada dividida" + "mesmo local" com uma dessas partes)
  // formam um grupo só: senão a parte em comum entraria em duas visitas e seus pacotes contariam duas vezes.
  const grupoDe = new Map<string, string[]>()
  for (const g of juntarGrupos(ef.groups)) for (const k of g) grupoDe.set(k, g)
  const porChave = new Map(ef.stops.map((s) => [s.key, s]))
  const feitas = new Set<string>()
  const paradas: Parada[] = []
  for (const s of [...ef.stops].sort((a, b) => a.order - b.order)) {
    if (feitas.has(s.key)) continue
    const membros = (grupoDe.get(s.key) ?? [s.key])
      .filter((k) => !feitas.has(k))
      .map((k) => porChave.get(k))
      .filter((x): x is DraftStop => !!x)
      .sort((a, b) => a.order - b.order)
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
  const suspeitas = marcarCoordenadasSuspeitas(paradas)
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
    ...(suspeitas ? { coordenadasSuspeitas: suspeitas } : {}),
  }
}
