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

/** Colunas que o app usa da planilha da SPX (para dizer exatamente o que faltou). */
const ROTULO_FALTA: Record<string, string> = {
  sem_endereco: 'endereço (“Destination Address”)',
  sem_identificacao: 'código do pacote (“SPX TN”) ou número da parada (“Stop”)',
  coluna_repetida: 'colunas com o mesmo nome',
  telefone_mapeado: 'coluna de telefone no lugar de outra',
}

export async function lerPlanilha(dados: ArrayBuffer, arquivo: string): Promise<RespostaLeitura> {
  const t0 = performance.now()
  try {
    const lido = await readSpreadsheet(dados, arquivo)
    let falta: string[] | null = null
    let semPacotes = false
    for (const aba of lido.sheets) {
      const h = detectHeaderRow(aba.rows)
      if (h === null) continue
      const cab = aba.rows[h]!
      const { mapping } = suggestMapping(cab)
      const problemas = validateMapping(mapping, cab)
      if (problemas.length) {
        falta ??= problemas.map((p) => ROTULO_FALTA[p.code] ?? p.message)
        continue
      }
      const resultado = buildImport(aba.rows, h, mapping)
      if (resultado.accounting.packages === 0) {
        semPacotes = true
        continue
      }
      return { ok: true, leitura: { arquivo, aba: aba.name, mapeamento: mapping, resultado, achados: findDuplicates(resultado), ms: Math.round(performance.now() - t0) } }
    }
    if (semPacotes) return { ok: false, erro: 'A planilha tem as colunas da rota, mas nenhuma linha com pacote.' }
    if (falta) return { ok: false, erro: `Faltam colunas da rota: ${falta.join('; ')}. Confira se é a planilha exportada da SPX.` }
    return { ok: false, erro: 'Não achei o cabeçalho da rota (AT ID, Stop, SPX TN, Destination Address…). Confira se é a planilha da SPX.' }
  } catch (e) {
    return { ok: false, erro: e instanceof SpreadsheetError ? e.message : 'Não foi possível ler a planilha.' }
  }
}
