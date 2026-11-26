// Servidor HTTP "ORS falso" para os testes de ponta a ponta (RB-2): responde como o OpenRouteService v2
// (snap, matrix, directions/geojson) com o mesmo modelo de src/core/ruas/testes/orsAnalitico.ts — distância =
// linha reta × 1,3; subir para o norte custa 25% mais (assimetria). Só dados FICTÍCIOS; nada sai da máquina.
// Modos (POST /_modo {"modo": ...}): normal · chave-invalida (403) · limite (429 a cada 3 pedidos de matriz) ·
// travar (não responde) · fechar (derruba a conexão, como sem internet). GET /_estado devolve as contagens.
import { createServer } from 'node:http'

const R = 6371000
const rad = (x) => (x * Math.PI) / 180
function metros(a, b) {
  const dLat = rad(b[1] - a[1])
  const dLon = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.3
}

export function iniciarORSFalso(porta = 8765) {
  const estado = { modo: 'normal', pedidos: 0, matriz: 0, snap: 0, rota: 0, recusados429: 0, textosRecebidos: new Set(), chaveValidaVista: false }
  const travados = []
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Max-Age': '600' }
  const json = (res, status, corpo, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...cors, ...extra })
    res.end(JSON.stringify(corpo))
  }
  const coletar = (v) => {
    if (typeof v === 'string') estado.textosRecebidos.add(v)
    else if (Array.isArray(v)) v.forEach(coletar)
    else if (v && typeof v === 'object') Object.values(v).forEach(coletar)
  }
  const srv = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      return res.end()
    }
    let corpo = ''
    req.on('data', (d) => (corpo += d))
    req.on('end', () => {
      if (req.url === '/_estado') return json(res, 200, { ...estado, textosRecebidos: [...estado.textosRecebidos] })
      if (req.url === '/_modo') {
        estado.modo = JSON.parse(corpo).modo
        return json(res, 200, { ok: true })
      }
      estado.pedidos++
      if (estado.modo === 'fechar') return req.socket.destroy()
      if (estado.modo === 'travar') return travados.push(res)
      const chave = req.headers.authorization ?? ''
      if (estado.modo === 'chave-invalida' || !chave.startsWith('TESTE-')) return json(res, 403, { error: 'Access to this API has been disallowed' })
      estado.chaveValidaVista = true
      let c
      try {
        c = JSON.parse(corpo)
      } catch {
        return json(res, 400, { error: 'json' })
      }
      coletar(c)
      if (req.url.includes('/snap/')) {
        estado.snap++
        return json(res, 200, { locations: c.locations.map((p) => ({ location: [p[0], p[1]], name: 'Rua Fictícia', snapped_distance: 3.2 })) })
      }
      if (req.url.includes('/matrix/')) {
        if (estado.modo === 'limite' && (estado.matriz + estado.recusados429 + 1) % 3 === 0) {
          estado.recusados429++
          return json(res, 429, { error: 'Rate limit exceeded' }, { 'Retry-After': '1' })
        }
        estado.matriz++
        const L = c.locations
        const val = (s, d) => {
          if (s === d) return [0, 0]
          const m = metros(L[s], L[d]) * (L[d][1] > L[s][1] ? 1.25 : 1)
          return [Math.round((m / 1000 / 25) * 3600 * 10) / 10, Math.round(m * 10) / 10]
        }
        const pares = c.sources.map((s) => c.destinations.map((d) => val(s, d)))
        return json(res, 200, { durations: pares.map((l) => l.map((x) => x[0])), distances: pares.map((l) => l.map((x) => x[1])), metadata: { engine: { version: '9.0.0', graph_date: '2026-11-20T00:00:00Z' } } })
      }
      return json(res, 404, { error: 'desconhecido' })
    })
  })
  return new Promise((ok) =>
    srv.listen(porta, '127.0.0.1', () =>
      ok({
        porta,
        estado,
        modo: (m) => {
          estado.modo = m
          if (m !== 'travar') travados.splice(0).forEach((r) => r.socket?.destroy())
        },
        fechar: () => new Promise((f) => {
          travados.splice(0).forEach((r) => r.socket?.destroy())
          srv.closeAllConnections?.()
          srv.close(() => f())
        }),
      }),
    ),
  )
}
