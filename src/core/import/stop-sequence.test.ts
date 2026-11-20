// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\import\\stop-sequence.test.ts (versão de 2026-11-19).
/**
 * Etapa 4.11 — D1 (Stop × Sequence), D2 (sem número) e D4 (sinônimos). Dados SINTÉTICOS.
 * Regra principal: o número da etiqueta nunca muda, nenhum pacote se perde e locais diferentes
 * nunca são unidos sem confirmação.
 */
import { describe, expect, it } from 'vitest'
import { packagesLabel, splitPartLabel, stopTitle } from '../route/labels'
import { buildImport, sheetRef } from './build'
import { reusableTemplate, suggestMapping, type Row } from './mapping'
import { applyDecisions, findDuplicates, undo, type Decision } from './review'

/** Cabeçalho no formato da SPX (títulos públicos; valores todos fictícios). */
const SPX: Row = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude']
const linha = (seq: string | number, stop: string | number, tn: string, end: string, lat: number | string = -16.7, lng: number | string = -49.3): Row => ['AT0', seq, stop, tn, end, 'Jd. Teste', 'Cidade Teste', '74000-000', lat, lng]
const importar = (rows: Row[]) => buildImport([SPX, ...rows], 0, suggestMapping(SPX).mapping)

describe('D4 · mapeamento SPX e sinônimos', () => {
  it('SPX: parada = Stop, sequência = Sequence; Destination Address e Zipcode/Postal code reconhecidos', () => {
    const s = suggestMapping(SPX)
    expect(s.mapping).toMatchObject({ sequencia: 1, parada: 2, pacote: 3, endereco: 4, bairro: 5, cidade: 6, cep: 7, lat: 8, lng: 9 })
    expect(s.confidence).toMatchObject({ parada: 1, sequencia: 1, endereco: 1, cep: 1 })
  })

  it('compatibilidade: planilha só com Seq/Sequência continua usando-a como número da parada', () => {
    for (const h of ['Seq', 'Sequência', 'Sequence', 'Sequência de entrega']) {
      const m = suggestMapping([h, 'Endereço', 'Código']).mapping
      expect(m.parada, h).toBe(0)
      expect(m.sequencia, h).toBeUndefined()
    }
    expect(suggestMapping(['Endereço de destino', 'Parada']).mapping).toMatchObject({ endereco: 0, parada: 1 })
  })

  it('modelo salvo antigo (sem v) que punha a parada na Sequence NÃO é reaplicado; o que concorda, sim; v2 sempre', () => {
    const sug = suggestMapping(SPX).mapping
    const antigoErrado = { mapping: { ...sug, parada: 1, sequencia: undefined } }
    expect(reusableTemplate(antigoErrado, sug)).toBeNull()
    const antigoCerto = { mapping: { ...sug } }
    expect(reusableTemplate(antigoCerto, sug)).toEqual(sug)
    const v2 = { mapping: { ...sug, bairro: undefined }, v: 2 }
    expect(reusableTemplate(v2, sug)).toBe(v2.mapping)
    expect(reusableTemplate(undefined, sug)).toBeNull()
  })
})

