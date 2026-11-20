// Leitura da planilha NO APARELHO (nada é enviado). Escolhe a aba, reconhece as colunas e monta a importação.

import { buildImport, type ImportResult } from '@/core/import/build'
import { detectHeaderRow, suggestMapping, validateMapping, type Mapping } from '@/core/import/mapping'
import { findDuplicates, type Finding } from '@/core/import/review'
import { readSpreadsheet, SpreadsheetError } from '@/platform/spreadsheet'

export interface Leitura {
  arquivo: string
  aba: string
  mapeamento: Mapping
  resultado: ImportResult
  achados: Finding[]
  ms: number
}

export type RespostaLeitura = { ok: true; leitura: Leitura } | { ok: false; erro: string }

export async function lerPlanilha(dados: ArrayBuffer, arquivo: string): Promise<RespostaLeitura> {
  const t0 = performance.now()
  try {
    const lido = await readSpreadsheet(dados, arquivo)
    for (const aba of lido.sheets) {
      const h = detectHeaderRow(aba.rows)
      if (h === null) continue
      const cab = aba.rows[h]!
      const { mapping } = suggestMapping(cab)
      if (validateMapping(mapping, cab).length) continue
      const resultado = buildImport(aba.rows, h, mapping)
      return { ok: true, leitura: { arquivo, aba: aba.name, mapeamento: mapping, resultado, achados: findDuplicates(resultado), ms: Math.round(performance.now() - t0) } }
    }
    return { ok: false, erro: 'Não achei as colunas da rota (endereço e código do pacote). Confira se é a planilha da SPX.' }
  } catch (e) {
    return { ok: false, erro: e instanceof SpreadsheetError ? e.message : 'Não foi possível ler a planilha.' }
  }
}
