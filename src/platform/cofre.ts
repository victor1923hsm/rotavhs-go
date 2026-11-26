// Cofre da chave da API de rotas (RB-1). No APK: plugin nativo próprio "CofreChave" (Android Keystore + AES-256-GCM,
// android/app/src/main/java/.../cofre/CofreChavePlugin.java). No PWA: INDISPONÍVEL — a chave nunca vai para
// localStorage, IndexedDB, sessionStorage, cookies ou arquivos; o app continua funcionando no modo rápido.
// Nenhuma função aqui registra a chave em log ou a coloca em mensagens de erro.

export type EstadoChave = 'cadastrada' | 'ausente' | 'invalidada'

export class FalhaCofre extends Error {
  constructor(readonly codigo: 'indisponivel' | 'valor-invalido' | 'falha') {
    super(codigo === 'indisponivel' ? 'Cofre seguro indisponível neste aparelho.' : codigo === 'valor-invalido' ? 'Chave em formato inválido.' : 'Não foi possível acessar o cofre seguro.')
    this.name = 'FalhaCofre'
  }
}

export interface Cofre {
  /** false no PWA (navegador): sem cofre seguro, a chave não é guardada. */
  readonly disponivel: boolean
  existe(): Promise<EstadoChave>
  guardar(valor: string): Promise<void>
  /** Só para o cliente de rotas (RB-2). A tela nunca mostra o valor. */
  ler(): Promise<{ estado: EstadoChave; valor: string | null }>
  apagar(): Promise<void>
}

interface PluginNativo {
  guardar(o: { valor: string }): Promise<{ estado: EstadoChave }>
  ler(): Promise<{ estado: EstadoChave; valor: string | null }>
  existe(): Promise<{ estado: EstadoChave }>
  apagar(): Promise<{ estado: EstadoChave }>
}

/** Normaliza e valida o texto colado (sem espaços; só caracteres usados por chaves de API). */
export function validarChave(texto: string): string | null {
  const v = texto.trim()
  if (v.length < 16 || v.length > 4096) return null
  if (!/^[A-Za-z0-9._\-+/=]+$/.test(v)) return null
  return v
}

const ESTADOS: readonly EstadoChave[] = ['cadastrada', 'ausente', 'invalidada']
const estadoValido = (e: unknown): EstadoChave => {
  if (ESTADOS.includes(e as EstadoChave)) return e as EstadoChave
  throw new FalhaCofre('falha')
}

/** Converte qualquer erro do plugin em FalhaCofre (sem repassar a mensagem original). */
const semDetalhes = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f()
  } catch (e) {
    if (e instanceof FalhaCofre) throw e
    const codigo = (e as { code?: string } | null)?.code
    throw new FalhaCofre(codigo === 'COFRE_VALOR_INVALIDO' ? 'valor-invalido' : 'falha')
  }
}

export function cofreDoPlugin(p: PluginNativo): Cofre {
  return {
    disponivel: true,
    existe: () => semDetalhes(async () => estadoValido((await p.existe()).estado)),
    guardar: (valor) =>
      semDetalhes(async () => {
        const v = validarChave(valor)
        if (!v) throw new FalhaCofre('valor-invalido')
        const r = await p.guardar({ valor: v })
        if (estadoValido(r.estado) !== 'cadastrada') throw new FalhaCofre('falha')
      }),
    ler: () =>
      semDetalhes(async () => {
        const r = await p.ler()
        const estado = estadoValido(r.estado)
        return { estado, valor: estado === 'cadastrada' && typeof r.valor === 'string' ? r.valor : null }
      }),
    apagar: () => semDetalhes(async () => void (await p.apagar())),
  }
}

export const COFRE_INDISPONIVEL: Cofre = {
  disponivel: false,
  existe: () => Promise.reject(new FalhaCofre('indisponivel')),
  guardar: () => Promise.reject(new FalhaCofre('indisponivel')),
  ler: () => Promise.reject(new FalhaCofre('indisponivel')),
  apagar: () => Promise.reject(new FalhaCofre('indisponivel')),
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  isPluginAvailable?: (n: string) => boolean
}

let cofre: Promise<Cofre> | null = null

/** Cofre do aparelho. A ponte do Capacitor só é carregada no APK (o PWA não baixa esse código). */
export function obterCofre(): Promise<Cofre> {
  if (cofre) return cofre
  cofre = (async () => {
    const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
    if (!cap?.isNativePlatform?.() || !cap.isPluginAvailable?.('CofreChave')) return COFRE_INDISPONIVEL
    const { registerPlugin } = await import('@capacitor/core')
    return cofreDoPlugin(registerPlugin<PluginNativo>('CofreChave'))
  })()
  return cofre
}

/** Só para testes. */
export function _definirCofre(c: Cofre | null) {
  cofre = c ? Promise.resolve(c) : null
}
