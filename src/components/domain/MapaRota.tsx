// Mapa real (MapLibre + OpenFreeMap). Carregado SÓ na tela Rotas (import dinâmico, G14).
// Sem tile/sem conexão: "mapa sem conexão" + "Ver lista" (G6). R4 (2026-11-25): NENHUMA linha reta entre as paradas;
// o traçado real pelas ruas chega na fase R-B. Até lá, só os pinos.

import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6: depois do build, o worker precisa ser apontado (senão: "Worker failed to load").
import urlDoWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { corDaParada, inicioDaRota, paradas, rotaAtual, useEstado } from '@/app/estado'
import { rotuloStop, temCoordenada } from '@/core/parada'
import { useLocalizacao } from '@/app/localizacao'
import { MinhaLocalizacao } from './MinhaLocalizacao'

const ESTILO = 'https://tiles.openfreemap.org/styles/positron'
const LIMITE_CARGA_MS = 10_000
maplibregl.setWorkerUrl(urlDoWorker)

function mapaDesligado(): boolean {
  // Simulação para teste: ?mapa=off força o aviso "mapa sem conexão".
  return new URLSearchParams(location.search).get('mapa') === 'off'
}

interface Props {
  ids: readonly string[]
  proxima: string | undefined
  /** Parada selecionada: destacada; em tela cheia, o mapa vai até ela. */
  selecionada?: string | undefined
  /** mini = dentro da tela Rotas (um toque abre a tela cheia); cheio = tela cheia, com zoom e arrastar. */
  modo?: 'mini' | 'cheio'
  aoTocarMapa?: () => void
  aoVerLista: () => void
}

export default function MapaRota({ ids, proxima, selecionada, modo = 'mini', aoTocarMapa, aoVerLista }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<maplibregl.Map | null>(null)
  const marcadores = useRef<maplibregl.Marker[]>([])
  const [semConexao, setSemConexao] = useState(() => !navigator.onLine || mapaDesligado())
  const [pronto, setPronto] = useState(false)
  const status = useEstado((e) => e.status)
  const selecionar = useEstado((e) => e.selecionar)

  // Cria o mapa uma vez.
  useEffect(() => {
    if (semConexao || !caixa.current) return
    const ps = paradas(ids).filter(temCoordenada)
    const inicio = inicioDaRota()
    const limites = new maplibregl.LngLatBounds()
    ps.forEach((p) => limites.extend([p.lon, p.lat]))
    if (inicio) limites.extend([inicio.lon, inicio.lat])
    const m = new maplibregl.Map({
      container: caixa.current,
      style: ESTILO,
      bounds: limites,
      fitBoundsOptions: { padding: modo === 'cheio' ? 60 : 30 },
      attributionControl: { compact: true },
      interactive: modo === 'cheio',
      dragRotate: false,
      pitchWithRotate: false,
    })
    if (modo === 'cheio') {
      m.touchZoomRotate.disableRotation()
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    }
    mapa.current = m
    const limite = setTimeout(() => {
      if (!m.loaded()) setSemConexao(true)
    }, LIMITE_CARGA_MS)
    m.on('error', (e: { error?: { message?: string } }) => {
      // Falha do estilo ou dos tiles: sem mapa, a operação continua pela lista.
      if (!m.isStyleLoaded() || /style|tile|fetch|network/i.test(String(e.error?.message ?? ''))) setSemConexao(true)
    })
    m.on('load', () => {
      clearTimeout(limite)
      // Marcador da posição de TESTE só na rota de exemplo (fictícia). A sua posição real é o ponto azul.
      if (inicio && rotaAtual().fonte === 'exemplo' && useEstado.getState().origemOtimizacao !== 'gps') {
        const eu = document.createElement('div')
        eu.className = 'posicao-teste'
        eu.title = 'Posição de teste (simulada, não é GPS)'
        new maplibregl.Marker({ element: eu }).setLngLat([inicio.lon, inicio.lat]).addTo(m)
      }
      setPronto(true)
    })
    const offline = () => setSemConexao(true)
    window.addEventListener('offline', offline)
    return () => {
      clearTimeout(limite)
      window.removeEventListener('offline', offline)
      m.remove()
      mapa.current = null
    }
  }, [semConexao])

  // Atualiza os pinos quando a ordem ou o status mudam.
  useEffect(() => {
    const m = mapa.current
    if (!m || !pronto) return
    const ps = paradas(ids).filter(temCoordenada)
    marcadores.current.forEach((mk) => mk.remove())
    marcadores.current = ps.map((p) => {
      const el = document.createElement('button')
      const st = status[p.id]
      el.className = `pino cor-${corDaParada(p.id)} ${st === 'entregue' ? 'entregue' : st === 'falha' ? 'falha' : ''} ${p.id === proxima ? 'proxima' : ''} ${p.id === selecionada ? 'selecionada' : ''}`
      el.textContent = st === 'entregue' ? '✓' : rotuloStop(p)
      el.setAttribute('aria-label', `Parada ${rotuloStop(p)}`)
      // No mapa pequeno o toque abre a tela cheia; em tela cheia, o toque no pino seleciona a parada.
      if (modo === 'cheio') el.onclick = (ev) => {
        ev.stopPropagation()
        useLocalizacao.getState().soltar() // tocar numa parada também tira a centralização na sua posição
        selecionar(p.id)
      }
      else el.tabIndex = -1
      return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m)
    })
  }, [ids, status, proxima, selecionada, pronto, selecionar, modo])

  // Leva o mapa até a parada selecionada (sem animação se você pediu menos movimento).
  useEffect(() => {
    const m = mapa.current
    if (!m || !pronto || !selecionada) return
    const p = paradas([selecionada])[0]
    if (!p || !temCoordenada(p)) return
    // Centralizando na sua localização (tela cheia): a sua posição tem prioridade até você mexer no mapa.
    const loc = useLocalizacao.getState()
    if (modo === 'cheio' && loc.ativa && loc.seguir && loc.leitura) return
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches
    // Em tela cheia, o cartão cobre a parte de baixo: a parada fica no centro da área livre.
    m.easeTo({ center: [p.lon, p.lat], zoom: Math.max(m.getZoom(), 15), padding: modo === 'cheio' ? { top: 70, bottom: 250, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 }, duration: calmo ? 0 : 600 })
  }, [selecionada, pronto, modo])

  if (semConexao) {
    return (
      <div className="sem-conexao" role="status">
        <strong style={{ fontSize: 17 }}>Mapa sem conexão</strong>
        <span className="sub" style={{ margin: 0 }}>Esta área não está salva no aparelho. A rota continua pela lista.</span>
        <button className="botao" style={{ width: 'auto', padding: '0 22px', height: 48 }} onClick={aoVerLista}>
          Ver lista
        </button>
      </div>
    )
  }
  return (
    <>
      <div
        ref={caixa}
        style={{ position: 'absolute', inset: 0, cursor: modo === 'mini' ? 'pointer' : undefined }}
        onClick={modo === 'mini' ? aoTocarMapa : undefined}
        role={modo === 'mini' ? 'button' : undefined}
        aria-label={modo === 'mini' ? 'Abrir o mapa em tela cheia' : 'Mapa da rota'}
      />
      {modo === 'mini' && <span className="mapa-legenda" style={{ top: 10, right: 10, fontWeight: 600, pointerEvents: 'none' }}>Toque para ampliar</span>}
      <MinhaLocalizacao mapa={mapa.current} pronto={pronto} modo={modo} />
    </>
  )
}
