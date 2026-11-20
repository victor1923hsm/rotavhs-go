// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\import\\build.ts (versão de 2026-11-19).
/**
 * Linhas da planilha → pacotes → paradas (CA-4.01, CA-4.02, CA-4.13.1).
 * - O número ORIGINAL da parada (o da etiqueta; "Stop" na SPX) vem da planilha e nunca é reescrito.
 * - D1: pacotes só formam UMA parada com o mesmo número E o mesmo local (porta + coordenada).
 *   Mesmo número em locais diferentes → paradas separadas ("Stop dividido · local i de n"); nada é unido sozinho.
 * - D2: número vazio, "-" ou inválido → `originalNumber: null` ("Sem número"), nunca 0; uma parada por linha.
 * - A sequência do pacote ("Sequence") é preservada por pacote e não muda o número nem a ordem.
 * - Telefone: nunca lido (a coluna não tem campo de destino).
 * - Nome do destinatário (E1 = B): devolvido SEPARADO das paradas, para ir à tabela isolada.
 * - Contabilidade: linhas lidas = pacotes + ignoradas (cada uma com motivo).
 */
import { normalizeAddress, type AddressInput, type NormalizedAddress, doorKey } from '../address/address'
import { basic } from '../address/normalize'
import type { Cell, Mapping, Row } from './mapping'
import { normHeader } from './fields'

/**
 * Valor ORIGINAL de uma célula de numeração (parada ou sequência).
 * `raw` só guarda textos curtos e seguros (número, "-", "12A"…); o resto vira "[inválido]",
 * para que um mapeamento errado nunca grave, por exemplo, um telefone.
 */
export interface SheetRef {
  raw: string
  /** Inteiro válido, ou null ("Sem número"). */
  number: number | null
}

export interface PackageRow {
  /** Linha na planilha (1 = primeira linha do arquivo). */
  sourceRow: number
  trackingCode: string | null
  stopKey: string
  /** Número da parada como veio nesta linha (D1). */
  sheetStop?: SheetRef
  /** Sequência individual do pacote como veio (D1). */
  sheetSequence?: SheetRef
}

export type StopIssue =
  /** Legado (rotas gravadas antes da D1): mesmo número com endereços diferentes numa só parada. */
  | { code: 'numero_conflitante'; rows: number[] }
  /** D1: o mesmo número aparece em locais diferentes; esta é a parte `part` de `parts`. */
  | { code: 'stop_dividido'; part: number; parts: number }
  /** D2: a célula do número estava vazia, "-" ou inválida. */
  | { code: 'sem_numero'; raw: string }
  | { code: 'quantidade_divergente'; declared: number; rows: number }
  | { code: 'sem_endereco' }
  | { code: 'coordenada_invalida' }
  | { code: 'numeracao_gerada' }

export interface DraftStop {
  key: string
  /** Número original da planilha (ou gerado pela ordem, com issue `numeracao_gerada`). null = "Sem número" (D2). */
  originalNumber: number | null
  /** Valor original da célula de número desta parada. */
  sheetStop?: SheetRef
  address: AddressInput
  norm: NormalizedAddress
  /** Coordenada que veio na planilha (E3: NÃO confirmada, precisão desconhecida). */
  sheetPoint?: { lat: number; lng: number }
  packageCount: number
  rows: number[]
  issues: StopIssue[]
  /** Ordem de aparição (vira a ordem planejada até a Fase 5). */
  order: number
}

export type IgnoreReason = 'vazia' | 'cabecalho_repetido' | 'total' | 'sem_dados'

export interface ImportResult {
  stops: DraftStop[]
  packages: PackageRow[]
  ignored: { row: number; reason: IgnoreReason }[]
  /** E1 = B: stopKey → nome. NUNCA misturado às paradas. */
  names: Map<string, string>
  accounting: { dataRows: number; packages: number; ignored: number; ok: boolean }
  numberingGenerated: boolean
}

const str = (c: Cell): string => {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c).trim()
}
const at = (row: Row, col: number | undefined): string => (col === undefined ? '' : str(row[col]))

function parseCoord(v: string, min: number, max: number): number | null {
  if (!v) return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= min && n <= max && n !== 0 ? n : null
}

function parseStopNumber(v: string): number | null {
  const m = /^\s*#?\s*0*(\d{1,6})\s*$/.exec(v)
  return m ? Number(m[1]) : null
}

