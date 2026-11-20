// Política dos alertas de proximidade (A6/A7, Etapa 3: estado persistente e controles).
// A detecção de proximidade em si continua DEMONSTRAÇÃO até a Etapa 7. Nada aqui guarda posição:
// só "parada X avisada em hh:mm" e "já se afastou depois do aviso" (sim/não).

/** Raio do aviso e exigência de precisão (G7). */
export const RAIO_ALERTA_M = 80
export const PRECISAO_MAX_M = 50
/** Rearmar uma parada: afastar-se mais de 200 m E passar 10 min desde o último aviso dela. */
export const REARME_DISTANCIA_M = 200
export const REARME_TEMPO_MS = 10 * 60_000
/** Intervalo mínimo entre alertas (de paradas diferentes). */
export const INTERVALO_ALERTAS_MS = 30_000
/** Acima disso (passando de carro), não avisa. */
export const VELOCIDADE_MAX_MS = 40 / 3.6

export interface AlertaParada {
  /** Quando avisou pela última vez (ms). */
  em: number
  /** Já se afastou mais de 200 m depois desse aviso. */
  afastou: boolean
}

/** Estado dos alertas guardado com a rota (sem posição). */
export interface EstadoAlertas {
  porParada: Record<string, AlertaParada>
  ultimoEm: number | null
  silenciadoNaRota: boolean
}

export const alertasVazios = (): EstadoAlertas => ({ porParada: {}, ultimoEm: null, silenciadoNaRota: false })

export interface Candidata {
  id: string
  distanciaM: number
}

export interface Contexto {
  /** Paradas pendentes com a distância até você (calculada na memória, na hora). */
  candidatas: readonly Candidata[]
  /** A próxima da rota tem prioridade. */
  proximaId: string | undefined
  precisaoM: number
  velocidadeMs: number | null
  agora: number
  /** Preferência global (configurações). */
  ligados: boolean
  /** Já há um alerta na tela. */
  visivel: boolean
}

/** Pode avisar esta parada agora? (nunca avisou, ou rearmou: afastou-se > 200 m e passaram 10 min) */
export function armada(a: AlertaParada | undefined, agora: number): boolean {
  return !a || (a.afastou && agora - a.em >= REARME_TEMPO_MS)
}

/** Decide qual parada avisar (ou nenhuma). Só uma por vez; a próxima da rota tem prioridade. */
export function decidirAlerta(c: Contexto, e: EstadoAlertas): Candidata | null {
  if (!c.ligados || e.silenciadoNaRota || c.visivel) return null
  if (c.precisaoM > PRECISAO_MAX_M) return null
  if (c.velocidadeMs !== null && c.velocidadeMs > VELOCIDADE_MAX_MS) return null
  if (e.ultimoEm !== null && c.agora - e.ultimoEm < INTERVALO_ALERTAS_MS) return null
  const perto = c.candidatas.filter((x) => x.distanciaM <= RAIO_ALERTA_M && armada(e.porParada[x.id], c.agora))
  if (!perto.length) return null
  return perto.find((x) => x.id === c.proximaId) ?? [...perto].sort((a, b) => a.distanciaM - b.distanciaM)[0]!
}

/** Registra o aviso de uma parada. */
export function registrarAviso(e: EstadoAlertas, id: string, agora: number): EstadoAlertas {
  return { ...e, ultimoEm: agora, porParada: { ...e.porParada, [id]: { em: agora, afastou: false } } }
}

/** Marca "afastou" nas paradas avisadas que agora estão a mais de 200 m. Devolve o mesmo objeto se nada mudou. */
export function atualizarAfastamento(e: EstadoAlertas, distancias: ReadonlyMap<string, number>): EstadoAlertas {
  let mudou = false
  const porParada = { ...e.porParada }
  for (const [id, a] of Object.entries(e.porParada)) {
    const d = distancias.get(id)
    if (!a.afastou && d !== undefined && d > REARME_DISTANCIA_M) {
      porParada[id] = { ...a, afastou: true }
      mudou = true
    }
  }
  return mudou ? { ...e, porParada } : e
}
