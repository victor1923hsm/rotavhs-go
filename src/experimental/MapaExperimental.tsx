// Mapa do modo experimental (RB-4), carregado sob demanda. Desenha SÓ o traçado real pelas ruas (geometria devolvida
// pelo provedor, trecho por trecho). Sem geometria: só os pinos — nunca uma linha reta entre paradas (R4).
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import urlDoWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { CENTRO_GOIANIA } from './area'
import type { ParadaTeste } from './armazem'

const ESTILO = 'https://tiles.openfreemap.org/styles/positron'
maplibregl.setWorkerUrl(urlDoWorker)
const CORES = ['1', '2', '3', '4'] as const

interface Props {
  partida: { lat: number; lon: number }
  paradas: readonly ParadaTeste[]
  /** Posição de cada parada na ordem atual (1 = primeira). */
  posicao: ReadonlyMap<string, number>
  linhas: readonly [number, number][][]
  aoTocarMapa: (c: { lat: number; lon: number }) => void
  aoTocarParada: (id: string) => void
  centro?: { lat: number; lon: number } | null
}

const cor = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || undefined

export default function MapaExperimental({ partida, paradas, posicao, linhas, aoTocarMapa, aoTocarParada, centro }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<maplibregl.Map | null>(null)
  const pinos = useRef<maplibregl.Marker[]>([])
  const tocarMapa = useRef(aoTocarMapa)
  tocarMapa.current = aoTocarMapa
  const tocarParada = useRef(aoTocarParada)
  tocarParada.current = aoTocarParada
  const [pronto, setPronto] = useState(false)
  const [semConexao, setSemConexao] = useState(false)
  // Muda a cada estilo carregado (refaz o traçado e os pinos depois da troca para o fundo liso).
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    if (!caixa.current) return
    const m = new maplibregl.Map({ container: caixa.current, style: ESTILO, center: [CENTRO_GOIANIA.lon, CENTRO_GOIANIA.lat], zoom: 12.5, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false })
    m.touchZoomRotate.disableRotation()
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ customAttribution: '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors', compact: true }))
    mapa.current = m
    // Sem internet e sem o estilo guardado: troca por um fundo liso local, para o traçado salvo e os pinos
    // continuarem visíveis (sem ruas desenhadas por baixo).
    let liso = false
    const usarFundoLiso = () => {
      if (liso) return
      liso = true
      setSemConexao(true)
      m.setStyle({ version: 8, sources: {}, layers: [{ id: 'fundo', type: 'background', paint: { 'background-color': cor('--mapa-fundo') ?? '#f4f6f5' } }] })
    }
    const limite = setTimeout(() => !m.isStyleLoaded() && usarFundoLiso(), 12_000)
    m.on('style.load', () => {
      if (!liso) clearTimeout(limite)
      if (!m.getSource('tracado')) {
        m.addSource('tracado', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        m.addLayer({ id: 'tracado-borda', type: 'line', source: 'tracado', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': cor('--tracado-borda') ?? '#fff', 'line-width': 8 } })
        m.addLayer({ id: 'tracado', type: 'line', source: 'tracado', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': cor('--tracado') ?? '#1d7a4e', 'line-width': 4.5 } })
      }
      setPronto(false)
      setPronto(true)
      setVersao((v) => v + 1)
    })
    m.on('error', () => !m.isStyleLoaded() && usarFundoLiso())
    m.on('click', (ev) => tocarMapa.current({ lat: ev.lngLat.lat, lon: ev.lngLat.lng }))
    return () => {
      clearTimeout(limite)
      m.remove()
      mapa.current = null
    }
  }, [])

  // Traçado real (só trechos com geometria do provedor).
  useEffect(() => {
    const m = mapa.current
    if (!m || !pronto) return
    const src = m.getSource('tracado') as maplibregl.GeoJSONSource | undefined
    src?.setData({ type: 'FeatureCollection', features: linhas.map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } })) })
  }, [linhas, pronto, versao])

  // Pinos: partida + paradas (número = posição na ordem; visitadas em menta com ✓).
  useEffect(() => {
    const m = mapa.current
    if (!m || !pronto) return
    pinos.current.forEach((p) => p.remove())
    const el = document.createElement('div')
    el.className = 'pino pino-partida'
    el.textContent = 'P'
    el.title = 'Partida (ponto público fictício)'
    const lista = [new maplibregl.Marker({ element: el }).setLngLat([partida.lon, partida.lat]).addTo(m)]
    paradas.forEach((p) => {
      const b = document.createElement('button')
      const k = posicao.get(p.id) ?? 0
      b.className = `pino ${p.visitada ? 'entregue' : `cor-${CORES[(p.n - 1) % 4]}`}`
      b.textContent = p.visitada ? '✓' : String(k || '•')
      b.setAttribute('aria-label', `Parada de teste ${p.n}${k ? `, ${k}ª na ordem` : ''}${p.visitada ? ', visitada' : ''}`)
      b.onclick = (ev) => {
        ev.stopPropagation()
        tocarParada.current(p.id)
      }
      lista.push(new maplibregl.Marker({ element: b }).setLngLat([p.lon, p.lat]).addTo(m))
    })
    pinos.current = lista
  }, [partida, paradas, posicao, pronto, versao])

  // Enquadra a rota quando o número de pontos muda.
  useEffect(() => {
    const m = mapa.current
    if (!m || !pronto || !paradas.length) return
    const b = new maplibregl.LngLatBounds()
    b.extend([partida.lon, partida.lat])
    paradas.forEach((p) => b.extend([p.lon, p.lat]))
    m.fitBounds(b, { padding: 50, maxZoom: 15, duration: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paradas.length, pronto])

  useEffect(() => {
    const m = mapa.current
    if (m && pronto && centro) m.easeTo({ center: [centro.lon, centro.lat], zoom: 15, duration: 0 })
  }, [centro, pronto])

  return (
    <>
      <div ref={caixa} style={{ position: 'absolute', inset: 0 }} aria-label="Mapa do teste de roteirização" />
      {semConexao && (
        <div className="sem-conexao" role="status" style={{ position: 'absolute', inset: 'auto 8px 8px 8px' }}>
          <strong>Sem o fundo do mapa (sem conexão)</strong>
          <span className="sub" style={{ margin: 0 }}>O traçado salvo e os pinos continuam aqui; as ruas por baixo voltam com a internet (o cache do mapa não é garantido).</span>
        </div>
      )}
    </>
  )
}
