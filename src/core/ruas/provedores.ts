// Limites oficiais dos provedores (conferidos em 2026-11-26; ver docs/ARQUITETURA.md §17.2) e o provedor ESTIMADO.
import { FATOR_URBANO, linhaRetaKm } from '../geo'
import { VELOCIDADE_ESTIMADA_KMH as KMH } from '../otimizacao/matriz'
import type { Coordenada, LimitesProvedor, RoutingProvider } from './tipos'
import { FalhaProvedor } from './tipos'

/** OpenRouteService público (plano Standard), em api.heigit.org/openrouteservice/v2/... */
export const LIMITES_ORS: LimitesProvedor = {
  maxParesMatriz: 3500,
  maxPontosRota: 50,
  maxPontosEncaixe: 5000,
  porMinuto: { matriz: 40, rota: 40, encaixe: 100 },
  porDia: { matriz: 500, rota: 2000, encaixe: 2000 },
}
/** Endereço base do ORS (o antigo api.openrouteservice.org foi descontinuado em 2026). */
export const ORS_BASE = 'https://api.heigit.org/openrouteservice/v2'
/** Atribuição obrigatória (termos do ORS; resultados sob CC-BY 4.0). */
export const ATRIBUICAO_ORS = '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors'

/** Servidor próprio (futuro). Limites por pedido configuráveis no servidor; sem cota diária. */
export const LIMITES_VALHALLA_PADRAO: LimitesProvedor = {
  maxParesMatriz: 50 * 50, // service_limits.auto.max_matrix_locations padrão = 50 (ajustável)
  maxPontosRota: 20, // service_limits.auto.max_locations padrão = 20 (ajustável)
  maxPontosEncaixe: 50,
  porMinuto: { matriz: Infinity, rota: Infinity, encaixe: Infinity },
  porDia: { matriz: Infinity, rota: Infinity, encaixe: Infinity },
}
export const LIMITES_OSRM_PADRAO: LimitesProvedor = {
  maxParesMatriz: 100 * 100, // --max-table-size padrão = 100 (ajustável)
  maxPontosRota: 500, // --max-viaroute-size padrão = 500
  maxPontosEncaixe: 100, // --max-nearest-size padrão = 100 (um ponto por pedido no /nearest)
  porMinuto: { matriz: Infinity, rota: Infinity, encaixe: Infinity },
  porDia: { matriz: Infinity, rota: Infinity, encaixe: Infinity },
}

/**
 * Provedor ESTIMADO (sem rede): o mesmo modelo de matrizEstimada (linha reta × fator urbano). `pelasRuas = false`: os números são rotulados como
 * aproximados e NÃO há geometria (rota() recusa) — assim nenhuma linha reta é desenhada como percurso (R4).
 */
export const PROVEDOR_ESTIMADO: RoutingProvider = {
  id: 'estimada',
  limites: { maxParesMatriz: Infinity, maxPontosRota: 0, maxPontosEncaixe: Infinity, porMinuto: { matriz: Infinity, rota: 0, encaixe: Infinity }, porDia: { matriz: Infinity, rota: 0, encaixe: Infinity } },
  perfis: ['carro', 'moto'],
  pelasRuas: false,
  async encaixar(pontos: readonly Coordenada[]) {
    return pontos.map((p) => ({ acesso: { lat: p.lat, lon: p.lon }, distanciaM: 0 }))
  },
  async matriz(pontos, origens, destinos) {
    const km = (i: number, j: number) => (i === j ? 0 : linhaRetaKm(pontos[i]!, pontos[j]!) * FATOR_URBANO)
    return {
      origens, destinos,
      metros: origens.map((i) => destinos.map((j) => km(i, j) * 1000)),
      segundos: origens.map((i) => destinos.map((j) => (km(i, j) / KMH) * 3600)),
    }
  },
  async rota() {
    throw new FalhaProvedor('requisicao')
  },
}
