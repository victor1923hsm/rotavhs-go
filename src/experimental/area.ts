// Área e pontos FICTÍCIOS do modo experimental (RB-4): Goiânia. Nada aqui vem de planilha, destinatário ou encomenda.
// Os pontos gerados são sorteados dentro de uma área do centro expandido e depois encaixados na malha viária pelo
// próprio provedor (ficam sobre uma via do OpenStreetMap). A partida padrão é uma praça pública.

export interface Coord {
  lat: number
  lon: number
}

/** Limite onde QUALQUER ponto experimental precisa estar (município de Goiânia, aproximado). */
export const LIMITE_GOIANIA = { latMin: -16.83, latMax: -16.55, lonMin: -49.42, lonMax: -49.13 } as const

/** Área usada para sortear paradas (Setores Central, Oeste, Bueno, Marista e vizinhos — vias públicas). */
export const AREA_SORTEIO = { latMin: -16.715, latMax: -16.665, lonMin: -49.29, lonMax: -49.235 } as const

/** Partidas públicas pré-definidas (coordenadas aproximadas; o provedor encaixa na via mais próxima). */
export const PARTIDAS_PUBLICAS: readonly { nome: string; lat: number; lon: number }[] = [
  { nome: 'Praça Cívica (centro, aprox.)', lat: -16.6799, lon: -49.2556 },
  { nome: 'Av. T-63 com Av. T-9 (Setor Bueno, aprox.)', lat: -16.7062, lon: -49.2735 },
]

export const CENTRO_GOIANIA: Coord = { lat: -16.686, lon: -49.264 }

export function dentroDeGoiania(c: Coord): boolean {
  return c.lat >= LIMITE_GOIANIA.latMin && c.lat <= LIMITE_GOIANIA.latMax && c.lon >= LIMITE_GOIANIA.lonMin && c.lon <= LIMITE_GOIANIA.lonMax
}

/** Sorteio determinístico (semente) de n pontos na área de sorteio, com 6 casas. */
export function sortearPontos(n: number, semente: number): Coord[] {
  let s = semente >>> 0 || 1
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  const a = AREA_SORTEIO
  return Array.from({ length: n }, () => ({
    lat: Math.round((a.latMin + r() * (a.latMax - a.latMin)) * 1e6) / 1e6,
    lon: Math.round((a.lonMin + r() * (a.lonMax - a.lonMin)) * 1e6) / 1e6,
  }))
}
