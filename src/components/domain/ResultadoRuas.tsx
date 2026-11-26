// Resultado pelas ruas esperando a sua decisão (RB-3), carregado SOB DEMANDA. A rota anterior continua valendo até
// "Aplicar nova ordem". Ordem atual × nova pela MESMA matriz e nas mesmas condições (origem, término, paradas).
// Resultado de servidor de TESTE é rotulado como tal: não é roteirização real.
import { createPortal } from 'react-dom'
import { parada, useEstado, type ResumoCalculo } from '@/app/estado'
import { LinkFluido } from '@/app/navegacao'
import { numero } from '@/core/formato'
import { ChipParada } from './ChipParada'

export const NOME_TERMINO: Record<string, string> = { livre: 'Livre (onde a última parada estiver)', partida: 'Voltar ao ponto de partida', parada: 'Numa parada escolhida' }
export const NOME_ORIGEM: Record<string, string> = { gps: 'Sua posição atual (GPS, no momento do cálculo)', teste: 'Posição de teste (rota de exemplo)' }
export const MOTIVO: Record<string, string> = {
  'sem-via': 'sem rua até o raio tentado',
  confirmar: 'sem rua até 200 m (aguarda a sua confirmação para procurar mais longe)',
  'sem-percurso': 'sem percurso pelas ruas de/para as outras',
}

/** Rótulo do tipo de distância: nunca apresenta simulação ou aproximação como roteirização real. */
export function rotuloDistancias(r: ResumoCalculo): string {
  if (r.tipoMatriz !== 'ruas') return 'aproximado (linha reta × 1,35, sem ruas)'
  return r.simulado ? 'pelas ruas — SERVIDOR DE TESTE (respostas controladas, não é roteirização real)' : `pelas ruas (${r.fonte ?? 'provedor'}, modelo)`
}

export function Comparacao({ r }: { r: ResumoCalculo }) {
  const antes = r.minDeslocAntes ?? r.minAntes
  const depois = r.minDesloc ?? r.min
  return (
    <div className="ruas-comparacao" role="group" aria-label="Comparação entre a ordem atual e a nova">
      <div className="linha" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>Ordem atual</span><span>Nova ordem</span></div>
      <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
        <span style={{ fontSize: 20 }}>{numero(r.kmAntes)} km · {numero(antes, 0)} min</span>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{numero(r.km)} km · {numero(depois, 0)} min</span>
      </div>
      <div className="ruas-comparacao-rodape">
        {r.melhorou ? `−${numero(Math.max(0, r.kmAntes - r.km))} km · −${numero(Math.max(0, antes - depois), 0)} min de deslocamento` : 'A ordem atual já é a melhor nas mesmas condições'}
        {' · '}{rotuloDistancias(r)}
      </div>
    </div>
  )
}

export default function ResultadoRuas() {
  const pend = useEstado((e) => e.resultadoRuas)
  const aplicar = useEstado((e) => e.aplicarResultadoRuas)
  const manter = useEstado((e) => e.manterOrdemAtual)
  if (!pend) return null
  const r = pend.resumo
  const ids = pend.pendNova.filter((id) => !pend.motivos.some((m) => m.id === id))
  return createPortal(
    <div className="janela-fundo">
      <div className="confirmar janela ruas-resultado" role="dialog" aria-modal="true" aria-label="Resultado pelas ruas">
        <div className="linha" style={{ gap: 8 }}>
          <strong className="cresce" style={{ fontSize: 18 }}>{pend.tipo === 'recalcular' ? 'Pendentes recalculadas' : 'Rota calculada'}</strong>
          <span className={`selo-estado ${r.simulado ? 'aviso' : ''}`}>{r.simulado ? 'TESTE' : 'PELAS RUAS'}</span>
        </div>
        {r.simulado && (
          <p className="ruas-aviso-teste" role="note">
            Respostas CONTROLADAS de um servidor de teste local: os números servem só para testar o app. <b>Não é roteirização real.</b>
          </p>
        )}
        <dl className="ruas-dados">
          <div><dt>Partida</dt><dd>{NOME_ORIGEM[pend.origem] ?? pend.origem}</dd></div>
          <div><dt>Destino final</dt><dd>{NOME_TERMINO[r.termino ?? 'livre']}</dd></div>
          <div><dt>Paradas no cálculo</dt><dd>{ids.length}{pend.motivos.length ? ` · ${pend.motivos.length} em revisão (ficam na posição anterior)` : ''}{r.corrigidas ? ` · ${r.corrigidas} com localização corrigida por você` : ''}</dd></div>
          <div><dt>Pedidos ao provedor</dt><dd>{r.pedidos ? `${r.pedidos.matriz} de distâncias · ${r.pedidos.encaixe} de encaixe${r.pedidos.divisoes ? ` (${r.pedidos.divisoes} para isolar respostas vazias)` : ''}` : '—'}</dd></div>
        </dl>
        <Comparacao r={r} />
        {r.melhorou && (
          <>
            <p className="rotulo" style={{ margin: '10px 0 6px', color: 'inherit' }}>Nova sequência (primeiras paradas)</p>
            <div className="ruas-chips">{ids.slice(0, 12).map((id) => <ChipParada key={id} id={id} />)}{ids.length > 12 && <span className="rotulo">+{ids.length - 12}</span>}</div>
          </>
        )}
        {pend.motivos.length > 0 && (
          <p className="rotulo" style={{ margin: '10px 0 0', color: 'inherit' }}>
            Em revisão: {pend.motivos.slice(0, 6).map((m) => `${parada(m.id).stop ?? '?'} (${MOTIVO[m.motivo]})`).join(' · ')}
            {pend.motivos.length > 6 ? ` · +${pend.motivos.length - 6}` : ''}{' · '}
            <LinkFluido to="/rotas/revisao" className="gps-acao" onClick={manter}>Manter a ordem atual e revisar as paradas</LinkFluido>
          </p>
        )}
        <p className="rotulo" style={{ margin: '10px 0 12px', color: 'inherit' }}>
          Minutos = só o deslocamento (sem o tempo parado em cada entrega). Concluídas não mudam. Nada muda até você tocar em aplicar.
        </p>
        <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
          {r.melhorou ? (
            <>
              <button className="botao" onClick={aplicar}>Aplicar nova ordem</button>
              <button className="botao contorno" onClick={manter}>Manter a ordem atual</button>
            </>
          ) : (
            <button className="botao" onClick={manter}>Fechar</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
