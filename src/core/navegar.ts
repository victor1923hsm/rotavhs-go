// Revisão 11: "Navegar" abre o Google Maps ou o Waze já com o destino, SÓ quando você toca.
// O RotaVHS não envia nada: o link leva apenas o destino daquela parada para o app escolhido.

import { temCoordenada, type Parada } from './parada'

export type AppNavegacao = 'google' | 'waze'

export function linkNavegacao(p: Parada, app: AppNavegacao): string {
  const coord = temCoordenada(p) ? `${p.lat.toFixed(6)},${p.lon.toFixed(6)}` : null
  const texto = encodeURIComponent([p.endereco, p.bairro].filter(Boolean).join(', '))
  if (app === 'google') return `https://www.google.com/maps/dir/?api=1&destination=${coord ?? texto}&travelmode=driving`
  return coord ? `https://waze.com/ul?ll=${coord}&navigate=yes` : `https://waze.com/ul?q=${texto}&navigate=yes`
}
