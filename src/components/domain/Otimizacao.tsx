// Andamento da otimização: obtendo a sua posição → (pelas ruas: encaixe → distâncias) → calculando, com Cancelar.
// Cancelar nunca mexe na rota. Falhas aparecem com o motivo; no modo pelas ruas, a janela oferece a otimização
// rápida (nunca troca sozinha), "Tentar de novo" e Fechar.
import { createPortal } from 'react-dom'
import { Check, Loader2 } from 'lucide-react'
import { useEstado, type EtapaOtimizacao } from '@/app/estado'
import { useLocalizacao } from '@/app/localizacao'
import { useRuas } from '@/app/ruas'

const ETAPAS_RUAS: readonly { id: EtapaOtimizacao; nome: string }[] = [
  { id: 'origem', nome: 'Sua posição atual' },
  { id: 'encaixe', nome: 'Encaixe das paradas nas ruas' },
  { id: 'matriz', nome: 'Distâncias e tempos pelas ruas' },
  { id: 'calculando', nome: 'Melhor ordem' },
]

export function JanelaOtimizacao() {
  const otimizacao = useEstado((e) => e.otimizacao)
  const falha = useEstado((e) => e.falhaOtimizacao)
  const falhaModo = useEstado((e) => e.falhaModo)
  const cancelar = useEstado((e) => e.cancelarOtimizacao)
  const fechar = useEstado((e) => e.fecharFalhaOtimizacao)
  const otimizar = useEstado((e) => e.otimizar)
  const recalcular = useEstado((e) => e.recalcular)
  const fase = useEstado((e) => e.fase)
  const abrirRuas = useRuas((r) => r.abrirAvisoRuas)
  // Enquanto a explicação da localização está na tela, ela fica sozinha (nada por cima dos botões dela).
  const explicando = useLocalizacao((l) => l.explicando)
  if ((!otimizacao && !falha) || (otimizacao && explicando)) return null
  const pct = Math.round((otimizacao?.progresso ?? 0) * 100)
  const ruas = otimizacao?.modo === 'ruas'
  const atual = ETAPAS_RUAS.findIndex((x) => x.id === otimizacao?.etapa)
  const tipo = fase === 'andamento' ? 'recalcular' : 'otimizar'
  return createPortal(
    <div className="janela-fundo">
      {otimizacao ? (
        <div className="confirmar janela" role="dialog" aria-modal="true" aria-label="Otimizando a rota">
          <strong style={{ fontSize: 18 }}>
            {otimizacao.tipo === 'otimizar' ? 'Otimizando a rota' : 'Recalculando as pendentes'}
            {ruas ? ' pelas ruas' : ''}
          </strong>
          {ruas ? (
            <ol className="etapas-ruas" aria-label="Etapas do cálculo">
              {ETAPAS_RUAS.map((x, k) => (
                <li key={x.id} className={k < atual ? 'feita' : k === atual ? 'atual' : ''}>
                  {k < atual ? <Check size={16} aria-hidden="true" /> : k === atual ? <Loader2 size={16} className="girando" aria-hidden="true" /> : <span className="ponto" aria-hidden="true" />}
                  <span>{x.nome}{k === atual && (otimizacao.detalhe || x.id === 'calculando') ? ` · ${x.id === 'calculando' ? `${pct}%` : otimizacao.detalhe}` : ''}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="sub" role="status" aria-live="polite" style={{ margin: '8px 0 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Loader2 size={18} className="girando" aria-hidden="true" />
              {otimizacao.etapa === 'origem' ? 'Obtendo a sua posição atual (ponto de partida)…' : `Calculando a melhor ordem… ${pct}%`}
            </p>
          )}
          <div className="progresso-otimizacao" aria-hidden="true"><i style={{ width: `${otimizacao.etapa === 'origem' ? 4 : Math.max(4, pct)}%` }} /></div>
          <p className="rotulo" role={ruas ? 'status' : undefined} style={{ margin: '10px 0 12px' }}>A rota atual continua valendo até você ver o resultado. Cancelar não muda nada.</p>
          <button className="botao contorno" onClick={cancelar}>Cancelar</button>
        </div>
      ) : (
        <div className="confirmar janela" role="alertdialog" aria-modal="true" aria-label="Não foi possível otimizar">
          <strong style={{ fontSize: 18 }}>{falhaModo === 'ruas' ? 'Não foi possível calcular pelas ruas' : 'Não foi possível otimizar'}</strong>
          <p className="sub" style={{ margin: '6px 0 12px' }}>{falha}</p>
          <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
            {falhaModo === 'ruas' ? (
              <>
                <button className="botao" onClick={() => { fechar(); void (tipo === 'recalcular' ? recalcular() : otimizar()) }}>Usar a otimização rápida</button>
                <button className="botao contorno" onClick={() => { fechar(); abrirRuas(tipo) }}>Tentar de novo</button>
              </>
            ) : (
              <button className="botao" onClick={() => { fechar(); void (tipo === 'recalcular' ? recalcular() : otimizar()) }}>Tentar de novo</button>
            )}
            <button className="botao contorno" onClick={fechar}>Fechar</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
