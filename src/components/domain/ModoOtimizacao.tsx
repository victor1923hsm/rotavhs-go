// Seletor do modo de otimização (RB-1/RB-2). Rápida = motor atual (distâncias aproximadas, sem ruas, offline).
// Pelas ruas = abre a janela "Calcular pelas ruas" (JanelaRuas.tsx, sob demanda). O modo nunca muda em silêncio.
import { lazy, Suspense } from 'react'
import { useEstado } from '@/app/estado'
import { useRuas, type ModoOtimizacao } from '@/app/ruas'
import { LinkFluido } from '@/app/navegacao'

const MODOS: readonly { id: ModoOtimizacao; nome: string; desc: string }[] = [
  { id: 'rapida', nome: 'Rápida', desc: 'Motor atual · distâncias aproximadas (linha reta × 1,35), sem ruas · funciona sem internet' },
  { id: 'ruas', nome: 'Pelas ruas reais', desc: 'Mão única e conversões pelo mapa · precisa de internet, chave e sua autorização · em desenvolvimento' },
]

export function SeletorModo({ comLink = false }: { comLink?: boolean }) {
  const modo = useRuas((r) => r.modo)
  const definir = useRuas((r) => r.definirModo)
  const atual = MODOS.find((m) => m.id === modo)!
  return (
    <div style={{ marginTop: 6 }}>
      <div className="fichas" role="radiogroup" aria-label="Modo de otimização">
        {MODOS.map((m) => (
          <button key={m.id} role="radio" aria-checked={modo === m.id} className={`ficha${modo === m.id ? ' ativa' : ''}`} onClick={() => definir(m.id)}>
            {m.nome}
            {m.id === 'ruas' && <span className="ficha-selo">em desenvolvimento</span>}
          </button>
        ))}
      </div>
      <p className="rotulo" style={{ margin: '6px 2px 0', color: 'inherit' }}>
        Selecionado: <b>{atual.nome}</b> · {atual.desc}
        {comLink && (
          <>
            {' · '}
            <LinkFluido to="/estatisticas/ruas" className="gps-acao">Central de otimização</LinkFluido>
          </>
        )}
      </p>
    </div>
  )
}

/** Disparo de OTIMIZAR/Recalcular respeitando o modo escolhido. */
export function useDisparoOtimizacao() {
  const otimizar = useEstado((e) => e.otimizar)
  const recalcular = useEstado((e) => e.recalcular)
  const modo = useRuas((r) => r.modo)
  const abrirAviso = useRuas((r) => r.abrirAvisoRuas)
  return {
    otimizar: () => (modo === 'ruas' ? abrirAviso('otimizar') : void otimizar()),
    recalcular: () => (modo === 'ruas' ? abrirAviso('recalcular') : void recalcular()),
  }
}

const JanelaRuas = lazy(() => import('./JanelaRuas'))

/** A janela só é baixada quando você toca em OTIMIZAR no modo "Pelas ruas reais" (G14: JS inicial ≤ 150 KB). */
export function AvisoRuas() {
  const aviso = useRuas((r) => r.avisoRuas)
  if (!aviso) return null
  return (
    <Suspense fallback={null}>
      <JanelaRuas />
    </Suspense>
  )
}
