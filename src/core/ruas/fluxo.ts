// Fluxo de roteirização pelas ruas (puro; a RB-2 o liga ao app em src/app/ruasOtimizacao.ts).
// 1) acesso viário de cada ponto (encaixe progressivo 25/50/100/200 m; além disso só com a sua confirmação);
// 2) matriz em blocos, dentro do limite por pedido e por minuto, com concorrência limitada, novas tentativas
//    LIMITADAS em 429/5xx/tempo esgotado/sem conexão e parada limpa em cota/chave/bloqueio;
// 3) relatório de consumo. A otimização em si continua no motor, que não sabe de onde veio a matriz.
// Pontos: 0 = origem (sua posição); 1..k = paradas; opcionalmente o último = destino fixo (voltar ao início).
// Nenhuma parada é eliminada: as que não entram no cálculo ficam em "confirmar"/"revisar" (ResultadoFluxo.acessos).
import { planejarFaltantes } from './blocos'
import { aplicarEncaixe, marcarSemPercurso, novoAcesso, planejarEncaixe, pontoDeCalculo, type AcessoViario } from './encaixe'
import { esperaNovaTentativa, JanelaDeslizante } from './limitador'
import { MontagemMatriz } from './montagem'
import { relatorioVazio, type RelatorioRoteirizacao } from './relatorio'
import type { Coordenada, PerfilVeiculo, RoutingProvider } from './tipos'
import { FalhaProvedor } from './tipos'

export type EtapaFluxo = 'encaixe' | 'matriz'

export interface AmbienteFluxo {
  agora: () => number
  esperar: (ms: number, sinal?: AbortSignal) => Promise<void>
  aoProgresso?: (etapa: EtapaFluxo, fracao: number, feitos?: number, total?: number) => void
}

export interface OpcoesFluxo {
  /** Término livre (padrão): uma parada "só de chegada" pode ser a última. */
  terminoLivre?: boolean
  /** O último ponto é um destino fixo (ex.: voltar ao ponto de partida), não uma parada. */
  destinoFinal?: boolean
  /** Acessos já conhecidos (cache), na mesma ordem dos pontos; undefined = encaixar. */
  acessosConhecidos?: (AcessoViario | undefined)[]
  /** Preenche a montagem com pares já conhecidos (cache) antes de planejar os pedidos. */
  preencher?: (m: MontagemMatriz, coords: readonly Coordenada[]) => void
  /** Pedidos de matriz em paralelo (padrão 2). */
  concorrencia?: number
}

export interface ResultadoFluxo {
  acessos: AcessoViario[]
  /** Índices (na lista original) encaixados e pedidos ao provedor, com a origem em 0. */
  incluidos: number[]
  /** Pontos de cálculo (acesso viário) na ordem LOCAL da montagem. */
  coords: Coordenada[]
  /** Índices LOCAIS que vão para o motor: 0 = origem, paradas do componente principal [+ final], [+ destino]. */
  paraMotor: number[]
  /** Término livre: parada "só de chegada" que deve ser a ÚLTIMA (índice LOCAL, já em paraMotor). */
  finalObrigatorio?: number
  /** Índice LOCAL do destino fixo, quando houver (último de paraMotor). */
  destino?: number
  montagem: MontagemMatriz | null
  relatorio: RelatorioRoteirizacao
  /** Parou antes do fim. A rota atual não muda; o que já veio fica na montagem (para guardar no cache). */
  interrompido?: FalhaProvedor
}

/** Tentativas por pedido (a 1ª + até 3 novas). Nunca ilimitado. */
export const MAX_TENTATIVAS = 4
// Sem conexão não é repetido (falha logo, com mensagem clara; você tenta de novo quando quiser).
const REPETIVEIS = new Set(['limite-minuto', 'indisponivel', 'tempo-esgotado'])

async function comTentativas<T>(fazer: () => Promise<T>, amb: AmbienteFluxo, sinal?: AbortSignal): Promise<T> {
  for (let t = 0; ; t++) {
    if (sinal?.aborted) throw new FalhaProvedor('cancelado')
    try {
      return await fazer()
    } catch (e) {
      if (!(e instanceof FalhaProvedor)) throw e
      if (sinal?.aborted) throw new FalhaProvedor('cancelado')
      if (!REPETIVEIS.has(e.tipo) || t + 1 >= MAX_TENTATIVAS) throw e
      await amb.esperar(esperaNovaTentativa(t, e.esperarMs), sinal)
    }
  }
}

