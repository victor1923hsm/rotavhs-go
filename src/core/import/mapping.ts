// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\import\\mapping.ts (versão de 2026-11-19).
/** Detecção da linha de cabeçalho e sugestão de mapeamento de colunas (CA-4.02.1, CA-4.03). */
import { FIELDS, isPhoneHeader, normHeader, SYNONYMS, type FieldId } from './fields'

export type Cell = string | number | boolean | Date | null | undefined
export type Row = readonly Cell[]

/** Campo → índice da coluna. */
export type Mapping = Partial<Record<FieldId, number>>

export interface Suggestion {
  mapping: Mapping
  confidence: Partial<Record<FieldId, number>>
  /** Colunas de telefone encontradas: SEMPRE descartadas. */
  discardedPhoneColumns: number[]
}

/** 1 = sinônimo exato; 0,7 = contém o sinônimo como palavra; 0 = nada. */
function scoreHeader(h: string, field: FieldId): number {
  if (!h) return 0
  let best = 0
  for (const s of SYNONYMS[field]) {
    if (h === s) return 1
    if (s.length >= 3 && (` ${h} `).includes(` ${s} `)) best = Math.max(best, 0.7)
  }
  return best
}

/** Linha de cabeçalho: a de maior número de colunas reconhecidas nas primeiras `maxScan` linhas (mínimo 2). */
export function detectHeaderRow(rows: readonly Row[], maxScan = 20): number | null {
  let bestRow: number | null = null
  let bestScore = 1
  for (let r = 0; r < Math.min(rows.length, maxScan); r++) {
    const cells = (rows[r] ?? []).map(normHeader)
    let score = 0
    for (const c of cells) if (c && (FIELDS.some((f) => scoreHeader(c, f.id) >= 0.7) || isPhoneHeader(c))) score++
    if (score > bestScore) {
      bestScore = score
      bestRow = r
    }
  }
  return bestRow
}

/** Sugere o mapeamento. Cada coluna vai para no máximo um campo; telefone nunca é mapeado. */
export function suggestMapping(header: Row): Suggestion {
  const cells = header.map(normHeader)
  const discardedPhoneColumns = cells.flatMap((c, i) => (isPhoneHeader(c) ? [i] : []))
  const candidates: { field: FieldId; col: number; score: number }[] = []
  cells.forEach((c, col) => {
    if (discardedPhoneColumns.includes(col)) return
    for (const f of FIELDS) {
      const score = scoreHeader(c, f.id)
      if (score > 0) candidates.push({ field: f.id, col, score })
    }
  })
  candidates.sort((a, b) => b.score - a.score || a.col - b.col)
  const mapping: Mapping = {}
  const confidence: Partial<Record<FieldId, number>> = {}
  const usedCols = new Set<number>()
  for (const c of candidates) {
    if (mapping[c.field] !== undefined || usedCols.has(c.col)) continue
    mapping[c.field] = c.col
    confidence[c.field] = c.score
    usedCols.add(c.col)
  }
  // D1: com "Stop" e "Sequence", a parada é o Stop (número da etiqueta) e a sequência fica só preservada.
  // Planilha só com "Seq"/"Sequência": ela faz o papel de número da parada, como antes.
  if (mapping.parada === undefined && mapping.sequencia !== undefined) {
    mapping.parada = mapping.sequencia
    confidence.parada = confidence.sequencia!
    delete mapping.sequencia
    delete confidence.sequencia
  }
  return { mapping, confidence, discardedPhoneColumns }
}

export interface MappingProblem {
  code: 'sem_endereco' | 'sem_identificacao' | 'coluna_repetida' | 'telefone_mapeado'
  message: string
}

/** Valida antes de importar: endereço (completo ou rua) + parada ou pacote; telefone nunca. */
export function validateMapping(m: Mapping, header: Row): MappingProblem[] {
  const problems: MappingProblem[] = []
  if (m.endereco === undefined && m.rua === undefined) problems.push({ code: 'sem_endereco', message: 'Escolha a coluna do endereço (completo) ou da rua.' })
  if (m.parada === undefined && m.pacote === undefined) problems.push({ code: 'sem_identificacao', message: 'Escolha a coluna do número da parada ou do código do pacote.' })
  const cols = Object.values(m).filter((v): v is number => v !== undefined)
  if (new Set(cols).size !== cols.length) problems.push({ code: 'coluna_repetida', message: 'Uma mesma coluna foi usada para dois campos.' })
  if (cols.some((c) => isPhoneHeader(header[c]))) problems.push({ code: 'telefone_mapeado', message: 'Colunas de telefone não podem ser importadas.' })
  return problems
}

/** Versão atual dos modelos salvos: 2 = já separa parada (Stop) e sequência (Sequence). */
export const TEMPLATE_VERSION = 2

/**
 * D4: um modelo salvo ANTES da separação Stop/Sequence (sem `v`) pode ter a parada apontando para a
 * sequência. Ele só é reaplicado se concordar com a sugestão nova nos campos de numeração; senão vale a
 * sugestão (e o modelo é regravado ao importar). Modelos `v: 2` são reaplicados como estão.
 */
export function reusableTemplate(saved: { mapping: Mapping; v?: number } | undefined, suggested: Mapping): Mapping | null {
  if (!saved) return null
  if (saved.v === TEMPLATE_VERSION) return saved.mapping
  return saved.mapping.parada === suggested.parada && saved.mapping.sequencia === suggested.sequencia ? saved.mapping : null
}

/** Assinatura do cabeçalho, para reaplicar um modelo salvo. Não contém dados das linhas. */
export function headerSignature(header: Row): string {
  return header.map(normHeader).join('|')
}
