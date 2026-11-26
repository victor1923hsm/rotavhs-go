// Andamento da otimização (R-A): obtendo a sua posição → calculando (em segundo plano), com Cancelar.
// Cancelar nunca mexe na rota. Falhas aparecem com o motivo e "Tentar de novo".
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { useEstado } from '@/app/estado'

export function JanelaOtimizacao() {
  const otimizacao = useEstado((e) => e.otimizacao)
  const falha = useEstado((e) => e.falhaOtimizacao)
  const cancelar = useEstado((e) => e.cancelarOtimizacao)
  const fechar = useEstado((e) => e.fecharFalhaOtimizacao)
  const otimizar = useEstado((e) => e.otimizar)
  const recalcular = useEstado((e) => e.recalcular)
  const fase = useEstado((e) => e.fase)
  if (!otimizacao && !falha) return null
  const pct = Math.round((otimizacao?.progresso ?? 0) * 100)
  return createPortal(
    <div className="janela-fundo">
      {otimizacao ? (
        <div className="confirmar janela" role="dialog" aria-modal="true" aria-label="Otimizando a rota">
          <strong style={{ fontSize: 18 }}>{otimizacao.tipo === 'otimizar' ? 'Otimizando a rota' : 'Recalculando as pendentes'}</strong>
          <p className="sub" role="status" aria-live="polite" style={{ margin: '8px 0 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Loader2 size={18} className="girando" aria-hidden="true" />
            {otimizacao.etapa === 'origem' ? 'Obtendo a sua posição atual (ponto de partida)…' : `Calculando a melhor ordem… ${pct}%`}
          </p>
          <div className="progresso-otimizacao" aria-hidden="true"><i style={{ width: `${otimizacao.etapa === 'origem' ? 4 : Math.max(4, pct)}%` }} /></div>
          <p className="rotulo" style={{ margin: '10px 0 12px' }}>A rota atual continua valendo até você ver o resultado. Cancelar não muda nada.</p>
          <button className="botao contorno" onClick={cancelar}>Cancelar</button>
        </div>
      ) : (
        <div className="confirmar janela" role="alertdialog" aria-modal="true" aria-label="Não foi possível otimizar">
          <strong style={{ fontSize: 18 }}>Não foi possível otimizar</strong>
          <p className="sub" style={{ margin: '6px 0 12px' }}>{falha}</p>
          <div className="linha">
            <button className="botao" onClick={() => { fechar(); void (fase === 'andamento' ? recalcular() : otimizar()) }}>Tentar de novo</button>
            <button className="botao contorno" onClick={fechar}>Fechar</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
