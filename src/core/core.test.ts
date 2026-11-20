import { describe, expect, it } from 'vitest'
import { custoEstimado } from './custo'
import { duracao, lerNumero, numero, reais } from './formato'
import { estimadaKm, FATOR_URBANO, linhaRetaKm, minutosEstimados } from './geo'
import { ordemEstimada } from './ordem'
import { buscarStop, rotuloStop, type Parada } from './parada'
import { percursoEstimadoKm } from './geo'

describe('distâncias', () => {
  it('linha reta de 1° de latitude ≈ 111 km', () => {
    expect(linhaRetaKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.19, 1)
  })
  it('estimada = linha reta × fator urbano 1,35', () => {
    const a = { lat: -16.69, lon: -49.26 }
    const b = { lat: -16.70, lon: -49.27 }
    expect(estimadaKm(a, b)).toBeCloseTo(linhaRetaKm(a, b) * FATOR_URBANO, 10)
  })
  it('tempo estimado: 20 km/h + 1,5 min por parada', () => {
    expect(minutosEstimados(10, 20)).toBe(60)
  })
})

describe('custo estimado (centavos)', () => {
  it('124 km, 10 km/L, R$ 6,19 → 12,4 L e R$ 76,76', () => {
    const c = custoEstimado(124, 18, { combustivel: 'Gasolina', precoCentavos: 619, consumoKmL: 10 })
    expect(c.litros).toBeCloseTo(12.4, 10)
    expect(c.totalCentavos).toBe(7676)
    expect(c.porKmCentavos).toBe(62)
    expect(c.porParadaCentavos).toBe(426)
    expect(Number.isInteger(c.totalCentavos)).toBe(true)
  })
  it('consumo zero ou inválido não gera custo infinito', () => {
    const c = custoEstimado(50, 10, { combustivel: 'Etanol', precoCentavos: 450, consumoKmL: 0 })
    expect(c.totalCentavos).toBe(0)
  })
})

describe('formato pt-BR', () => {
  it('reais e números', () => {
    expect(reais(124800)).toBe('R$ 1.248,00')
    expect(numero(12.84)).toBe('12,8')
    expect(duracao(91)).toBe('1 h 31 min')
    expect(duracao(39)).toBe('39 min')
  })
  it('lê números digitados', () => {
    expect(lerNumero('6,19')).toBeCloseTo(6.19)
    expect(lerNumero('R$ 1.234,50')).toBeCloseTo(1234.5)
    expect(lerNumero('10.5')).toBeCloseTo(10.5)
    expect(lerNumero('abc')).toBeNaN()
  })
})

const P = (id: string, stop: number | null, lat: number, lon: number): Parada => ({
  id, stop, lat, lon, pacotes: [id], endereco: id, bairro: '', semNumero: false,
})

describe('Stop', () => {
  const ps = [P('a', 12, 0, 0), P('b', 12, 0, 0.01), P('c', null, 0, 0.02), P('d', 3, 0, 0.03)]
  it('"?" quando o Stop não veio, nunca 0', () => {
    expect(rotuloStop(ps[2]!)).toBe('?')
  })
  it('busca pelo Stop acha todas as partes de um Stop dividido', () => {
    expect(buscarStop(ps, '12').map((p) => p.id)).toEqual(['a', 'b'])
    expect(buscarStop(ps, '?').map((p) => p.id)).toEqual(['c'])
    expect(buscarStop(ps, '99')).toEqual([])
    expect(buscarStop(ps, 'x')).toEqual([])
  })
})

describe('ordem estimada', () => {
  const linha = [P('1', 1, 0, 0), P('2', 2, 0, 0.03), P('3', 3, 0, 0.01), P('4', 4, 0, 0.02)]
  it('reordena sem criar, perder ou duplicar paradas', () => {
    const ids = ordemEstimada(linha, null)
    expect([...ids].sort()).toEqual(['1', '2', '3', '4'])
  })
  it('nunca fica pior que a ordem original pelo modelo', () => {
    const ids = ordemEstimada(linha, null)
    const nova = ids.map((id) => linha.find((p) => p.id === id)!)
    expect(percursoEstimadoKm(nova)).toBeLessThanOrEqual(percursoEstimadoKm(linha) + 1e-9)
  })
})
