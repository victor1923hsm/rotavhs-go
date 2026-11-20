/**
 * RotaVHS Go · Etapa 2 — formato REAL da planilha da SPX (colunas conferidas em 2026-11-19),
 * com dados FICTÍCIOS (test-fixtures/planilhas/11-formato-spx.xlsx, gerado por npm run planilhas).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readSpreadsheet } from '@/platform/spreadsheet'
import { buildImport } from './build'
import { detectHeaderRow, suggestMapping, validateMapping, type Row } from './mapping'
import { findDuplicates } from './review'

const arquivo = (): ArrayBuffer => {
  const u = readFileSync(new URL('../../../test-fixtures/planilhas/11-formato-spx.xlsx', import.meta.url))
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

async function importar() {
  const lido = await readSpreadsheet(arquivo(), '11-formato-spx.xlsx')
  const aba = lido.sheets[0]!
  const h = detectHeaderRow(aba.rows)!
  const { mapping } = suggestMapping(aba.rows[h]!)
  return { lido, aba, h, mapping, r: buildImport(aba.rows, h, mapping) }
}

describe('planilha no formato da SPX', () => {
  it('reconhece sozinho todas as colunas da SPX', async () => {
    const { aba, h, mapping } = await importar()
    expect(h).toBe(0)
    expect(validateMapping(mapping, aba.rows[h]!)).toEqual([])
    const nomes = Object.fromEntries(Object.entries(mapping).map(([campo, col]) => [campo, String(aba.rows[h]![col!])]))
    expect(nomes).toMatchObject({
      parada: 'Stop', sequencia: 'Sequence', pacote: 'SPX TN', endereco: 'Destination Address',
      bairro: 'Bairro', cidade: 'City', cep: 'Zipcode/Postal code', lat: 'Latitude', lng: 'Longitude',
    })
  })

  it('contabilidade: linhas = pacotes + ignoradas', async () => {
    const { r } = await importar()
    expect(r.accounting).toMatchObject({ dataRows: 11, packages: 11, ignored: 0, ok: true })
  })

  it('agrupa pacotes pelo Stop e nunca renumera', async () => {
    const { r } = await importar()
    const porNumero = (n: number) => r.stops.filter((s) => s.originalNumber === n)
    expect(porNumero(1)).toHaveLength(1)
    expect(porNumero(1)[0]!.packageCount).toBe(2)
    expect(porNumero(4)[0]!.packageCount).toBe(3)
    expect(r.stops.map((s) => s.originalNumber).filter((n) => n !== null).every((n) => [1, 2, 3, 4, 5].includes(n!))).toBe(true)
  })

  it('Stop dividido: o 3 em dois locais vira duas paradas sinalizadas, nunca unidas', async () => {
    const { r } = await importar()
    const tres = r.stops.filter((s) => s.originalNumber === 3)
    expect(tres).toHaveLength(2)
    expect(tres.map((s) => s.issues.find((i) => i.code === 'stop_dividido'))).toEqual([
      { code: 'stop_dividido', part: 1, parts: 2 },
      { code: 'stop_dividido', part: 2, parts: 2 },
    ])
  })

  it('Stop "-" vira "sem número" (null), uma parada por pacote, nunca 0', async () => {
    const { r } = await importar()
    const sem = r.stops.filter((s) => s.originalNumber === null)
    expect(sem).toHaveLength(2)
    expect(sem.every((s) => s.issues.some((i) => i.code === 'sem_numero'))).toBe(true)
    expect(r.stops.some((s) => s.originalNumber === 0)).toBe(false)
  })

  it('guarda a coordenada da planilha em todas as paradas', async () => {
    const { r } = await importar()
    expect(r.stops.every((s) => s.sheetPoint && Number.isFinite(s.sheetPoint.lat) && Number.isFinite(s.sheetPoint.lng))).toBe(true)
  })

  it('a conferência acha o Stop dividido', async () => {
    const { r } = await importar()
    expect(findDuplicates(r).some((f) => f.kind === 'stop_dividido')).toBe(true)
  })

  it('200 pacotes no formato da SPX são lidos e agrupados em menos de 0,5 s', () => {
    const cab: Row = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude']
    const linhas: Row[] = [cab]
    for (let i = 1; i <= 200; i++) {
      const stop = Math.ceil(i / 2)
      linhas.push(['AT0', i, stop, `BR26${String(i).padStart(9, '0')}X`, `Rua Teste ${stop}, ${stop * 3}`, 'Bairro', 'Cidade Teste', '70000-000', -15.8 - stop * 0.0003, -47.9 - stop * 0.0002])
    }
    const t0 = performance.now()
    const { mapping } = suggestMapping(cab)
    const r = buildImport(linhas, 0, mapping)
    const ms = performance.now() - t0
    expect(r.accounting.packages).toBe(200)
    expect(r.stops).toHaveLength(100)
    expect(ms).toBeLessThan(500)
  })
})
