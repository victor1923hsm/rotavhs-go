// Matriz de custos da otimização (F2). Implementação própria.
// Nó 0 = ponto de partida (quando existe); nós seguintes = visitas, na ordem recebida.
// A matriz pode ser ASSIMÉTRICA (G15: mão única, retornos): km[i][j] ≠ km[j][i] é permitido.
import { FATOR_URBANO, linhaRetaKm, type Ponto } from '../geo'

export type TipoMatriz = 'estimada' | 'ruas'

export interface Matriz {
  /** Distância em km de i para j. */
  km: number[][]
  /** Duração em minutos de i para j (sem o tempo parado na entrega). */
  min: number[][]
  /** 'estimada' = linha reta × fator urbano (offline, sempre disponível); 'ruas' = pela malha viária (F2, com autorização). */
  tipo: TipoMatriz
}

/** Velocidade média urbana do modelo estimado (calibrável em campo, F9). */
export const VELOCIDADE_ESTIMADA_KMH = 20

/** Matriz estimada, local e offline: a garantia quando não há motor viário. */
export function matrizEstimada(pontos: readonly Ponto[], velocidadeKmh = VELOCIDADE_ESTIMADA_KMH): Matriz {
  const n = pontos.length
  const km: number[][] = []
  const min: number[][] = []
  for (let i = 0; i < n; i++) {
    km.push(new Array<number>(n).fill(0))
    min.push(new Array<number>(n).fill(0))
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const d = linhaRetaKm(pontos[i]!, pontos[j]!) * FATOR_URBANO
      km[i]![j] = d
      min[i]![j] = (d / velocidadeKmh) * 60
    }
  }
  return { km, min, tipo: 'estimada' }
}

/** Confere tamanho e valores (uma matriz pelas ruas incompleta ou corrompida nunca é usada). */
export function matrizValida(m: Matriz, n: number): boolean {
  if (m.km.length !== n || m.min.length !== n) return false
  for (let i = 0; i < n; i++) {
    const a = m.km[i]
    const b = m.min[i]
    if (!a || !b || a.length !== n || b.length !== n) return false
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(a[j]!) || !Number.isFinite(b[j]!) || a[j]! < 0 || b[j]! < 0) return false
    }
  }
  return true
}
