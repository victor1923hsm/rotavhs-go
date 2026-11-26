// Cliente do OpenRouteService (RB-2) pela interface RoutingProvider. Puro: o `fetch`, o relógio e o temporizador são
// injetados (testes com respostas controladas; no app, o fetch do navegador/WebView).
//
// Regras:
// - Só coordenadas e parâmetros técnicos saem do aparelho (validarCarga antes de cada pedido).
// - A chave vai só no cabeçalho Authorization; nunca em URL, mensagem de erro, relatório ou log.
// - Envio ao ORS REAL bloqueado enquanto `liberadoReal` for falso (termos e autorização pendentes). Servidores de
//   TESTE locais (127.0.0.1, localhost, 10.0.2.2) são aceitos para respostas controladas.
// - Cada pedido tem tempo limite e pode ser cancelado. 401/403/429/5xx viram FalhaProvedor com tipo, sem detalhes.
import { coordenadaParaEnvio, validarCarga } from './privacidade'
import { LIMITES_ORS, ORS_BASE } from './provedores'
import type { BlocoMatriz, Coordenada, Encaixe, PerfilVeiculo, RoutingProvider, TrechoRuas } from './tipos'
import { FalhaProvedor } from './tipos'

export const HOSTS_DE_TESTE = new Set(['127.0.0.1', 'localhost', '10.0.2.2'])
export const TEMPO_LIMITE_MS = 30_000

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; credentials?: 'omit'; cache?: 'no-store'; referrerPolicy?: 'no-referrer' }) => Promise<{
  status: number
  headers: { get(n: string): string | null }
  text(): Promise<string>
}>

export interface OpcoesORS {
  chave: string
  fetch: FetchLike
  /** Base dos endpoints v2 (padrão: o ORS público). */
  base?: string
  /** Envio ao ORS real liberado? (falso até a confirmação dos termos e a sua autorização específica). */
  liberadoReal: boolean
  tempoLimiteMs?: number
  agendar?: (f: () => void, ms: number) => unknown
  desagendar?: (h: unknown) => void
}

/** A base é um servidor de teste local (respostas controladas)? */
export function ehBaseDeTeste(base: string): boolean {
  try {
    return HOSTS_DE_TESTE.has(new URL(base).hostname)
  } catch {
    return false
  }
}

const PERFIL_ORS: Record<PerfilVeiculo, string> = { carro: 'driving-car', moto: 'driving-car' }

/** Converte "Retry-After" (segundos) ou "x-ratelimit-reset" (época em s) em ms de espera. */
function esperaDoCabecalho(h: { get(n: string): string | null }, agora: number): number | undefined {
  const ra = Number(h.get('retry-after'))
  if (Number.isFinite(ra) && ra > 0) return ra * 1000
  const reset = Number(h.get('x-ratelimit-reset'))
  if (Number.isFinite(reset) && reset > 0) {
    const ms = reset * 1000 - agora
    if (ms > 0 && ms < 120_000) return ms
  }
  return undefined
}