/** Só número, símbolos de "sem número" e no máximo uma letra no fim; até 6 dígitos. */
const SAFE_RAW = /^[-–—#.\s\d]{0,10}[a-zA-Z]?$/
export function sheetRef(v: string): SheetRef {
  const seguro = SAFE_RAW.test(v) && (v.match(/\d/g)?.length ?? 0) <= 6
  return { raw: seguro ? v : '[inválido]', number: parseStopNumber(v) }
}

/** Identidade do LOCAL de uma linha: porta normalizada + coordenada da planilha (5 casas ≈ 1 m). */
const localKey = (norm: NormalizedAddress, p: { lat: number; lng: number } | null) =>
  `${doorKey(norm)}|${p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : '-'}`

const MAX_NAME = 80

export function buildImport(rows: readonly Row[], headerIndex: number, m: Mapping): ImportResult {
  const header = (rows[headerIndex] ?? []).map(normHeader).join('|')
  const ignored: ImportResult['ignored'] = []
  const packages: PackageRow[] = []
  const names = new Map<string, string>()
  const stops = new Map<string, DraftStop>()
  const hasStopCol = m.parada !== undefined
  const declared = new Map<string, number>()
  let order = 0
  let dataRows = 0

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const sourceRow = i + 1
    dataRows++
    const cells = row.map(str)
    if (cells.every((c) => c === '')) {
      ignored.push({ row: sourceRow, reason: 'vazia' })
      continue
    }
    if (row.map(normHeader).join('|') === header) {
      ignored.push({ row: sourceRow, reason: 'cabecalho_repetido' })
      continue
    }
    const address: AddressInput = {
      full: at(row, m.endereco) || null,
      street: at(row, m.rua) || null,
      number: at(row, m.numero) || null,
      complement: at(row, m.complemento) || null,
      neighborhood: at(row, m.bairro) || null,
      city: at(row, m.cidade) || null,
      uf: at(row, m.uf) || null,
      cep: at(row, m.cep) || null,
      quadra: at(row, m.quadra) || null,
      lote: at(row, m.lote) || null,
    }
    const tracking = at(row, m.pacote) || null
    const hasAddress = !!(address.full || address.street)
    const ref = hasStopCol ? sheetRef(at(row, m.parada)) : null
    const seq = m.sequencia !== undefined ? sheetRef(at(row, m.sequencia)) : null
    if (!hasAddress && !tracking && !ref?.raw) {
      const isTotal = cells.some((c) => /\btotal\b/.test(basic(c)))
      ignored.push({ row: sourceRow, reason: isTotal ? 'total' : 'sem_dados' })
      continue
    }

    // Observação: só para achar quadra/lote; o texto NÃO é guardado.
    const obs = at(row, m.observacao)
    let norm = normalizeAddress(address)
    if (obs && (norm.quadra === undefined || norm.lote === undefined)) {
      const extra = normalizeAddress({ ...address, complement: [address.complement, obs].filter(Boolean).join(' ') })
      norm = { ...norm, ...(norm.quadra === undefined && extra.quadra ? { quadra: extra.quadra } : {}), ...(norm.lote === undefined && extra.lote ? { lote: extra.lote } : {}) }
      if (norm.quadra) address.quadra = address.quadra ?? norm.quadra
      if (norm.lote) address.lote = address.lote ?? norm.lote
    }

    const lat = parseCoord(at(row, m.lat), -90, 90)
    const lng = parseCoord(at(row, m.lng), -180, 180)
    const point = lat !== null && lng !== null ? { lat, lng } : null
    // A chave só vale DENTRO desta importação (o id gravado é outro, aleatório).
    // Sem coluna de número: agrupa pela porta (como antes). Com número: número + local (D1). Sem número: uma por linha (D2).
    const key = !ref ? `a:${doorKey(norm)}` : ref.number !== null ? `n:${ref.number}|${localKey(norm, point)}` : `x:${sourceRow}`
    let stop = stops.get(key)
    if (!stop) {
      stop = {
        key,
        originalNumber: ref ? ref.number : null,
        ...(ref ? { sheetStop: ref } : {}),
        address,
        norm,
        packageCount: 0,
        rows: [],
        issues: [],
        order: order++,
      }
      if (point) stop.sheetPoint = point
      else if (at(row, m.lat) || at(row, m.lng)) stop.issues.push({ code: 'coordenada_invalida' })
      if (!hasAddress) stop.issues.push({ code: 'sem_endereco' })
      if (ref && ref.number === null) stop.issues.push({ code: 'sem_numero', raw: ref.raw })
      stops.set(key, stop)
    }
    stop.rows.push(sourceRow)
    stop.packageCount++
    packages.push({ sourceRow, trackingCode: tracking, stopKey: key, ...(ref ? { sheetStop: ref } : {}), ...(seq ? { sheetSequence: seq } : {}) })

    // E1 = B: só o nome, aparado e limitado; nunca o telefone.
    const name = at(row, m.destinatario).replace(/\s+/g, ' ').slice(0, MAX_NAME)
    if (name && !names.has(key)) names.set(key, name)

    const qty = Number(at(row, m.quantidade))
    if (m.quantidade !== undefined && Number.isInteger(qty) && qty > 0) declared.set(key, Math.max(declared.get(key) ?? 0, qty))
  }

  // Numeração gerada quando a planilha não traz o número da parada.
  const list = [...stops.values()].sort((a, b) => a.order - b.order)
  if (!hasStopCol) list.forEach((s, i) => ((s.originalNumber = i + 1), s.issues.push({ code: 'numeracao_gerada' })))

  // D1: mesmo número em locais diferentes → partes separadas e sinalizadas (nunca unidas sozinhas).
  const porNumero = new Map<number, DraftStop[]>()
  for (const s of list) if (s.key.startsWith('n:') && s.originalNumber !== null) porNumero.set(s.originalNumber, [...(porNumero.get(s.originalNumber) ?? []), s])
  for (const partes of porNumero.values())
    if (partes.length > 1) partes.forEach((s, i) => s.issues.push({ code: 'stop_dividido', part: i + 1, parts: partes.length }))

  // Quantidade declarada × linhas.
  for (const s of list) {
    const d = declared.get(s.key)
    if (d === undefined) continue
    if (s.rows.length === 1) s.packageCount = d
    else if (d !== s.rows.length) s.issues.push({ code: 'quantidade_divergente', declared: d, rows: s.rows.length })
  }

  return {
    stops: list,
    packages,
    ignored,
    names,
    numberingGenerated: !hasStopCol,
    accounting: { dataRows, packages: packages.length, ignored: ignored.length, ok: packages.length + ignored.length === dataRows },
  }
}
