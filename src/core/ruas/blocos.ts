// Divisão dos pedidos ao provedor (matriz em blocos, traçado em partes), dentro dos limites por pedido.
// Índices de pontos: 0 = origem (sua posição), 1..n = paradas, na ordem da tarefa.

export interface PedidoBloco {
  origens: number[]
  destinos: number[]
}

/**
 * Matriz completa para a 1ª otimização: linha da origem (0 → paradas) + linhas das paradas (paradas → paradas).
 * A origem só é destino quando a rota volta ao ponto de partida. Cada bloco tem no máximo `maxPares` pares.
 */
export function planejarMatriz(nParadas: number, maxPares: number, voltarAoInicio = false): PedidoBloco[] {
  if (nParadas <= 0) return []
  const paradas = Array.from({ length: nParadas }, (_, i) => i + 1)
  const destinos = voltarAoInicio ? [...paradas, 0] : paradas
  return planejarFaltantes([0, ...paradas], destinos, () => false, maxPares)
}

/**
 * Pede só o que falta (reotimização, retomada de download): para cada origem, as colunas desconhecidas.
 * Origens com o mesmo conjunto de colunas faltantes vão juntas; colunas demais são divididas.
 */
export function planejarFaltantes(
  origens: readonly number[],
  destinos: readonly number[],
  conhecido: (i: number, j: number) => boolean,
  maxPares: number,
): PedidoBloco[] {
  if (maxPares < 1) throw new Error('maxPares inválido')
  const grupos = new Map<string, { cols: number[]; linhas: number[] }>()
  for (const i of origens) {
    const cols = destinos.filter((j) => j !== i && !conhecido(i, j))
    if (!cols.length) continue
    // A diagonal (i → i) vai junto quando a linha está toda faltando: assim linhas iguais formam um só grupo.
    if (destinos.includes(i) && cols.length === destinos.length - 1) cols.splice(destinos.indexOf(i), 0, i)
    const chave = cols.join(',')
    const g = grupos.get(chave)
    if (g) g.linhas.push(i)
    else grupos.set(chave, { cols, linhas: [i] })
  }
  const pedidos: PedidoBloco[] = []
  for (const { cols, linhas } of grupos.values()) {
    const largura = Math.min(cols.length, maxPares)
    for (let c = 0; c < cols.length; c += largura) {
      const parte = cols.slice(c, c + largura)
      const altura = Math.max(1, Math.floor(maxPares / parte.length))
      for (let l = 0; l < linhas.length; l += altura) pedidos.push({ origens: linhas.slice(l, l + altura), destinos: parte })
    }
  }
  return pedidos
}

/** Traçado: partes de até `maxPontos` pontos, cada uma começando no último ponto da anterior. */
export function planejarRota(nPontos: number, maxPontos: number): [number, number][] {
  if (maxPontos < 2) throw new Error('maxPontos inválido')
  const partes: [number, number][] = []
  for (let ini = 0; ini < nPontos - 1; ini += maxPontos - 1) partes.push([ini, Math.min(nPontos - 1, ini + maxPontos - 1)])
  return partes
}
