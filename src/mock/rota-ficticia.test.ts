import { describe, expect, it } from 'vitest'
import { ORDEM_SPX, PARADAS } from './rota-ficticia'

describe('dados fictícios do modelo de teste (G11)', () => {
  it('cerca de 60 paradas', () => {
    expect(PARADAS.length).toBeGreaterThanOrEqual(55)
    expect(PARADAS.length).toBeLessThanOrEqual(65)
  })
  it('ids únicos e a ordem da SPX contém cada parada uma vez', () => {
    const ids = PARADAS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ORDEM_SPX].sort()).toEqual([...ids].sort())
  })
  it('tem Stops com vários pacotes', () => {
    expect(PARADAS.filter((p) => p.pacotes.length > 1).length).toBeGreaterThan(5)
  })
  it('tem um Stop dividido: mesmo número, endereços diferentes, partes 1 e 2', () => {
    const div = PARADAS.filter((p) => p.parte)
    expect(div.length).toBe(2)
    expect(new Set(div.map((p) => p.stop)).size).toBe(1)
    expect(div[0]!.endereco).not.toBe(div[1]!.endereco)
  })
  it('tem uma parada "?" (stop null) e nenhum Stop 0', () => {
    expect(PARADAS.filter((p) => p.stop === null).length).toBe(1)
    expect(PARADAS.some((p) => p.stop === 0)).toBe(false)
  })
  it('tem uma casa sem número', () => {
    expect(PARADAS.filter((p) => p.semNumero && /s\/n/.test(p.endereco)).length).toBe(1)
  })
  it('códigos de pacote únicos e nenhum telefone nos dados', () => {
    const tns = PARADAS.flatMap((p) => p.pacotes)
    expect(new Set(tns).size).toBe(tns.length)
    const texto = JSON.stringify(PARADAS)
    expect(texto).not.toMatch(/\(\d{2}\)\s?9?\d{4}-?\d{4}/)
    expect(texto).not.toMatch(/"(tel|telefone|phone|celular)"/i)
  })
})
