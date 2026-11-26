// Relatório de roteirização (requisito 8 da R-B): consumo de API, tempos separados, memória, distância, duração
// e pontos problemáticos. Também a PREVISÃO de consumo antes de baixar (para avisar sobre cota e tempo).
import { planejarMatriz, planejarRota } from './blocos'
import type { LimitesProvedor } from './tipos'

export interface RelatorioRoteirizacao {
  provedor: string
  paradas: number
  pedidos: { encaixe: number; matriz: number; rota: number; divisoes?: number }
  bytesRecebidos: number
  tempos: { encaixeMs: number; matrizMs: number; algoritmoMs: number; tracadoMs: number }
  memoria: { matrizBytes: number; geometriaBytes: number }
  kmTotal: number
  minTotal: number
  problemas: { confirmar: number; revisar: number; paresSemPercurso: number; trechosEstimados: number }
}

export function relatorioVazio(provedor: string, paradas: number): RelatorioRoteirizacao {
  return {
    provedor, paradas, pedidos: { encaixe: 0, matriz: 0, rota: 0 }, bytesRecebidos: 0,
    tempos: { encaixeMs: 0, matrizMs: 0, algoritmoMs: 0, tracadoMs: 0 }, memoria: { matrizBytes: 0, geometriaBytes: 0 },
    kmTotal: 0, minTotal: 0, problemas: { confirmar: 0, revisar: 0, paresSemPercurso: 0, trechosEstimados: 0 },
  }
}

export interface PrevisaoConsumo {
  pedidosMatriz: number
  pedidosRota: number
  /** Pedidos de encaixe no pior caso (4 raios automáticos). */
  pedidosEncaixeMax: number
  /** Tempo mínimo imposto pelo limite por minuto (sem contar a rede), em segundos. */
  esperaMinimaMatrizS: number
  /** Quantas rotas iguais cabem na cota diária de matriz. */
  rotasPorDia: number
}

/** Previsão de consumo para uma rota de n paradas (1ª otimização completa). */
export function preverConsumo(n: number, limites: LimitesProvedor, folga = 0.9): PrevisaoConsumo {
  const pedidosMatriz = planejarMatriz(n, limites.maxParesMatriz).length
  const pedidosRota = planejarRota(n + 1, limites.maxPontosRota).length
  const porMin = Math.max(1, Math.floor(limites.porMinuto.matriz * folga))
  const esperaMinimaMatrizS = pedidosMatriz <= porMin ? 0 : Math.ceil(pedidosMatriz / porMin - 1) * 60
  return {
    pedidosMatriz,
    pedidosRota,
    pedidosEncaixeMax: Math.ceil(n / limites.maxPontosEncaixe) * 4,
    esperaMinimaMatrizS,
    rotasPorDia: Number.isFinite(limites.porDia.matriz) ? Math.floor(limites.porDia.matriz / pedidosMatriz) : Infinity,
  }
}
