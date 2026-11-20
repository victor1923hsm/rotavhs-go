// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\address\\extract.ts (versão de 2026-11-19).
/**
 * Extração de quadra e lote de textos livres (FASE-1-PLANEJAMENTO.md §14.3):
 * "Qd 15 Lt 22", "Q.15 L.22", "Quadra 15, Lote 22", "QD15-LT22", "Quadra 05" (= 5), "15A".
 */
import { basic, numberToken } from './normalize'

/** Aceita "nº/no/nro/número" entre a palavra e o valor ("Qd nº 15"). */
const QUADRA = /(?:^|\s)(?:quadra|quad|qda|qdr|qd|q)\s*(?:(?:n|no|nro|numero)\s+)?(\d{1,4}[a-z]?)(?=\s|$)/
const LOTE = /(?:^|\s)(?:lote|lte|lt|l)\s*(?:(?:n|no|nro|numero)\s+)?(\d{1,4}[a-z]?)(?=\s|$)/

/** "15 a" / "15-a" → "15a" (só letras a–h isoladas logo após o número, para não engolir "L 22"). */
const juntaLetra = (t: string) => t.replace(/(\d) ([a-h])(?=\s|$)/g, '$1$2')

export interface QuadraLote {
  quadra?: string
  lote?: string
}

/** Procura quadra e lote no texto (o primeiro de cada). Não inventa: sem padrão claro, devolve vazio. */
export function extractQuadraLote(...texts: (string | null | undefined)[]): QuadraLote {
  const out: QuadraLote = {}
  for (const raw of texts) {
    const t = juntaLetra(basic(raw))
    if (!t) continue
    if (out.quadra === undefined) {
      const q = QUADRA.exec(t)
      if (q) out.quadra = numberToken(q[1]!)
    }
    if (out.lote === undefined) {
      const l = LOTE.exec(t)
      if (l) out.lote = numberToken(l[1]!)
    }
  }
  return out
}

/** Valor de uma coluna própria de quadra/lote ("15", "Qd 15", "15-A"). */
export function cleanQuadraLoteValue(v: string | number | null | undefined): string | undefined {
  const t = juntaLetra(basic(String(v ?? ''))).replace(/^(quadra|quad|qda|qd|q|lote|lte|lt|l)\s*/, '')
  if (!/^\d{1,4}[a-z]?$/.test(t)) return undefined
  return numberToken(t)
}