describe('D1 · Stop e local', () => {
  it('mesmo Stop + mesma porta + mesma coordenada → UMA parada com vários pacotes; Sequence preservada por pacote', () => {
    const r = importar([linha(9, 4, 'BR01', 'Rua 1, 10'), linha(7, 4, 'BR02', 'Rua 1, 10'), linha(8, 4, 'BR03', 'Rua 1, 10')])
    expect(r.stops).toHaveLength(1)
    expect(r.stops[0]).toMatchObject({ originalNumber: 4, packageCount: 3, rows: [2, 3, 4], sheetStop: { raw: '4', number: 4 } })
    expect(r.packages.map((p) => p.sheetSequence)).toEqual([
      { raw: '9', number: 9 },
      { raw: '7', number: 7 },
      { raw: '8', number: 8 },
    ])
    expect(r.stops[0]!.issues).toEqual([])
  })

  it('a Sequence nunca muda o número nem a ordem das paradas', () => {
    const r = importar([linha(50, 2, 'BR01', 'Rua 1, 10'), linha(1, 7, 'BR02', 'Rua 2, 20')])
    expect(r.stops.map((s) => [s.originalNumber, s.order])).toEqual([
      [2, 0],
      [7, 1],
    ])
  })

  it('mesmo Stop com ENDEREÇO diferente → partes separadas, "local i de n", nada fundido', () => {
    const r = importar([linha(1, 5, 'BR01', 'Rua 1, 10'), linha(2, 5, 'BR02', 'Rua 3, 30'), linha(3, 5, 'BR03', 'Rua 1, 10')])
    expect(r.stops.map((s) => [s.originalNumber, s.rows])).toEqual([
      [5, [2, 4]],
      [5, [3]],
    ])
    expect(r.stops.map((s) => splitPartLabel(s.issues))).toEqual(['endereço 1 de 2', 'endereço 2 de 2'])
    expect(r.packages).toHaveLength(3)
    expect(new Set(r.stops.map((s) => s.key)).size).toBe(2)
  })

  it('mesmo Stop e mesma porta com COORDENADA diferente (ou ausente numa delas) → partes separadas', () => {
    const coord = importar([linha(1, 6, 'BR01', 'Rua 1, 10', -16.7, -49.3), linha(2, 6, 'BR02', 'Rua 1, 10', -16.7003, -49.3)])
    expect(coord.stops).toHaveLength(2)
    const semCoord = importar([linha(1, 6, 'BR01', 'Rua 1, 10', -16.7, -49.3), linha(2, 6, 'BR02', 'Rua 1, 10', '', '')])
    expect(semCoord.stops).toHaveLength(2)
    // diferença abaixo de 5 casas (≈ 1 m) é o mesmo local
    const igual = importar([linha(1, 6, 'BR01', 'Rua 1, 10', -16.700001, -49.3), linha(2, 6, 'BR02', 'Rua 1, 10', -16.700002, -49.3)])
    expect(igual.stops).toHaveLength(1)
  })

  it('o Stop não é identificador global: Stops diferentes na mesma porta continuam separados e viram "mesma porta"', () => {
    const r = importar([linha(1, 3, 'BR01', 'Rua 1, 10'), linha(2, 8, 'BR02', 'Rua 1, 10')])
    expect(r.stops.map((s) => s.originalNumber)).toEqual([3, 8])
    expect(findDuplicates(r).map((f) => f.kind)).toEqual(['mesma_porta'])
  })

  it('revisão: "São o mesmo local" só LIGA as partes (não funde pacotes, não muda números) e pode ser desfeito', () => {
    const r = importar([linha(1, 5, 'BR01', 'Rua 1, 10'), linha(2, 5, 'BR02', 'Rua 3, 30')])
    const f = findDuplicates(r)
    expect(f).toHaveLength(1) // partes do mesmo Stop não aparecem de novo como "mesma porta"
    const div = f[0]!
    expect(div).toMatchObject({ kind: 'stop_dividido', number: 5, rows: [[2], [3]] })
    if (div.kind !== 'stop_dividido') throw new Error('tipo')

    const agrupar: Decision[] = [{ type: 'agrupar_paradas', findingId: div.id, stopKeys: div.stopKeys, at: 1 }]
    const ef = applyDecisions(r, agrupar)
    expect(ef.groups).toEqual([div.stopKeys])
    expect(ef.stops.map((s) => [s.originalNumber, s.rows])).toEqual([
      [5, [2]],
      [5, [3]],
    ])
    expect(ef.packages).toHaveLength(2)
    expect(ef.stops.map((s) => s.address.full)).toEqual(['Rua 1, 10', 'Rua 3, 30'])

    expect(applyDecisions(r, undo(agrupar, div.id)).groups).toEqual([])
    expect(applyDecisions(r, [{ type: 'manter_todas', findingId: div.id, at: 2 }]).groups).toEqual([])
  })
})

describe('D2 · sem número', () => {
  it('"-", vazio e inválido → null + aviso, valor original preservado; uma parada por linha; nunca 0', () => {
    const r = importar([linha('-', '-', 'BR01', 'Rua 1, 10'), linha('', '', 'BR02', 'Rua 1, 10'), linha('x', 'abc', 'BR03', 'Rua 2, 20'), linha(4, '12A', 'BR04', 'Rua 3, 30')])
    expect(r.stops).toHaveLength(4)
    expect(r.stops.every((s) => s.originalNumber === null)).toBe(true)
    expect(r.stops.map((s) => s.issues.find((i) => i.code === 'sem_numero'))).toEqual([
      { code: 'sem_numero', raw: '-' },
      { code: 'sem_numero', raw: '' },
      { code: 'sem_numero', raw: '[inválido]' },
      { code: 'sem_numero', raw: '12A' },
    ])
    expect(new Set(r.stops.map((s) => s.key)).size).toBe(4)
    expect(r.packages).toHaveLength(4)
    expect(r.accounting.ok).toBe(true)
    // duas S/N na mesma porta: separadas, apontadas como "mesma porta" para você decidir
    expect(findDuplicates(r).find((f) => f.kind === 'mesma_porta')).toMatchObject({ numbers: [null, null] })
  })

  it('"0" que veio na planilha é preservado como 0 (só não se inventa zero)', () => {
    expect(importar([linha(1, '0', 'BR01', 'Rua 1, 10')]).stops[0]!.originalNumber).toBe(0)
    expect(importar([linha(1, '007', 'BR01', 'Rua 1, 10')]).stops[0]!.originalNumber).toBe(7)
  })

  it('privacidade: o valor original só é guardado quando curto e seguro (nada parecido com telefone ou nome)', () => {
    expect(sheetRef('62900001234').raw).toBe('[inválido]')
    expect(sheetRef('(62) 90000-1234').raw).toBe('[inválido]')
    expect(sheetRef('Maria').raw).toBe('[inválido]')
    expect(sheetRef('#12').raw).toBe('#12')
    expect(sheetRef(' - ')).toEqual({ raw: ' - ', number: null })
  })

  it('rótulos (4.12): "Sem nº de parada", "Parada 12", "endereço 1 de 2" e quantidade só quando > 1', () => {
    expect(stopTitle(null)).toBe('Sem nº de parada')
    expect(stopTitle(12)).toBe('Parada 12')
    expect(splitPartLabel([{ code: 'stop_dividido', part: 1, parts: 2 }])).toBe('endereço 1 de 2')
    expect(splitPartLabel([])).toBeNull()
    expect(packagesLabel(1)).toBeNull()
    expect(packagesLabel(3)).toBe('3 pacotes')
  })
})
