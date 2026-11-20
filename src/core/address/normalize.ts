// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\address\\normalize.ts (versão de 2026-11-19).
/**
 * Normalização de endereços brasileiros (FASE-1-PLANEJAMENTO.md §14.3). TS puro, sem biblioteca.
 * Transforma qualquer escrita numa forma canônica para casar com a Memória de locais.
 */

/** Minúsculas, sem acentos, pontuação vira espaço, espaços colapsados. */
export function basic(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ºª°]/g, ' ')
    .replace(/[.,;:/\\|()[\]{}"'`´#_*+!?]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Abreviações → forma canônica (dicionário ajustável; será calibrado com a planilha real). */
export const DICIONARIO: Readonly<Record<string, string>> = {
  r: 'rua',
  rua: 'rua',
  av: 'avenida',
  avn: 'avenida',
  aven: 'avenida',
  avenida: 'avenida',
  tv: 'travessa',
  trav: 'travessa',
  travessa: 'travessa',
  al: 'alameda',
  alameda: 'alameda',
  estr: 'estrada',
  est: 'estrada',
  estrada: 'estrada',
  rod: 'rodovia',
  rodovia: 'rodovia',
  pc: 'praca',
  pca: 'praca',
  praca: 'praca',
  jd: 'jardim',
  jdm: 'jardim',
  jard: 'jardim',
  jardim: 'jardim',
  vl: 'vila',
  vila: 'vila',
  pq: 'parque',
  pque: 'parque',
  parque: 'parque',
  res: 'residencial',
  resid: 'residencial',
  residencial: 'residencial',
  cj: 'conjunto',
  conj: 'conjunto',
  conjunto: 'conjunto',
  lot: 'loteamento',
  loteam: 'loteamento',
  loteamento: 'loteamento',
  st: 'setor',
  set: 'setor',
  setor: 'setor',
  cond: 'condominio',
  condominio: 'condominio',
  cs: 'casa',
  casa: 'casa',
  ap: 'apartamento',
  apt: 'apartamento',
  apto: 'apartamento',
  apartamento: 'apartamento',
  bl: 'bloco',
  bloco: 'bloco',
  dr: 'doutor',
  prof: 'professor',
  sta: 'santa',
  sto: 'santo',
  n: 'numero',
  no: 'numero',
  nro: 'numero',
  num: 'numero',
}

/** Expande abreviações palavra a palavra. */
export function expand(s: string): string {
  return basic(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => DICIONARIO[w] ?? w)
    .join(' ')
}

/** Rua canônica: expandida e sem o tipo genérico "rua" no início (R. X = Rua X = X). */
export function streetKey(street: string | null | undefined): string {
  const e = expand(street ?? '')
  return e.replace(/^rua /, '')
}

/** Bairro / cidade canônicos. */
export const placeNameKey = (s: string | null | undefined): string => expand(s ?? '')

/** UF: duas letras minúsculas (ou vazio). */
export function ufKey(s: string | null | undefined): string {
  const b = basic(s)
  return /^[a-z]{2}$/.test(b) ? b : ''
}

/** CEP: só dígitos; `cep5` = 5 primeiros (desempate de região). */
export function cepDigits(s: string | number | null | undefined): string {
  const d = String(s ?? '').replace(/\D/g, '')
  return d.length === 8 ? d : d.length === 7 ? `0${d}` : ''
}
export const cep5 = (s: string | number | null | undefined): string => cepDigits(s).slice(0, 5)

/** "05" → "5", "015A" → "15a", "0" → "0". */
export function numberToken(s: string): string {
  const m = /^0*(\d+)([a-z]?)$/.exec(basic(s).replace(/\s/g, ''))
  if (!m) return basic(s).replace(/\s/g, '')
  return `${m[1] === '' ? '0' : m[1]}${m[2]}`
}

/** Número do imóvel: "120", "120A"; "S/N", "SN", "sem número" → "sn". */
export function houseNumber(s: string | number | null | undefined): string {
  const b = basic(String(s ?? ''))
  if (!b) return ''
  if (/^(s n|sn|sem numero|sem n)$/.test(b)) return 'sn'
  const m = /(\d+)\s*([a-z])?\b/.exec(b)
  return m ? numberToken(`${m[1]}${m[2] ?? ''}`) : ''
}
