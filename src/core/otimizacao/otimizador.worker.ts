// Worker da otimização: o cálculo roda fora da tela (a interface não trava). Cancelar = encerrar o Worker.
// Recebe só coordenadas e ids internos; não grava, não envia e não registra nada.
import { executarTarefa, type MensagemDoWorker, type TarefaOtimizacao } from './tarefa'

const enviar = (m: MensagemDoWorker) => (self as unknown as { postMessage: (m: MensagemDoWorker) => void }).postMessage(m)

self.onmessage = (ev: MessageEvent<TarefaOtimizacao>) => {
  try {
    const resultado = executarTarefa(ev.data, (fracao) => enviar({ tipo: 'progresso', fracao }), () => false)
    enviar({ tipo: 'pronto', resultado })
  } catch (e) {
    // Só o tipo/mensagem do erro, sem dados da rota.
    enviar({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro interno' })
  }
}
