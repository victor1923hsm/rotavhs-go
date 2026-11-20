import { beforeEach, describe, expect, it } from 'vitest'
import { useEstado } from './estado'

const e = () => useEstado.getState()
const pendentes = () => e().ordem.filter((id) => e().status[id] === 'pendente')

describe('estado do modelo de teste', () => {
  beforeEach(() => {
    e().definirFase('otimizada')
    e().definirFase('andamento')
  })
  it('marcar pula para a próxima pendente e desfazer volta (revisão 9)', () => {
    const a = e().selecionada
    e().marcar('entregue')
    expect(e().status[a]).toBe('entregue')
    expect(e().selecionada).not.toBe(a)
    expect(e().aviso?.desfazer).toBeTypeOf('function')
    e().aviso?.desfazer?.()
    expect(e().status[a]).toBe('pendente')
    expect(e().selecionada).toBe(a)
  })
  it('sugestão nunca muda a ordem sozinha; "Usar nova ordem" aplica (G8)', () => {
    const antes = [...e().ordem]
    e().simularSugestao()
    expect(e().sugestao).not.toBeNull()
    expect(e().ordem).toEqual(antes)
    e().recusarSugestao()
    expect(e().ordem).toEqual(antes)
    e().simularSugestao()
    e().aceitarSugestao()
    expect(e().ordem).not.toEqual(antes)
    expect([...e().ordem].sort()).toEqual([...antes].sort())
  })
  it('recalcular não mexe nas paradas já visitadas', () => {
    e().marcar('entregue')
    e().marcar('falha')
    const feitas = e().ordem.filter((id) => e().status[id] !== 'pendente')
    e().recalcular()
    if (e().sugestao) e().aceitarSugestao()
    expect(e().ordem.slice(0, feitas.length)).toEqual(e().ordem.filter((id) => e().status[id] !== 'pendente'))
    expect(pendentes().length + feitas.length).toBe(e().ordem.length)
  })
})
