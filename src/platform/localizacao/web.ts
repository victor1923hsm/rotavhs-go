// Implementação web do LocationProvider: navigator.geolocation.watchPosition.
// Bateria: alta precisão só quando pedida; maximumAge maior no modo econômico; clearWatch ao parar.

import { rumoConfiavel, type LocationProvider } from './tipos'

export const provedorWeb: LocationProvider = {
  capabilities: { background: false },

  observar({ alta }, aoLer, aoErro) {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator) || (typeof isSecureContext !== 'undefined' && !isSecureContext)) {
      aoErro('sem-suporte')
      return () => {}
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const c = p.coords
        aoLer({ lat: c.latitude, lon: c.longitude, precisaoM: c.accuracy, rumo: rumoConfiavel(c.heading, c.speed, c.accuracy), velocidadeMs: Number.isFinite(c.speed) ? c.speed : null, em: p.timestamp })
      },
      (e) => aoErro(e.code === e.PERMISSION_DENIED ? 'negada' : e.code === e.TIMEOUT ? 'tempo' : 'indisponivel'),
      alta ? { enableHighAccuracy: true, maximumAge: 3_000, timeout: 20_000 } : { enableHighAccuracy: false, maximumAge: 30_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  },

  async permissao() {
    try {
      const r = await navigator.permissions?.query({ name: 'geolocation' })
      return r?.state ?? 'prompt'
    } catch {
      return 'prompt'
    }
  },
}
