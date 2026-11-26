// Central de otimização (RB-1): estados do cofre na tela, modo e disponibilidade. Cofre falso, chave fictícia.
import { beforeEach, describe, expect, it } from 'vitest'
import { disponibilidade, useRuas } from './ruas'
import { COFRE_INDISPONIVEL, _definirCofre, type Cofre } from '@/platform/cofre'

const FICTICIA = 'chave-ficticia-de-teste-0123456789'

function cofreMemoria(): Cofre & { valor: string | null } {
  const c = {
    disponivel: true,
    valor: null as string | null,
    existe: async () => (c.valor ? ('cadastrada' as const) : ('ausente' as const)),
    guardar: async (v: string) => void (c.valor = v.trim()),
    ler: async () => ({ estado: c.valor ? ('cadastrada' as const) : ('ausente' as const), valor: c.valor }),
    apagar: async () => void (c.valor = null),
  }
  return c
}

describe('central de otimização', () => {
  beforeEach(() => useRuas.setState({ cofre: 'verificando', ocupado: null, avisoRuas: null }))

  it('PWA: indisponível, e a chave não é aceita', async () => {
    _definirCofre(COFRE_INDISPONIVEL)
    await useRuas.getState().verificarCofre()
    expect(useRuas.getState().cofre).toBe('pwa')
    expect(await useRuas.getState().guardarChave(FICTICIA)).toMatch(/Android/)
  })

  it('APK: cadastrar, substituir e excluir; a tela nunca guarda o valor no estado', async () => {
    const c = cofreMemoria()
    _definirCofre(c)
    await useRuas.getState().verificarCofre()
    expect(useRuas.getState().cofre).toBe('ausente')
    expect(await useRuas.getState().guardarChave(FICTICIA)).toBeNull()
    expect(useRuas.getState().cofre).toBe('cadastrada')
    expect(JSON.stringify(useRuas.getState())).not.toContain(FICTICIA)
    expect(await useRuas.getState().guardarChave(FICTICIA + 'X')).toBeNull()
    expect(c.valor).toBe(FICTICIA + 'X')
    expect(await useRuas.getState().apagarChave()).toBeNull()
    expect(useRuas.getState().cofre).toBe('ausente')
    expect(c.valor).toBeNull()
  })

  it('falha do cofre vira estado de erro, com mensagem sem a chave', async () => {
    _definirCofre({ ...cofreMemoria(), existe: () => Promise.reject(new Error('x')), guardar: () => Promise.reject(new Error(FICTICIA)) })
    const m = await useRuas.getState().guardarChave(FICTICIA)
    expect(m).not.toContain(FICTICIA)
    expect(useRuas.getState().cofre).toBe('erro')
  })

  it('o cálculo pelas ruas nunca aparece como pronto nesta versão', () => {
    for (const e of ['verificando', 'pwa', 'ausente', 'cadastrada', 'invalidada', 'erro'] as const)
      for (const on of [true, false]) {
        const d = disponibilidade(e, on)
        expect(d.pronto).toBe(false)
      }
    expect(disponibilidade('cadastrada', true).detalhe).toMatch(/em desenvolvimento/)
    expect(disponibilidade('cadastrada', false).titulo).toMatch(/sem conexão/)
  })

  it('modo "pelas ruas" abre o aviso em vez de calcular', () => {
    useRuas.getState().definirModo('ruas')
    useRuas.getState().abrirAvisoRuas('otimizar')
    expect(useRuas.getState().avisoRuas).toBe('otimizar')
    useRuas.getState().fecharAvisoRuas()
    useRuas.getState().definirModo('rapida')
    expect(useRuas.getState().modo).toBe('rapida')
  })
})
