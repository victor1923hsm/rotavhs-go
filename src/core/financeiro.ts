// Números da aba Financeiro (V15). Funções puras: só usam os resumos guardados (sem endereços nem códigos)
// e os números da rota em andamento. Dinheiro em centavos inteiros; custo sempre ESTIMADO.
import type { ResumoRota } from './resumo'

const DIA_MS = 86_400_000
const INICIAIS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const
const NOMES = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'] as const

export interface DiaFinanceiro {
  rotulo: string
  entregas: number
  hoje: boolean
}

export interface RotaRecente {
  id: string
  data: string
  entregas: number
  km: string
  custoCentavos: number
}

export interface SemanaFinanceira {
  dias: DiaFinanceiro[]
  totalEntregas: number
  custoCentavos: number
  recentes: RotaRecente[]
}

/** Meia-noite local do dia de `t`. */
function inicioDoDia(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const entregasDoResumo = (r: ResumoRota) => r.pacotesEntregues ?? r.entregues

/**
 * Últimos 7 dias (o último é hoje). Rotas substituídas também contam (as entregas aconteceram).
 * `atual` = números da rota em andamento, somados a hoje.
 */
export function semanaFinanceira(
  resumos: readonly ResumoRota[],
  agora: number,
  atual: { entregues: number; custoCentavos: number },
): SemanaFinanceira {
  const hoje0 = inicioDoDia(agora)
  const inicio = hoje0 - 6 * DIA_MS
  const dias: DiaFinanceiro[] = []
  for (let i = 0; i < 7; i++) {
    const t = inicio + i * DIA_MS
    dias.push({ rotulo: INICIAIS[new Date(t).getDay()]!, entregas: 0, hoje: i === 6 })
  }
  let custo = 0
  for (const r of resumos) {
    if (r.finalizadaEm < inicio || r.finalizadaEm >= hoje0 + DIA_MS) continue
    const i = Math.floor((inicioDoDia(r.finalizadaEm) - inicio) / DIA_MS)
    if (i < 0 || i > 6) continue
    dias[i]!.entregas += entregasDoResumo(r)
    custo += Math.max(0, Math.round(r.custoCentavos))
  }
  dias[6]!.entregas += Math.max(0, atual.entregues)
  custo += Math.max(0, Math.round(atual.custoCentavos))
  const recentes = [...resumos]
    .sort((a, b) => b.finalizadaEm - a.finalizadaEm)
    .slice(0, 3)
    .map((r) => {
      const d = new Date(r.finalizadaEm)
      return {
        id: r.rotaId,
        data: `${NOMES[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        entregas: entregasDoResumo(r),
        km: r.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
        custoCentavos: Math.max(0, Math.round(r.custoCentavos)),
      }
    })
  return { dias, totalEntregas: dias.reduce((n, d) => n + d.entregas, 0), custoCentavos: custo, recentes }
}
