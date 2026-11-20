// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\import\\import.test.ts (versão de 2026-11-19).
/**
 * Etapa 4.2 — importador lendo as planilhas SINTÉTICAS de test-fixtures/planilhas/ (gerador: npm run planilhas).
 * CA-4.01 (número original, contabilidade), CA-4.02 (campos), CA-4.03 (mapeamento), CA-4.11.1, CA-4.13.1 (telefone nunca).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readSpreadsheet, SpreadsheetError } from '@/platform/spreadsheet'
import { buildImport, type ImportResult } from './build'
import { parseCsv } from './csv'
import { detectHeaderRow, headerSignature, suggestMapping, validateMapping, type Row } from './mapping'

const DIR = new URL('../../../test-fixtures/planilhas/', import.meta.url)
const buf = (name: string): ArrayBuffer => {
  const u = readFileSync(new URL(name, DIR))
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

/** Fluxo automático completo: lê → escolhe a aba com cabeçalho → sugere mapeamento → importa. */
async function importar(name: string): Promise<{ r: ImportResult; header: Row; sheet: string; sha: string }> {
  const read = await readSpreadsheet(buf(name), name)
  for (const s of read.sheets) {
    const h = detectHeaderRow(s.rows)
    if (h === null) continue
    const header = s.rows[h]!
    const { mapping } = suggestMapping(header)
    if (validateMapping(mapping, header).length) continue
    return { r: buildImport(s.rows, h, mapping), header, sheet: s.name, sha: read.sha256 }
  }
  throw new Error(`nenhuma aba importável em ${name}`)
}

const TELEFONES = /\(62\) 9000/

/** Garante que nenhum telefone apareceu em nada que o importador devolve (exceto nada). */
function semTelefone(r: ImportResult) {
  const tudo = JSON.stringify({ stops: r.stops, packages: r.packages, names: [...r.names] })
  expect(tudo).not.toMatch(TELEFONES)
}

describe('CA-4.01 · número original e contabilidade', () => {
  it('01-padrao: 5 linhas → 4 paradas com os números da planilha; 2 pacotes na #3', async () => {
    const { r, sha } = await importar('01-padrao.xlsx')
    expect(r.stops.map((s) => s.originalNumber)).toEqual([3, 7, 12, 25])
    expect(r.stops[0]!.packageCount).toBe(2)
    expect(r.accounting).toEqual({ dataRows: 5, packages: 5, ignored: 0, ok: true })
    expect(sha).toMatch(/^[0-9a-f]{64}$/)
    semTelefone(r)
  })

  it('02: cabeçalho na 4ª linha é encontrado', async () => {
    const { r } = await importar('02-cabecalho-linha-4.xlsx')
    expect(r.stops.map((s) => s.originalNumber)).toEqual([3, 7, 12, 25])
  })

  it('04: sem coluna de parada → numeração gerada e marcada; agrupa pelo endereço', async () => {
    const { r } = await importar('04-sem-coluna-parada.xlsx')
    expect(r.numberingGenerated).toBe(true)
    expect(r.stops.map((s) => [s.originalNumber, s.packageCount])).toEqual([
      [1, 2],
      [2, 1],
    ])
    expect(r.stops.every((s) => s.issues.some((i) => i.code === 'numeracao_gerada'))).toBe(true)
  })

  it('07: linhas vazias, cabeçalho repetido e total são ignorados COM motivo; nada some', async () => {
    const { r } = await importar('07-linhas-vazias-e-total.xlsx')
    expect(r.ignored.map((i) => i.reason).sort()).toEqual(['cabecalho_repetido', 'total', 'vazia', 'vazia'])
    expect(r.accounting.ok).toBe(true)
    expect(r.accounting.packages + r.accounting.ignored).toBe(r.accounting.dataRows)
  })

  it('06: mesmo número com endereços diferentes → NÃO funde: duas paradas "Stop dividido", mesmo número, nenhuma linha descartada', async () => {
    const { r } = await importar('06-duplicados-e-conflitos.xlsx')
    const partes = r.stops.filter((s) => s.originalNumber === 2)
    expect(partes).toHaveLength(2)
    expect(partes.map((s) => s.rows)).toEqual([[4], [5]])
    expect(partes.map((s) => s.issues.find((i) => i.code === 'stop_dividido'))).toEqual([
      { code: 'stop_dividido', part: 1, parts: 2 },
      { code: 'stop_dividido', part: 2, parts: 2 },
    ])
    expect(partes[0]!.norm.streetKey).not.toBe(partes[1]!.norm.streetKey)
    expect(r.packages).toHaveLength(7)
    expect(r.accounting.ok).toBe(true)
  })
})

