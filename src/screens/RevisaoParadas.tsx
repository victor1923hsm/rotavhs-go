// Revisão das paradas que não puderam ser associadas às ruas (RB-3). Carregada SOB DEMANDA.
// Você escolhe a parada (na lista ou no mapa), ajusta a localização usada no cálculo (tocando/arrastando no mapa,
// pelos botões de direção ou pela sua posição atual), vê a coordenada original e a corrigida, CONFIRMA antes de usar,
// pode restaurar a original e pede o recálculo dos trechos afetados. Também pode autorizar procurar rua mais longe
// (> 200 m) ou posicionar a parada na sequência à mão.
// Nada aqui exclui, duplica ou marca entrega: a coordenada ORIGINAL da parada nunca muda (é a do pino e do Navegar).
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Crosshair, Loader2 } from 'lucide-react'
import { LinkFluido } from '@/app/navegacao'
import { parada, useEstado } from '@/app/estado'
import { useRuas } from '@/app/ruas'
import { useLocalizacao } from '@/app/localizacao'
import { linhaRetaKm } from '@/core/geo'
import { numero } from '@/core/formato'
import { temCoordenada } from '@/core/parada'
import { RAIOS_COM_CONFIRMACAO_M } from '@/core/ruas/encaixe'
import type { CorrecaoParada, ParadaEmRevisao } from '@/core/ruas/cacheMatriz'
import { lerDecisoes, gravarDecisao } from '@/app/ruasOtimizacao'
import { ChipParada } from '@/components/domain/ChipParada'
import { AvisoRuas } from '@/components/domain/ModoOtimizacao'
import { JanelaOtimizacao } from '@/components/domain/Otimizacao'
import { MOTIVO } from '@/components/domain/ResultadoRuas'

const MapaRevisao = lazy(() => import('@/components/domain/MapaRevisao'))
const PASSO_M = 10
const fmt = (v: number) => v.toFixed(6)

type Confirmacao = { tipo: 'corrigir' } | { tipo: 'restaurar' } | { tipo: 'raio'; raioM: number }

