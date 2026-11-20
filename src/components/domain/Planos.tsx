// Planos guardados (Etapa 3): a ordem da SPX + os 5 mais recentes. Comparar e voltar para um plano anterior,
// sempre com confirmação. As marcações dos pacotes não mudam. Nenhum algoritmo novo aqui (Etapas 5/6).
import { useState } from 'react'
import { resumoDaOrdem, useEstado } from '@/app/estado'
import { numero } from '@/core/formato'

const NOME = { spx: 'Ordem original da SPX', otimizada: 'Otimizada', sugestao: 'Sugestão aceita' } as const
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function Planos() {
  const { planos, planoAtivo, restaurarPlano, ordem } = useEstado()
  const [confirmar, setConfirmar] = useState<string | null>(null)
  if (planos.length < 2) return null
  const atualKm = resumoDaOrdem(ordem).km
  const lista = [...planos].sort((a, b) => (a.tipo === 'spx' ? -1 : b.tipo === 'spx' ? 1 : b.criadoEm - a.criadoEm))
  return (
    <details className="planos">
      <summary>Planos guardados ({planos.length})</summary>
      <p className="rotulo" style={{ margin: '0 0 6px' }}>Distâncias estimadas a partir do ponto de partida atual. Voltar para um plano só muda a ordem; as marcações continuam.</p>
      {lista.map((p) => {
        const km = resumoDaOrdem(p.ordem).km
        return (
          <div key={p.id} className="plano-linha">
            <div className="cresce">
              <div style={{ fontWeight: 600 }}>{NOME[p.tipo]}{p.tipo !== 'spx' ? ` · ${hora(p.criadoEm)}` : ''}</div>
              <div className="rotulo">{numero(km)} km est.{p.id !== planoAtivo && Math.abs(km - atualKm) >= 0.05 ? ` (${km > atualKm ? '+' : '−'}${numero(Math.abs(km - atualKm))} km)` : ''}</div>
            </div>
            {p.id === planoAtivo ? (
              <span className="selo-estado">EM USO</span>
            ) : confirmar === p.id ? (
              <div className="linha" style={{ gap: 4 }}>
                <button className="gps-acao" onClick={() => { restaurarPlano(p.id); setConfirmar(null) }}>Trocar</button>
                <button className="gps-acao" onClick={() => setConfirmar(null)}>Cancelar</button>
              </div>
            ) : (
              <button className="gps-acao" onClick={() => setConfirmar(p.id)}>Usar este plano</button>
            )}
          </div>
        )
      })}
    </details>
  )
}
