// "Testar roteirização real" (RB-4, MODO EXPERIMENTAL). Tela separada das entregas SPX: só pontos fictícios de
// Goiânia (sorteados e encaixados em vias, ou tocados no mapa) e partida pública ou escolhida no mapa. Envia ao
// OpenRouteService REAL só depois do seu "Autorizo", pela guarda experimental (ver guarda.ts).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { LinkFluido } from '@/app/navegacao'
import { useLocalizacao } from '@/app/localizacao'
import { numero } from '@/core/formato'
import { consumoHoje } from '@/app/ruasOtimizacao'
import { PARTIDAS_PUBLICAS } from './area'
import { linhasDoTracado } from './motorExperimental'
import { useExperimental } from './estadoExperimental'

const MapaExperimental = lazy(() => import('./MapaExperimental'))
const NOME_ETAPA: Record<string, string> = { encaixe: 'Encaixe nas ruas', matriz: 'Distâncias e tempos', algoritmo: 'Melhor ordem', tracado: 'Traçado pelas ruas' }

export function TestarRoteirizacao() {
  const x = useExperimental()
  const leitura = useLocalizacao((l) => l.leitura)
  const [sel, setSel] = useState<string | null>(null)
  const [centro, setCentro] = useState<{ lat: number; lon: number } | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    void x.carregar()
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => {
      removeEventListener('online', on)
      removeEventListener('offline', off)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const t = x.teste
  const posicao = useMemo(() => new Map((t?.ordem ?? []).map((id, k) => [id, k + 1])), [t?.ordem])
  const linhas = useMemo(() => (t ? linhasDoTracado(t) : []), [t])
  if (!t) return <div className="rolagem"><p className="sub"><Loader2 size={18} className="girando" /> Carregando…</p></div>
  const pend = t.paradas.filter((p) => !p.visitada).length
  const c = t.comparacao
  const hoje = consumoHoje()
  const ocupado = !!x.calculo
  const pSel = t.paradas.find((p) => p.id === sel)
  const aoTocarMapa = (p: { lat: number; lon: number }) => {
    if (x.modoMapa === 'adicionar') void x.adicionarParada(p).then((e) => e && useExperimental.setState({ erro: e }))
    else if (x.modoMapa === 'partida') void x.definirPartida(p, 'Ponto escolhido no mapa').then((e) => e && useExperimental.setState({ erro: e }))
  }

  return (
    <div className="rolagem">
      <div className="linha">
        <LinkFluido to="/estatisticas/ruas" className="icone-botao" aria-label="Voltar"><ArrowLeft size={22} /></LinkFluido>
        <h1 className="titulo cresce">Testar roteirização real</h1>
        <span className="selo-estado aviso">EXPERIMENTAL</span>
      </div>
      <p className="exp-selo" role="note">
        <b>Modo experimental, separado das entregas SPX.</b> Só pontos <b>fictícios</b> em vias de Goiânia (sorteados ou tocados por você) e uma partida pública. Nenhuma planilha, encomenda ou posição de GPS é enviada. Os números vêm do OpenRouteService real; o traçado segue as ruas devolvidas por ele.
      </p>

      {!x.autorizacao ? (
        <div className="cartao" style={{ marginTop: 10 }}>
          <strong>Autorização para este teste</strong>
          <p className="rotulo" style={{ margin: '6px 0 8px', color: 'inherit' }}>
            Provedor: <b>OpenRouteService (HeiGIT gGmbH, Alemanha)</b>, plano gratuito, uso de teste não comercial. Sai do aparelho só: latitude e longitude dos pontos de teste e da partida, e a sua chave (no cabeçalho). Os termos do provedor proíbem enviar dados pessoais: <b>não marque casas reais nem a sua posição</b>. O provedor guarda a coordenada arredondada a 2 casas e, por 7 dias, dados do pedido (como o IP) contra abuso.
          </p>
          <button className="botao" onClick={x.autorizar}>Autorizo o envio destas coordenadas de teste</button>
        </div>
      ) : (
        <p className="rotulo" style={{ marginTop: 8 }}>Autorizado nesta sessão · provedor: OpenRouteService (HeiGIT).{online ? '' : ' · Sem internet agora.'}</p>
      )}

      <div className="secao">
        <div className="t">Partida</div>
        <div className="exp-barra">
          {PARTIDAS_PUBLICAS.map((p) => (
            <button key={p.nome} className={`ficha${t.partida.nome === p.nome ? ' ativa' : ''}`} onClick={() => void x.definirPartida(p, p.nome)} disabled={ocupado}>{p.nome}</button>
          ))}
          <button className={`ficha${x.modoMapa === 'partida' ? ' ativa' : ''}`} onClick={() => x.definirModoMapa(x.modoMapa === 'partida' ? 'ver' : 'partida')} disabled={ocupado}>Escolher no mapa</button>
          <button className="ficha" onClick={() => (leitura ? setCentro({ lat: leitura.lat, lon: leitura.lon }) : void useLocalizacao.getState().pedirAtivacao())}>Centralizar no meu GPS</button>
        </div>
        <p className="rotulo" style={{ margin: '6px 2px 0' }}>
          Partida: {t.partida.nome}. O GPS só centraliza o mapa no aparelho: a sua posição <b>não</b> é usada como partida nem enviada (é dado pessoal; os termos do provedor proíbem).
        </p>
      </div>

      <div className="secao">
        <div className="t">Paradas de teste ({t.paradas.length} · {pend} pendentes)</div>
        <div className="exp-barra">
          {[10, 25, 50, 100].map((n) => (
            <button key={n} className="botao contorno" onClick={() => void x.gerar(n)} disabled={ocupado || !x.autorizacao}>Gerar {n}</button>
          ))}
          <button className={`ficha${x.modoMapa === 'adicionar' ? ' ativa' : ''}`} onClick={() => x.definirModoMapa(x.modoMapa === 'adicionar' ? 'ver' : 'adicionar')} disabled={ocupado}>
            {x.modoMapa === 'adicionar' ? 'Tocando no mapa adiciona (toque para parar)' : 'Adicionar tocando no mapa'}
          </button>
        </div>
        {!x.autorizacao && <p className="rotulo" style={{ margin: '6px 2px 0' }}>Gerar paradas usa o provedor (encaixe nas vias): autorize primeiro.</p>}
      </div>

      <div className="exp-mapa">
        <Suspense fallback={<div className="sem-conexao">Carregando o mapa…</div>}>
          <MapaExperimental partida={t.partida} paradas={t.paradas} posicao={posicao} linhas={linhas} aoTocarMapa={aoTocarMapa} aoTocarParada={setSel} centro={centro} />
        </Suspense>
      </div>
      <p className="rotulo" style={{ margin: '6px 2px 0' }}>
        {linhas.length ? `Traçado real pelas ruas: ${linhas.length} trecho(s) desenhado(s).` : 'Sem traçado ainda: só os pinos (nenhuma linha reta é desenhada).'}
        {c?.tracado?.semTracado ? ` ${c.tracado.semTracado} trecho(s) sem traçado guardado aparecem só como pinos.` : ''}
      </p>

      {pSel && (
        <div className="cartao" style={{ marginTop: 10 }} role="dialog" aria-label={`Parada de teste ${pSel.n}`}>
          <strong>Parada de teste {pSel.n}{posicao.get(pSel.id) ? ` · ${posicao.get(pSel.id)}ª na ordem` : ''}</strong>
          <p className="rotulo" style={{ margin: '4px 0 8px', color: 'inherit' }}>{pSel.lat.toFixed(6)}, {pSel.lon.toFixed(6)} · {pSel.origem === 'sorteio' ? 'sorteada e encaixada na via' : 'marcada no mapa'}</p>
          <div className="exp-barra">
            <button className="botao contorno" onClick={() => void x.alternarVisitada(pSel.id)}>{pSel.visitada ? 'Desmarcar visitada' : 'Marcar como visitada (simulação)'}</button>
            <button className="botao contorno" onClick={() => { void x.removerParada(pSel.id); setSel(null) }} disabled={ocupado}>Remover</button>
            <button className="botao contorno" onClick={() => setSel(null)}>Fechar</button>
          </div>
        </div>
      )}

      <div className="secao">
        <div className="exp-barra">
          <button className="botao destaque" onClick={() => void x.calcular()} disabled={ocupado || !pend || !x.autorizacao}>
            {c ? 'Reotimizar as pendentes pelas ruas' : 'Calcular pelas ruas (real)'}
          </button>
          {c && <button className="botao contorno" onClick={() => void x.reotimizarSemInternet()} disabled={ocupado || !pend}>Reotimizar sem internet (matriz salva)</button>}
        </div>
        <p className="rotulo" style={{ margin: '6px 2px 0' }}>
          Consumo de hoje (este aparelho): {hoje.pedidos.encaixe}/{hoje.limites.encaixe} encaixe · {hoje.pedidos.matriz}/{hoje.limites.matriz} distâncias · {hoje.pedidos.rota}/{hoje.limites.rota} traçado. Reotimizar reaproveita a matriz e o traçado salvos: só o que falta é pedido.
        </p>
      </div>

      {x.calculo && (
        <div className="cartao" role="status" aria-live="polite" style={{ marginTop: 10 }}>
          <div className="linha" style={{ gap: 8 }}>
            <Loader2 size={18} className="girando" aria-hidden="true" />
            <strong className="cresce">{NOME_ETAPA[x.calculo.etapa]}</strong>
            <span>{Math.round(x.calculo.fracao * 100)}%</span>
          </div>
          <p className="rotulo" style={{ margin: '4px 0 0', color: 'inherit' }}>{x.calculo.detalhe}</p>
          <button className="botao contorno" style={{ marginTop: 8 }} onClick={x.cancelar}>Cancelar</button>
        </div>
      )}
      {x.erro && <p className="ruas-erro" role="alert">{x.erro}</p>}
      {x.aviso && <p className="rotulo" role="status" style={{ marginTop: 8 }}>{x.aviso}</p>}

      {c && (
        <div className="secao">
          <div className="t">Resultado {c.offline ? '(reotimizado sem internet)' : ''}</div>
          <div className="cartao">
            <table className="exp-tabela">
              <thead>
                <tr><th>Ordem</th><th>km</th><th>min (desloc.)</th></tr>
              </thead>
              <tbody>
                {!c.offline && Number.isFinite(c.rapida.km) && (
                  <tr><td>Rápida (aproximada), medida pelas ruas</td><td>{numero(c.rapida.km)}</td><td>{numero(c.rapida.min, 0)}</td></tr>
                )}
                <tr><td>Pelas ruas (matriz real)</td><td>{numero(c.ruas.km)}</td><td>{numero(c.ruas.min, 0)}</td></tr>
                {c.tracado && <tr><td>Percurso desenhado (traçado real)</td><td>{numero(c.tracado.km)}</td><td>{numero(c.tracado.min, 0)}</td></tr>}
              </tbody>
            </table>
            {!c.offline && Number.isFinite(c.rapida.km) && (
              <p className="rotulo" style={{ margin: '8px 0 0', color: 'inherit' }}>
                A rápida achava {numero(c.rapida.kmModelo)} km pelo modelo (linha reta × 1,35); a mesma ordem medida pelas ruas dá {numero(c.rapida.km)} km. Pelas ruas: {c.ruas.km <= c.rapida.km ? `−${numero(c.rapida.km - c.ruas.km)} km` : `+${numero(c.ruas.km - c.rapida.km)} km`} e {c.ruas.min <= c.rapida.min ? `−${numero(c.rapida.min - c.ruas.min, 0)}` : `+${numero(c.ruas.min - c.rapida.min, 0)}`} min (estimativas do provedor; sem trânsito em tempo real).
              </p>
            )}
            <p className="rotulo" style={{ margin: '6px 0 0', color: 'inherit' }}>
              Pedidos: {c.pedidos.encaixe} encaixe · {c.pedidos.matriz} distâncias · {c.pedidos.rota} traçado. Tempos: encaixe {numero(c.ms.encaixe / 1000, 1)} s · distâncias {numero(c.ms.matriz / 1000, 1)} s · algoritmo {numero(c.ms.algoritmo / 1000, 1)} s · traçado {numero(c.ms.tracado / 1000, 1)} s. Salvo no aparelho (funciona sem internet).
            </p>
          </div>
        </div>
      )}

      <div className="secao">
        <button className="botao contorno" onClick={() => void x.apagarTudo()}>Apagar os dados do teste</button>
        <p className="rotulo" style={{ margin: '6px 2px 0' }}>© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors</p>
      </div>
    </div>
  )
}