export async function roteirizar(
  provedor: RoutingProvider,
  pontos: readonly Coordenada[],
  perfil: PerfilVeiculo,
  amb: AmbienteFluxo,
  sinal?: AbortSignal,
  acessosAnteriores?: AcessoViario[],
  opcoes: OpcoesFluxo = {},
): Promise<ResultadoFluxo> {
  const terminoLivre = (opcoes.terminoLivre ?? true) && !opcoes.destinoFinal
  const nPts = pontos.length
  const ultimaParada = opcoes.destinoFinal ? nPts - 2 : nPts - 1
  const rel = relatorioVazio(provedor.id, ultimaParada)
  const acessos = acessosAnteriores ?? pontos.map((p, i) => opcoes.acessosConhecidos?.[i] ?? novoAcesso(p))
  const limite = (v: number) => Math.max(1, Math.floor(Math.min(v, 1e6) * 0.9))
  const janelaEnc = new JanelaDeslizante(limite(provedor.limites.porMinuto.encaixe))
  const janelaMat = new JanelaDeslizante(limite(provedor.limites.porMinuto.matriz))
  const pedir = <T>(janela: JanelaDeslizante, fazer: () => Promise<T>) =>
    comTentativas(
      async () => {
        const w = janela.esperaAte(amb.agora())
        if (w > 0) await amb.esperar(w, sinal)
        janela.registrar(amb.agora())
        return fazer()
      },
      amb,
      sinal,
    )
  let interrompido: FalhaProvedor | undefined
  const parar = (e: unknown) => {
    if (e instanceof FalhaProvedor && e.tipo !== 'cancelado') {
      interrompido = e
      return
    }
    throw e
  }

  // 1) Encaixe progressivo (só o que ainda não tem acesso conhecido).
  const t0 = amb.agora()
  try {
    for (let rodada = 0; rodada < 8; rodada++) {
      const planos = planejarEncaixe(acessos)
      if (!planos.length) break
      const total = planos.reduce((s, p) => s + Math.ceil(p.indices.length / provedor.limites.maxPontosEncaixe), 0)
      let feitos = 0
      for (const { raioM, indices } of planos)
        for (let k = 0; k < indices.length; k += provedor.limites.maxPontosEncaixe) {
          const parte = indices.slice(k, k + provedor.limites.maxPontosEncaixe)
          const r = await pedir(janelaEnc, () => provedor.encaixar(parte.map((i) => acessos[i]!.original), raioM, perfil, sinal))
          rel.pedidos.encaixe++
          aplicarEncaixe(acessos, parte, raioM, r)
          amb.aoProgresso?.('encaixe', Math.min(1, (rodada + ++feitos / total) / 4), rel.pedidos.encaixe)
        }
    }
  } catch (e) {
    parar(e)
  } finally {
    rel.tempos.encaixeMs = amb.agora() - t0
  }
  if (interrompido) return fim(null, [], [])

  // Origem e destino fixo precisam de acesso: sem rua perto, o cálculo pelas ruas não é feito.
  const extremos = opcoes.destinoFinal ? [0, nPts - 1] : [0]
  if (extremos.some((i) => pontoDeCalculo(acessos[i]!) === null)) {
    interrompido = new FalhaProvedor('requisicao', 2010)
    return fim(null, [], [])
  }
  const incluidos = acessos.map((_, i) => i).filter((i) => pontoDeCalculo(acessos[i]!) !== null)
  const coords = incluidos.map((i) => pontoDeCalculo(acessos[i]!)!)
  const local = new Map(incluidos.map((i, k) => [i, k]))
  const paradasLocais = incluidos.filter((i) => i >= 1 && i <= ultimaParada).map((i) => local.get(i)!)
  const destinoLocal = opcoes.destinoFinal ? local.get(nPts - 1)! : undefined

  // 2) Matriz em blocos, só o que falta (cache primeiro — RB4).
  const t1 = amb.agora()
  const mont = new MontagemMatriz(coords.length)
  opcoes.preencher?.(mont, coords)
  const origensM = [0, ...paradasLocais]
  const destinosM = destinoLocal === undefined ? paradasLocais : [...paradasLocais, destinoLocal]
  const blocos = planejarFaltantes(origensM, destinosM, (i, j) => mont.conhecido(i, j), provedor.limites.maxParesMatriz)
  let feitos = 0
  const fila = [...blocos]
  const trabalhador = async () => {
    for (;;) {
      const b = fila.shift()
      if (!b || interrompido) return
      const r = await pedir(janelaMat, () => provedor.matriz(coords, b.origens, b.destinos, perfil, sinal))
      rel.pedidos.matriz++
      rel.bytesRecebidos += r.bytes ?? 0
      mont.aplicar(r)
      amb.aoProgresso?.('matriz', ++feitos / blocos.length, feitos, blocos.length)
    }
  }
  try {
    const n = Math.max(1, Math.min(opcoes.concorrencia ?? 2, blocos.length))
    const resultados = await Promise.allSettled(Array.from({ length: n }, trabalhador))
    const falha = resultados.find((x): x is PromiseRejectedResult => x.status === 'rejected')
    if (falha) parar(falha.reason)
  } finally {
    rel.tempos.matrizMs = amb.agora() - t1
  }
  if (interrompido) return fim(mont, incluidos, coords)
  mont.dispensarNaoPedidos()

  // Só entram no motor as paradas com percurso de ida e volta entre si (alcançáveis a partir de você).
  const { dentro, fora } = mont.componentePrincipal(paradasLocais)
  const soChegada = fora.filter((k) => dentro.some((i) => mont.alcanca(i, k)) || mont.alcanca(0, k))
  let finalObrigatorio: number | undefined
  if (terminoLivre && soChegada.length === 1) finalObrigatorio = soChegada[0]
  for (const k of fora) if (k !== finalObrigatorio) marcarSemPercurso(acessos[incluidos[k]!]!)
  const paraMotor = [0, ...dentro, ...(finalObrigatorio === undefined ? [] : [finalObrigatorio]), ...(destinoLocal === undefined ? [] : [destinoLocal])]
  return fim(mont, incluidos, coords, paraMotor, finalObrigatorio, destinoLocal)

  function fim(m: MontagemMatriz | null, inc: number[], cs: Coordenada[], paraMotor: number[] = [], finalObrigatorio?: number, destino?: number): ResultadoFluxo {
    rel.memoria.matrizBytes = m?.bytes ?? 0
    rel.problemas.confirmar = acessos.filter((a) => a.situacao === 'confirmar').length
    rel.problemas.revisar = acessos.filter((a) => a.situacao === 'revisar').length
    rel.problemas.paresSemPercurso = m ? m.semPercurso().length : 0
    return { acessos, incluidos: inc, coords: cs, paraMotor, finalObrigatorio, destino, montagem: m, relatorio: rel, interrompido }
  }
}
