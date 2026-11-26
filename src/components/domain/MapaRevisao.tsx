// Mapa da revisão de paradas (RB-3), carregado SOB DEMANDA. Mostra as paradas em revisão pela coordenada ORIGINAL
// (pino da cor da parada) e, para a selecionada, a posição CORRIGIDA proposta (pino "C", arrastável). Tocar no mapa
// também move a proposta. Nenhuma linha entre os pinos (R4). Sem conexão: aviso; a revisão continua pelos botões.
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import urlDoWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { corDaParada, parada } from '@/app/estado'
import { rotuloStop } from '@/core/parada'

const ESTILO = 'https://tiles.openfreemap.org/styles/positron'
maplibregl.setWorkerUrl(urlDoWorker)

interface Props {
  itens: readonly { id: string; lat: number; lon: number }[]
  selecionada: string | null
  rascunho: { lat: number; lon: number } | null
  aoSelecionar: (id: string) => void
  aoMover: (p: { lat: number; lon: number }) => void
}

export default function MapaRevisao({ itens, selecionada, rascunho, aoSelecionar, aoMover }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<maplibregl.Map | null>(null)
  const pinos = useRef<maplibregl.Marker[]>([])
  const proposta = useRef<maplibregl.Marker | null>(null)
  const mover = useRef(aoMover)
  mover.current = aoMover
  const [pronto, setPronto] = useState(false)
  const [semConexao, setSemConexao] = useState(() => !navigator.onLine)

  useEffect(() => {
    if (semConexao || !caixa.current || !itens.length) return
    const limites = new maplibregl.LngLatBounds()
    itens.forEach((p) => limites.extend([p.lon, p.lat]))
    const m = new maplibregl.Map({ container: caixa.current, style: ESTILO, bounds: limites, fitBoundsOptions: { padding: 50, maxZoom: 16 }, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false })
    m.touchZoomRotate.disableRotation()
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapa.current = m
    const limite = setTimeout(() => !m.loaded() && setSemConexao(true), 10_000)
    m.on('error', () => !m.isStyleLoaded() && setSemConexao(true))
    m.on('load', () => {
      clearTimeout(limite)
      setPronto(true)
    })
    m.on('click', (ev) => mover.current({ lat: ev.lngLat.lat, lon: ev.lngLat.lng }))
    return () => {
      clearTimeout(limite)
      m.remove()
      mapa.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semConexao])

  // Pinos das paradas em revisão (coordenada original).
  useEffect(() => {
    const m = mapa.current
    if (!m || !pronto) return
    pinos.current.forEach((p) => p.remove())
    pinos.current = itens.map((it) => {
      const el = document.createElement('button')
      el.className = `pino cor-${corDaParada(it.id)} ${it.id === selecionada ? 'selecionada' : ''}`
      el.textContent = rotuloStop(parada(it.id))
      el.setAttribute('aria-label', `Parada ${rotuloStop(parada(it.id))}, posição original`)
      el.onclick = (ev) => {
        ev.stopPropagation()
        aoSelecionar(it.id)
      }
      return new maplibregl.Marker({ element: el }).setLngLat([it.lon, it.lat]).addTo(m)
    })
  }, [itens, selecionada, pronto, aoSelecionar])

  // Posição corrigida proposta (arrastável).
  useEffect(() => {
    const m = mapa.current
    proposta.current?.remove()
    proposta.current = null
    if (!m || !pronto || !rascunho) return
    const el = document.createElement('div')
    el.className = 'pino pino-corrigido'
    el.textContent = 'C'
    el.title = 'Posição corrigida (arraste para ajustar)'
    const mk = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([rascunho.lon, rascunho.lat]).addTo(m)
    mk.on('dragend', () => {
      const p = mk.getLngLat()
      mover.current({ lat: p.lat, lon: p.lng })
    })
    proposta.current = mk
  }, [rascunho, pronto])

  // Leva o mapa até a parada selecionada.
  useEffect(() => {
    const m = mapa.current
    const it = itens.find((x) => x.id === selecionada)
    if (!m || !pronto || !it) return
    m.easeTo({ center: [it.lon, it.lat], zoom: Math.max(m.getZoom(), 16), duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500 })
  }, [selecionada, pronto, itens])

  if (semConexao)
    return (
      <div className="sem-conexao" role="status">
        <strong style={{ fontSize: 17 }}>Mapa sem conexão</strong>
        <span className="sub" style={{ margin: 0 }}>Ajuste pela sua posição atual ou pelos botões de direção.</span>
      </div>
    )
  return <div ref={caixa} style={{ position: 'absolute', inset: 0 }} aria-label="Mapa da revisão: toque para mover a posição corrigida" />
}
