// Otimização pelas ruas no app (RB-2). Carregado SOB DEMANDA (só quando você escolhe "Pelas ruas reais").
// Liga: cofre (chave) → cliente ORS (RoutingProvider) → fluxo (encaixe + matriz em blocos, cache) → motor (Worker).
// - Envio ao ORS REAL bloqueado (ENVIO_REAL_LIBERADO = false); só o servidor de TESTE local responde.
// - Só coordenadas saem; a sua posição é enviada só neste cálculo (nunca continuamente).
// - Nenhuma parada é eliminada: sem acesso/percurso = "pendente de revisão", mantida na posição anterior.
// - Falhas viram mensagens claras; o modo nunca é trocado em silêncio (a janela oferece a otimização rápida).
import { chaveCoordenada } from '@/core/ruas/cache'
import { CacheMatriz } from '@/core/ruas/cacheMatriz'
import { roteirizar } from '@/core/ruas/fluxo'
import { trechosSemPercurso } from '@/core/ruas/montagem'
import { ehBaseDeTeste, provedorORS } from '@/core/ruas/ors'
import { LIMITES_ORS, ORS_BASE } from '@/core/ruas/provedores'
import { planejarFaltantes } from '@/core/ruas/blocos'
import { FalhaProvedor, type TipoFalha } from '@/core/ruas/tipos'
import type { TarefaOtimizacao } from '@/core/otimizacao/tarefa'
import { obterCofre } from '@/platform/cofre'
import { persistenciaAtual } from './persistencia'
import { baseDeTeste, ENVIO_REAL_LIBERADO, envioPermitido } from './ruas'
import type { ContextoPreparacao, Preparado } from './estado'

export class FalhaRuas extends Error {
  constructor(
    readonly motivo: TipoFalha | 'sem-chave' | 'chave-invalidada' | 'pwa' | 'sem-consentimento' | 'sem-origem' | 'nenhuma-parada' | 'trecho-impossivel',
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'FalhaRuas'
  }
}

export const MENSAGENS: Record<string, string> = {
  'limite-minuto': 'O provedor pediu para esperar (limite de pedidos por minuto) e as novas tentativas acabaram. A rota atual continua valendo.',
  'cota-diaria': 'A cota diária de pedidos do provedor acabou. O que já veio fica guardado para amanhã. A rota atual continua valendo.',
  chave: 'O provedor recusou a chave da API (inválida ou sem acesso). Confira a chave em "Calcular pelas ruas".',
  indisponivel: 'O provedor de rotas está indisponível agora. A rota atual continua valendo.',
  'tempo-esgotado': 'O provedor demorou demais para responder. A rota atual continua valendo.',
  'sem-conexao': 'Sem conexão com a internet. O cálculo pelas ruas precisa de conexão; a otimização rápida funciona sem internet.',
  requisicao: 'O provedor recusou o pedido. A rota atual continua valendo.',
  bloqueado: 'O envio de coordenadas ao provedor real ainda não está liberado nesta versão (termos de uso e sua autorização específica pendentes).',
  cancelado: 'Cálculo cancelado. A rota continua como estava.',
  'sem-chave': 'Nenhuma chave da API cadastrada. Cadastre em "Calcular pelas ruas".',
  'chave-invalidada': 'A chave foi apagada pela segurança do aparelho. Cadastre de novo em "Calcular pelas ruas".',
  pwa: 'O cálculo pelas ruas só existe no app Android (cofre seguro da chave).',
  'sem-consentimento': 'O envio de coordenadas ao provedor não foi autorizado.',
  'sem-origem': 'Não há rua perto da sua posição atual para começar o cálculo pelas ruas.',
  'nenhuma-parada': 'Nenhuma parada pendente tem acesso pelas ruas.',
  'trecho-impossivel': 'A ordem calculada usaria um trecho sem percurso pelas ruas. Nada foi aplicado.',
}

const falha = (m: keyof typeof MENSAGENS & string) => new FalhaRuas(m as FalhaRuas['motivo'], MENSAGENS[m]!)

export const NOME_PROVEDOR = 'OpenRouteService (HeiGIT)'

function baseAtual(): string {
  return baseDeTeste() ?? ORS_BASE
}

