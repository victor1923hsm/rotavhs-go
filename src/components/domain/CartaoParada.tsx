import { useIr } from '@/app/navegacao'
import { Navigation } from 'lucide-react'
import { corDaParada, parada, useEstado } from '@/app/estado'
import { linkNavegacao } from '@/core/navegar'
import { rotuloStop } from '@/core/parada'

/** Parada selecionada: número, endereço e os botões Navegar (Google Maps / Waze) e Abrir pedido. */
export function CartaoParada({ id, aoAbrir }: { id: string; aoAbrir?: () => void }) {
  const ir = useIr()
  const status = useEstado((e) => e.status[id])
  const p = parada(id)
  return (
    <div className="cartao-parada" aria-label={`Parada ${rotuloStop(p)} selecionada`}>
      <div className="linha">
        <span className={`chip-stop cor-${corDaParada(id)}`} style={{ minWidth: 44, height: 44, fontSize: 20 }}>{rotuloStop(p)}</span>
        <div className="cresce">
          <div style={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{p.endereco}</div>
          <div className="rotulo">
            {p.pacotes.length} {p.pacotes.length > 1 ? 'pacotes' : 'pacote'}
            {status === 'entregue' ? ' · entregue' : status === 'falha' ? ' · sem sucesso' : ''}
            {p.semCoordenada ? (p.coordenadaSuspeita ? ' · localização não confirmada (navega pelo endereço)' : ' · sem coordenada (navega pelo endereço)') : ''}
          </div>
        </div>
      </div>
      <div className="linha" style={{ marginTop: 10, gap: 8 }}>
        <a className="botao menta" style={{ textDecoration: 'none', fontSize: 15 }} href={linkNavegacao(p, 'google')} target="_blank" rel="noopener noreferrer">
          <Navigation size={18} /> Google Maps
        </a>
        <a className="botao menta" style={{ textDecoration: 'none', fontSize: 15 }} href={linkNavegacao(p, 'waze')} target="_blank" rel="noopener noreferrer">
          <Navigation size={18} /> Waze
        </a>
      </div>
      <button
        className="botao contorno"
        style={{ marginTop: 8, height: 46, fontSize: 15 }}
        onClick={() => {
          aoAbrir?.()
          ir('/pedidos')
        }}
      >
        Abrir pedido
      </button>
    </div>
  )
}
