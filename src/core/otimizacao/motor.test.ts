import { describe, expect, it } from 'vitest'
import { matrizEstimada, matrizValida, type Matriz } from './matriz'
import { otimizar, type Criterio } from './motor'
import type { Ponto } from '../geo'

// Dados FICTÍCIOS: pontos numa grade em torno de um centro qualquer.
const C = { lat: -16.68, lon: -49.25 }
const ponto = (dx: number, dy: number): Ponto => ({ lat: C.lat + dy * 0.001, lon: C.lon + dx * 0.001 })
let semente = 7
const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647)
const visitas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `v${i}` }))

describe('motor de otimização (F2)', () => {
  it('nunca devolve ordem pior que a atual e não perde, duplica nem cria visitas', () => {
    for (let r = 0; r < 20; r++) {
      const n = 5 + Math.floor(aleatorio() * 30)
      const pts = [C, ...Array.from({ length: n }, () => ponto(aleatorio() * 40, aleatorio() * 40))]
      for (const criterio of ['tempo', 'distancia', 'combustivel', 'inteligente'] as Criterio[]) {
        const res = otimizar({ visitas: visitas(n), comOrigem: true, matriz: matrizEstimada(pts), criterio })
        expect(res.custo).toBeLessThanOrEqual(res.custoAtual + 1e-9)
        expect([...res.ordem].sort()).toEqual(visitas(n).map((v) => v.id).sort())
      }
    }
  })

  it('melhora uma ordem em zigue-zague numa rua reta, partindo da posição atual', () => {
    const xs = [9, 1, 7, 3, 5, 2, 8, 4, 6]
    const pts = [ponto(0, 0), ...xs.map((x) => ponto(x, 0))]
    const res = otimizar({ visitas: visitas(xs.length), comOrigem: true, matriz: matrizEstimada(pts), criterio: 'distancia' })
    expect(res.melhorou).toBe(true)
    expect(res.ordem.map((id) => xs[Number(id.slice(1))])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(res.km).toBeLessThan(res.kmAtual)
  })

  it('respeita primeira e última fixadas', () => {
    const pts = [ponto(0, 0), ...[1, 2, 3, 4, 5, 6].map((x) => ponto(x, 0))]
    const res = otimizar({ visitas: visitas(6), comOrigem: true, matriz: matrizEstimada(pts), criterio: 'distancia', fixas: { primeira: 'v4', ultima: 'v0' } })
    expect(res.ordem[0]).toBe('v4')
    expect(res.ordem[res.ordem.length - 1]).toBe('v0')
  })

  it('mantém juntas as visitas do mesmo endereço confirmado (sem uni-las)', () => {
    const pts = [ponto(0, 0), ponto(1, 0), ponto(9, 0), ponto(1.01, 0), ponto(5, 0)]
    const vs = [{ id: 'a' , grupo: 'g1' }, { id: 'b' }, { id: 'c', grupo: 'g1' }, { id: 'd' }]
    const res = otimizar({ visitas: vs, comOrigem: true, matriz: matrizEstimada(pts), criterio: 'distancia' })
    const ia = res.ordem.indexOf('a')
    expect(res.ordem[ia + 1]).toBe('c')
    expect(res.ordem).toHaveLength(4)
  })

  it('usa matriz assimétrica (mão única): escolhe o sentido barato', () => {
    // Origem 0; visitas 1 e 2. 1→2 é barato, 2→1 é caro (contramão obriga a dar a volta).
    const km = [
      [0, 1, 1],
      [1, 0, 1],
      [1, 9, 0],
    ]
    const m: Matriz = { km, min: km.map((l) => l.map((x) => x * 3)), tipo: 'ruas' }
    expect(matrizValida(m, 3)).toBe(true)
    const res = otimizar({ visitas: [{ id: 'B' }, { id: 'A' }], comOrigem: true, matriz: m, criterio: 'distancia' })
    // Nós: 1 = B, 2 = A. Ordem atual B→A custa 1 + 1 = 2; A→B custa 1 + 9 = 10.
    expect(res.ordem).toEqual(['B', 'A'])
    expect(res.melhorou).toBe(false)
  })

  it('critérios diferentes podem dar ordens diferentes (tempo × distância)', () => {
    // Visita X perto em km mas lenta (rua congestionada); Y mais longe porém rápida.
    const km = [
      [0, 1, 3, 4],
      [1, 0, 3, 3],
      [3, 3, 0, 1],
      [4, 3, 1, 0],
    ]
    const min = [
      [0, 30, 6, 8],
      [30, 0, 6, 6],
      [6, 6, 0, 2],
      [8, 6, 2, 0],
    ]
    const m: Matriz = { km, min, tipo: 'ruas' }
    const vs = visitas(3)
    const porKm = otimizar({ visitas: vs, comOrigem: true, matriz: m, criterio: 'distancia' })
    const porMin = otimizar({ visitas: vs, comOrigem: true, matriz: m, criterio: 'tempo' })
    expect(porKm.ordem[0]).toBe('v0')
    expect(porMin.ordem[0]).not.toBe('v0')
  })

  it('é determinístico e rejeita matriz de tamanho errado', () => {
    const pts = [C, ...Array.from({ length: 25 }, () => ponto(aleatorio() * 20, aleatorio() * 20))]
    const a = otimizar({ visitas: visitas(25), comOrigem: true, matriz: matrizEstimada(pts), criterio: 'tempo' })
    const b = otimizar({ visitas: visitas(25), comOrigem: true, matriz: matrizEstimada(pts), criterio: 'tempo' })
    expect(a.ordem).toEqual(b.ordem)
    expect(() => otimizar({ visitas: visitas(3), comOrigem: true, matriz: matrizEstimada(pts.slice(0, 3)), criterio: 'tempo' })).toThrow()
  })

  it('150 visitas: termina dentro do limite de tempo e melhora uma ordem embaralhada', () => {
    const pts = [C, ...Array.from({ length: 150 }, () => ponto(aleatorio() * 60, aleatorio() * 60))]
    const t0 = performance.now()
    const res = otimizar({ visitas: visitas(150), comOrigem: true, matriz: matrizEstimada(pts), criterio: 'tempo', limiteMs: 600 })
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(2500)
    expect(res.custo).toBeLessThan(res.custoAtual * 0.6)
  })
})
