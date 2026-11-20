import { useState } from 'react'
import { useIr } from '@/app/navegacao'
import { X } from 'lucide-react'
import { rotaAtual, useEstado } from '@/app/estado'
import { buscarStop, rotuloStop } from '@/core/parada'

/** Busca imediata pelo número da parada (teclado numérico). Mostra todas as partes de uma parada dividida. */
export function BuscaParada() {
  const aberta = useEstado((e) => e.buscaAberta)
  const abrir = useEstado((e) => e.abrirBusca)
  const selecionar = useEstado((e) => e.selecionar)
  const irPara = useIr()
  const [texto, setTexto] = useState('')
  if (!aberta) return null
  const achadas = texto ? buscarStop(rotaAtual().paradas, texto) : []
  const ir = (id: string) => {
    selecionar(id)
    abrir(false)
    setTexto('')
    irPara('/pedidos')
  }
  return (
    <div className="busca" onClick={() => abrir(false)}>
      <div className="busca-caixa" role="dialog" aria-label="Buscar parada" onClick={(e) => e.stopPropagation()}>
        <div className="linha">
          <h2 className="titulo cresce" style={{ fontSize: 20 }}>Buscar parada</h2>
          <button className="icone-botao" aria-label="Fechar" onClick={() => abrir(false)}>
            <X size={22} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (achadas.length === 1) ir(achadas[0]!.id)
          }}
        >
          <label className="entrada">
            <input
              autoFocus
              inputMode="numeric"
              placeholder="Número da parada (ou ?)"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-label="Número da parada"
            />
          </label>
        </form>
        <div style={{ marginTop: 8 }}>
          {texto && achadas.length === 0 && <p className="sub">Nenhuma parada com esse número.</p>}
          {achadas.map((p) => (
            <button key={p.id} className="seq-linha" onClick={() => ir(p.id)}>
              <span className="chip-stop cor-1" style={{ background: 'var(--superficie)' }}>{rotuloStop(p)}</span>
              <span className="cresce">
                {p.endereco}
                {p.parte && <span className="rotulo"> · endereço {p.parte.i} de {p.parte.n}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