export function fonteAtual(): string {
  return ehBaseDeTeste(baseAtual()) ? 'servidor de teste (respostas controladas)' : NOME_PROVEDOR
}


export interface Estimativa {
  paradas: number
  pedidosEncaixe: number
  pedidosEncaixeMax: number
  pedidosMatriz: number
  paresDoCache: number
  /** Espera mínima imposta pelo limite por minuto (sem a rede). */
  esperaMinimaS: number
  cotaDiariaMatriz: number
  fonte: string
}

/** Estimativa de consumo ANTES de começar (usa o cache da rota). A sua posição ainda não é conhecida: conta 1 linha. */
export async function estimarConsumo(rotaId: string, paradas: readonly { lat: number; lon: number }[], voltarAoInicio: boolean): Promise<Estimativa> {
  const cache = CacheMatriz.abrir(await persistenciaAtual()?.arm.lerMatrizRuas(rotaId).catch(() => null), 'ors', 'carro', Date.now())
  const acessos = paradas.map((p) => cache.acessoConhecido(p))
  const semAcesso = acessos.filter((a) => !a).length
  // índices: 0 = origem (desconhecida), 1..n = paradas, n+1 = destino (se voltar)
  const chaves = ['?origem', ...acessos.map((a, i) => (a?.acesso ? chaveCoordenada(a.acesso) : `?p${i}`))]
  const dados = cache.serializar()
  const pos = new Map(dados.pontos.map((k, i) => [k, i]))
  const N = dados.pontos.length
  const conhecido = (i: number, j: number) => {
    const a = pos.get(chaves[i]!)
    const b = pos.get(chaves[j]!)
    if (a === undefined || b === undefined) return false
    const v = dados.min[a * N + b]
    return v !== undefined && !Number.isNaN(v)
  }
  const n = paradas.length
  const idx = Array.from({ length: n }, (_, i) => i + 1)
  const dest = voltarAoInicio ? [...idx, 0] : idx
  const blocos = planejarFaltantes([0, ...idx], dest, conhecido, LIMITES_ORS.maxParesMatriz)
  let paresDoCache = 0
  for (const i of idx) for (const j of idx) if (i !== j && conhecido(i, j)) paresDoCache++
  const porMin = Math.floor(LIMITES_ORS.porMinuto.matriz * 0.9)
  return {
    paradas: n,
    pedidosEncaixe: 1 + (semAcesso ? 1 : 0),
    pedidosEncaixeMax: 4 * (1 + (semAcesso ? Math.ceil(semAcesso / LIMITES_ORS.maxPontosEncaixe) : 0)),
    pedidosMatriz: blocos.length,
    paresDoCache,
    esperaMinimaS: blocos.length <= porMin ? 0 : Math.ceil(blocos.length / porMin - 1) * 60,
    cotaDiariaMatriz: LIMITES_ORS.porDia.matriz,
    fonte: fonteAtual(),
  }
}

const dormir = (ms: number, sinal?: AbortSignal) =>
  new Promise<void>((ok, nao) => {
    if (sinal?.aborted) return nao(new FalhaProvedor('cancelado'))
    const t = setTimeout(() => {
      sinal?.removeEventListener('abort', parar)
      ok()
    }, ms)
    const parar = () => {
      clearTimeout(t)
      nao(new FalhaProvedor('cancelado'))
    }
    sinal?.addEventListener('abort', parar, { once: true })
  })