describe('CA-4.02 · campos', () => {
  it('03: colunas em inglês e em outra ordem são reconhecidas; telefone descartado', async () => {
    const { r, header } = await importar('03-colunas-outra-ordem-ingles.xlsx')
    const s = suggestMapping(header)
    expect(s.discardedPhoneColumns).toEqual([0])
    expect(s.mapping).toMatchObject({ destinatario: 1, parada: 2, rua: 3, numero: 4, bairro: 5, cidade: 6, uf: 7, cep: 8, pacote: 9 })
    expect(r.stops.map((x) => x.originalNumber)).toEqual([41, 42])
    semTelefone(r)
  })

  it('05: quadra/lote de colunas próprias e de dentro do complemento', async () => {
    const { r } = await importar('05-quadra-lote-colunas-e-texto.xlsx')
    expect(r.stops.map((s) => [s.originalNumber, s.norm.quadra, s.norm.lote])).toEqual([
      [1, '15', '22'],
      [2, '15', '23'],
      [3, '5', '1'],
    ])
  })

  it('08: coordenada da planilha (vírgula decimal) e coordenada inválida sinalizada; quantidade declarada', async () => {
    const { r } = await importar('08-coordenadas.xlsx')
    expect(r.stops[0]!.sheetPoint).toEqual({ lat: -15.80012, lng: -47.90034 })
    expect(r.stops[0]!.packageCount).toBe(3) // 1 linha com "3 volumes"
    expect(r.stops[1]!.sheetPoint).toBeUndefined()
    expect(r.stops[1]!.issues).toContainEqual({ code: 'coordenada_invalida' })
  })

  it('09: escolhe a aba com as entregas (ignora a aba "Resumo")', async () => {
    const { sheet, r } = await importar('09-duas-abas.xlsx')
    expect(sheet).toBe('Entregas')
    expect(r.stops).toHaveLength(4)
  })

  it('10: CSV com ; , BOM e acentos dá o mesmo resultado do .xlsx', async () => {
    const a = await importar('01-padrao.xlsx')
    const b = await importar('10-padrao.csv')
    expect(b.r.stops.map((s) => [s.originalNumber, s.packageCount, s.norm])).toEqual(a.r.stops.map((s) => [s.originalNumber, s.packageCount, s.norm]))
  })
})

describe('CA-4.13.1 · nome do destinatário separado; telefone nunca', () => {
  it('nomes vão para um mapa à parte, um por parada; as paradas NÃO têm nome', async () => {
    const { r } = await importar('01-padrao.xlsx')
    expect([...r.names.values()]).toEqual(['Cliente Fictício A', 'Cliente Fictício B', 'Cliente Fictício C', 'Cliente Fictício D'])
    expect(JSON.stringify(r.stops)).not.toMatch(/Cliente Fictício/)
    expect(JSON.stringify(r.packages)).not.toMatch(/Cliente Fictício/)
    semTelefone(r)
  })
  it('nome é aparado e limitado a 80 caracteres', () => {
    const rows: Row[] = [['Parada', 'Endereço', 'Destinatário'], [1, 'Rua A, 1', `  ${'x'.repeat(200)}  `]]
    const r = buildImport(rows, 0, suggestMapping(rows[0]!).mapping)
    expect([...r.names.values()][0]).toHaveLength(80)
  })
})

describe('CA-4.03 · mapeamento', () => {
  it('validação: exige endereço e (parada ou pacote); recusa telefone mapeado e coluna repetida', () => {
    const h: Row = ['Parada', 'Endereço', 'Telefone']
    expect(validateMapping({ parada: 0 }, h).map((p) => p.code)).toEqual(['sem_endereco'])
    expect(validateMapping({ endereco: 1 }, h).map((p) => p.code)).toEqual(['sem_identificacao'])
    expect(validateMapping({ parada: 0, endereco: 1, complemento: 2 }, h).map((p) => p.code)).toEqual(['telefone_mapeado'])
    expect(validateMapping({ parada: 0, endereco: 0 }, h).map((p) => p.code)).toContain('coluna_repetida')
  })
  it('assinatura do cabeçalho reconhece o mesmo modelo (sem dados das linhas)', () => {
    expect(headerSignature(['Sequência', 'Endereço'])).toBe(headerSignature(['SEQUENCIA', 'endereco']))
  })
})

describe('arquivos inválidos', () => {
  it('.xls antigo, formato estranho e arquivo vazio dão mensagem clara', async () => {
    await expect(readSpreadsheet(new ArrayBuffer(4), 'x.xls')).rejects.toMatchObject({ code: 'xls_antigo' })
    await expect(readSpreadsheet(new ArrayBuffer(4), 'x.pdf')).rejects.toMatchObject({ code: 'formato' })
    await expect(readSpreadsheet(new ArrayBuffer(0), 'x.xlsx')).rejects.toBeInstanceOf(SpreadsheetError)
    await expect(readSpreadsheet(new TextEncoder().encode('não é zip').buffer as ArrayBuffer, 'x.xlsx')).rejects.toMatchObject({ code: 'corrompido' })
  })
  it('CSV com aspas, ; dentro de aspas e quebra de linha', () => {
    expect(parseCsv('a;b\n"x;y";"linha\nnova"\r\n"aspas ""ok""";2')).toEqual([
      ['a', 'b'],
      ['x;y', 'linha\nnova'],
      ['aspas "ok"', '2'],
    ])
  })
})

describe('CA-4.01.5 · desempenho', () => {
  it('300 linhas importam em ≤ 2 s (tempo real registrado)', () => {
    const rows: Row[] = [['Seq', 'Código', 'Destinatário', 'Telefone', 'Endereço', 'Bairro', 'Cidade']]
    for (let i = 0; i < 300; i++) rows.push([Math.floor(i / 2) + 1, `BR${String(i).padStart(13, '0')}`, `Cliente ${i}`, '0000', `Rua ${i % 40}, ${i}`, 'Centro', 'Cidade Teste'])
    const t0 = performance.now()
    const r = buildImport(rows, 0, suggestMapping(rows[0]!).mapping)
    const ms = performance.now() - t0
    console.info(`[importação] 300 linhas → ${r.stops.length} paradas em ${ms.toFixed(1)} ms`)
    expect(r.accounting.ok).toBe(true)
    expect(ms).toBeLessThan(2000)
  })
})