export function provedorORS(o: OpcoesORS): RoutingProvider & { readonly base: string; readonly deTeste: boolean } {
  const base = (o.base ?? ORS_BASE).replace(/\/+$/, '')
  const deTeste = ehBaseDeTeste(base)
  const agendar = o.agendar ?? ((f, ms) => setTimeout(f, ms))
  const desagendar = o.desagendar ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

  async function pedir<T>(caminho: string, corpo: Record<string, unknown>, sinal?: AbortSignal): Promise<{ json: T; bytes: number }> {
    if (!deTeste && !o.liberadoReal) throw new FalhaProvedor('bloqueado')
    if (!o.chave) throw new FalhaProvedor('chave')
    if (sinal?.aborted) throw new FalhaProvedor('cancelado')
    validarCarga(corpo)
    const ctl = new AbortController()
    let esgotou = false
    const aoCancelar = () => ctl.abort()
    sinal?.addEventListener('abort', aoCancelar, { once: true })
    const h = agendar(() => {
      esgotou = true
      ctl.abort()
    }, o.tempoLimiteMs ?? TEMPO_LIMITE_MS)
    try {
      let r: Awaited<ReturnType<FetchLike>>
      try {
        r = await o.fetch(`${base}${caminho}`, {
          method: 'POST',
          headers: { Authorization: o.chave, 'Content-Type': 'application/json', Accept: 'application/json, application/geo+json' },
          body: JSON.stringify(corpo),
          signal: ctl.signal,
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        })
      } catch {
        if (sinal?.aborted) throw new FalhaProvedor('cancelado')
        throw new FalhaProvedor(esgotou ? 'tempo-esgotado' : 'sem-conexao')
      }
      let texto: string
      try {
        texto = await r.text()
      } catch {
        if (sinal?.aborted) throw new FalhaProvedor('cancelado')
        throw new FalhaProvedor(esgotou ? 'tempo-esgotado' : 'sem-conexao')
      }
      if (r.status === 429) throw new FalhaProvedor('limite-minuto', 429, esperaDoCabecalho(r.headers, Date.now()))
      if (r.status === 401) throw new FalhaProvedor('chave', 401)
      if (r.status === 403) {
        // O ORS usa 403 para cota do dia esgotada e para chave sem acesso. Cota: remaining = 0 ou texto de cota.
        const resta = r.headers.get('x-ratelimit-remaining')
        throw new FalhaProvedor(resta === '0' || /quota/i.test(texto) ? 'cota-diaria' : 'chave', 403)
      }
      if (r.status >= 500) throw new FalhaProvedor('indisponivel', r.status)
      if (r.status < 200 || r.status >= 300) throw new FalhaProvedor('requisicao', r.status)
      try {
        return { json: JSON.parse(texto) as T, bytes: texto.length }
      } catch {
        throw new FalhaProvedor('requisicao', r.status)
      }
    } finally {
      desagendar(h)
      sinal?.removeEventListener('abort', aoCancelar)
    }
  }

  return {
    id: 'ors',
    base,
    deTeste,
    limites: LIMITES_ORS,
    perfis: ['carro'],
    pelasRuas: true,

    async encaixar(pontos: readonly Coordenada[], raioM: number, perfil: PerfilVeiculo, sinal?: AbortSignal): Promise<(Encaixe | null)[]> {
      if (pontos.length > LIMITES_ORS.maxPontosEncaixe) throw new FalhaProvedor('requisicao', 413)
      const { json } = await pedir<{ locations?: ({ location?: [number, number]; snapped_distance?: number } | null)[] }>(
        `/snap/${PERFIL_ORS[perfil]}`,
        { locations: pontos.map(coordenadaParaEnvio), radius: raioM },
        sinal,
      )
      const ls = json.locations ?? []
      if (ls.length !== pontos.length) throw new FalhaProvedor('requisicao', 200)
      // O ORS também devolve o nome da rua: é descartado aqui (não guardamos nada além da coordenada).
      return ls.map((l) =>
        l && Array.isArray(l.location) && Number.isFinite(l.location[0]) && Number.isFinite(l.location[1])
          ? { acesso: { lat: l.location[1], lon: l.location[0] }, distanciaM: Number(l.snapped_distance ?? 0) }
          : null,
      )
    },

    async matriz(pontos, origens, destinos, perfil, sinal): Promise<BlocoMatriz> {
      if (origens.length * destinos.length > LIMITES_ORS.maxParesMatriz) throw new FalhaProvedor('requisicao', 413)
      // Só os pontos usados neste bloco (menos dados enviados); os índices são remapeados.
      const usados = [...new Set([...origens, ...destinos])]
      const pos = new Map(usados.map((g, k) => [g, k]))
      const { json, bytes } = await pedir<{ durations?: (number | null)[][]; distances?: (number | null)[][]; metadata?: { engine?: { graph_date?: string; version?: string } } }>(
        `/matrix/${PERFIL_ORS[perfil]}`,
        {
          locations: usados.map((g) => coordenadaParaEnvio(pontos[g]!)),
          sources: origens.map((g) => pos.get(g)!),
          destinations: destinos.map((g) => pos.get(g)!),
          metrics: ['distance', 'duration'],
          units: 'm',
        },
        sinal,
      )
      const ok = (m?: (number | null)[][]) => Array.isArray(m) && m.length === origens.length && m.every((l) => Array.isArray(l) && l.length === destinos.length)
      if (!ok(json.durations) || !ok(json.distances)) throw new FalhaProvedor('requisicao', 200)
      const versao = json.metadata?.engine?.graph_date ?? json.metadata?.engine?.version
      return { origens, destinos, segundos: json.durations!, metros: json.distances!, versaoDados: versao ? String(versao) : undefined, bytes }
    },

    async rota(sequencia, perfil, sinal): Promise<TrechoRuas[]> {
      if (sequencia.length < 2) return []
      if (sequencia.length > LIMITES_ORS.maxPontosRota) throw new FalhaProvedor('requisicao', 413)
      const { json } = await pedir<{
        features?: { geometry?: { coordinates?: [number, number][] }; properties?: { segments?: { distance?: number; duration?: number }[]; way_points?: number[] } }[]
      }>(`/directions/${PERFIL_ORS[perfil]}/geojson`, { coordinates: sequencia.map(coordenadaParaEnvio), instructions: false, elevation: false }, sinal)
      const f = json.features?.[0]
      const coords = f?.geometry?.coordinates
      const seg = f?.properties?.segments
      const wp = f?.properties?.way_points
      if (!coords || !seg || !wp || seg.length !== sequencia.length - 1 || wp.length !== sequencia.length) throw new FalhaProvedor('requisicao', 200)
      return seg.map((s, i) => ({
        de: i,
        para: i + 1,
        pontos: coords.slice(wp[i]!, wp[i + 1]! + 1).map((c) => [c[0], c[1]] as [number, number]),
        metros: Number(s.distance ?? 0),
        segundos: Number(s.duration ?? 0),
      }))
    },
  }
}
