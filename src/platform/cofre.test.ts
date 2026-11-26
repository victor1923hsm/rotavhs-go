// Adaptador do cofre (RB-1): plugin falso em memória; nenhuma chave real.
import { describe, expect, it } from 'vitest'
import { COFRE_INDISPONIVEL, FalhaCofre, cofreDoPlugin, obterCofre, validarChave, _definirCofre } from './cofre'

const FICTICIA = 'chave-ficticia-de-teste-0123456789'

function pluginFalso() {
  let guardada: string | null = null
  let invalidar = false
  return {
    plugin: {
      guardar: async ({ valor }: { valor: string }) => ((guardada = valor), { estado: 'cadastrada' as const }),
      ler: async () => {
        if (invalidar) return ((guardada = null), (invalidar = false), { estado: 'invalidada' as const, valor: null })
        return guardada ? { estado: 'cadastrada' as const, valor: guardada } : { estado: 'ausente' as const, valor: null }
      },
      existe: async () => ({ estado: guardada ? ('cadastrada' as const) : ('ausente' as const) }),
      apagar: async () => ((guardada = null), { estado: 'ausente' as const }),
    },
    invalidar: () => (invalidar = true),
  }
}

describe('cofre da chave', () => {
  it('guardar, verificar, ler, substituir e excluir', async () => {
    const f = pluginFalso()
    const c = cofreDoPlugin(f.plugin)
    expect(await c.existe()).toBe('ausente')
    await c.guardar(`  ${FICTICIA}  `)
    expect(await c.existe()).toBe('cadastrada')
    expect((await c.ler()).valor).toBe(FICTICIA)
    await c.guardar(FICTICIA + 'B')
    expect((await c.ler()).valor).toBe(FICTICIA + 'B')
    await c.apagar()
    expect(await c.existe()).toBe('ausente')
    expect(await c.ler()).toEqual({ estado: 'ausente', valor: null })
  })

  it('chave invalidada pelo sistema volta como "invalidada", sem valor', async () => {
    const f = pluginFalso()
    const c = cofreDoPlugin(f.plugin)
    await c.guardar(FICTICIA)
    f.invalidar()
    expect(await c.ler()).toEqual({ estado: 'invalidada', valor: null })
  })

  it('recusa formato inválido sem chamar o plugin', async () => {
    let chamou = false
    const c = cofreDoPlugin({ ...pluginFalso().plugin, guardar: async () => ((chamou = true), { estado: 'cadastrada' as const }) })
    await expect(c.guardar('curta')).rejects.toMatchObject({ codigo: 'valor-invalido' })
    await expect(c.guardar('tem espaço no meio da chave 123')).rejects.toBeInstanceOf(FalhaCofre)
    expect(chamou).toBe(false)
    expect(validarChave('a'.repeat(4097))).toBeNull()
    expect(validarChave('eyJvcmciOiI1YjNj.ZTM1OTc4NTEx_MTAw-MDFj+ZjYy/NDgi=')).not.toBeNull()
  })

  it('erros do plugin nunca repassam a mensagem original (que poderia conter a chave)', async () => {
    const c = cofreDoPlugin({
      ...pluginFalso().plugin,
      guardar: async () => {
        throw Object.assign(new Error(`falhou com ${FICTICIA}`), { code: 'COFRE_FALHA' })
      },
    })
    const e = (await c.guardar(FICTICIA).catch((x: unknown) => x)) as FalhaCofre
    expect(e).toBeInstanceOf(FalhaCofre)
    expect(String(e.message)).not.toContain(FICTICIA)
    expect(JSON.stringify(e)).not.toContain(FICTICIA)
  })

  it('no navegador (PWA) o cofre fica indisponível e nada é guardado em lugar nenhum', async () => {
    _definirCofre(null)
    const c = await obterCofre()
    expect(c).toBe(COFRE_INDISPONIVEL)
    await expect(c.guardar(FICTICIA)).rejects.toMatchObject({ codigo: 'indisponivel' })
    const ls = (globalThis as { localStorage?: Storage }).localStorage
    if (ls) for (let i = 0; i < ls.length; i++) expect(ls.getItem(ls.key(i)!) ?? '').not.toContain(FICTICIA)
  })
})
