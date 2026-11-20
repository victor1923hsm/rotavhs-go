import { lazy, Suspense, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useIr } from '@/app/navegacao'
import { ehFicticia } from '@/app/prototipo'
import { RefreshCw, Search, X } from 'lucide-react'
import { ordemOtimizada, parada, resumoDaOrdem, useEstado } from '@/app/estado'
import { duracao, numero } from '@/core/formato'
import { ChipParada } from '@/components/domain/ChipParada'
import { ChipGps, SeloDemo } from '@/components/domain/Gps'
import { Laboratorio } from '@/app/sobDemanda'
import { Planos } from '@/components/domain/Planos'
import { useLocalizacao } from '@/app/localizacao'
import { origemPertoDaRota } from '@/app/dinamica'
import { CartaoParada } from '@/components/domain/CartaoParada'

// G14: o MapLibre só é baixado quando esta tela abre.
const MapaRota = lazy(() => import('@/components/domain/MapaRota'))

export function Rotas() {
  const e = useEstado()
  const ir = useIr()
  const lista = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<HTMLDivElement>(null)
  const [cheio, setCheio] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const proxima = e.ordem.find((id) => e.status[id] === 'pendente')
  const pendentes = e.ordem.filter((id) => e.status[id] === 'pendente').length
  const r = resumoDaOrdem(e.ordem)
  useLocalizacao((l) => l.leitura) // re-desenha a origem quando a posição muda
  const gpsPerto = !!origemPertoDaRota()
  const loc = useLocalizacao.getState()
  const multiplos = e.rota.paradas.filter((p) => p.pacotes.length > 1).length
  const spx = resumoDaOrdem(e.rota.ordemSpx)
  const otm = resumoDaOrdem(ordemOtimizada())
  const selo = { revisao: ['REVISÃO', ''], otimizada: ['OTIMIZADA', ''], andamento: ['EM ANDAMENTO', 'escuro'] }[e.fase]
  const sub =
    e.fase === 'revisao'
      ? `Revise ${e.ordem.length} paradas antes de otimizar.`
      : e.fase === 'otimizada'
        ? 'Uma rota mais curta, pronta para sair.'
        : proxima
          ? `Próxima parada: ${parada(proxima).stop ?? '?'} · ${parada(proxima).endereco}`
          : 'Todas as paradas foram visitadas.'
  const abrir = (id: string) => {
    e.selecionar(id)
    ir('/pedidos')
  }
  // Toque na lista: seleciona, destaca no mapa e mostra o cartão com Navegar (revisão 11).
  const escolher = (id: string) => {
    e.selecionar(id)
    mapaRef.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  const verLista = () => {
    setCheio(false)
    lista.current?.scrollIntoView({ behavior: 'smooth' })
  }
  const legenda = `- - - ordem, não é o caminho${e.rota.fonte === 'exemplo' ? ' · ● posição de teste' : ''}`

  return (
    <div className="rolagem">
      <div className="linha">
        <h1 className="titulo cresce">Rotas</h1>
        <span className={`selo-estado ${selo[1]}`}>{selo[0]}</span>
        <button className="icone-botao" aria-label="Buscar parada" onClick={() => e.abrirBusca(true)}><Search size={22} /></button>
      </div>
      <p className="sub">{sub}</p>
      <ChipGps />

      {e.fase === 'revisao' && (
        <div className="otimizar-cartao">
          {e.destacarOtimizar && <p className="rotulo" role="status" style={{ margin: '0 2px 8px', color: 'inherit', fontWeight: 600 }}>Rota importada e conferida. Próximo passo:</p>}
          <button className={`botao destaque${e.destacarOtimizar ? ' pulsar' : ''}`} onClick={e.otimizar}>OTIMIZAR MINHA ROTA</button>
          <p className="rotulo" style={{ margin: '8px 2px 0', color: 'inherit' }}>
            Cálculo de teste: ordem estimada pela distância em linha reta, sem ruas reais <SeloDemo />. A ordem só muda com o seu toque.
          </p>
          <p className="rotulo" style={{ margin: '8px 2px 0', color: 'inherit' }}>
            Ponto de partida:{' '}
            {gpsPerto ? (
              <>sua posição atual (GPS) <SeloDemo /></>
            ) : e.rota.fonte === 'exemplo' ? (
              <>posição de teste{loc.ativa && loc.leitura ? ' (você está longe da rota de exemplo)' : ' · ligue o GPS para partir de onde você está'}</>
            ) : (
              'a 1ª parada da SPX · ligue o GPS para partir de onde você está'
            )}
          </p>
        </div>
      )}
      {e.fase !== 'revisao' && e.origemOtimizacao && (
        <p className="rotulo" style={{ margin: '4px 0 8px' }}>
          Otimizada a partir de: {e.origemOtimizacao === 'gps' ? <>sua posição no momento <SeloDemo /></> : e.origemOtimizacao === 'teste' ? 'posição de teste' : '1ª parada da SPX'}
        </p>
      )}

      <div className="mapa" ref={mapaRef}>
        <Suspense fallback={<div className="sem-conexao"><span className="sub">Carregando o mapa…</span></div>}>
          {!cheio && (
            <MapaRota ids={e.ordem} proxima={e.fase === 'andamento' ? proxima : undefined} selecionada={e.selecionada} modo="mini" aoTocarMapa={() => setCheio(true)} aoVerLista={verLista} />
          )}
        </Suspense>
        <span className="mapa-legenda" style={{ top: 10, left: 10, fontWeight: 700, letterSpacing: '.06em', fontSize: 10 }}>{e.rota.fonte === 'exemplo' ? 'ROTA DE EXEMPLO' : ehFicticia(e.rota) ? 'PLANILHA FICTÍCIA' : 'SUA PLANILHA'}</span>
        <span className="mapa-legenda" style={{ bottom: 10, left: 10 }}>{legenda}</span>
      </div>
      <CartaoParada id={e.selecionada} />

      <div className={`numeros3 ${e.fase !== 'revisao' ? 'menta' : ''}`}>
        <div><div className="rotulo">Paradas</div><div className="v">{e.ordem.length}</div></div>
        <div><div className="rotulo">Distância est.</div><div className="v">{numero(r.km)} km</div></div>
        <div><div className="rotulo">Tempo est.</div><div className="v">{duracao(r.min)}</div></div>
      </div>
      <p className="rotulo" style={{ margin: '6px 2px 0' }}>{e.rota.paradas.length} paradas (visitas) · {e.rota.pacotes} pacotes · {multiplos} paradas com 2 ou mais pacotes</p>

      {e.sugestao && (
        <div className="sugestao" role="dialog" aria-label="Nova ordem sugerida">
          <div className="linha">
            <strong className="cresce" style={{ fontSize: 16 }}>Nova ordem sugerida</strong>
            <span className="selo-estado escuro">
              {e.sugestao.origem === 'simulada' ? 'TESTE' : e.sugestao.origem === 'manual' ? 'RECALCULADA' : e.sugestao.motivo === 'desvio' ? 'AUTOMÁTICA · DESVIO' : 'AUTOMÁTICA · APÓS ENTREGA'}
            </span>
            {(e.sugestao.daPosicao || e.sugestao.motivo === 'desvio') && <SeloDemo />}
          </div>
          <p className="sub" style={{ color: 'inherit', opacity: 0.85 }}>
            −{numero(e.sugestao.ganhoPct, 0)} % · −{numero(e.sugestao.ganhoKm)} km (estimado). A ordem só muda se você tocar em “Usar nova ordem”.
          </p>
          <div className="linha" style={{ marginTop: 10 }}>
            <button style={{ background: 'var(--menta)', color: 'var(--sobre-menta)' }} onClick={e.aceitarSugestao}>Usar nova ordem</button>
            <button style={{ boxShadow: 'inset 0 0 0 2px var(--sobre-tinta-claro)' }} onClick={e.recusarSugestao}>Manter atual</button>
          </div>
        </div>
      )}

      <div className="linha" style={{ justifyContent: 'space-between', marginTop: 16 }} ref={lista}>
        <h2 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Sequência de paradas</h2>
        <span className="rotulo">{e.fase === 'revisao' ? 'Ordem da SPX' : `−${numero(spx.km - otm.km)} km · −${spx.min - otm.min} min (estimado)`}</span>
      </div>
      <div>
        {e.ordem.map((id, i) => {
          const p = parada(id)
          return (
            <button key={id} className={`seq-linha ${id === e.selecionada ? 'selecionada' : ''}`} onClick={() => escolher(id)} aria-pressed={id === e.selecionada}>
              <span className="n">{i + 1}</span>
              <ChipParada id={id} />
              <span className="cresce">
                {p.endereco}
                {e.fase === 'andamento' && id === proxima && <b style={{ fontSize: 11, color: 'var(--menta-texto)' }}> · PRÓXIMA</b>}
              </span>
              <span className="rotulo">{p.pacotes.length} pct</span>
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        {e.fase === 'otimizada' && <button className="botao" onClick={() => e.definirFase('andamento')}>Iniciar entregas →</button>}
        {e.fase === 'andamento' && (
          <>
            {proxima && <button className="botao" onClick={() => abrir(proxima)}>Ver próximo pedido →</button>}
            <button className="botao contorno" onClick={e.recalcular}><RefreshCw size={18} /> Recalcular</button>
            {confirmar ? (
              <div className="confirmar" role="alertdialog" aria-label="Finalizar a rota">
                <strong>Finalizar a rota?</strong>
                <p className="sub" style={{ margin: '4px 0 10px' }}>
                  {pendentes === 0
                    ? 'Todas as paradas foram marcadas.'
                    : `${pendentes} ${pendentes === 1 ? 'parada com pacote pendente' : 'paradas com pacotes pendentes'}: esses pacotes contam como não entregues.`}{' '}
                  O resumo fica em Estatísticas; endereços, códigos SPX e o histórico desta rota são apagados do aparelho.
                </p>
                <div className="linha">
                  <button className="botao" onClick={() => { e.finalizarRota(); setConfirmar(false); e.avisar('Rota finalizada · resumo guardado'); ir('/estatisticas') }}>Finalizar</button>
                  <button className="botao contorno" onClick={() => setConfirmar(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button className="botao contorno" onClick={() => setConfirmar(true)}>Finalizar rota</button>
            )}
            <button className="rotulo" style={{ textDecoration: 'underline', minHeight: 44 }} onClick={e.simularSugestao}>Simular sugestão automática (teste)</button>
          </>
        )}
        {e.fase !== 'revisao' && (
          <button className="rotulo" style={{ textDecoration: 'underline', minHeight: 44 }} onClick={() => e.definirFase('revisao')}>Usar ordem original da SPX</button>
        )}
      </div>

      <Planos />
      <Suspense fallback={null}><Laboratorio /></Suspense>

      {cheio &&
        createPortal(
          <div className="mapa-cheio" role="dialog" aria-label="Mapa em tela cheia">
            <Suspense fallback={<div className="sem-conexao"><span className="sub">Carregando o mapa…</span></div>}>
              <MapaRota ids={e.ordem} proxima={e.fase === 'andamento' ? proxima : undefined} selecionada={e.selecionada} modo="cheio" aoVerLista={verLista} />
            </Suspense>
            <button className="icone-botao mapa-fechar" aria-label="Fechar o mapa" onClick={() => setCheio(false)}><X size={24} /></button>
            <span className="mapa-legenda" style={{ top: 'calc(66px + env(safe-area-inset-top))', left: 12 }}>{legenda}</span>
            <div className="mapa-cheio-cartao"><CartaoParada id={e.selecionada} aoAbrir={() => setCheio(false)} /></div>
          </div>,
          document.querySelector('.app') ?? document.body,
        )}
    </div>
  )
}
