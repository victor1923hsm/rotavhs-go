// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\route\\conference-list.test.ts (versão de 2026-11-19).
/** 4.12 — leitura da Conferência e da revisão. Dados sintéticos; nada aqui muda número, pacote ou parada. */
import { describe, expect, it } from 'vitest'
import { normalizeAddress } from '../address/address'
import type { StopIssue } from '../import/build'
import { groupFindings, keepAllSeparate, needsAttention, undoBatch, undo, type Decision, type Finding } from '../import/review'
import { buildConferenceList, stopRelations, type RelStop } from './conference-list'
import { addressNumberHint, numberBand, splitPartLabel, stopNumberA11y, stopTitle } from './labels'

const div = (part: number, parts: number): StopIssue[] => [{ code: 'stop_dividido', part, parts }]
const p = (id: string, n: number | null, i: number, issues: StopIssue[] = [], end = { street: 'Rua Teste', number: String(10 + i) }, groupedWith?: string[]): RelStop => ({
  id,
  originalNumber: n,
  plannedIndex: i,
  issues,
  norm: normalizeAddress({ ...end, city: 'Cidade Fictícia', uf: 'GO' }),
  ...(groupedWith ? { groupedWith } : {}),
})

describe('rótulos 4.12', () => {
  it('parada sem número ≠ endereço sem número (nunca o mesmo texto; "S/N" fica para o endereço)', () => {
    expect(stopTitle(null)).toBe('Sem nº de parada')
    expect(stopNumberA11y(null)).toBe('Parada sem número na etiqueta')
    expect(stopNumberA11y(12)).toBe('Parada 12')
    expect(addressNumberHint(normalizeAddress({ street: 'Rua A', number: 'S/N' }))).toBe('casa sem nº')
    expect(addressNumberHint(normalizeAddress({ street: 'Rua A', number: '' }))).toBe('casa sem nº')
    expect(addressNumberHint(normalizeAddress({ street: 'Rua A', number: '120' }))).toBeNull()
    expect(addressNumberHint({ number: '', quadra: '12', lote: '5' })).toBeNull() // porta por quadra e lote
    expect(stopTitle(null)).not.toContain('S/N')
  })
  it('Stop dividido como "endereço i de n" e faixas 1–10, 11–20', () => {
    expect(splitPartLabel(div(1, 2))).toBe('endereço 1 de 2')
    expect([1, 10, 11, 101].map((n) => numberBand(n))).toEqual(['1–10', '1–10', '11–20', '101–110'])
    expect(numberBand(null)).toBe('Sem nº de parada')
  })
})

describe('lista da Conferência (só apresentação)', () => {
  const stops = [p('a', 12, 0, div(1, 2)), p('s', null, 1), p('b', 3, 2), p('c', 12, 3, div(2, 2)), p('d', 25, 4)]

  it('ordem da planilha: partes do Stop dividido JUNTAS na posição da primeira, sem renumerar', () => {
    const it = buildConferenceList(stops, 'planilha')
    expect(it.map((x) => (x.type === 'parada' ? `${x.stop.id}:${x.stop.originalNumber}` : x.label))).toEqual(['Parada 12 · 2 endereços', 'a:12', 'c:12', 's:null', 'b:3', 'd:25'])
  })

  it('ordem pela etiqueta: faixas, sem número no fim; nenhuma parada some ou se repete', () => {
    const it = buildConferenceList(stops, 'etiqueta')
    expect(it.map((x) => (x.type === 'parada' ? x.stop.id : x.label))).toEqual(['1–10', 'b', '11–20', 'Parada 12 · 2 endereços', 'a', 'c', '21–30', 'd', 'Sem nº de parada', 's'])
    const ids = it.flatMap((x) => (x.type === 'parada' ? [x.stop.id] : []))
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd', 's'])
  })

  it('não altera as paradas recebidas (números, ordem planejada)', () => {
    const copia = JSON.stringify(stops)
    buildConferenceList(stops, 'etiqueta')
    expect(JSON.stringify(stops)).toBe(copia)
  })

  it('relações: ligada ao endereço, agrupada com outra parada, mesma porta', () => {
    const porta = { street: 'Rua Igual', number: '7' }
    const rel = stopRelations([
      p('a', 12, 0, div(1, 2), { street: 'Rua X', number: '1' }, ['c']),
      p('c', 12, 1, div(2, 2), { street: 'Rua X', number: '3' }, ['a']),
      p('m', 13, 2, [], porta),
      p('n', 14, 3, [], porta),
      p('g', 15, 4, [], { street: 'Rua G', number: '9' }, ['h']),
      p('h', 16, 5, [], { street: 'Rua G', number: '9' }, ['g']),
    ])
    expect(rel.get('a')).toEqual(['ligada ao endereço 2'])
    expect(rel.get('m')).toEqual(['mesma porta que parada 14'])
    expect(rel.get('g')).toEqual(['agrupada com parada 16']) // já agrupadas: não repete "mesma porta"
  })
})

describe('revisão por local', () => {
  const f: Finding[] = [
    { kind: 'stop_dividido', id: 'div:12', number: 12, stopKeys: ['k12a', 'k12b'], rows: [[2], [5]] },
    { kind: 'mesma_porta', id: 'porta:x', stopKeys: ['k12a', 'k13'], numbers: [12, 13] },
    { kind: 'stop_dividido', id: 'div:20', number: 20, stopKeys: ['k20a', 'k20b'], rows: [[8], [9]] },
    { kind: 'pacote_repetido', id: 'pac:T1', trackingCode: 'T1', rows: [3, 4] },
  ]

  it('um cartão por local: mesma porta junto do Stop dividido que tem parte nela', () => {
    expect(groupFindings(f).map((g) => g.map((x) => x.id))).toEqual([['div:12', 'porta:x'], ['div:20'], ['pac:T1']])
  })

  it('Stop dividido é informativo; mesma porta e pacote repetido pedem decisão', () => {
    expect(f.map(needsAttention)).toEqual([false, true, false, true])
  })

  it('"Manter todas separadas" decide só os abertos (sem pacote repetido) e desfaz de uma vez', () => {
    const antes: Decision[] = [{ type: 'agrupar_paradas', findingId: 'div:20', stopKeys: ['k20a', 'k20b'], at: 100 }]
    const r = keepAllSeparate(antes, f, 100) // mesmo horário de uma decisão anterior → o lote ganha horário próprio
    expect(r.at).not.toBe(100)
    expect(r.count).toBe(2)
    expect(r.decisions.filter((d) => d.at === r.at).map((d) => d.findingId)).toEqual(['div:12', 'porta:x'])
    expect(undoBatch(r.decisions, r.at)).toEqual(antes) // a decisão anterior continua
    expect(undo(r.decisions, 'porta:x').some((d) => d.findingId === 'porta:x')).toBe(false) // e cada uma desfaz sozinha
  })
})
