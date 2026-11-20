// Minha localização no MapLibre (autorização P2 do protótipo): ponto azul, círculo de precisão, seta de direção
// (só quando confiável), botão "Minha localização" e avisos. Fica no bloco do mapa (carregado só em Rotas).
// Nada aqui guarda, envia ou registra a posição. A posição não muda a ordem das paradas.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Locate, LocateFixed, LocateOff } from 'lucide-react'
import { imprecisa, mapaNaTela, useLocalizacao } from '@/app/localizacao'
import { circuloGeo, linhaRetaKm } from '@/core/geo'
import { numero } from '@/core/formato'

const VAZIO = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [] as [number, number][][] } }
const cor = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || 'blue'
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

interface Props {
  mapa: maplibregl.Map | null
  pronto: boolean
  modo: 'mini' | 'cheio'
}

/** Desenha a posição no mapa e, em tela cheia, mostra o botão, o estado e o pedido de permissão. */
export function MinhaLocalizacao({ mapa, pronto, modo }: Props) {
  const loc = useLocalizacao()
  const marcador = useRef<maplibregl.Marker | null>(null)
  const ultimoCentro = useRef<{ lat: number; lon: number } | null>(null)

  // Este mapa está na tela: o GPS pode ficar ligado (se você ativou). Saiu: o GPS pausa.
  useEffect(() => (pronto ? mapaNaTela(modo) : undefined), [pronto, modo])

  // Camadas do círculo de precisão (abaixo do tracejado da ordem) e o marcador azul.
  useEffect(() => {
    const m = mapa
    if (!m || !pronto) return
    m.addSource('minha-precisao', { type: 'geojson', data: VAZIO })
    const antes = m.getLayer('ordem') ? 'ordem' : undefined
    m.addLayer({ id: 'minha-precisao', type: 'fill', source: 'minha-precisao', paint: { 'fill-color': cor('--minha-posicao'), 'fill-opacity': 0.14 } }, antes)
    m.addLayer({ id: 'minha-precisao-borda', type: 'line', source: 'minha-precisao', paint: { 'line-color': cor('--minha-posicao'), 'line-opacity': 0.45, 'line-width': 1 } }, antes)
    const el = document.createElement('div')
    el.className = 'minha-posicao'
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', 'Sua localização')
    el.innerHTML = '<span class="minha-rumo" aria-hidden="true"></span><span class="minha-ponto" aria-hidden="true"></span>'
    marcador.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
    // Arrastar o mapa com o dedo desliga só a centralização; o acompanhamento continua.
    const arrastou = (e: { originalEvent?: Event }) => {
      if (e.originalEvent) useLocalizacao.getState().soltar()
    }
    m.on('dragstart', arrastou)
    return () => {
      m.off('dragstart', arrastou)
      marcador.current?.remove()
      marcador.current = null
      if (m.getStyle()) {
        for (const id of ['minha-precisao-borda', 'minha-precisao']) if (m.getLayer(id)) m.removeLayer(id)
        if (m.getSource('minha-precisao')) m.removeSource('minha-precisao')
      }
    }
  }, [mapa, pronto])

  // Atualiza o ponto, o círculo e a seta a cada leitura (só a última leitura existe; nada é guardado).
  const { leitura, ativa, estado, seguir } = loc
  useEffect(() => {
    const m = mapa
    const mk = marcador.current
    if (!m || !pronto || !mk) return
    const fonte = m.getSource('minha-precisao') as maplibregl.GeoJSONSource | undefined
    if (!ativa || !leitura) {
      mk.remove()
      fonte?.setData(VAZIO)
      ultimoCentro.current = null
      return
    }
    const el = mk.getElement()
    el.classList.toggle('antiga', estado === 'sem-sinal')
    el.classList.toggle('com-rumo', leitura.rumo !== null)
    mk.setLngLat([leitura.lon, leitura.lat]).setRotation(leitura.rumo ?? 0)
    if (!el.isConnected) mk.addTo(m)
    fonte?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circuloGeo(leitura.lat, leitura.lon, leitura.precisaoM)] } })
  }, [mapa, pronto, ativa, leitura, estado])

  // Centralização automática (só em tela cheia; o mapa pequeno mostra a rota inteira).
  useEffect(() => {
    const m = mapa
    if (!m || !pronto || modo !== 'cheio' || !ativa || !seguir || !leitura) return
    const antes = ultimoCentro.current
    if (antes && linhaRetaKm(antes, leitura) * 1000 < 3) return // anti-tremor: parado não balança o mapa
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches
    m.easeTo({ center: [leitura.lon, leitura.lat], zoom: antes ? m.getZoom() : Math.max(m.getZoom(), 16), padding: { top: 70, bottom: 250, left: 0, right: 0 }, duration: calmo ? 0 : 500 })
    ultimoCentro.current = { lat: leitura.lat, lon: leitura.lon }
  }, [mapa, pronto, modo, ativa, seguir, leitura])
  // Voltou a centralizar: o próximo passo recentra mesmo sem andar.
  useEffect(() => {
    if (seguir) ultimoCentro.current = null
  }, [seguir])

  if (modo !== 'cheio') return null

  const Icone = estado === 'negada' || estado === 'sem-suporte' ? LocateOff : ativa && seguir ? LocateFixed : Locate
  return (
    <>
      <button
        className={`icone-botao minha-loc-botao ${ativa ? 'ativa' : ''} ${ativa && seguir ? 'seguindo' : ''}`}
        aria-label="Minha localização"
        aria-pressed={ativa && seguir}
        title="Minha localização"
        onClick={() => loc.pedirAtivacao()}
      >
        <Icone size={24} />
      </button>

      {(ativa || (estado !== 'desligada' && estado !== 'pedindo')) && (
        <div className={`minha-loc-estado ${estado}`} role="status" aria-live="polite">
          <span className="cresce">{textoEstado(loc)}</span>
          {ativa ? (
            <button onClick={loc.desativar}>Desligar</button>
          ) : (
            <button onClick={() => useLocalizacao.setState({ estado: 'desligada' })}>Fechar</button>
          )}
        </div>
      )}

    </>
  )
}

function textoEstado(l: ReturnType<typeof useLocalizacao.getState>): string {
  switch (l.estado) {
    case 'pedindo':
      return 'Procurando sua localização…'
    case 'ok': {
      if (l.imprecisaDesde !== null) return `Você · imprecisa (±${Math.round(l.precisaoRecebidaM ?? 0)} m). Mostrando a última posição boa.`
      const p = l.leitura!
      const raio = p.precisaoM >= 1000 ? `${numero(p.precisaoM / 1000)} km` : `${Math.round(p.precisaoM)} m`
      return imprecisa(p) ? `Você · imprecisa (±${raio}). Vá para céu aberto ou aguarde.` : `Você · ±${raio}${l.seguir ? '' : ' · toque no alvo para centralizar'}`
    }
    case 'sem-sinal':
      return l.leitura ? `Sem sinal do GPS desde ${hora(l.leitura.em)}. Mostrando a última posição.` : 'Sem sinal do GPS. Tentando de novo…'
    case 'indisponivel':
      return 'Localização indisponível. Confira se a localização (GPS) do celular está ligada.'
    case 'negada':
      return 'Permissão negada. Para liberar: toque no cadeado ao lado do endereço → Permissões → Localização.'
    case 'sem-suporte':
      return 'Este navegador não oferece localização aqui (precisa de HTTPS).'
    default:
      return ''
  }
}
