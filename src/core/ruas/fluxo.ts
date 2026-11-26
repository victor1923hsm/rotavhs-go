// Fluxo de roteirização pelas ruas (RB-0: puro, NÃO ligado ao app; a RB-1/RB-2 ligam ao Worker e à rede).
// 1) acesso viário de cada ponto (encaixe progressivo 25/50/100/200 m; o resto aguarda confirmação ou revisão);
// 2) matriz em blocos, respeitando o limite por minuto, com novas tentativas em 429/5xx e parada limpa em cota/chave;
// 3) relatório de consumo. A otimização em si continua no motor (otimizar), que não sabe de onde veio a matriz.
// Origem = índice 0 (sua posição). Ela é encaixada como as paradas, mas nunca vai para "revisar": sem via perto
// de você, o cálculo pelas ruas não é feito e o app continua no estimado (rotulado).
import { planejarFaltantes } from './blocos'
import { aplicarEncaixe, marcarSemPercurso, novoAcesso, planejarEncaixe, pontoDeCalculo, type AcessoViario } from './encaixe'
import { esperaNovaTentativa, JanelaDeslizante } from './limitador'
import { MontagemMatriz } from './montagem'
import { relatorioVazio, type RelatorioRoteirizacao } from './relatorio'
import type { Coordenada, PerfilVeiculo, RoutingProvider } from './tipos'
import { FalhaProvedor } from './tipos'

export interface AmbienteFluxo {
  agora: () => number
  esperar: (ms: number, sinal?: AbortSignal) => Promise<void>
  /** Tamanho em memória (bytes) da pilha JS, se o ambiente informar. */
  memoria?: () => number
  aoProgresso?: (etapa: 'encaixe' | 'matriz', fracao: number) => void
}

export interface ResultadoFluxo {
  acessos: AcessoViario[]
  /** Índices (na lista original) encaixados e pedidos ao provedor, com a origem em 0. */
  incluidos: number[]
  /** Índices LOCAIS da montagem que vão para o motor (0 = origem + componente principal). */
  paraMotor: number[]
  montagem: MontagemMatriz | null
  relatorio: RelatorioRoteirizacao
  /** Parou antes do fim (cota, chave, indisponível). A rota atual não muda; o que já veio fica guardado. */
  interrompido?: FalhaProvedor
}

const MAX_TENTATIVAS = 4

async function comTentativas<T>(fazer: () => Promise<T>, amb: AmbienteFluxo, sinal?: AbortSignal): Promise<T> {
  for (let t = 0; ; t++) {
    if (sinal?.aborted) throw new FalhaProvedor('cancelado')
    try {
      return await fazer()
    } catch (e) {
      if (!(e instanceof FalhaProvedor)) throw e
      const repetir = e.tipo === 'limite-minuto' || e.tipo === 'indisponivel'
      if (!repetir || t + 1 >= MAX_TENTATIVAS) throw e
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
): Promise<ResultadoFluxo> {
  const rel = relatorioVazio(provedor.id, pontos.length - 1)
  const acessos = acessosAnteriores ?? pontos.map(novoAcesso)
  const janelaEnc = new JanelaDeslizante(Math.max(1, Math.floor(Math.min(provedor.limites.porMinuto.encaixe, 1e6) * 0.9)))
  const janelaMat = new JanelaDeslizante(Math.max(1, Math.floor(Math.min(provedor.limites.porMinuto.matriz, 1e6) * 0.9)))
  const pedir = async <T>(janela: JanelaDeslizante, fazer: () => Promise<T>) => {
    const w = janela.esperaAte(amb.agora())
    if (w > 0) await amb.esperar(w, sinal)
    janela.registrar(amb.agora())
    return comTentativas(fazer, amb, sinal)
  }

  // 1) Encaixe progressivo.
  const t0 = amb.agora()
  try {
    for (let rodada = 0; rodada < 8; rodada++) {
      const planos = planejarEncaixe(acessos)
      if (!planos.length) break
      for (const { raioM, indices } of planos)
        for (let k = 0; k < indices.length; k += provedor.limites.maxPontosEncaixe) {
          const parte = indices.slice(k, k + provedor.limites.maxPontosEncaixe)
          const r = await pedir(janelaEnc, () => provedor.encaixar(parte.map((i) => acessos[i]!.original), raioM, perfil, sinal))
          rel.pedidos.encaixe++
          aplicarEncaixe(acessos, parte, raioM, r)
        }
      amb.aoProgresso?.('encaixe', (rodada + 1) / 4)
    }
  } catch (e) {
    if (e instanceof FalhaProvedor && e.tipo !== 'cancelado') return fim(null, e)
    throw e
  } finally {
    rel.tempos.encaixeMs = amb.agora() - t0
  }

  const origemOk = pontoDeCalculo(acessos[0]!) !== null
  const incluidos = origemOk ? acessos.map((_, i) => i).filter((i) => pontoDeCalculo(acessos[i]!) !== null) : []
  if (!origemOk) return fim(null, new FalhaProvedor('requisicao'))

  // 2) Matriz em blocos (só o que falta, se houver montagem anterior — RB4: reaproveitar).
  const t1 = amb.agora()
  const coords = incluidos.map((i) => pontoDeCalculo(acessos[i]!)!)
  const mont = new MontagemMatriz(coords.length)
  const locais = coords.map((_, i) => i)
  const blocos = planejarFaltantes(locais, locais.slice(1), (i, j) => mont.conhecido(i, j), provedor.limites.maxParesMatriz)
  try {
    for (let b = 0; b < blocos.length; b++) {
      const { origens, destinos } = blocos[b]!
      const r = await pedir(janelaMat, () => provedor.matriz(coords, origens, destinos, perfil, sinal))
      rel.pedidos.matriz++
      mont.aplicar(r)
      amb.aoProgresso?.('matriz', (b + 1) / blocos.length)
    }
  } catch (e) {
    rel.tempos.matrizMs = amb.agora() - t1
    if (e instanceof FalhaProvedor && e.tipo !== 'cancelado') return fim(mont, e)
    throw e
  }
  rel.tempos.matrizMs = amb.agora() - t1
  mont.dispensarVoltaAoInicio()
  // Só entram no motor as paradas com percurso de ida e volta entre si (e alcançáveis a partir de você).
  const { dentro, fora } = mont.componentePrincipal()
  for (const k of fora) marcarSemPercurso(acessos[incluidos[k]!]!)
  return fim(mont, undefined, [0, ...dentro])

  function fim(m: MontagemMatriz | null, interrompido?: FalhaProvedor, paraMotor: number[] = []): ResultadoFluxo {
    rel.memoria.matrizBytes = m?.bytes ?? 0
    rel.problemas.confirmar = acessos.filter((a) => a.situacao === 'confirmar').length
    rel.problemas.revisar = acessos.filter((a) => a.situacao === 'revisar').length
    rel.problemas.paresSemPercurso = m ? m.semPercurso().length : 0
    return { acessos, incluidos: m ? incluidos : [], paraMotor, montagem: m, relatorio: rel, interrompido }
  }
}
