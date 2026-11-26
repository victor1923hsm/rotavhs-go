// Malha viária SINTÉTICA (fictícia) para testes de regressão do motor. Nada aqui vem de dados reais.
// Grade de quarteirões de 100 m (lado × lado nós), avenidas a 40 km/h a cada 8 ruas, ruas locais a 22 km/h,
// ~35% das ruas locais em mão única, alguns quarteirões sem passagem. Paradas agrupadas em "bairros".
// Matriz pelo menor tempo (Dijkstra): ASSIMÉTRICA. Nó 0 = origem (base na borda).
import type { Matriz } from './matriz'

export interface MalhaSintetica {
  matriz: Matriz
  /** Posição de cada nó na grade, em km (para medir "voltas" e para o algoritmo antigo em linha reta). */
  xy: [number, number][]
  /** Fração de pares (i, j) com ida ≠ volta. */
  assimetria: number
}

function rng(semente: number) {
  let s = semente >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

export function malhaSintetica(n: number, semente: number, lado = 70, bloqueios: [number, number][] = []): MalhaSintetica {
  const r = rng(semente)
  const idx = (x: number, y: number) => y * lado + x
  const adj: [number, number, number][][] = Array.from({ length: lado * lado }, () => [])
  const bloq = new Set(bloqueios.map(([a, b]) => `${a}>${b}`))
  const via = (a: number, b: number, kmh: number) => {
    if (!bloq.has(`${a}>${b}`)) adj[a]!.push([b, 0.1, (0.1 / kmh) * 60])
  }
  const ligar = (a: number, b: number, avenida: boolean, maoFixa: boolean, sentido: boolean) => {
    const kmh = avenida ? 40 : 22
    if (!avenida && r() < 0.06) return // quarteirão sem passagem
    if (!avenida && maoFixa && r() < 0.9) return sentido ? via(a, b, kmh) : via(b, a, kmh)
    if (!avenida && r() < 0.15) return r() < 0.5 ? via(a, b, kmh) : via(b, a, kmh)
    via(a, b, kmh)
    via(b, a, kmh)
  }
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if (x + 1 < lado) ligar(idx(x, y), idx(x + 1, y), y % 8 === 0, y % 8 === 2 || y % 8 === 5, y % 2 === 0)
      if (y + 1 < lado) ligar(idx(x, y), idx(x, y + 1), x % 8 === 0, x % 8 === 3 || x % 8 === 6, x % 2 === 0)
    }
  }
  // Só nós com ida e volta possíveis (componente fortemente conexa do centro).
  const alcance = (lista: number[][]) => {
    const vis = new Uint8Array(lado * lado)
    const pilha = [idx(lado >> 1, lado >> 1)]
    vis[pilha[0]!] = 1
    while (pilha.length) {
      const u = pilha.pop()!
      for (const v of lista[u]!) if (!vis[v]) {
        vis[v] = 1
        pilha.push(v)
      }
    }
    return vis
  }
  const rev: number[][] = Array.from({ length: lado * lado }, () => [])
  adj.forEach((l, u) => l.forEach(([v]) => rev[v]!.push(u)))
  const ida = alcance(adj.map((l) => l.map(([v]) => v)))
  const volta = alcance(rev)
  const ok = (v: number) => ida[v] === 1 && volta[v] === 1
  let base = -1
  for (let d = 0; base < 0; d++) {
    for (let x = (lado >> 1) - d; x <= (lado >> 1) + d && base < 0; x++) {
      const v = idx(Math.max(0, Math.min(lado - 1, x)), lado - 2)
      if (ok(v)) base = v
    }
  }
  const nb = Math.max(3, Math.floor(n / 40))
  const centros = Array.from({ length: nb }, () => [8 + Math.floor(r() * (lado - 16)), 8 + Math.floor(r() * (lado - 16))] as const)
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  const nos = [base]
  const usados = new Set(nos)
  while (nos.length < n + 1) {
    let x: number, y: number
    if (r() < 0.85) {
      const c = centros[Math.floor(r() * centros.length)]!
      x = Math.min(lado - 1, Math.max(0, Math.round(c[0] + gauss() * 4)))
      y = Math.min(lado - 1, Math.max(0, Math.round(c[1] + gauss() * 4)))
    } else {
      x = Math.floor(r() * lado)
      y = Math.floor(r() * lado)
    }
    const v = idx(x, y)
    if (!usados.has(v) && ok(v)) {
      usados.add(v)
      nos.push(v)
    }
  }
  // Dijkstra (heap binário) a partir de cada parada.
  const N = nos.length
  const km = Array.from({ length: N }, () => new Array<number>(N).fill(0))
  const min = Array.from({ length: N }, () => new Array<number>(N).fill(0))
  const dist = new Float64Array(lado * lado)
  const dkm = new Float64Array(lado * lado)
  for (let i = 0; i < N; i++) {
    dist.fill(Infinity)
    dist[nos[i]!] = 0
    dkm[nos[i]!] = 0
    const heap: [number, number][] = [[0, nos[i]!]]
    const push = (e: [number, number]) => {
      heap.push(e)
      let k = heap.length - 1
      while (k > 0) {
        const p = (k - 1) >> 1
        if (heap[p]![0] <= heap[k]![0]) break
        ;[heap[p], heap[k]] = [heap[k]!, heap[p]!]
        k = p
      }
    }
    const pop = () => {
      const top = heap[0]!
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let k = 0
        for (;;) {
          const a = 2 * k + 1, b = a + 1
          let m = k
          if (a < heap.length && heap[a]![0] < heap[m]![0]) m = a
          if (b < heap.length && heap[b]![0] < heap[m]![0]) m = b
          if (m === k) break
          ;[heap[m], heap[k]] = [heap[k]!, heap[m]!]
          k = m
        }
      }
      return top
    }
    while (heap.length) {
      const [t, u] = pop()
      if (t > dist[u]!) continue
      for (const [v, k, mm] of adj[u]!) {
        const nt = t + mm
        if (nt < dist[v]!) {
          dist[v] = nt
          dkm[v] = dkm[u]! + k
          push([nt, v])
        }
      }
    }
    for (let j = 0; j < N; j++) {
      if (i === j) continue
      km[i]![j] = Math.round(dkm[nos[j]!]! * 1e4) / 1e4
      min[i]![j] = Math.round(dist[nos[j]!]! * 1e4) / 1e4
    }
  }
  let assim = 0
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j && Math.abs(min[i]![j]! - min[j]![i]!) > 0.01) assim++
  return { matriz: { km, min, tipo: 'ruas' }, xy: nos.map((v) => [(v % lado) * 0.1, Math.floor(v / lado) * 0.1]), assimetria: assim / (N * (N - 1)) }
}