/** Preparação pelas ruas: devolve a tarefa com a matriz pelas ruas (ou lança FalhaRuas com a mensagem para a tela). */
export async function prepararPelasRuas(c: ContextoPreparacao): Promise<Preparado> {
  if (!envioPermitido()) throw falha('bloqueado')
  const cofre = await obterCofre()
  if (!cofre.disponivel) throw falha('pwa')
  let chave: string | null
  try {
    const r = await cofre.ler()
    if (r.estado === 'invalidada') throw falha('chave-invalidada')
    chave = r.valor
  } catch (e) {
    if (e instanceof FalhaRuas) throw e
    throw new FalhaRuas('chave', 'Não foi possível ler a chave no cofre seguro.')
  }
  if (!chave) throw falha('sem-chave')
  const provedor = provedorORS({ chave, fetch: (u, i) => fetch(u, i), base: baseAtual(), liberadoReal: ENVIO_REAL_LIBERADO })
  chave = null

  const arm = persistenciaAtual()?.arm
  const cache = CacheMatriz.abrir(await arm?.lerMatrizRuas(c.rotaId).catch(() => null), 'ors', 'carro', Date.now())
  const voltar = c.tarefa.termino?.tipo === 'ponto'
  const pontos = c.tarefa.pontos
  const exec = async () =>
    roteirizar(
      provedor,
      pontos,
      'carro',
      {
        agora: () => Date.now(),
        esperar: dormir,
        aoProgresso: (etapa, fracao, feitos, total) =>
          c.progresso(etapa, fracao, etapa === 'encaixe' ? 'Encaixando as paradas nas ruas…' : `Distâncias pelas ruas: ${feitos ?? 0} de ${total ?? 0} pedidos`),
      },
      c.sinal,
      undefined,
      {
        terminoLivre: c.termino.tipo === 'livre',
        destinoFinal: voltar,
        acessosConhecidos: pontos.map((p, i) => (i === 0 || (voltar && i === pontos.length - 1) ? undefined : cache.acessoConhecido(p))),
        preencher: (m, coords) => cache.preencher(m, coords),
      },
    )
  let r
  try {
    r = await exec()
  } catch (e) {
    if (e instanceof Error && /dados do mapa mudaram/.test(e.message)) {
      // O provedor atualizou o mapa: o cache inteiro é descartado e o cálculo refeito uma vez.
      cache.limpar()
      r = await exec().catch((x: unknown) => {
        throw x instanceof FalhaProvedor ? falha(x.tipo) : x
      })
    } else if (e instanceof FalhaProvedor) throw falha(e.tipo)
    else throw e
  }
  // Guarda o que veio (mesmo se interrompido), só para esta rota.
  if (r.montagem && arm) {
    cache.atualizar(r.montagem, r.coords, r.acessos)
    await arm.salvarMatrizRuas(c.rotaId, cache.serializar()).catch(() => {})
  }
  if (r.interrompido) throw r.interrompido.codigo === 2010 && r.interrompido.tipo === 'requisicao' ? falha('sem-origem') : falha(r.interrompido.tipo)
  if (c.sinal.aborted) throw falha('cancelado')

  const m = r.montagem!
  const { matriz, proibidos } = m.paraMotor(r.paraMotor)
  // Visitas do motor: posições 1.. de paraMotor (sem o destino fixo), na ordem de paraMotor.
  const ultimo = r.destino === undefined ? r.paraMotor.length : r.paraMotor.length - 1
  const idsMotor = r.paraMotor.slice(1, ultimo).map((k) => c.pend[r.incluidos[k]! - 1]!)
  if (!idsMotor.length) throw falha('nenhuma-parada')
  const noMotor = new Set(idsMotor)
  const revisar = c.pend.filter((id) => !noMotor.has(id))
  let termino: TarefaOtimizacao['termino'] = { tipo: 'livre' }
  if (r.destino !== undefined) termino = { tipo: 'ponto' }
  else if (r.finalObrigatorio !== undefined) termino = { tipo: 'visita', id: c.pend[r.incluidos[r.finalObrigatorio]! - 1]! }
  else if (c.termino.tipo === 'parada' && noMotor.has(c.termino.id)) termino = { tipo: 'visita', id: c.termino.id }
  const posMotor = new Map(idsMotor.map((id, k) => [id, k + 1]))
  const tarefa: TarefaOtimizacao = {
    ...c.tarefa,
    visitas: idsMotor.map((id) => ({ id })),
    pontos: [],
    matriz,
    termino,
    candidatas: c.candidatas.map((o) => o.filter((id) => noMotor.has(id))),
  }
  return {
    tarefa,
    revisar,
    fonte: provedor.deTeste ? 'servidor de teste' : NOME_PROVEDOR,
    validar: (ordem) => {
      const seq = [0, ...ordem.map((id) => posMotor.get(id)!)]
      if (r.destino !== undefined) seq.push(r.paraMotor.length - 1)
      return trechosSemPercurso(seq, proibidos).length ? MENSAGENS['trecho-impossivel']! : null
    },
  }
}
