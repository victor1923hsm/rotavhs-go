import { useState } from 'react'
import { useIr } from '@/app/navegacao'
import { X } from 'lucide-react'
import { rotaAtual, useEstado } from '@/app/estado'
import { buscarParadas, rotuloStop } from '@/core/parada'

/** Busca imediata pelo número da parada (teclado numérico) ou pelo código do pacote. Mostra todas as partes de uma parada dividida. */
export function BuscaParada() {
  const aberta = useEstado((e) => e.buscaAberta)
  const abrir = useEstado((e) => e.abrirBusca)
  const selecionar = useEstado((e) => e.selecionar)
  const irPara = useIr()
  const [texto, setTexto] = useState('')
  const [porCodigo, setPorCodigo] = useState(false)
  if (!aberta) return null
  const busca = buscarParadas(rotaAtual().paradas, texto)
  const achadas = texto ? busca.paradas : []
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
              key={porCodigo ? 'codigo' : 'numero'}
              inputMode={porCodigo ? 'text' : 'numeric'}
              autoCapitalize={porCodigo ? 'characters' : 'off'}
              autoComplete="off"
              spellCheck={false}
              placeholder={porCodigo ? 'Código do pacote (ex.: BR26…)' : 'Número da parada (ou ?)'}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-label={porCodigo ? 'Código do pacote' : 'Número da parada'}
            />
          </label>
        </form>
        <button className="botao-texto" style={{ minHeight: 44 }} onClick={() => { setPorCodigo((v) => !v); setTexto('') }}>
          {porCodigo ? 'Buscar pelo número da parada' : 'Buscar pelo código do pacote'}
        </button>
        <div style={{ marginTop: 8 }}>
          {texto && busca.tipo === 'nada' && <p className="sub">Digite pelo menos 3 caracteres do código.</p>}
          {texto && busca.tipo !== 'nada' && achadas.length === 0 && <p className="sub">{busca.tipo === 'codigo' ? 'Nenhum pacote com esse código.' : 'Nenhuma parada com esse número.'}</p>}
          {achadas.map((p) => (
            <button key={p.id} className="seq-linha" onClick={() => ir(p.id)}>
              <span className="chip-stop cor-1" style={{ background: 'var(--superficie)' }}>{rotuloStop(p)}</span>
              <span className="cresce">
                {p.endereco}
                {p.parte && <span className="rotulo"> · endereço {p.parte.i} de {p.parte.n}</span>}
                {busca.codigos.get(p.id)?.map((c) => <span key={c} className="rotulo" style={{ display: 'block' }}>{c}</span>)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
