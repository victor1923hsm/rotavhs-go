// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\platform\\spreadsheet.ts (versão de 2026-11-19).
/**
 * Leitura de planilhas NO APARELHO (decisão E2 = A): nada é enviado ao servidor.
 * `.xlsx` via read-excel-file (carregado sob demanda) e `.csv` via leitor próprio.
 */
import { parseCsv } from '@/core/import/csv'
import type { Row } from '@/core/import/mapping'

export interface SheetRows {
  name: string
  rows: Row[]
}

export interface ReadResult {
  sheets: SheetRows[]
  /** SHA-256 do arquivo (integridade; vai para o registro da importação). */
  sha256: string
  format: 'xlsx' | 'csv'
}

export class SpreadsheetError extends Error {
  constructor(
    public readonly code: 'formato' | 'xls_antigo' | 'vazio' | 'corrompido',
    message: string,
  ) {
    super(message)
  }
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function decodeText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf)
  // Muitos CSV do Excel brasileiro vêm em Windows-1252: se o UTF-8 falhar, tenta ele.
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
}

export async function readSpreadsheet(data: ArrayBuffer, fileName: string): Promise<ReadResult> {
  const lower = fileName.toLowerCase()
  if (data.byteLength === 0) throw new SpreadsheetError('vazio', 'O arquivo está vazio.')
  const sha256 = await sha256Hex(data)
  if (lower.endsWith('.csv')) {
    return { sheets: [{ name: fileName, rows: parseCsv(decodeText(data)) }], sha256, format: 'csv' }
  }
  if (lower.endsWith('.xls')) throw new SpreadsheetError('xls_antigo', 'Arquivo .xls antigo: abra no Excel e salve como .xlsx.')
  if (!lower.endsWith('.xlsx')) throw new SpreadsheetError('formato', 'Formato não aceito. Use .xlsx ou .csv.')
  try {
    const { default: readXlsxFile } = await import('read-excel-file/universal')
    const sheets = await readXlsxFile(data)
    return { sheets: sheets.map((s) => ({ name: s.sheet, rows: s.data as Row[] })), sha256, format: 'xlsx' }
  } catch {
    throw new SpreadsheetError('corrompido', 'Não foi possível ler a planilha (arquivo corrompido ou protegido por senha).')
  }
}
