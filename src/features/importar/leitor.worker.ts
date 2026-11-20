// Worker da leitura (G14): a planilha é lida fora da tela; o Worker é encerrado ao terminar.
import { lerPlanilha } from './leitura'

self.onmessage = async (e: MessageEvent<{ dados: ArrayBuffer; arquivo: string }>) => {
  self.postMessage(await lerPlanilha(e.data.dados, e.data.arquivo))
}
