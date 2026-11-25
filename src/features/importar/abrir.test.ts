import { describe, expect, it } from 'vitest'
import { ETAPAS_ABRIR, FalhaAbrir, abrirRotaImportada } from './abrir'
import type { RotaImportada } from './converter'

// Rota SINTÉTICA mínima (só os campos usados aqui).
const rota = (pacotes: string[][]): RotaImportada =>
  ({
    paradas: pacotes.map((ps, i) => ({ id: `p${i}`, pacotes: ps })),
    ordemSpx: pacotes.map((_, i) => `p${i}`),
    pacotes: pacotes.flat().length,
  }) as unknown as RotaImportada

const passos = (over: Partial<Parameters<typeof abrirRotaImportada>[2]> = {}) => {
  const vistas: number[] = []
  let ativa = false
  return {
    vistas,
    p: {
      criar: () => { ativa = true },
      criada: () => ativa,
      salvar: async () => true,
      abrir: async () => true,
      progresso: (i: number) => vistas.push(i),
      respirar: async () => {},
      ...over,
    },
  }
}

async function falha(r: RotaImportada | null, rep: number, over = {}) {
  const { p } = passos(over)
  try {
    await abrirRotaImportada(r, rep, p)
  } catch (e) {
    return e as FalhaAbrir
  }
  throw new Error('deveria falhar')
}

describe('abrir a rota importada em etapas', () => {
  it('passa pelas 5 etapas, em ordem, até abrir a tela Rotas', async () => {
    const { p, vistas } = passos()
    await abrirRotaImportada(rota([['A'], ['B', 'C']]), 0, p)
    expect(vistas).toEqual([0, 1, 2, 3, 4])
    expect(ETAPAS_ABRIR).toEqual(['Validando dados', 'Organizando encomendas', 'Criando paradas', 'Salvando rota', 'Abrindo rota'])
  })
  it('pacote repetido sem escolha: diz o que fazer (não fica mudo)', async () => {
    const e = await falha(rota([['A']]), 2)
    expect(e.etapa).toBe('Validando dados')
    expect(e.message).toContain('2 pacotes repetidos')
  })
  it('sem planilha, ou ordem que não fecha: falha na validação', async () => {
    expect((await falha(null, 0)).etapa).toBe('Validando dados')
    const r = rota([['A'], ['B']])
    r.ordemSpx = ['p0', 'p0']
    expect((await falha(r, 0)).message).toContain('ordem da SPX')
  })
  it('pacote em duas paradas ou contagem errada: falha ao organizar as encomendas', async () => {
    expect((await falha(rota([['A'], ['A']]), 0)).etapa).toBe('Organizando encomendas')
    const r = rota([['A'], ['B']])
    r.pacotes = 3
    expect((await falha(r, 0)).message).toContain('não fecha')
  })
  it('gravação e navegação que falham dizem a etapa', async () => {
    expect((await falha(rota([['A']]), 0, { salvar: async () => false })).etapa).toBe('Salvando rota')
    expect((await falha(rota([['A']]), 0, { abrir: async () => false })).etapa).toBe('Abrindo rota')
  })
  it('erro inesperado vira mensagem sem dados da planilha (só o tipo do erro)', async () => {
    const e = await falha(rota([['A']]), 0, { criar: () => { throw new TypeError('Rua Teste 1, 10 BR260000000101X') } })
    expect(e.etapa).toBe('Criando paradas')
    expect(e.message).toBe('Erro interno (TypeError). Toque em "Tentar de novo".')
  })
})
