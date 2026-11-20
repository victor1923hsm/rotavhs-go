// Mapas guardados para uso sem internet (Q3): só as áreas do mapa já vistas, até ~60 MB (G6).
// Limpar apaga apenas esse cache do navegador. Rotas, entregas e resumos ficam no IndexedDB e não são tocados.

export const CACHE_MAPA = 'mapa-tiles'
const ESTIMATIVA_TILE = 40 * 1024

export interface InfoMapas {
  disponivel: boolean
  itens: number
  bytes: number
}

export async function infoMapas(): Promise<InfoMapas> {
  if (typeof caches === 'undefined') return { disponivel: false, itens: 0, bytes: 0 }
  try {
    if (!(await caches.has(CACHE_MAPA))) return { disponivel: true, itens: 0, bytes: 0 }
    const c = await caches.open(CACHE_MAPA)
    const chaves = await c.keys()
    let bytes = 0
    for (const req of chaves) {
      const r = await c.match(req)
      if (!r) continue
      const n = Number(r.headers.get('content-length'))
      if (r.type !== 'opaque' && Number.isFinite(n) && n > 0) bytes += n
      else if (r.type !== 'opaque') bytes += (await r.clone().blob()).size
      else bytes += ESTIMATIVA_TILE
    }
    return { disponivel: true, itens: chaves.length, bytes }
  } catch {
    return { disponivel: false, itens: 0, bytes: 0 }
  }
}

/** Apaga só o cache do mapa. Devolve se conseguiu. */
export async function limparMapas(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    await caches.delete(CACHE_MAPA)
    return true
  } catch {
    return false
  }
}

export const mb = (bytes: number) => (bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: bytes > 0 && bytes < 1024 * 1024 ? 1 : 0 })
