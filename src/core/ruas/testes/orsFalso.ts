// "ORS falso" (só testes e bancada): responde como o OpenRouteService v2 (snap, matrix, directions/geojson) sobre a
// MalhaViaria FICTÍCIA. Permite simular chave inválida, 429, cota do dia, 5xx, queda de conexão e travamento
// (sem resposta, para testar tempo limite e cancelamento). Guarda os corpos recebidos (para conferir a privacidade).
import type { MalhaViaria } from './malhaViaria'

export interface OpcoesORSFalso {
  chaveValida?: string
  /** A cada k pedidos de matriz, responde 429 uma vez (com Retry-After: 1). */
  limiteACada?: number
  /** Depois de k pedidos de matriz com sucesso, 403 de cota. */
  cotaDepoisDe?: number
  /** Responde 503 nos primeiros k pedidos. */
  falhas5xx?: number
  /** Sem conexão (o fetch rejeita) a partir do pedido k (1 = desde o primeiro). */
  semConexaoAPartirDe?: number
  /** Nunca responde (até ser abortado). */
  travar?: boolean
  /** Data dos dados do mapa informada na matriz. */
  versao?: string
}

interface Resposta {
  status: number
  headers: { get(n: string): string | null }
  text(): Promise<string>
}

export function orsFalso(malha: MalhaViaria, o: OpcoesORSFalso = {}) {
  const chave = o.chaveValida ?? 'TESTE-chave-ficticia-0123456789'
  const estado = { pedidos: 0, matriz: 0, snap: 0, rota: 0, recusados429: 0, corpos: [] as string[], cabecalhosAuth: [] as string[], urls: [] as string[] }
  const caches = new Map<number, ReturnType<MalhaViaria['caminhos']>>()
  const cam = (no: number) => {
    let c = caches.get(no)
    if (!c) caches.set(no, (c = malha.caminhos(no)))
    return c
  }
  const no = (lon: number, lat: number) => malha.encaixar({ lat, lon }, 2)?.no ?? null
  const resp = (status: number, corpo: unknown, h: Record<string, string> = {}): Resposta => {
    const t = typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
    return { status, headers: { get: (n) => h[n.toLowerCase()] ?? null }, text: async () => t }
  }

  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }): Promise<Resposta> => {
    estado.pedidos++
    estado.urls.push(url)
    estado.corpos.push(init.body)
    estado.cabecalhosAuth.push(init.headers.Authorization ?? '')
    if (init.signal.aborted) throw new DOMException('abortado', 'AbortError')
    if (o.semConexaoAPartirDe !== undefined && estado.pedidos >= o.semConexaoAPartirDe) throw new TypeError('Failed to fetch')
    if (o.travar)
      return new Promise((_, falha) => init.signal.addEventListener('abort', () => falha(new DOMException('abortado', 'AbortError')), { once: true }))
    if (init.headers.Authorization !== chave) return resp(403, { error: 'Access to this API has been disallowed' })
    if (o.falhas5xx && estado.pedidos <= o.falhas5xx) return resp(503, { error: 'indisponível' })
    const corpo = JSON.parse(init.body) as { locations?: [number, number][]; coordinates?: [number, number][]; sources?: number[]; destinations?: number[]; radius?: number }

    if (url.includes('/snap/')) {
      estado.snap++
      return resp(200, {
        locations: corpo.locations!.map(([lon, lat]) => {
          const e = malha.encaixar({ lat, lon }, corpo.radius ?? 0)
          if (!e) return null
          const c = malha.coordenada(e.no)
          return { location: [c.lon, c.lat], name: 'Rua Fictícia', snapped_distance: Math.round(e.distanciaM * 100) / 100 }
        }),
        metadata: { attribution: 'teste' },
      })
    }
    if (url.includes('/matrix/')) {
      const k = estado.matriz + estado.recusados429 + 1
      if (o.limiteACada && k % o.limiteACada === 0 && estado.recusados429 < Math.floor(k / o.limiteACada)) {
        estado.recusados429++
        return resp(429, { error: 'Rate limit exceeded' }, { 'retry-after': '1', 'x-ratelimit-remaining': '0' })
      }
      if (o.cotaDepoisDe !== undefined && estado.matriz >= o.cotaDepoisDe) return resp(403, { error: 'Quota exceeded' }, { 'x-ratelimit-remaining': '0' })
      estado.matriz++
      const locs = corpo.locations!.map(([lon, lat]) => no(lon, lat))
      const durations: (number | null)[][] = []
      const distances: (number | null)[][] = []
      for (const s of corpo.sources!) {
        const a = locs[s]
        const c = a === null || a === undefined ? null : cam(a)
        const linha = corpo.destinations!.map((d) => {
          const b = locs[d]
          if (s === d) return [0, 0]
          if (!c || b === null || b === undefined || !Number.isFinite(c.segundos[b]!)) return [null, null]
          return [Math.round(c.segundos[b]! * 10) / 10, Math.round(c.metros[b]! * 10) / 10]
        })
        durations.push(linha.map((x) => x[0]!))
        distances.push(linha.map((x) => x[1]!))
      }
      return resp(200, { durations, distances, metadata: { engine: { version: '9.0.0', graph_date: o.versao ?? '2026-11-20T00:00:00Z' } } })
    }
    if (url.includes('/directions/')) {
      estado.rota++
      const nos = corpo.coordinates!.map(([lon, lat]) => no(lon, lat))
      const coordenadas: [number, number][] = []
      const way_points: number[] = []
      const segments: { distance: number; duration: number }[] = []
      for (let i = 0; i < nos.length; i++) {
        const a = nos[i]
        if (a === null || a === undefined) return resp(404, { error: { code: 2010, message: 'Could not find routable point' } })
        if (i === 0) {
          const c = malha.coordenada(a)
          coordenadas.push([c.lon, c.lat])
          way_points.push(0)
          continue
        }
        const ant = nos[i - 1]!
        const t = ant === a ? [a] : cam(ant).trajeto(a)
        if (!t.length) return resp(404, { error: { code: 2009, message: 'Route could not be found' } })
        for (const n of t.slice(1)) {
          const c = malha.coordenada(n)
          coordenadas.push([c.lon, c.lat])
        }
        way_points.push(coordenadas.length - 1)
        segments.push({ distance: ant === a ? 0 : cam(ant).metros[a]!, duration: ant === a ? 0 : cam(ant).segundos[a]! })
      }
      return resp(200, { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coordenadas }, properties: { segments, way_points } }] })
    }
    return resp(404, { error: 'endpoint desconhecido' })
  }
  return { fetch, estado, chave }
}
