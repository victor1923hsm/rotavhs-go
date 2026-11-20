import { corDaParada, paradas, useEstado } from '@/app/estado'
import { rotuloStop, temCoordenada } from '@/core/parada'

/** Desenho esquemático da rota (sem tiles, sem MapLibre): usado no círculo de Estatísticas (G14). */
export function MapaEsquema({ ids, tamanho = 300 }: { ids: readonly string[]; tamanho?: number }) {
  const status = useEstado((e) => e.status)
  const ps = paradas(ids).filter(temCoordenada)
  if (ps.length === 0) return null
  const lats = ps.map((p) => p.lat)
  const lons = ps.map((p) => p.lon)
  const kx = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180))
  const w = (Math.max(...lons) - Math.min(...lons)) * kx || 1e-6
  const h = Math.max(...lats) - Math.min(...lats) || 1e-6
  const m = tamanho * 0.2
  const esc = (tamanho - 2 * m) / Math.max(w, h)
  const xy = (lat: number, lon: number) => [m + (lon - Math.min(...lons)) * kx * esc, m + (Math.max(...lats) - lat) * esc] as const
  const caminho = ps.map((p, i) => `${i ? 'L' : 'M'}${xy(p.lat, p.lon).join(' ')}`).join(' ')
  const ruas = []
  for (let i = 0; i < 9; i++) {
    const y = (i * tamanho) / 8
    ruas.push(<path key={`h${i}`} d={`M0 ${y} q ${tamanho / 3} -12 ${tamanho / 2} 0 t ${tamanho / 2} 0`} stroke="var(--mapa-rua)" fill="none" />)
    ruas.push(<path key={`v${i}`} d={`M${y} 0 q 10 ${tamanho / 4} 0 ${tamanho / 2} t 0 ${tamanho / 2}`} stroke="var(--mapa-rua)" fill="none" />)
  }
  return (
    <svg viewBox={`0 0 ${tamanho} ${tamanho}`} width="100%" height="100%" aria-label="Esquema da rota">
      <rect width={tamanho} height={tamanho} fill="var(--mapa-esquema-fundo)" />
      {ruas}
      <path d={caminho} stroke="var(--mapa-esquema-traco)" strokeWidth={1.6} strokeDasharray="3 3" fill="none" opacity={0.7} />
      {ps.map((p) => {
        const [x, y] = xy(p.lat, p.lon)
        const st = status[p.id]
        return (
          <g key={p.id}>
            <circle cx={x} cy={y} r={7} fill={st === 'entregue' ? 'var(--menta)' : st === 'falha' ? 'var(--mapa-esquema-fundo)' : `var(--stop-${corDaParada(p.id)})`} stroke="var(--mapa-esquema-traco)" strokeWidth={1.4} />
            {st !== 'entregue' && (
              <text x={x} y={y + 2.6} fontSize={7} fontWeight={700} textAnchor="middle" fill="var(--mapa-esquema-traco)">
                {rotuloStop(p)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
