// Execução da otimização em segundo plano (Web Worker). Cancelar encerra o cálculo e não mexe na rota.
// Sem Worker (testes em Node): roda no próprio processo, em fatias, com o mesmo cancelamento.
import { executarTarefa, type MensagemDoWorker, type TarefaOtimizacao } from '@/core/otimizacao/tarefa'
import { OtimizacaoCancelada, type ResultadoOtimizacao } from '@/core/otimizacao/motor'

export interface Execucao {
  resultado: Promise<ResultadoOtimizacao>
  cancelar: () => void
}

export { OtimizacaoCancelada }

export function iniciarOtimizacao(tarefa: TarefaOtimizacao, aoProgresso: (f: number) => void = () => {}): Execucao {
  if (typeof Worker === 'undefined') {
    let cancelada = false
    const resultado = new Promise<ResultadoOtimizacao>((ok, falha) => {
      setTimeout(() => {
        try {
          if (cancelada) throw new OtimizacaoCancelada()
          ok(executarTarefa(tarefa, aoProgresso, () => cancelada))
        } catch (e) {
          falha(e)
        }
      }, 0)
    })
    return { resultado, cancelar: () => (cancelada = true) }
  }
  const w = new Worker(new URL('../core/otimizacao/otimizador.worker.ts', import.meta.url), { type: 'module' })
  let terminar: (e: unknown) => void = () => {}
  const resultado = new Promise<ResultadoOtimizacao>((ok, falha) => {
    terminar = falha
    w.onmessage = (ev: MessageEvent<MensagemDoWorker>) => {
      const m = ev.data
      if (m.tipo === 'progresso') aoProgresso(m.fracao)
      else {
        w.terminate()
        if (m.tipo === 'pronto') ok(m.resultado)
        else falha(new Error(m.mensagem))
      }
    }
    w.onerror = () => {
      w.terminate()
      falha(new Error('Falha no cálculo em segundo plano'))
    }
  })
  w.postMessage(tarefa)
  return {
    resultado,
    cancelar: () => {
      w.terminate()
      terminar(new OtimizacaoCancelada())
    },
  }
}
