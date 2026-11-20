// Ordem de visita ESTIMADA (modelo de teste). O solver definitivo vem na Etapa 5 (G3).
// Regras: só reordena; nunca cria, une, remove ou renumera paradas. Nunca pior que a original pelo modelo.

import { estimadaKm, percursoEstimadoKm, type Ponto } from './geo'

export interface ComId extends Ponto {
  id: string
}

/**
 * Distância entre dois pontos usada pelo otimizador. Hoje: a estimada (linha reta × fator urbano).
 * Preparado para G15/N2: a função recebe (de, para) e pode ser ASSIMÉTRICA (mão única, retornos, restrições),
 * vinda de uma matriz pelas ruas. Nada aqui supõe que ida = volta.
 */
export type Distancia = (de: Ponto, para: Ponto) => number

function custo(seq: readonly ComId[], inicio: Ponto | null, dist: Distancia): number {
  const pts: Ponto[] = inicio ? [inicio, ...seq] : [...seq]
  if (dist === estimadaKm) return percursoEstimadoKm(pts)
  let t = 0
  for (let i = 1; i < pts.length; i++) t += dist(pts[i - 1]!, pts[i]!)
  return t
}

/** Vizinho mais próximo + 2-opt (caminho aberto). Retorna os ids na nova ordem. */
export function ordemEstimada<T extends ComId>(original: readonly T[], inicio: Ponto | null, dist: Distancia = estimadaKm): string[] {
  if (original.length < 3) return original.map((p) => p.id)
  const resto = [...original]
  const seq: T[] = []
  let atual: Ponto = inicio ?? resto.shift()!
  if (!inicio) seq.push(atual as T)
  while (resto.length) {
    let melhor = 0
    let melhorD = Infinity
    resto.forEach((p, i) => {
      const d = dist(atual, p)
      if (d < melhorD) {
        melhorD = d
        melhor = i
      }
    })
    const [p] = resto.splice(melhor, 1)
    seq.push(p!)
    atual = p!
  }
  // 2-opt: inverte trechos enquanto melhorar (início fixo).
  const fixo = inicio ? 0 : 1
  let melhorou = true
  let voltas = 0
  while (melhorou && voltas++ < 100) {
    melhorou = false
    for (let i = fixo; i < seq.length - 1; i++) {
      for (let k = i + 1; k < seq.length; k++) {
        const a: Ponto | undefined = i === 0 ? (inicio ?? undefined) : seq[i - 1]
        const b = seq[i]!
        const c = seq[k]!
        const d = seq[k + 1]
        // Simétrica: compara só as duas pontas. Assimétrica (ruas): o trecho invertido muda de sentido, então
        // compara o percurso inteiro do trecho.
        const ponta = (x: Ponto | undefined, y: Ponto | undefined) => (x && y ? dist(x, y) : 0)
        let antes = ponta(a, b) + ponta(c, d)
        let depois = ponta(a, c) + ponta(b, d)
        if (dist !== estimadaKm) {
          for (let j = i; j < k; j++) {
            antes += dist(seq[j]!, seq[j + 1]!)
            depois += dist(seq[j + 1]!, seq[j]!)
          }
        }
        if (depois + 1e-9 < antes) {
          const trecho = seq.slice(i, k + 1).reverse()
          seq.splice(i, k - i + 1, ...trecho)
          melhorou = true
        }
      }
    }
  }
  return custo(seq, inicio, dist) <= custo(original, inicio, dist) ? seq.map((p) => p.id) : original.map((p) => p.id)
}
