import { describe, expect, it } from 'vitest'
import { direcaoEntre } from './navegacao'

describe('direção das transições (estilo iOS)', () => {
  it('tela interna entra pela frente e volta para trás', () => {
    expect(direcaoEntre('/pedidos', '/importar')).toBe('frente')
    expect(direcaoEntre('/importar', '/pedidos')).toBe('tras')
    expect(direcaoEntre('/estatisticas', '/estatisticas/custo')).toBe('frente')
    expect(direcaoEntre('/estatisticas/custo', '/estatisticas')).toBe('tras')
  })
  it('entre abas, desliza para o lado da aba escolhida', () => {
    expect(direcaoEntre('/pedidos', '/rotas')).toBe('aba-direita')
    expect(direcaoEntre('/estatisticas', '/pedidos')).toBe('aba-esquerda')
    expect(direcaoEntre('/importar', '/rotas')).toBe('aba-direita')
  })
  it('mesma tela: sem transição', () => {
    expect(direcaoEntre('/rotas', '/rotas')).toBe('nenhuma')
  })
})
