// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\address\\address.ts (versão de 2026-11-19).
/**
 * Endereço normalizado + chaves de casamento com a Memória (FASE-1-PLANEJAMENTO.md §14.2–14.3).
 * A chave separa SEMPRE por cidade e bairro: "Quadra 15" do Jd. Primavera ≠ Quadra 15 da Vila Nova.
 */
import { cleanQuadraLoteValue, extractQuadraLote } from './extract'
import { basic, cep5, cepDigits, expand, houseNumber, placeNameKey, streetKey, ufKey } from './normalize'

/** Campos de endereço como vieram (planilha ou edição manual). Nunca contém nome/telefone. */
export interface AddressInput {
  full?: string | null
  street?: string | null
  number?: string | number | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  uf?: string | null
  cep?: string | number | null
  quadra?: string | number | null
  lote?: string | number | null
}

export interface NormalizedAddress {
  streetKey: string
  number: string
  complementKey: string
  neighborhoodKey: string
  cityKey: string
  uf: string
  cep: string
  cep5: string
  quadra?: string
  lote?: string
}

/** Rua e número a partir de um endereço completo numa só coluna: "R. das Acácias, 120 - Casa 2". */
export function splitFullAddress(full: string): { street: string; number: string; rest: string } {
  const t = full.replace(/\s+/g, ' ').trim()
  const m = /^(.+?)[,\s]+(?:n[ºo°.]?\s*)?(\d+[a-zA-Z]?|s\/?n)\b(.*)$/i.exec(t)
  if (!m) return { street: t, number: '', rest: '' }
  return { street: m[1]!.replace(/[,\s]+$/, ''), number: m[2]!, rest: m[3]!.replace(/^[\s,\-–]+/, '') }
}

export function normalizeAddress(a: AddressInput): NormalizedAddress {
  let street = a.street ?? ''
  let number = a.number ?? ''
  let rest = ''
  if (!street && a.full) {
    const s = splitFullAddress(a.full)
    street = s.street
    number = number || s.number
    rest = s.rest
  }
  const fromCols = { quadra: cleanQuadraLoteValue(a.quadra ?? undefined), lote: cleanQuadraLoteValue(a.lote ?? undefined) }
  const fromText = extractQuadraLote(a.complement, rest, a.full, street)
  const quadra = fromCols.quadra ?? fromText.quadra
  const lote = fromCols.lote ?? fromText.lote
  return {
    streetKey: streetKey(street),
    number: houseNumber(number),
    complementKey: expand([a.complement, rest].filter(Boolean).join(' ')),
    neighborhoodKey: placeNameKey(a.neighborhood),
    cityKey: placeNameKey(a.city),
    uf: ufKey(a.uf),
    cep: cepDigits(a.cep),
    cep5: cep5(a.cep),
    ...(quadra !== undefined ? { quadra } : {}),
    ...(lote !== undefined ? { lote } : {}),
  }
}

/** Região (cidade + bairro). Sem cidade nem bairro não há chave confiável. */
function regionKey(n: Pick<NormalizedAddress, 'uf' | 'cityKey' | 'neighborhoodKey'>): string {
  return `${n.uf}|${n.cityKey}|${n.neighborhoodKey}`
}

export type PlaceLevel = 'quadra' | 'lote' | 'imovel' | 'entrada'

/** Chave canônica de um local na memória. Entradas usam a chave do imóvel/lote + "|e". */
export function matchKey(n: NormalizedAddress, level: PlaceLevel): string | null {
  if (!n.cityKey && !n.neighborhoodKey) return null
  const r = regionKey(n)
  switch (level) {
    case 'quadra':
      return n.quadra ? `${r}|q:${n.quadra}` : null
    case 'lote':
      return n.quadra && n.lote ? `${r}|q:${n.quadra}|l:${n.lote}` : null
    case 'imovel':
      return n.streetKey && n.number && n.number !== 'sn' ? `${r}|s:${n.streetKey}|n:${n.number}` : null
    case 'entrada': {
      const base = matchKey(n, 'lote') ?? matchKey(n, 'imovel')
      return base ? `${base}|e` : null
    }
  }
}

/** Mesma porta? Rua + número + complemento (apartamentos diferentes NÃO são a mesma porta). */
export function doorKey(n: NormalizedAddress): string {
  return [regionKey(n), n.streetKey, n.number, n.quadra ?? '', n.lote ?? '', n.complementKey].join('|')
}

/** Texto curto para a tela (sem nome, sem telefone). */
export function addressLine(a: AddressInput): string {
  const parts = [a.full || [a.street, a.number].filter((x) => x !== null && x !== undefined && x !== '').join(', '), a.complement].filter(Boolean)
  return parts.join(' · ')
}

/** A escrita original, compactada: vira "alias" quando você confirma um local. */
export const aliasOf = (a: AddressInput): string =>
  basic([a.full, a.street, a.number, a.complement, a.neighborhood, a.city, a.quadra && `qd ${a.quadra}`, a.lote && `lt ${a.lote}`].filter(Boolean).join(' '))
