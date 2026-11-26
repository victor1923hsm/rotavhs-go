import { describe, expect, it } from 'vitest'
import { matrizEstimada, type Matriz } from './matriz'
import { malhaSintetica } from './malhaSintetica'
import { otimizar, OtimizacaoCancelada, type Criterio } from './motor'
import type { Ponto } from '../geo'

// Dados FICTÍCIOS.
const C = { lat: -16.68, lon: -49.25 }
const ponto = (dx: number, dy: number): Ponto => ({ lat: C.lat + dy * 0.001, lon: C.lon + dx * 0.001 })
let semente = 7
const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647)
const visitas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `v${i}` }))

/** Matriz aleatória assimétrica (ida e volta independentes). */
function matrizAssimetrica(n: number): Matriz {
  const km = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : 0.2 + aleatorio() * 5)))
  return { km, min: km.map((l) => l.map((v) => v * 3)), tipo: 'ruas' }
}
const custoDe = (m: Matriz, ordem: readonly number[], destino = -1) => {
  let t = 0, a = 0
  for (const v of ordem) {
    t += m.min[a]![v]!
    a = v
  }
  return t + (destino >= 0 ? m.min[a]![destino]! : 0)
}
function forcaBruta(m: Matriz, n: number): number {
  let melhor = Infinity
  const usado = new Array<boolean>(n + 1).fill(false)
  const cur: number[] = []
  const rec = () => {
    if (cur.length === n) {
      melhor = Math.min(melhor, custoDe(m, cur))
      return
    }
    for (let v = 1; v <= n; v++) if (!usado[v]) {
      usado[v] = true
      cur.push(v)
      rec()
      cur.pop()
      usado[v] = false
    }
  }
  rec()
  return melhor
}
const nosDe = (ordem: readonly string[]) => ordem.map((id) => Number(id.slice(1)) + 1)

