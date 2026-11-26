// Seletor do modo de otimização e aviso "pelas ruas em desenvolvimento" (RB-1).
// Rápida = motor atual (distâncias aproximadas, sem ruas, offline). Pelas ruas = ainda não calcula: tocar em OTIMIZAR
// abre o aviso, que oferece a otimização rápida ou Cancelar (nada muda). Nenhum resultado simulado.
import { createPortal } from 'react-dom'
import { useEstado } from '@/app/estado'
import { useRuas, type ModoOtimizacao } from '@/app/ruas'
import { LinkFluido } from '@/app/navegacao'

const MODOS: readonly { id: ModoOtimizacao; nome: string; desc: string }[] = [
  { id: 'rapida', nome: 'Rápida', desc: 'Motor atual · distâncias aproximadas (linha reta × 1,35), sem ruas · funciona sem internet' },
  { id: 'ruas', nome: 'Pelas ruas reais', desc: 'Mão única e conversões pelo mapa · em desenvolvimento: ainda não calcula' },
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

export function AvisoRuas() {
  const aviso = useRuas((r) => r.avisoRuas)
  const fechar = useRuas((r) => r.fecharAvisoRuas)
  const definirModo = useRuas((r) => r.definirModo)
  const otimizar = useEstado((e) => e.otimizar)
  const recalcular = useEstado((e) => e.recalcular)
  const avisar = useEstado((e) => e.avisar)
  if (!aviso) return null
  return createPortal(
    <div className="janela-fundo">
      <div className="confirmar janela" role="alertdialog" aria-modal="true" aria-label="Cálculo pelas ruas em desenvolvimento">
        <strong style={{ fontSize: 18 }}>Cálculo pelas ruas em desenvolvimento</strong>
        <p className="sub" style={{ margin: '6px 0 12px' }}>
          Esta versão ainda não calcula rotas pelas ruas reais e não envia coordenadas. Você pode usar a otimização <b>rápida</b> (distâncias aproximadas, sem ruas) ou cancelar: a rota continua como está.
        </p>
        <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button
            className="botao"
            onClick={() => {
              fechar()
              definirModo('rapida')
              void (aviso === 'recalcular' ? recalcular() : otimizar())
            }}
          >
            Usar a otimização rápida
          </button>
          <button
            className="botao contorno"
            onClick={() => {
              fechar()
              avisar('Nada mudou · a rota continua como estava')
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
