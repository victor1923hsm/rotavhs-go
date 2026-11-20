import { useEffect, useRef, useState } from 'react'
import { LinkFluido } from '@/app/navegacao'
import { FileSpreadsheet, Navigation, Search } from 'lucide-react'
import { corDaParada, parada, situacao, useEstado } from '@/app/estado'
import { ChipGps } from '@/components/domain/Gps'
import type { Status } from '@/core/parada'
import { contar, textoPacotes } from '@/core/pacotes'
import { rotuloStop } from '@/core/parada'
import { linkNavegacao } from '@/core/navegar'

export function Pedidos() {
  const { ordem, status, pacotes, selecionada, fase, rota, selecionar, marcar, marcarPacote, desmarcar, abrirBusca } = useEstado()
  const [porPacoteAberto, setPorPacoteAberto] = useState(false)
  useEffect(() => setPorPacoteAberto(false), [selecionada])
  const coluna = useRef<HTMLDivElement>(null)
  const p = parada(selecionada)
  const st = status[selecionada]
  const sit = situacao(selecionada, pacotes)
  const ps = pacotes[selecionada] ?? []
  const c = contar(ps)
  const ROTULO: Record<Status, string> = { pendente: 'pendente', entregue: '✓ entregue', falha: '✕ sem sucesso' }
  const proxima = ordem.find((id) => status[id] === 'pendente')

  // Revisão 9: ao pular para a próxima, a coluna rola até a caixa dela.
  useEffect(() => {
    const el = coluna.current?.querySelector<HTMLElement>('.caixa-card.selecionada')
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [selecionada])

  return (
    <>
      <div className="ped-principal">
        <div className="linha">
          <h1 className="titulo cresce">Pedidos de hoje</h1>
          <button className="icone-botao" aria-label="Buscar parada" onClick={() => abrirBusca(true)}>
            <Search size={22} />
          </button>
        </div>
        <LinkFluido to="/importar" className="botao menta" style={{ marginTop: 14, textDecoration: 'none' }}>
          <FileSpreadsheet size={20} /> Importar rotas
        </LinkFluido>
        <p className="sub" style={{ fontSize: 12, marginTop: 6 }}>{rota.arquivo} · {rota.paradas.length} paradas (visitas) · {rota.pacotes} pacotes{rota.fonte === 'exemplo' ? ' · exemplo' : ''}</p>
        <ChipGps />

        <div className="stop-grande" aria-label={`Parada ${rotuloStop(p)}`}>
          <small>PARADA</small>
          <b>{rotuloStop(p)}</b>
        </div>
        {p.parte && <span className="selo-estado aviso" style={{ display: 'inline-block', marginTop: 8 }}>PARADA DIVIDIDA · ENDEREÇO {p.parte.i} DE {p.parte.n}</span>}
        {p.stop === null && <span className="selo-estado aviso" style={{ display: 'inline-block', marginTop: 8 }}>NÚMERO DA PARADA NÃO VEIO NA PLANILHA</span>}

        <div className="campo">
          <div className="rotulo">Pedido · {p.pacotes.length} {p.pacotes.length > 1 ? 'pacotes' : 'pacote'}</div>
          {p.pacotes.map((tn, i) => (
            <div key={`${i}:${tn}`} className="valor" style={{ fontSize: 16 }}>
              {tn}
              {p.pacotes.length > 1 && ps[i] && ps[i] !== 'pendente' && <span className="rotulo"> · {ROTULO[ps[i]!]}</span>}
            </div>
          ))}
          {p.pacotes.length > 1 && sit !== 'pendente' && <div className="rotulo" style={{ marginTop: 4, fontWeight: 600 }}>{textoPacotes(ps)}</div>}
        </div>
        <div className="campo">
          <div className="rotulo">Endereço</div>
          <div className="valor">{p.endereco}</div>
          {p.outrosEnderecos?.map((e) => (
            <div key={e} className="valor" style={{ fontSize: 15, color: 'var(--texto-suave)' }}>{e}</div>
          ))}
          <div className="rotulo" style={{ marginTop: 2 }}>{p.bairro}{p.cep ? ` · CEP ${p.cep}` : ''}{p.semNumero ? ' · casa sem número' : ''}</div>
          {p.outrosEnderecos && <span className="selo-estado" style={{ display: 'inline-block', marginTop: 6 }}>MESMO LOCAL · {p.outrosEnderecos.length + 1} ENDEREÇOS (SUA DECISÃO)</span>}
          {p.semCoordenada && <span className="selo-estado aviso" style={{ display: 'inline-block', marginTop: 6 }}>{p.coordenadaSuspeita ? 'LOCALIZAÇÃO NÃO CONFIRMADA · FORA DO MAPA' : 'SEM COORDENADA · FORA DO MAPA'}</span>}
        </div>

        <div className="linha" style={{ marginTop: 12, gap: 8 }}>
          <a className="botao contorno" style={{ height: 46, fontSize: 15, textDecoration: 'none' }} href={linkNavegacao(p, 'google')} target="_blank" rel="noopener noreferrer"><Navigation size={16} /> Maps</a>
          <a className="botao contorno" style={{ height: 46, fontSize: 15, textDecoration: 'none' }} href={linkNavegacao(p, 'waze')} target="_blank" rel="noopener noreferrer"><Navigation size={16} /> Waze</a>
        </div>

        {porPacoteAberto ? (
          <div className="parcial" role="group" aria-label="Pacote a pacote">
            <strong style={{ display: 'block', margin: '0 0 2px' }}>Pacote a pacote</strong>
            <p className="rotulo" style={{ margin: 0 }}>Cada toque é guardado na hora. A parada só sai da lista quando nenhum pacote ficar pendente.</p>
            {p.pacotes.map((tn, i) => (
              <div key={`${i}:${tn}`} className="parcial-linha">
                <div className="parcial-codigo">{tn}</div>
                <div className="parcial-escolha tres" role="radiogroup" aria-label={`Situação do pacote ${tn}`}>
                  {(['pendente', 'entregue', 'falha'] as const).map((x) => (
                    <button key={x} role="radio" aria-checked={ps[i] === x} className={`ficha ${ps[i] === x ? 'ativa' : ''}`} onClick={() => marcarPacote(selecionada, i, x)}>
                      {x === 'pendente' ? 'Pendente' : x === 'entregue' ? 'Entregue' : 'Sem sucesso'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="rotulo" style={{ margin: '10px 2px 6px', fontWeight: 600 }} aria-live="polite">{textoPacotes(ps)}</p>
            <button className="botao contorno" onClick={() => setPorPacoteAberto(false)}>Fechar</button>
          </div>
        ) : st === 'pendente' ? (
          <>
            <div className="linha" style={{ marginTop: 16, gap: 10 }}>
              <button className="botao menta" onClick={() => marcar('entregue')}>{c.pendentes < c.total ? `Entregue (${c.pendentes})` : 'Entregue'}</button>
              <button className="botao contorno" onClick={() => marcar('falha')}>{c.pendentes < c.total ? `Sem sucesso (${c.pendentes})` : 'Sem sucesso'}</button>
            </div>
            {p.pacotes.length > 1 && (
              <button className="botao-texto" onClick={() => setPorPacoteAberto(true)}>Marcar pacote a pacote ({p.pacotes.length} pacotes)</button>
            )}
          </>
        ) : (
          <div className="linha" style={{ marginTop: 16 }}>
            <strong className="cresce" style={{ fontSize: 17 }}>
              {sit === 'parcial' ? `◐ Parcial · ${textoPacotes(ps)}` : st === 'entregue' ? '✓ Entregue' : '✕ Sem sucesso'}
            </strong>
            <button className="botao contorno" style={{ width: 'auto', padding: '0 18px' }} onClick={() => desmarcar(selecionada)}>Desfazer</button>
          </div>
        )}
        {!porPacoteAberto && st !== 'pendente' && p.pacotes.length > 1 && (
          <button className="botao-texto" onClick={() => setPorPacoteAberto(true)}>Corrigir pacote a pacote</button>
        )}
      </div>

      <div className="ped-coluna" ref={coluna} aria-label="Paradas da rota">
        {ordem.map((id) => {
          const q = parada(id)
          const s = status[id]
          return (
            <button key={id} className={`caixa-card ${id === selecionada ? 'selecionada' : ''}`} onClick={() => selecionar(id)} aria-label={`Parada ${rotuloStop(q)}`}>
              <div className={`caixa cor-${corDaParada(id)}`}>
                <small>PARADA</small>
                <b>{rotuloStop(q)}</b>
              </div>
              {s === 'entregue' && <span className="pilula">{situacao(id, pacotes) === 'parcial' ? 'PARCIAL' : 'ENTREGUE'}</span>}
              {s === 'pendente' && situacao(id, pacotes) === 'em-andamento' && <span className="pilula">{contar(pacotes[id] ?? []).total - contar(pacotes[id] ?? []).pendentes}/{contar(pacotes[id] ?? []).total}</span>}
              {s === 'falha' && <span className="pilula">SEM SUCESSO</span>}
              {s === 'pendente' && fase === 'andamento' && id === proxima && <span className="pilula proxima">PRÓXIMA</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}
