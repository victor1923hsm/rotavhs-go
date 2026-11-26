// Otimização pelas ruas no app (RB-2). Carregado SOB DEMANDA (só quando você escolhe "Pelas ruas reais").
// Liga: cofre (chave) → cliente ORS (RoutingProvider) → fluxo (encaixe + matriz em blocos, cache) → motor (Worker).
// - Envio ao ORS REAL bloqueado (ENVIO_REAL_LIBERADO = false); só o servidor de TESTE local responde.
// - Só coordenadas saem; a sua posição é enviada só neste cálculo (nunca continuamente).
// - Nenhuma parada é eliminada: sem acesso/percurso = "pendente de revisão", mantida na posição anterior.
// - Falhas viram mensagens claras; o modo nunca é trocado em silêncio (a janela oferece a otimização rápida).
import { chaveCoordenada } from '@/core/ruas/cache'
import { CacheMatriz, type MotivoRevisao, type ParadaEmRevisao } from '@/core/ruas/cacheMatriz'
import { cabeNaCota, lerConsumo, registrarPedido, registrarRestante, restanteHoje, type ServicoConsumo } from '@/core/ruas/consumo'
import { planejarRota } from '@/core/ruas/blocos'
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
  'resposta-incompleta': 'O provedor mandou respostas incompletas (mesmo depois das novas tentativas). Nada foi aplicado; a rota atual continua valendo.',
  'cota-ou-chave': 'O provedor recusou o acesso: a cota do dia acabou OU a chave não tem acesso (a resposta não diz qual). A rota atual continua valendo.',
  'cota-local': 'O consumo previsto passa do que ainda resta hoje na cota do provedor (pela conta deste aparelho). Nada foi enviado; a rota atual continua valendo.',
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

const armazem = () => {
  try {
    return localStorage
  } catch {
    return null
  }
}
/** Consumo de hoje (contador local + último restante informado pelo provedor). Só números. */
export function consumoHoje() {
  const c = lerConsumo(armazem(), 'ors', Date.now())
  return { pedidos: c.pedidos, resta: restanteHoje(c, LIMITES_ORS), limites: LIMITES_ORS.porDia }
}

/** Correções confirmadas e raios autorizados desta rota (para a tela de revisão). */
export async function lerDecisoes(rotaId: string) {
  const cache = CacheMatriz.abrir(await persistenciaAtual()?.arm.lerMatrizRuas(rotaId).catch(() => null), 'ors', 'carro', Date.now())
  return { correcoes: cache.correcoes, raios: cache.raios, revisao: cache.revisao }
}

/**
 * Grava uma decisão SUA sobre uma parada (confirmada na tela de revisão): coordenada corrigida, restauração da
 * original ou raio maior autorizado. Os trechos afetados são esquecidos no cache (serão pedidos de novo).
 * A coordenada ORIGINAL da parada nunca é alterada.
 */
export async function gravarDecisao(
  rotaId: string,
  id: string,
  original: { lat: number; lon: number },
  d: { tipo: 'corrigir'; lat: number; lon: number } | { tipo: 'restaurar' } | { tipo: 'raio'; raioM: number },
) {
  const arm = persistenciaAtual()?.arm
  if (!arm) throw new Error('Armazenamento indisponível')
  const cache = CacheMatriz.abrir(await arm.lerMatrizRuas(rotaId).catch(() => null), 'ors', 'carro', Date.now())
  const antiga = cache.correcoes[id]
  if (d.tipo === 'corrigir') {
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lon) || Math.abs(d.lat) > 90 || Math.abs(d.lon) > 180) throw new Error('Coordenada inválida')
    if (antiga) cache.esquecerPonto(antiga)
    cache.esquecerPonto(original)
    cache.correcoes[id] = { lat: Math.round(d.lat * 1e6) / 1e6, lon: Math.round(d.lon * 1e6) / 1e6, em: Date.now() }
    delete cache.raios[id]
  } else if (d.tipo === 'restaurar') {
    if (antiga) cache.esquecerPonto(antiga)
    cache.esquecerPonto(original)
    delete cache.correcoes[id]
    delete cache.raios[id]
  } else {
    cache.raios[id] = d.raioM
    cache.esquecerPonto(antiga ?? original)
  }
  await arm.salvarMatrizRuas(rotaId, cache.serializar())
}

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
  /** Quanto resta hoje (contador local / provedor) e o serviço que não caberia, se algum. */
  restaHoje: Record<ServicoConsumo, number>
  excede: ServicoConsumo | null
  /** Traçado pelas ruas (RB-4, ainda NÃO usado): pedidos de directions que a rota inteira custaria. */
  pedidosTracadoRB4: number
}

