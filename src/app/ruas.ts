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
const CHAVE_CONSENTIMENTO = 'rotavhsgo.consentimentoRuas'
/** Só para testes: servidor de respostas controladas (aceito apenas em http://127.0.0.1 ou http://localhost). */
export const CHAVE_BASE_TESTE = 'rotavhsgo.ruasTesteURL'

/**
 * Envio de coordenadas ao provedor REAL: bloqueado até a confirmação dos termos de uso e a sua autorização
 * específica (RB-2, 2026-11-26). Mudar exige nova aprovação.
 */
export const ENVIO_REAL_LIBERADO = false

/** Envio permitido nesta versão? Só para o servidor de teste local, enquanto o envio real não for liberado. */
export function envioPermitido(): boolean {
  return baseDeTeste() !== null || ENVIO_REAL_LIBERADO
}

export interface Consentimento {
  provedor: string
  em: number
  versao: 1
}

function lerConsentimento(): Consentimento | null {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE_CONSENTIMENTO) ?? 'null') as Consentimento | null
    return c && c.versao === 1 && typeof c.provedor === 'string' ? c : null
  } catch {
    return null
  }
}

/** Servidor de teste configurado (respostas controladas), ou null. */
export function baseDeTeste(): string | null {
  try {
    const v = localStorage.getItem(CHAVE_BASE_TESTE)
    if (!v) return null
    // Só HTTP local (o servidor de respostas controladas dos testes). https://localhost é a própria origem do app
    // no Android, e 10.0.2.2 não é usado. No APK entregue, a configuração de rede bloqueia HTTP: nada responde.
    const u = new URL(v)
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? v : null
  } catch {
    return null
  }
}

function modoInicial(): ModoOtimizacao {
  try {
    return localStorage.getItem(CHAVE_MODO) === 'ruas' ? 'ruas' : 'rapida'
  } catch {
    return 'rapida'
  }
}

export interface Disponibilidade {
  /** O cálculo pelas ruas pode rodar agora? Só com servidor de TESTE local (o envio real ainda não é liberado). */
  pronto: boolean
  tom: 'ok' | 'aviso' | 'erro' | 'neutro'
  titulo: string
  detalhe: string
}

export function disponibilidade(cofre: EstadoCofreTela, online: boolean, teste: string | null = null, liberado = ENVIO_REAL_LIBERADO): Disponibilidade {
  const dev = liberado
    ? 'Envio ao provedor liberado.'
    : 'O envio ao provedor real ainda não está liberado (termos de uso e sua autorização específica pendentes): nenhuma coordenada é enviada a ele nesta versão.'
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
      if (teste) return { pronto: online, tom: online ? 'ok' : 'aviso', titulo: online ? 'Servidor de TESTE (respostas controladas)' : 'Servidor de teste · sem conexão', detalhe: 'Cálculo pelas ruas ligado a um servidor de teste local, com dados fictícios. Não é o provedor real.' }
      if (liberado) return { pronto: online, tom: online ? 'ok' : 'aviso', titulo: online ? 'Pronto para calcular pelas ruas' : 'Sem conexão', detalhe: dev }
      return { pronto: false, tom: online ? 'ok' : 'aviso', titulo: online ? 'Chave cadastrada · envio real ainda não liberado' : 'Chave cadastrada · sem conexão', detalhe: dev }
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
  /** Autorização explícita para enviar coordenadas ao provedor (P-COORD). Revogável. */
  consentimento: Consentimento | null
  autorizarEnvio: (provedor: string) => void
  revogarEnvio: () => void
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
  consentimento: lerConsentimento(),
  autorizarEnvio: (provedor) => {
    const c: Consentimento = { provedor, em: Date.now(), versao: 1 }
    try {
      localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify(c))
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
    set({ consentimento: c })
  },
  revogarEnvio: () => {
    try {
      localStorage.removeItem(CHAVE_CONSENTIMENTO)
    } catch {
      /* nada a fazer */
    }
    set({ consentimento: null })
  },
}))
