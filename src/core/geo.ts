// Distâncias. Sempre rotuladas: linha reta (só proximidade) ou estimada pelo modelo (ARQUITETURA.md §7).

export interface Ponto {
  lat: number
  lon: number
}

/** Fator urbano: linha reta × 1,35 = distância estimada pelo modelo (calibrável na Etapa 9). */
export const FATOR_URBANO = 1.35

/** Distância em linha reta, em km (haversine). Nunca é apresentada como trajeto. */
export function linhaRetaKm(a: Ponto, b: Ponto): number {
  const R = 6371
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLon = (b.lon - a.lon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Distância estimada pelo modelo, em km. */
export function estimadaKm(a: Ponto, b: Ponto): number {
  return linhaRetaKm(a, b) * FATOR_URBANO
}

/** Soma das distâncias estimadas ao longo de uma sequência de pontos. */
export function percursoEstimadoKm(pontos: readonly Ponto[]): number {
  let total = 0
  for (let i = 1; i < pontos.length; i++) total += estimadaKm(pontos[i - 1]!, pontos[i]!)
  return total
}

/** Tempo estimado: 20 km/h + 1,5 min por parada. Sempre rotulado "estimado". */
export function minutosEstimados(km: number, paradas: number): number {
  return Math.round((km / 20) * 60 + paradas * 1.5)
}

/** Círculo (polígono) de raio em metros ao redor de um ponto: o círculo de precisão da sua localização. */
export function circuloGeo(lat: number, lon: number, raioM: number, lados = 48): [number, number][] {
  const R = 6_371_000
  const dLat = (raioM / R) * (180 / Math.PI)
  const dLon = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  const pts: [number, number][] = []
  for (let i = 0; i <= lados; i++) {
    const a = (i / lados) * 2 * Math.PI
    pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return pts
}
