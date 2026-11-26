// Limite de pedidos por minuto (janela deslizante de 60 s), com folga abaixo do limite do provedor.
// Puro (relógio injetado): o cliente de rede da RB-2 usa esperaAte() antes de cada pedido.

export class JanelaDeslizante {
  private envios: number[] = []

  constructor(
    readonly maxPorJanela: number,
    readonly janelaMs = 60_000,
  ) {
    if (maxPorJanela < 1) throw new Error('limite inválido')
  }

  /** Quanto esperar (ms) a partir de `agora` para poder enviar mais um. */
  esperaAte(agora: number): number {
    this.envios = this.envios.filter((t) => t > agora - this.janelaMs)
    if (this.envios.length < this.maxPorJanela) return 0
    return this.envios[0]! + this.janelaMs - agora
  }

  registrar(agora: number) {
    this.envios.push(agora)
  }

  /** Folga recomendada: 90% do limite oficial (ex.: 40/min → 36/min). */
  static comFolga(limiteOficialPorMinuto: number) {
    return new JanelaDeslizante(Math.max(1, Math.floor(limiteOficialPorMinuto * 0.9)))
  }
}

/** Espera de nova tentativa depois de 429/5xx: Retry-After se houver, senão 15 s, 30 s, 60 s. */
export function esperaNovaTentativa(tentativa: number, retryAfterMs?: number, rapida = false): number {
  if (retryAfterMs !== undefined && retryAfterMs > 0) return Math.min(retryAfterMs, 120_000)
  // Resposta incompleta não é sobrecarga do provedor: tenta de novo logo (1 s, 2 s, 4 s).
  return (rapida ? [1_000, 2_000, 4_000] : [15_000, 30_000, 60_000])[Math.min(tentativa, 2)]!
}
