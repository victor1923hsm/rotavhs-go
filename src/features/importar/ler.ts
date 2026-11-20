// Lê no Worker; se o aparelho não aceitar Worker de módulo, lê na própria página.
import type { RespostaLeitura } from './leitura'

export async function lerArquivo(arquivo: File): Promise<RespostaLeitura> {
  const dados = await arquivo.arrayBuffer()
  try {
    const w = new Worker(new URL('./leitor.worker.ts', import.meta.url), { type: 'module' })
    return await new Promise<RespostaLeitura>((ok, falha) => {
      w.onmessage = (e: MessageEvent<RespostaLeitura>) => {
        ok(e.data)
        w.terminate()
      }
      w.onerror = (e) => {
        w.terminate()
        falha(e)
      }
      w.postMessage({ dados, arquivo: arquivo.name }, [dados])
    })
  } catch {
    const { lerPlanilha } = await import('./leitura')
    return lerPlanilha(await arquivo.arrayBuffer(), arquivo.name)
  }
}
