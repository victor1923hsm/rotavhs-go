// "ORS analítico" (só testes): responde no formato do OpenRouteService v2 para QUALQUER região, com um modelo
// simples e determinístico — distância = linha reta × 1,3; subir para o norte custa 25% mais (assimetria, como mão
// única); pontos "inacessíveis" (sem percurso de/para ninguém); pontos "só de chegada" (sem saída); pontos "sem via"
// (snap devolve null). Simula chave inválida, 429, cota, 5xx, sem conexão e travamento. Guarda os corpos recebidos.
// O mesmo modelo existe em e2e/ors-falso.mjs (servidor HTTP para o emulador e o navegador).

export interface OpcoesAnalitico {
  chaveValida?: string
  inacessiveis?: { lat: number; lon: number }[]
  soChegada?: { lat: number; lon: number }[]
  semVia?: { lat: number; lon: number }[]
  limiteACada?: number
  cotaDepoisDe?: number
  falhas5xx?: number
  semConexao?: boolean
  travar?: boolean
  versao?: string
}

const R = 6371000
const rad = (x: number) => (x * Math.PI) / 180
function metros(a: [number, number], b: [number, number]) {
  const dLat = rad(b[1] - a[1])
  const dLon = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.3
}
const perto = (a: [number, number], l: { lat: number; lon: number }[] = []) => l.some((p) => Math.abs(p.lat - a[1]) < 2e-5 && Math.abs(p.lon - a[0]) < 2e-5)

export function orsAnalitico(o: OpcoesAnalitico = {}) {
  const chave = o.chaveValida ?? 'TESTE-chave-ficticia-0123456789'
  const estado = { pedidos: 0, matriz: 0, snap: 0, rota: 0, recusados429: 0, corpos: [] as string[], urls: [] as string[], cabecalhos: [] as Record<string, string>[] }
  const resp = (status: number, corpo: unknown, h: Record<string, string> = {}) => {
    const t = JSON.stringify(corpo)
    return { status, headers: { get: (n: string) => h[n.toLowerCase()] ?? null }, text: async () => t }
  }
  const fetch = async (url: string, init: { headers: Record<string, string>; body: string; signal: AbortSignal }) => {
    estado.pedidos++
    estado.urls.push(url)
    estado.corpos.push(init.body)
    estado.cabecalhos.push({ ...init.headers })
    if (init.signal.aborted) throw new DOMException('abortado', 'AbortError')
    if (o.semConexao) throw new TypeError('Failed to fetch')
    if (o.travar) return new Promise<never>((_, nao) => init.signal.addEventListener('abort', () => nao(new DOMException('abortado', 'AbortError')), { once: true }))
    if (init.headers.Authorization !== chave) return resp(403, { error: 'Access to this API has been disallowed' })
    if (o.falhas5xx && estado.pedidos <= o.falhas5xx) return resp(503, { error: 'indisponível' })
    const c = JSON.parse(init.body) as { locations?: [number, number][]; coordinates?: [number, number][]; sources?: number[]; destinations?: number[] }
    if (url.includes('/snap/')) {
      estado.snap++
      return resp(200, { locations: c.locations!.map((p) => (perto(p, o.semVia) ? null : { location: [p[0], p[1]], name: 'Rua Fictícia', snapped_distance: 3.2 })) })
    }
    if (url.includes('/matrix/')) {
      const k = estado.matriz + estado.recusados429 + 1
      if (o.limiteACada && k % o.limiteACada === 0 && estado.recusados429 < Math.floor(k / o.limiteACada)) {
        estado.recusados429++
        return resp(429, { error: 'Rate limit exceeded' }, { 'retry-after': '1' })
      }
      if (o.cotaDepoisDe !== undefined && estado.matriz >= o.cotaDepoisDe) return resp(403, { error: 'Quota exceeded' }, { 'x-ratelimit-remaining': '0' })
      estado.matriz++
      const L = c.locations!
      const val = (s: number, d: number): [number | null, number | null] => {
        if (s === d) return [0, 0]
        const a = L[s]!, b = L[d]!
        if (perto(a, o.inacessiveis) || perto(b, o.inacessiveis) || perto(a, o.soChegada)) return [null, null]
        const m = metros(a, b) * (b[1] > a[1] ? 1.25 : 1)
        return [Math.round((m / 1000 / 25) * 3600 * 10) / 10, Math.round(m * 10) / 10]
      }
      const pares = c.sources!.map((s) => c.destinations!.map((d) => val(s, d)))
      return resp(200, { durations: pares.map((l) => l.map((x) => x[0])), distances: pares.map((l) => l.map((x) => x[1])), metadata: { engine: { version: '9.0.0', graph_date: o.versao ?? '2026-11-20T00:00:00Z' } } })
    }
    if (url.includes('/directions/')) {
      estado.rota++
      const P = c.coordinates!
      const coords: [number, number][] = []
      const wp: number[] = []
      const seg: { distance: number; duration: number }[] = []
      P.forEach((p, i) => {
        if (i > 0) {
          // em "L": primeiro na longitude, depois na latitude (nunca uma reta direta)
          coords.push([p[0], P[i - 1]![1]])
          const m = metros(P[i - 1]!, p)
          seg.push({ distance: m, duration: (m / 1000 / 25) * 3600 })
        }
        coords.push([p[0], p[1]])
        wp.push(coords.length - 1)
      })
      return resp(200, { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { segments: seg, way_points: wp } }] })
    }
    return resp(404, { error: 'desconhecido' })
  }
  return { fetch, estado, chave }
}
