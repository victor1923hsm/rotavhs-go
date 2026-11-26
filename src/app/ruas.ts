// Central de otimização (RB-1): modo escolhido (rápida × pelas ruas), estado da chave no cofre e disponibilidade
// do provedor. O cálculo pelas ruas AINDA NÃO EXISTE no app (RB-2/RB-3): escolher "pelas ruas" e tocar em
// OTIMIZAR abre um aviso; nada é simulado e nenhuma coordenada é enviada.
import { create } from 'zustand'
import { FalhaCofre, obterCofre, type EstadoChave } from '@/platform/cofre'

export type ModoOtimizacao = 'rapida' | 'ruas'
export type EstadoCofreTela = 'verificando' | 'pwa' | EstadoChave | 'erro'

/** Provedor previsto (só para testes até a resposta da HeiGIT; a arquitetura não depende dele). */
export const PROVEDOR_PREVISTO = { nome: 'OpenRouteService', uso: 'só desenvolvimento e testes', consulta: 'consulta à HeiGIT sobre uso comercial: pendente' } as const

const CHAVE_MODO = 'rotavhsgo.modoOtimizacao'

function modoInicial(): ModoOtimizacao {
  try {
    return localStorage.getItem(CHAVE_MODO) === 'ruas' ? 'ruas' : 'rapida'
  } catch {
    return 'rapida'
  }
}

export interface Disponibilidade {
  /** O cálculo pelas ruas pode rodar agora? Nesta versão, sempre false (integração em desenvolvimento). */
  pronto: false
  tom: 'ok' | 'aviso' | 'erro' | 'neutro'
  titulo: string
  detalhe: string
}

export function disponibilidade(cofre: EstadoCofreTela, online: boolean): Disponibilidade {
  const dev = 'A integração com o provedor ainda está em desenvolvimento: nenhuma rota pelas ruas é calculada nesta versão.'
  switch (cofre) {
    case 'verificando':
      return { pronto: false, tom: 'neutro', titulo: 'Verificando o cofre…', detalhe: dev }
    case 'pwa':
      return { pronto: false, tom: 'aviso', titulo: 'Indisponível neste navegador', detalhe: 'O cálculo pelas ruas será só no app Android, que guarda a chave no cofre seguro do aparelho. Aqui continua a otimização rápida.' }
    case 'erro':
      return { pronto: false, tom: 'erro', titulo: 'Não consegui acessar o cofre', detalhe: 'Tente de novo. Se continuar, apague e cadastre a chave outra vez.' }
    case 'invalidada':
      return { pronto: false, tom: 'aviso', titulo: 'Chave apagada pela segurança do aparelho', detalhe: 'O Android invalidou a proteção da chave (por exemplo, depois de restaurar dados ou mudar a segurança). Cadastre de novo.' }
    case 'ausente':
      return { pronto: false, tom: 'neutro', titulo: 'Sem chave cadastrada', detalhe: dev }
    case 'cadastrada':
      return { pronto: false, tom: online ? 'ok' : 'aviso', titulo: online ? 'Chave cadastrada · em desenvolvimento' : 'Chave cadastrada · sem conexão', detalhe: dev }
  }
}

interface EstadoRuas {
  modo: ModoOtimizacao
  definirModo: (m: ModoOtimizacao) => void
  cofre: EstadoCofreTela
  /** Operação em andamento no cofre (para desabilitar botões e mostrar o carregamento). */
  ocupado: 'guardar' | 'apagar' | null
  verificarCofre: () => Promise<void>
  /** Guarda (ou substitui) a chave. Devolve o motivo da falha, ou null se deu certo. */
  guardarChave: (valor: string) => Promise<string | null>
  apagarChave: () => Promise<string | null>
  /** Aviso "pelas ruas ainda em desenvolvimento" aberto a partir de OTIMIZAR / Recalcular. */
  avisoRuas: 'otimizar' | 'recalcular' | null
  abrirAvisoRuas: (de: 'otimizar' | 'recalcular') => void
  fecharAvisoRuas: () => void
}

const motivo = (e: unknown) => (e instanceof FalhaCofre ? e.message : 'Não foi possível acessar o cofre seguro.')

export const useRuas = create<EstadoRuas>()((set, get) => ({
  modo: modoInicial(),
  definirModo: (modo) => {
    try {
      localStorage.setItem(CHAVE_MODO, modo)
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
    set({ modo })
  },
  cofre: 'verificando',
  ocupado: null,
  verificarCofre: async () => {
    const c = await obterCofre()
    if (!c.disponivel) return set({ cofre: 'pwa' })
    try {
      set({ cofre: await c.existe() })
    } catch {
      set({ cofre: 'erro' })
    }
  },
  guardarChave: async (valor) => {
    if (get().ocupado) return 'Aguarde a operação em andamento.'
    const c = await obterCofre()
    if (!c.disponivel) return 'O cofre seguro só existe no app Android.'
    set({ ocupado: 'guardar' })
    try {
      await c.guardar(valor)
      set({ cofre: 'cadastrada' })
      return null
    } catch (e) {
      await get().verificarCofre()
      return motivo(e)
    } finally {
      set({ ocupado: null })
    }
  },
  apagarChave: async () => {
    if (get().ocupado) return 'Aguarde a operação em andamento.'
    const c = await obterCofre()
    if (!c.disponivel) return null
    set({ ocupado: 'apagar' })
    try {
      await c.apagar()
      set({ cofre: 'ausente' })
      return null
    } catch (e) {
      await get().verificarCofre()
      return motivo(e)
    } finally {
      set({ ocupado: null })
    }
  },
  avisoRuas: null,
  abrirAvisoRuas: (de) => set({ avisoRuas: de }),
  fecharAvisoRuas: () => set({ avisoRuas: null }),
}))
