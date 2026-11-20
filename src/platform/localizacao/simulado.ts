// GPS SIMULADO (demonstração, P3): um LocationProvider que entrega as posições que o simulador mandar.
// Serve para ver e testar o comportamento sem sair de casa. Nada aqui usa o GPS do aparelho.

import type { ErroLocalizacao, Leitura, LocationProvider } from './tipos'

export interface Simulador {
  provedor: LocationProvider
  /** Envia uma leitura (se o app estiver observando). */
  enviar: (l: Omit<Leitura, 'em'> & { em?: number }) => void
  erro: (e: ErroLocalizacao) => void
  /** Última posição enviada (o simulador lembra só ela). */
  atual: () => Leitura | null
}

export function criarSimulador(): Simulador {
  let ler: ((l: Leitura) => void) | null = null
  let errar: ((e: ErroLocalizacao) => void) | null = null
  let ultima: Leitura | null = null
  return {
    provedor: {
      capabilities: { background: false },
      observar(_op, aoLer, aoErro) {
        ler = aoLer
        errar = aoErro
        if (ultima) aoLer({ ...ultima, em: Date.now() })
        return () => {
          ler = null
          errar = null
        }
      },
      permissao: async () => 'granted',
    },
    enviar(l) {
      ultima = { ...l, em: l.em ?? Date.now() }
      ler?.(ultima)
    },
    erro(e) {
      errar?.(e)
    },
    atual: () => ultima,
  }
}
