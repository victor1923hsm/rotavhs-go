// Guarda de privacidade dos pedidos ao provedor de rotas (requisitos 12 e 13 da R-B).
// Todo corpo de pedido passa por validarCarga ANTES de sair do aparelho: só coordenadas, índices e parâmetros técnicos.
// Qualquer texto fora da lista (nome, endereço, código SPX, número da etiqueta, id interno) faz o pedido ser recusado.

/** Chaves permitidas nos corpos JSON (ORS v2; Valhalla e OSRM entram aqui quando forem integrados). */
const CHAVES = new Set([
  'locations', 'coordinates', 'sources', 'destinations', 'metrics', 'units', 'radius', 'radiuses',
  'instructions', 'geometry', 'elevation', 'preference', 'continue_straight', 'geometry_simplify', 'resolve_locations',
  'options', 'avoid_features',
])
/** Textos permitidos (enums técnicos). Qualquer outro texto é recusado. */
const TEXTOS = new Set(['distance', 'duration', 'm', 'km', 'recommended', 'fastest', 'shortest', 'ferries', 'tollways', 'highways'])

export class CargaRecusada extends Error {
  constructor(motivo: string) {
    super(`Pedido ao provedor recusado pela guarda de privacidade: ${motivo}`)
    this.name = 'CargaRecusada'
  }
}

/** Valida o corpo de um pedido. Lança CargaRecusada no primeiro problema. */
export function validarCarga(corpo: unknown, caminho = '$'): void {
  if (corpo === null || typeof corpo === 'boolean') return
  if (typeof corpo === 'number') {
    if (!Number.isFinite(corpo)) throw new CargaRecusada(`número inválido em ${caminho}`)
    return
  }
  if (typeof corpo === 'string') {
    if (!TEXTOS.has(corpo)) throw new CargaRecusada(`texto não permitido em ${caminho}`)
    return
  }
  if (Array.isArray(corpo)) {
    corpo.forEach((v, i) => validarCarga(v, `${caminho}[${i}]`))
    return
  }
  if (typeof corpo === 'object') {
    for (const [k, v] of Object.entries(corpo as Record<string, unknown>)) {
      if (!CHAVES.has(k)) throw new CargaRecusada(`campo não permitido "${k}" em ${caminho}`)
      validarCarga(v, `${caminho}.${k}`)
    }
    return
  }
  throw new CargaRecusada(`tipo não permitido em ${caminho}`)
}

/** Coordenada no formato [lon, lat] com 6 casas (~0,1 m): nada além do necessário. */
export function coordenadaParaEnvio(c: { lat: number; lon: number }): [number, number] {
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon) || Math.abs(c.lat) > 90 || Math.abs(c.lon) > 180) throw new CargaRecusada('coordenada inválida')
  return [Math.round(c.lon * 1e6) / 1e6, Math.round(c.lat * 1e6) / 1e6]
}

/** Esconde a chave em qualquer texto (mensagens de erro, relatórios). */
export function ocultarChave(texto: string, chave: string | null | undefined): string {
  if (!chave || chave.length < 8) return texto
  return texto.split(chave).join('[chave oculta]')
}