export function RevisaoParadas() {
  const e = useEstado()
  const abrirAviso = useRuas((r) => r.abrirAvisoRuas)
  const leitura = useLocalizacao((l) => l.leitura)
  const [dec, setDec] = useState<{ correcoes: Record<string, CorrecaoParada>; raios: Record<string, number>; revisao: ParadaEmRevisao[] } | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<{ lat: number; lon: number } | null>(null)
  const [confirmar, setConfirmar] = useState<Confirmacao | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [depoisDe, setDepoisDe] = useState<string>('')

  const carregar = useCallback(async () => setDec(await lerDecisoes(e.rotaId)), [e.rotaId])
  useEffect(() => void carregar(), [carregar])

  // Paradas pendentes em revisão ou com correção sua (para poder restaurar). Concluídas não entram.
  const itens = useMemo(() => {
    if (!dec) return []
    const ids = new Set([...dec.revisao.map((r) => r.id), ...Object.keys(dec.correcoes)])
    return e.ordem.filter((id) => ids.has(id) && e.status[id] === 'pendente' && temCoordenada(parada(id))).map((id) => ({ id, lat: parada(id).lat!, lon: parada(id).lon! }))
  }, [dec, e.ordem, e.status])

  useEffect(() => {
    if (!sel && itens[0]) setSel(itens[0].id)
  }, [itens, sel])
  useEffect(() => {
    if (!sel || !dec) return
    const c = dec.correcoes[sel]
    setRascunho(c ? { lat: c.lat, lon: c.lon } : null)
    setConfirmar(null)
  }, [sel, dec])

  const aoSelecionar = useCallback((id: string) => setSel(id), [])
  const aoMover = useCallback((p: { lat: number; lon: number }) => {
    setRascunho({ lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6 })
    setConfirmar(null)
  }, [])

  if (!dec) return <div className="rolagem"><p className="sub"><Loader2 size={18} className="girando" /> Carregando…</p></div>

  const item = itens.find((x) => x.id === sel)
  const p = item ? parada(item.id) : null
  const motivo = sel ? dec.revisao.find((r) => r.id === sel)?.motivo : undefined
  const corrigida = sel ? dec.correcoes[sel] : undefined
  const base = rascunho ?? corrigida ?? (item ? { lat: item.lat, lon: item.lon } : null)
  const mudou = !!rascunho && (!corrigida || rascunho.lat !== corrigida.lat || rascunho.lon !== corrigida.lon)
  const distM = item && rascunho ? linhaRetaKm(item, rascunho) * 1000 : null
  const empurrar = (dn: number, de: number) => {
    if (!base) return
    const dLat = (dn * PASSO_M) / 111_320
    const dLon = (de * PASSO_M) / (111_320 * Math.cos((base.lat * Math.PI) / 180))
    aoMover({ lat: base.lat + dLat, lon: base.lon + dLon })
  }
  const usarMinhaPosicao = () => {
    if (leitura) return aoMover({ lat: leitura.lat, lon: leitura.lon })
    void useLocalizacao.getState().pedirAtivacao()
    e.avisar('Ligando o GPS… toque de novo quando a sua posição aparecer')
  }
  const executar = async () => {
    if (!confirmar || !item || !sel) return
    setOcupado(true)
    try {
      if (confirmar.tipo === 'corrigir' && rascunho) await gravarDecisao(e.rotaId, sel, item, { tipo: 'corrigir', ...rascunho })
      else if (confirmar.tipo === 'restaurar') await gravarDecisao(e.rotaId, sel, item, { tipo: 'restaurar' })
      else if (confirmar.tipo === 'raio') await gravarDecisao(e.rotaId, sel, item, { tipo: 'raio', raioM: confirmar.raioM })
      e.avisar(confirmar.tipo === 'corrigir' ? 'Correção confirmada · recalcule para usar' : confirmar.tipo === 'restaurar' ? 'Posição original restaurada · recalcule para usar' : 'Busca mais longe autorizada · recalcule para usar')
      setConfirmar(null)
      await carregar()
    } catch {
      e.avisar('Não foi possível gravar a decisão no aparelho. Tente de novo.')
    } finally {
      setOcupado(false)
    }
  }
  const recalcular = () => abrirAviso(e.fase === 'revisao' ? 'otimizar' : 'recalcular')
  const pendentes = e.ordem.filter((id) => e.status[id] === 'pendente' && id !== sel)

  return (
    <div className="rolagem">
      <div className="linha">
        <LinkFluido to="/rotas" className="icone-botao" aria-label="Voltar"><ArrowLeft size={22} /></LinkFluido>
        <h1 className="titulo cresce">Revisar paradas</h1>
        <span className="selo-estado aviso">{itens.length} EM REVISÃO</span>
      </div>
      <p className="sub">Paradas sem acesso pelas ruas no último cálculo. Elas continuam na rota, na posição anterior; nada é excluído nem marcado sozinho.</p>

      {itens.length === 0 ? (
        <div className="cartao" style={{ marginTop: 12 }}>
          <strong>Nenhuma parada em revisão</strong>
          <p className="rotulo" style={{ margin: '4px 0 0', color: 'inherit' }}>Todas as pendentes entraram no último cálculo pelas ruas.</p>
        </div>
      ) : (
        <>
          <div className="ruas-revisao-lista" role="listbox" aria-label="Paradas em revisão">
            {itens.map((it) => {
              const m = dec.revisao.find((r) => r.id === it.id)?.motivo
              return (
                <button key={it.id} role="option" aria-selected={it.id === sel} className={`seq-linha ${it.id === sel ? 'selecionada' : ''}`} onClick={() => setSel(it.id)}>
                  <ChipParada id={it.id} />
                  <span className="cresce" style={{ textAlign: 'left' }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{parada(it.id).endereco}</span>
                    <span className="rotulo">{dec.correcoes[it.id] ? 'localização corrigida por você' : m ? MOTIVO[m] : ''}{dec.raios[it.id] ? ` · busca até ${dec.raios[it.id]} m autorizada` : ''}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {item && p && (
            <>
              <div className="mapa-revisao">
                <Suspense fallback={<div className="sem-conexao">Carregando o mapa…</div>}>
                  <MapaRevisao itens={itens} selecionada={sel} rascunho={rascunho ?? corrigida ?? null} aoSelecionar={aoSelecionar} aoMover={aoMover} />
                </Suspense>
              </div>

              <div className="cartao" style={{ marginTop: 12 }}>
                <div className="linha" style={{ gap: 10 }}>
                  <ChipParada id={item.id} />
                  <strong className="cresce">PARADA {p.stop ?? '?'}</strong>
                </div>
                {motivo && <p className="rotulo" style={{ margin: '6px 0 0', color: 'inherit' }}>Motivo: {MOTIVO[motivo]}</p>}
                <dl className="ruas-dados">
                  <div><dt>Original (planilha)</dt><dd data-teste="coord-original">{fmt(item.lat)}, {fmt(item.lon)}</dd></div>
                  <div><dt>Corrigida {corrigida && !mudou ? '(confirmada)' : rascunho ? '(proposta, ainda não usada)' : ''}</dt><dd data-teste="coord-corrigida">{rascunho ? `${fmt(rascunho.lat)}, ${fmt(rascunho.lon)}` : corrigida ? `${fmt(corrigida.lat)}, ${fmt(corrigida.lon)}` : '— (usa a original)'}</dd></div>
                  {distM !== null && <div><dt>Distância da original</dt><dd>{numero(distM, 0)} m (linha reta, só referência)</dd></div>}
                </dl>
                <p className="rotulo" style={{ margin: '8px 0 6px', color: 'inherit' }}>Ajustar (o pino "C" no mapa também pode ser arrastado; tocar no mapa move a proposta):</p>
                <div className="ruas-setas" role="group" aria-label="Mover a posição corrigida 10 m">
                  <button className="botao contorno" onClick={() => empurrar(1, 0)}>Norte 10 m</button>
                  <button className="botao contorno" onClick={() => empurrar(-1, 0)}>Sul 10 m</button>
                  <button className="botao contorno" onClick={() => empurrar(0, -1)}>Oeste 10 m</button>
                  <button className="botao contorno" onClick={() => empurrar(0, 1)}>Leste 10 m</button>
                </div>
                <button className="botao contorno" style={{ marginTop: 8 }} onClick={usarMinhaPosicao}><Crosshair size={18} /> Usar minha posição atual</button>

                {confirmar ? (
                  <div className="confirmar" role="alertdialog" aria-label="Confirmar" style={{ marginTop: 10 }}>
                    <p style={{ margin: '0 0 8px' }}>
                      {confirmar.tipo === 'corrigir' && <>Usar <b>{rascunho && `${fmt(rascunho.lat)}, ${fmt(rascunho.lon)}`}</b> no cálculo pelas ruas desta parada? A coordenada original continua guardada (pino e Navegar não mudam). Os trechos desta parada serão pedidos de novo.</>}
                      {confirmar.tipo === 'restaurar' && <>Voltar a usar a <b>coordenada original</b> no cálculo? A correção é descartada e os trechos desta parada serão pedidos de novo.</>}
                      {confirmar.tipo === 'raio' && <>Procurar uma rua até <b>{confirmar.raioM} m</b> da parada? Rua muito longe pode não ser o acesso certo: confira no mapa depois.</>}
                    </p>
                    <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button className="botao" onClick={() => void executar()} disabled={ocupado}>{ocupado ? 'Gravando…' : 'Confirmar'}</button>
                      <button className="botao contorno" onClick={() => setConfirmar(null)} disabled={ocupado}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="linha" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                    <button className="botao" disabled={!mudou} onClick={() => setConfirmar({ tipo: 'corrigir' })}>Confirmar correção…</button>
                    {(corrigida || rascunho) && <button className="botao contorno" onClick={() => (corrigida ? setConfirmar({ tipo: 'restaurar' }) : setRascunho(null))}>Restaurar original…</button>}
                  </div>
                )}
                {motivo === 'confirmar' && !corrigida && !confirmar && (
                  <div style={{ marginTop: 10 }}>
                    <p className="rotulo" style={{ margin: '0 0 6px', color: 'inherit' }}>Não há rua até 200 m. Procurar mais longe (só com a sua confirmação):</p>
                    <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
                      {RAIOS_COM_CONFIRMACAO_M.filter((r) => r > (dec.raios[item.id] ?? 0)).map((r) => (
                        <button key={r} className="botao contorno" onClick={() => setConfirmar({ tipo: 'raio', raioM: r })}>Até {r} m…</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="cartao" style={{ marginTop: 12 }}>
                <strong>Posição na sequência</strong>
                <p className="rotulo" style={{ margin: '4px 0 8px', color: 'inherit' }}>Enquanto estiver em revisão, a parada fica onde estava. Você pode colocá-la em outro ponto da sequência:</p>
                <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <select aria-label="Colocar depois de" className="ficha" value={depoisDe} onChange={(ev) => setDepoisDe(ev.target.value)}>
                    <option value="">Escolha…</option>
                    <option value="__inicio">No começo das pendentes</option>
                    {pendentes.map((id) => <option key={id} value={id}>Depois da parada {parada(id).stop ?? '?'}</option>)}
                  </select>
                  <button className="botao contorno" disabled={!depoisDe} onClick={() => { e.posicionarParada(item.id, depoisDe === '__inicio' ? null : depoisDe); setDepoisDe('') }}>Mover na sequência</button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div className="secao">
        <button className="botao destaque" onClick={recalcular} disabled={!!e.otimizacao}>Recalcular os trechos afetados (pelas ruas)</button>
        <p className="rotulo" style={{ margin: '6px 2px 0' }}>Só os trechos que mudaram são pedidos de novo (o resto vem do que já está guardado). Antes de enviar, o app mostra o consumo previsto; a rota atual só muda quando você aplicar o resultado.</p>
      </div>
      <JanelaOtimizacao />
      <AvisoRuas />
    </div>
  )
}