describe('motor de otimização v3', () => {
  it('acha o ótimo exato em matrizes assimétricas pequenas (até 9 paradas)', () => {
    for (const n of [3, 5, 7, 8, 9, 9]) {
      const m = matrizAssimetrica(n + 1)
      const r = otimizar({ visitas: visitas(n), matriz: m, servicoMin: 0, limiteMs: 1e9 })
      expect(r.custo).toBeCloseTo(forcaBruta(m, n), 9)
      expect(custoDe(m, nosDe(r.ordem))).toBeCloseTo(r.custo, 9)
    }
  })

  it('nunca devolve ordem pior que a atual e não perde, duplica nem cria visitas (todos os critérios)', () => {
    for (let k = 0; k < 6; k++) {
      const n = 10 + Math.floor(aleatorio() * 40)
      const m = matrizAssimetrica(n + 1)
      for (const criterio of ['tempo', 'distancia', 'combustivel', 'inteligente'] as Criterio[]) {
        const r = otimizar({ visitas: visitas(n), matriz: m, criterio, limiteMs: 1e9, iteracoes: 100 })
        expect(r.custo).toBeLessThanOrEqual(r.custoAtual + 1e-9)
        expect([...r.ordem].sort()).toEqual(visitas(n).map((v) => v.id).sort())
      }
    }
  })

  it('usa o custo real do sentido invertido (rua de mão única)', () => {
    // Fila de 12 paradas numa rua: ir para a frente custa 1 por quarteirão; voltar custa 10.
    // A ordem atual (v0, v1, …) anda na contramão: v0 é a mais distante da origem.
    const n = 12
    const p = (no: number) => (no === 0 ? 0 : n + 1 - no)
    const km = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (p(j) >= p(i) ? p(j) - p(i) : 10 * (p(i) - p(j)))))
    const m: Matriz = { km, min: km, tipo: 'ruas' }
    const r = otimizar({ visitas: visitas(n), matriz: m, servicoMin: 0, limiteMs: 1e9 })
    expect(r.ordem).toEqual(visitas(n).map((v) => v.id).reverse())
    expect(r.custo).toBe(n)
    expect(r.custoAtual).toBeGreaterThan(r.custo)
  })

  it('sai da posição atual (nó 0): nunca começa pela 1ª da SPX só por ela ser a primeira', () => {
    // A 1ª parada da lista está no outro extremo; a origem está perto da última.
    const xs = [30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    const pts = [ponto(0, 0), ...xs.map((x) => ponto(x, 0))]
    const r = otimizar({ visitas: visitas(xs.length), matriz: matrizEstimada(pts), limiteMs: 1e9 })
    expect(r.ordem[0]).toBe('v1')
    expect(r.ordem[r.ordem.length - 1]).toBe('v0')
  })

  it('término livre por padrão; destino opcional (ponto ou visita) e primeira fixa', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const pts = [ponto(0, 0), ...xs.map((x) => ponto(x, 0))]
    // Voltar ao ponto de partida (destino = um ponto, último nó da matriz).
    const comVolta = matrizEstimada([...pts, ponto(0, 0)])
    const r1 = otimizar({ visitas: visitas(10), matriz: comVolta, termino: { tipo: 'ponto' }, servicoMin: 0, limiteMs: 1e9 })
    expect(r1.km).toBeCloseTo(2 * matrizEstimada([ponto(0, 0), ponto(10, 0)]).km[0]![1]!, 6)
    // Última visita fixa e primeira fixa.
    const r2 = otimizar({ visitas: visitas(10), matriz: matrizEstimada(pts), termino: { tipo: 'visita', id: 'v2' }, primeira: 'v6', limiteMs: 1e9 })
    expect(r2.ordem[0]).toBe('v6')
    expect(r2.ordem[r2.ordem.length - 1]).toBe('v2')
    expect(r2.ordem).toHaveLength(10)
  })

  it('mantém juntas as visitas do mesmo endereço confirmado (sem uni-las)', () => {
    const n = 20
    const pts = [ponto(0, 0), ...Array.from({ length: n }, () => ponto(aleatorio() * 30, aleatorio() * 30))]
    const vs = visitas(n).map((v, i) => (i === 2 || i === 11 || i === 17 ? { ...v, grupo: 'g1' } : i === 4 || i === 9 ? { ...v, grupo: 'g2' } : v))
    const r = otimizar({ visitas: vs, matriz: matrizEstimada(pts), limiteMs: 1e9 })
    const i2 = r.ordem.indexOf('v2')
    expect(r.ordem.slice(i2, i2 + 3)).toEqual(['v2', 'v11', 'v17'])
    const i4 = r.ordem.indexOf('v4')
    expect(r.ordem[i4 + 1]).toBe('v9')
    expect(r.ordem).toHaveLength(n)
  })

  it('recusa matriz com trecho sem percurso (nunca troca por linha reta em silêncio)', () => {
    const m = matrizAssimetrica(6)
    m.min[2]![3] = Infinity
    expect(() => otimizar({ visitas: visitas(5), matriz: m })).toThrow(/sem percurso/)
  })

  it('pode ser cancelada (lança OtimizacaoCancelada) e avisa o progresso até 100%', () => {
    const m = malhaSintetica(60, 3)
    let chamadas = 0
    expect(() => otimizar({ visitas: visitas(60), matriz: m.matriz, cancelado: () => ++chamadas > 50 })).toThrow(OtimizacaoCancelada)
    const prog: number[] = []
    let t = 0
    otimizar({ visitas: visitas(60), matriz: m.matriz, agora: () => (t += 7), limiteMs: 1e12, aoProgresso: (f) => prog.push(f) })
    expect(prog.length).toBeGreaterThan(3)
    expect(prog[prog.length - 1]).toBe(1)
    expect([...prog].sort((a, b) => a - b)).toEqual(prog)
  })

  it('é determinístico (mesma entrada, mesmo resultado)', () => {
    const m = malhaSintetica(80, 9)
    const a = otimizar({ visitas: visitas(80), matriz: m.matriz, limiteMs: 1e9 })
    const b = otimizar({ visitas: visitas(80), matriz: m.matriz, limiteMs: 1e9 })
    expect(a.ordem).toEqual(b.ordem)
  })
})

// Regressão de qualidade em malha viária sintética com mão única (52–58% dos pares assimétricos).
// Referência = melhor de 3 execuções longas (15.000 iterações) do próprio motor; teste.7 = algoritmo antigo
// (vizinho mais próximo + 2-opt em linha reta, começando pela 1ª parada), avaliado pelas ruas. Valores de 2026-11-25.
const REFERENCIA: Record<number, { ref: number; teste7: number }> = {
  50: { ref: 77.13, teste7: 84.45 },
  100: { ref: 96.89, teste7: 111.46 },
  250: { ref: 199.47, teste7: 234.07 },
  500: { ref: 307.42, teste7: 367.17 },
}
describe('regressão de qualidade (50, 100, 250, 500 paradas)', () => {
  for (const n of [50, 100, 250, 500]) {
    it(`${n} paradas: até 1,5% da referência e bem melhor que o teste.7`, () => {
      const m = malhaSintetica(n, n * 10 + 1)
      expect(m.assimetria).toBeGreaterThan(0.4)
      const r = otimizar({ visitas: Array.from({ length: n }, (_, i) => ({ id: String(i + 1) })), matriz: m.matriz, servicoMin: 0, limiteMs: 1e9 })
      const { ref, teste7 } = REFERENCIA[n]!
      expect(r.custo).toBeLessThanOrEqual(ref * 1.015)
      expect(r.custo).toBeLessThanOrEqual(teste7 * 0.93)
    }, 60_000)
  }
})
