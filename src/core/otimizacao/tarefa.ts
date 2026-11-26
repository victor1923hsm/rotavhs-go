// Entrada e execução de uma otimização, igual no Worker e no modo sem Worker (testes).
// R-A: a matriz é a APROXIMADA local (linha reta × fator urbano), rotulada "aproximada, sem ruas" (R5).
// R-B: a matriz pelas ruas chega pronta (do cache ou do OpenRouteService) no campo `matriz`.
import type { Ponto } from '../geo'
import { matrizEstimada, type Matriz } from './matriz'
import { otimizar, type Criterio, type ResultadoOtimizacao, type Termino, type VisitaOtimizacao } from './motor'

export interface TarefaOtimizacao {
  visitas: VisitaOtimizacao[]
  /** Origem (posição atual), visitas na ordem, e o destino no fim quando termino é 'ponto'. Só coordenadas. */
  pontos: Ponto[]
  /** Matriz pelas ruas, quando houver (R-B). Sem ela, a aproximada é montada aqui. */
  matriz?: Matriz
  criterio?: Criterio
  termino?: Termino
  primeira?: string
  candidatas?: string[][]
  servicoMin?: number
}

export function executarTarefa(t: TarefaOtimizacao, aoProgresso: (f: number) => void, cancelado: () => boolean): ResultadoOtimizacao {
  const matriz = t.matriz ?? matrizEstimada(t.pontos)
  return otimizar({
    visitas: t.visitas, matriz, criterio: t.criterio ?? 'tempo', termino: t.termino, primeira: t.primeira,
    candidatas: t.candidatas, servicoMin: t.servicoMin, aoProgresso, cancelado,
  })
}

export type MensagemDoWorker =
  | { tipo: 'progresso'; fracao: number }
  | { tipo: 'pronto'; resultado: ResultadoOtimizacao }
  | { tipo: 'erro'; mensagem: string }
