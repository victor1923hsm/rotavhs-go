import { describe, expect, it } from 'vitest'
import { semanaFinanceira } from './financeiro'
import type { ResumoRota } from './resumo'

const base: ResumoRota = {
  rotaId: 'r', arquivo: '', fonte: 'planilha', motivo: 'finalizada', iniciadaEm: null, finalizadaEm: 0,
  paradas: 10, pacotes: 12, entregues: 9, falhas: 1, pendentes: 0, pacotesEntregues: 11, km: 20.4, kmTipo: 'estimado',
  minutosEstimados: 60, combustivel: 'Gasolina', litros: 2, custoCentavos: 1238,
}
const dia = (d: number, h = 12) => new Date(2026, 10, d, h).getTime()

describe('semanaFinanceira', () => {
  it('soma as entregas por dia nos últimos 7 dias e inclui a rota de hoje', () => {
    const s = semanaFinanceira(
      [
        { ...base, rotaId: 'a', finalizadaEm: dia(24) },
        { ...base, rotaId: 'b', finalizadaEm: dia(19), pacotesEntregues: 4 },
        { ...base, rotaId: 'velha', finalizadaEm: dia(10) },
      ],
      dia(25, 9),
      { entregues: 3, custoCentavos: 500 },
    )
    expect(s.dias).toHaveLength(7)
    expect(s.dias[6]).toMatchObject({ entregas: 3, hoje: true })
    expect(s.dias[5]!.entregas).toBe(11)
    expect(s.dias[0]!.entregas).toBe(4)
    expect(s.totalEntregas).toBe(18)
    expect(s.custoCentavos).toBe(1238 * 2 + 500)
  })
  it('lista as 3 rotas mais recentes sem endereço nem código', () => {
    const s = semanaFinanceira([1, 2, 3, 4].map((d) => ({ ...base, rotaId: `r${d}`, finalizadaEm: dia(20 + d) })), dia(25), { entregues: 0, custoCentavos: 0 })
    expect(s.recentes.map((r) => r.id)).toEqual(['r4', 'r3', 'r2'])
    expect(s.recentes[0]).toMatchObject({ data: 'ter. 24/11', entregas: 11, km: '20,4', custoCentavos: 1238 })
  })
  it('usa as visitas entregues em resumos antigos sem contagem de pacotes', () => {
    const { pacotesEntregues: _, ...antigo } = base
    const s = semanaFinanceira([{ ...antigo, finalizadaEm: dia(25, 8) }], dia(25, 9), { entregues: 0, custoCentavos: 0 })
    expect(s.dias[6]!.entregas).toBe(9)
  })
})
