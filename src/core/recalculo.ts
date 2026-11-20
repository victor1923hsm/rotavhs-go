// Política de sugestão automática de nova ordem (G8). A ordem NUNCA muda sozinha: só com o toque.

/** Ganho mínimo do modelo para sugerir: ≥ 5 % E ≥ 300 m. */
export const GANHO_MIN_PCT = 5
export const GANHO_MIN_KM = 0.3
/** Intervalo mínimo entre cálculos automáticos. */
export const INTERVALO_MIN_MS = 60_000

export interface Avaliacao {
  sugerir: boolean
  ganhoKm: number
  ganhoPct: number
}

export function avaliarSugestao(atualKm: number, novaKm: number, ultimaMs: number | null, agoraMs: number, intervaloMs = INTERVALO_MIN_MS): Avaliacao {
  const ganhoKm = Math.max(0, atualKm - novaKm)
  const ganhoPct = atualKm > 0 ? (ganhoKm / atualKm) * 100 : 0
  const cedo = ultimaMs !== null && agoraMs - ultimaMs < intervaloMs
  return { sugerir: !cedo && ganhoPct >= GANHO_MIN_PCT && ganhoKm >= GANHO_MIN_KM, ganhoKm, ganhoPct }
}