/** Estimativa de consumo ANTES de começar (usa o cache da rota). A sua posição ainda não é conhecida: conta 1 linha. */
export async function estimarConsumo(rotaId: string, paradasOriginais: readonly { id?: string; lat: number; lon: number }[], voltarAoInicio: boolean): Promise<Estimativa> {
  const cache = CacheMatriz.abrir(await persistenciaAtual()?.arm.lerMatrizRuas(rotaId).catch(() => null), 'ors', 'carro', Date.now())
  // Paradas com correção confirmada entram pela coordenada corrigida (como no cálculo).
  const paradas = paradasOriginais.map((p) => (p.id && cache.correcoes[p.id]) || p)
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
  const pedidosEncaixeMax = 4 * (1 + (semAcesso ? Math.ceil(semAcesso / LIMITES_ORS.maxPontosEncaixe) : 0))
  const resta = consumoHoje().resta
  return {
    restaHoje: resta,
    // Conta o pior caso do encaixe (4 raios) para nunca começar algo que não cabe.
    excede: cabeNaCota({ matriz: blocos.length, encaixe: pedidosEncaixeMax }, resta),
    pedidosTracadoRB4: planejarRota(n + 1 + (voltarAoInicio ? 1 : 0), LIMITES_ORS.maxPontosRota).length,
    paradas: n,
    pedidosEncaixe: 1 + (semAcesso ? 1 : 0),
    pedidosEncaixeMax,
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
  const provedor = provedorORS({
    chave, fetch: (u, i) => fetch(u, i), base: baseAtual(), liberadoReal: ENVIO_REAL_LIBERADO,
    aoPedir: (sv) => registrarPedido(armazem(), 'ors', sv, Date.now()),
    aoResponder: (sv, resta) => resta !== undefined && registrarRestante(armazem(), 'ors', sv, resta, Date.now()),
  })
  chave = null

  const arm = persistenciaAtual()?.arm
  const cache = CacheMatriz.abrir(await arm?.lerMatrizRuas(c.rotaId).catch(() => null), 'ors', 'carro', Date.now())
  const voltar = c.tarefa.termino?.tipo === 'ponto'
  // Paradas com correção SUA confirmada: o cálculo usa a coordenada corrigida (a original da parada não muda).
  const ultimaParada = voltar ? c.tarefa.pontos.length - 2 : c.tarefa.pontos.length - 1
  const idDoPonto = (i: number) => (i >= 1 && i <= ultimaParada ? c.pend[i - 1] : undefined)
  const pontos = c.tarefa.pontos.map((p, i) => {
    const id = idDoPonto(i)
    const cor = id ? cache.correcoes[id] : undefined
    return cor ? { lat: cor.lat, lon: cor.lon } : p
  })
  // Cota do dia: estimativa pelo pior caso; se não couber, nada é enviado.
  {
    const est = await estimarConsumo(c.rotaId, c.pend.map((id, k) => ({ id, ...c.tarefa.pontos[k + 1]! })), voltar)
    if (est.excede) throw falha('cota-local')
  }
  const acessoInicial = (i: number) => {
    if (i === 0 || (voltar && i === pontos.length - 1)) return undefined
    const a = cache.acessoConhecido(pontos[i]!)
    const raio = cache.raios[idDoPonto(i)!]
    // Raio maior autorizado por você e ainda não tentado: o encaixe tenta só esse raio.
    if (a && a.situacao === 'confirmar' && raio && raio > (a.raioM ?? 0)) a.raioConfirmadoM = raio
    if (!a && raio) return { original: { ...pontos[i]! }, acesso: null, distanciaM: null, raioM: 200, situacao: 'confirmar' as const, raioConfirmadoM: raio }
    return a
  }
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
        acessosConhecidos: pontos.map((_, i) => acessoInicial(i)),
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
  // Paradas que ficam de fora, com o motivo (para a tela de revisão).
  const motivoDe = (i: number): MotivoRevisao | null => {
    const a = r.acessos[i]!
    if (a.situacao === 'confirmar') return 'confirmar'
    if (a.situacao === 'revisar') return a.motivoRevisao === 'sem-percurso' ? 'sem-percurso' : 'sem-via'
    return null
  }
  const revisao: ParadaEmRevisao[] = []
  for (let i = 1; i <= ultimaParada; i++) {
    const m = motivoDe(i)
    if (m) revisao.push({ id: idDoPonto(i)!, motivo: m })
  }
  // Guarda o que veio (mesmo se interrompido), só para esta rota.
  if (arm) {
    if (r.montagem) cache.atualizar(r.montagem, r.coords, r.acessos)
    if (!r.interrompido) cache.revisao = revisao
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
    motivos: revisao,
    pedidos: { matriz: r.relatorio.pedidos.matriz, encaixe: r.relatorio.pedidos.encaixe, divisoes: r.relatorio.pedidos.divisoes ?? 0 },
    corrigidas: c.pend.filter((id) => cache.correcoes[id]).length,
    simulado: provedor.deTeste,
    fonte: provedor.deTeste ? 'servidor de teste' : NOME_PROVEDOR,
    validar: (ordem) => {
      const seq = [0, ...ordem.map((id) => posMotor.get(id)!)]
      if (r.destino !== undefined) seq.push(r.paraMotor.length - 1)
      return trechosSemPercurso(seq, proibidos).length ? MENSAGENS['trecho-impossivel']! : null
    },
  }
}
