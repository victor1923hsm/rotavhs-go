import { describe, expect, it } from 'vitest'
import { TEMAS, temaSalvo } from './estado'
import { ABAS, direcaoEntre } from './navegacao'

describe('temas (V7)', () => {
  it('converte os nomes antigos e usa Claro como padrão', () => {
    expect(temaSalvo('noite')).toBe('escuro')
    expect(temaSalvo('sol')).toBe('claro')
    expect(temaSalvo(null)).toBe('claro')
    expect(temaSalvo('alta')).toBe('alta')
    expect(TEMAS.map((t) => t.id)).toEqual(['claro', 'alta', 'escuro'])
  })
})

describe('barra inferior (V15)', () => {
  it('tem as quatro abas do Figma, na ordem', () => {
    expect(ABAS).toEqual(['/pedidos', '/rotas', '/estatisticas', '/financeiro'])
    expect(direcaoEntre('/estatisticas', '/financeiro')).toBe('aba-direita')
    expect(direcaoEntre('/financeiro', '/pedidos')).toBe('aba-esquerda')
  })
})
