import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findDuplicates, keepAllSeparate, type Decision, type Finding } from '@/core/import/review'
import { lerPlanilha } from './leitura'
import { rotaDaImportacao } from './converter'

async function ler(nome: string) {
  const u = readFileSync(new URL(`../../../test-fixtures/planilhas/${nome}`, import.meta.url))
  const r = await lerPlanilha(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, nome)
  if (!r.ok) throw new Error(r.erro)
  return r.leitura
}
const pacotes = (r: ReturnType<typeof rotaDaImportacao>) => r.paradas.flatMap((p) => p.pacotes)

describe('planilha SPX → paradas do app', () => {
  it('sem decisões: as partes da parada dividida ficam separadas; nenhum pacote some ou duplica', async () => {
    const l = await ler('11-formato-spx.xlsx')
    const r = rotaDaImportacao(l.resultado, [], l.arquivo)
    expect(r.paradas.filter((p) => p.stop === 3)).toHaveLength(2)
    expect(r.paradas.filter((p) => p.stop === 3).map((p) => p.parte)).toEqual([{ i: 1, n: 2 }, { i: 2, n: 2 }])
    const tns = pacotes(r)
    expect(tns).toHaveLength(11)
    expect(new Set(tns).size).toBe(11)
    expect(r.pacotes).toBe(11)
  })

  it('"são o mesmo local" junta a VISITA sem mudar o número nem perder pacotes', async () => {
    const l = await ler('11-formato-spx.xlsx')
    const f = l.achados.find((x) => x.kind === 'stop_dividido') as Extract<Finding, { kind: 'stop_dividido' }>
    const ds: Decision[] = [{ type: 'agrupar_paradas', findingId: f.id, stopKeys: f.stopKeys, at: 1 }]
    const r = rotaDaImportacao(l.resultado, ds, l.arquivo)
    const tres = r.paradas.filter((p) => p.stop === 3)
    expect(tres).toHaveLength(1)
    expect(tres[0]!.pacotes).toHaveLength(2)
    expect(tres[0]!.outrosEnderecos).toHaveLength(1)
    expect(tres[0]!.parte).toBeUndefined()
    expect(pacotes(r)).toHaveLength(11)
  })

  it('"manter todas separadas" dá o mesmo resultado de não decidir', async () => {
    const l = await ler('11-formato-spx.xlsx')
    const sep = keepAllSeparate([], l.achados, 1).decisions
    expect(rotaDaImportacao(l.resultado, sep, l.arquivo).paradas.map((p) => p.id)).toEqual(rotaDaImportacao(l.resultado, [], l.arquivo).paradas.map((p) => p.id))
  })

  it('ordem da SPX pela Sequence; os sem número ("-") vão para o fim, como "?"', async () => {
    const l = await ler('11-formato-spx.xlsx')
    const r = rotaDaImportacao(l.resultado, [], l.arquivo)
    const nums = r.ordemSpx.map((id) => r.paradas.find((p) => p.id === id)!.stop)
    expect(nums.slice(0, 2)).toEqual([1, 2])
    expect(nums.slice(-2)).toEqual([null, null])
  })

  it('coordenadas e CEP da planilha chegam às paradas', async () => {
    const l = await ler('11-formato-spx.xlsx')
    const r = rotaDaImportacao(l.resultado, [], l.arquivo)
    expect(r.paradas.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !p.semCoordenada)).toBe(true)
    expect(r.paradas[0]!.cep).toBe('70000-001')
  })

  it('pacote repetido: remover uma das linhas (decisão sua) tira só aquele pacote', async () => {
    const l = await ler('06-duplicados-e-conflitos.xlsx')
    const rep = findDuplicates(l.resultado).find((f) => f.kind === 'pacote_repetido') as Extract<Finding, { kind: 'pacote_repetido' }>
    const antes = pacotes(rotaDaImportacao(l.resultado, [], l.arquivo)).length
    const depois = rotaDaImportacao(l.resultado, [{ type: 'remover_linha', row: rep.rows[1]!, findingId: rep.id, at: 1 }], l.arquivo)
    expect(pacotes(depois)).toHaveLength(antes - 1)
  })

  it('sem coordenada: a parada fica na lista, marcada e fora do mapa', async () => {
    const l = await ler('08-coordenadas.xlsx')
    const r = rotaDaImportacao(l.resultado, [], l.arquivo)
    expect(r.paradas.some((p) => p.semCoordenada)).toBe(true)
    expect(r.semCoordenada).toBeGreaterThan(0)
  })

  it('arquivo que não é planilha: erro claro, sem travar', async () => {
    const r = await lerPlanilha(new TextEncoder().encode('isto não é xlsx').buffer as ArrayBuffer, 'x.xlsx')
    expect(r.ok).toBe(false)
  })
})
