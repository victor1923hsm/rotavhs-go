// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\import\\review.test.ts (versão de 2026-11-19).
/** Etapa 4.3 — duplicidades sem excluir entregas legítimas (CA-4.04). Planilha SINTÉTICA 06. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readSpreadsheet } from '@/platform/spreadsheet'
import { buildImport } from './build'
import { detectHeaderRow, suggestMapping } from './mapping'
import { applyDecisions, findDuplicates, isResolved, removeRow, undo, type Decision } from './review'

async function importar06() {
  const u = readFileSync(new URL('../../../test-fixtures/planilhas/06-duplicados-e-conflitos.xlsx', import.meta.url))
  const read = await readSpreadsheet(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, '06.xlsx')
  const rows = read.sheets[0]!.rows
  const h = detectHeaderRow(rows)!
  return buildImport(rows, h, suggestMapping(rows[h]!).mapping)
}

describe('CA-4.04 · tabela de duplicidades', () => {
  it('encontra pacote repetido, mesma porta em paradas diferentes e número conflitante; apartamentos NÃO', async () => {
    const r = await importar06()
    const f = findDuplicates(r)
    expect(f.map((x) => x.kind).sort()).toEqual(['mesma_porta', 'pacote_repetido', 'stop_dividido'])
    expect(f.find((x) => x.kind === 'stop_dividido')).toMatchObject({ number: 2, rows: [[4], [5]] })
    const pac = f.find((x) => x.kind === 'pacote_repetido')!
    expect(pac).toMatchObject({ trackingCode: 'BR0000000000031', rows: [2, 3] })
    const porta = f.find((x) => x.kind === 'mesma_porta')!
    expect(porta).toMatchObject({ numbers: [2, 4] }) // Rua Y, 5 nas paradas 2 e 4
    // Rua W, 8 — Apto 101 (parada 5) e Apto 102 (parada 6): portas diferentes
    expect(f.some((x) => x.kind === 'mesma_porta' && x.numbers.includes(5))).toBe(false)
  })

  it('nada é removido sem decisão; com decisão, a linha sai e a contabilidade continua fechando', async () => {
    const r = await importar06()
    const semDecisao = applyDecisions(r, [])
    expect(semDecisao.packages).toHaveLength(7)
    expect(semDecisao.accounting.ok).toBe(true)

    const pac = findDuplicates(r).find((x) => x.kind === 'pacote_repetido')!
    let ds: Decision[] = removeRow([], pac, 3, 1000)
    const efetivo = applyDecisions(r, ds)
    expect(efetivo.packages).toHaveLength(6)
    expect(efetivo.stops.find((s) => s.originalNumber === 1)!.packageCount).toBe(1)
    expect(efetivo.accounting).toMatchObject({ removedByUser: 1, ok: true })
    expect(isResolved(ds, pac)).toBe(true)

    ds = undo(ds, pac.id)
    expect(applyDecisions(r, ds).packages).toHaveLength(7)
  })

  it('não deixa remover TODAS as linhas de um pacote', async () => {
    const r = await importar06()
    const pac = findDuplicates(r).find((x) => x.kind === 'pacote_repetido')!
    const ds = removeRow(removeRow([], pac, 2, 1), pac, 3, 2)
    expect(ds).toHaveLength(1)
  })

  it('"mesma porta" nunca agrupa sozinho; agrupar é decisão e não muda os números originais', async () => {
    const r = await importar06()
    const porta = findDuplicates(r).find((x) => x.kind === 'mesma_porta')!
    expect(applyDecisions(r, []).groups).toEqual([])
    const ds: Decision[] = [{ type: 'agrupar_paradas', findingId: porta.id, stopKeys: porta.kind === 'mesma_porta' ? porta.stopKeys : [], at: 1 }]
    const ef = applyDecisions(r, ds)
    expect(ef.groups).toHaveLength(1)
    expect(ef.stops.map((s) => s.originalNumber)).toEqual(r.stops.map((s) => s.originalNumber))
  })
})
