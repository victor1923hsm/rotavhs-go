// Provedor SINTÉTICO (só para testes e bancada): implementa RoutingProvider sobre a MalhaViaria fictícia, com os
// mesmos limites do ORS e injeção de falhas (429, cota, null). Conta os pedidos e os bytes (como se viessem em JSON).
// NUNCA usado no app: o rótulo é "sintetico" e os dados são fictícios.
import { LIMITES_ORS } from '../provedores'
import type { BlocoMatriz, Coordenada, Encaixe, LimitesProvedor, RoutingProvider, TrechoRuas } from '../tipos'
import { FalhaProvedor } from '../tipos'
import { validarCarga, coordenadaParaEnvio } from '../privacidade'
import type { MalhaViaria } from './malhaViaria'

export interface FalhasSimuladas {
  /** A cada k pedidos de matriz, um 429 (com Retry-After). */
  limiteMinutoACada?: number
  /** Depois de k pedidos de matriz, 403 de cota diária. */
  cotaDepoisDe?: number
}

export class ProvedorSintetico implements RoutingProvider {
  readonly id = 'sintetico' as const
  readonly perfis = ['carro'] as const
  readonly pelasRuas = true
  readonly contagem = { encaixe: 0, matriz: 0, rota: 0, bytes: 0, recusados429: 0 }
  private cacheCaminhos = new Map<number, ReturnType<MalhaViaria['caminhos']>>()

  constructor(
    readonly malha: MalhaViaria,
    readonly limites: LimitesProvedor = LIMITES_ORS,
    readonly falhas: FalhasSimuladas = {},
  ) {}

  private cancelado(sinal?: AbortSignal) {
    if (sinal?.aborted) throw new FalhaProvedor('cancelado')
  }

  private caminhos(no: number) {
    let c = this.cacheCaminhos.get(no)
    if (!c) {
      c = this.malha.caminhos(no)
      this.cacheCaminhos.set(no, c)
    }
    return c
  }

  private no(c: Coordenada): number | null {
    return this.malha.encaixar(c, 1)?.no ?? null // pontos já encaixados caem em cima do cruzamento
  }

  async encaixar(pontos: readonly Coordenada[], raioM: number, _perfil: unknown, sinal?: AbortSignal): Promise<(Encaixe | null)[]> {
    this.cancelado(sinal)
    if (pontos.length > this.limites.maxPontosEncaixe) throw new FalhaProvedor('requisicao', 400)
    validarCarga({ locations: pontos.map(coordenadaParaEnvio), radius: raioM })
    this.contagem.encaixe++
    const r = pontos.map((p) => {
      const e = this.malha.encaixar(p, raioM)
      return e ? { acesso: this.malha.coordenada(e.no), distanciaM: e.distanciaM } : null
    })
    this.contagem.bytes += JSON.stringify(r).length
    return r
  }

  async matriz(pontos: readonly Coordenada[], origens: readonly number[], destinos: readonly number[], _perfil: unknown, sinal?: AbortSignal): Promise<BlocoMatriz> {
    this.cancelado(sinal)
    if (origens.length * destinos.length > this.limites.maxParesMatriz) throw new FalhaProvedor('requisicao', 400)
    validarCarga({ locations: [...new Set([...origens, ...destinos])].map((i) => coordenadaParaEnvio(pontos[i]!)), sources: [...origens], destinations: [...destinos], metrics: ['distance', 'duration'] })
    const k = this.contagem.matriz + 1
    if (this.falhas.cotaDepoisDe !== undefined && k > this.falhas.cotaDepoisDe) throw new FalhaProvedor('cota-diaria', 403)
    if (this.falhas.limiteMinutoACada && k % this.falhas.limiteMinutoACada === 0 && this.contagem.recusados429 < k / this.falhas.limiteMinutoACada) {
      this.contagem.recusados429++
      throw new FalhaProvedor('limite-minuto', 429, 1000)
    }
    this.contagem.matriz++
    const nos = pontos.map((p) => this.no(p))
    const segundos: (number | null)[][] = []
    const metros: (number | null)[][] = []
    for (const i of origens) {
      const a = nos[i] ?? null
      const cam = a === null ? null : this.caminhos(a)
      const vale = (j: number) => {
        const b = nos[j] ?? null
        return cam && b !== null && Number.isFinite(cam.segundos[b]!) ? b : null
      }
      segundos.push(destinos.map((j) => (i === j ? 0 : vale(j) === null ? null : cam!.segundos[vale(j)!]!)))
      metros.push(destinos.map((j) => (i === j ? 0 : vale(j) === null ? null : cam!.metros[vale(j)!]!)))
    }
    this.contagem.bytes += JSON.stringify({ segundos, metros }).length
    return { origens, destinos, segundos, metros, versaoDados: 'sintetico-1' }
  }

  async rota(sequencia: readonly Coordenada[], _perfil: unknown, sinal?: AbortSignal): Promise<TrechoRuas[]> {
    this.cancelado(sinal)
    if (sequencia.length > this.limites.maxPontosRota) throw new FalhaProvedor('requisicao', 400)
    validarCarga({ coordinates: sequencia.map(coordenadaParaEnvio) })
    this.contagem.rota++
    const nos = sequencia.map((p) => this.no(p))
    const trechos: TrechoRuas[] = []
    for (let i = 0; i + 1 < nos.length; i++) {
      const a = nos[i] ?? null, b = nos[i + 1] ?? null
      if (a === null || b === null) throw new FalhaProvedor('requisicao', 404)
      const cam = this.caminhos(a)
      const trajeto = a === b ? [a] : cam.trajeto(b)
      if (!trajeto.length) throw new FalhaProvedor('requisicao', 404)
      const pontos = trajeto.map((n) => {
        const c = this.malha.coordenada(n)
        return [c.lon, c.lat] as [number, number]
      })
      trechos.push({ de: i, para: i + 1, pontos, metros: a === b ? 0 : cam.metros[b]!, segundos: a === b ? 0 : cam.segundos[b]! })
    }
    this.contagem.bytes += JSON.stringify(trechos.map((t) => t.pontos)).length
    return trechos
  }
}
