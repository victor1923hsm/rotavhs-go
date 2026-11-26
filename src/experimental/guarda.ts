// Guarda técnica do modo experimental (RB-4). O envio REAL ao provedor só acontece por um cliente criado com esta
// guarda, e ela recusa QUALQUER coordenada que:
//   1. não tenha sido registrada pelo próprio modo experimental (sorteio, toque no mapa, partida pública, ou ponto
//      devolvido pelo provedor para um ponto já registrado);
//   2. esteja fora de Goiânia;
//   3. coincida (até ~20 m) com qualquer coordenada de uma rota SPX carregada no app (planilha) — defesa extra.
// A autorização é um objeto que só este módulo cria, depois do seu "Autorizo" na tela do modo experimental.
// As rotas da SPX continuam com ENVIO_REAL_LIBERADO = false e sem guarda: o cliente delas recusa o envio real.
import { dentroDeGoiania, type Coord } from './area'

// Mesma normalização do envio (coordenadaParaEnvio: 6 casas por arredondamento).
const n6 = (v: number) => (Math.round(v * 1e6) / 1e6).toFixed(6)
const chave = (lon: number, lat: number) => `${n6(lon)},${n6(lat)}`
const MARCA = Symbol('autorizacao-experimental')

export class AutorizacaoExperimental {
  readonly [MARCA] = true
  private constructor(readonly em: number) {}
  /** @internal só criarAutorizacao chama. */
  static _criar(em: number) {
    return new AutorizacaoExperimental(em)
  }
}

/** Criada SÓ pelo toque em "Autorizo" no modo experimental (ver TestarRoteirizacao). */
export function criarAutorizacao(): AutorizacaoExperimental {
  return AutorizacaoExperimental._criar(Date.now())
}

export class RegistroExperimental {
  private readonly permitidas = new Set<string>()

  registrar(c: Coord) {
    if (!dentroDeGoiania(c)) throw new Error('Ponto experimental fora de Goiânia')
    this.permitidas.add(chave(c.lon, c.lat))
  }

  tem(c: Coord) {
    return this.permitidas.has(chave(c.lon, c.lat))
  }

  get tamanho() {
    return this.permitidas.size
  }
}

/**
 * Monta a guarda para o cliente do provedor. `coordenadasSpx` devolve as coordenadas da rota da SPX carregada (se
 * houver), consultadas a cada pedido.
 */
export function guardaExperimental(
  aut: AutorizacaoExperimental | null,
  registro: RegistroExperimental,
  coordenadasSpx: () => readonly Coord[],
): (coordenadas: readonly [number, number][]) => void {
  return (cs) => {
    if (!(aut instanceof AutorizacaoExperimental) || aut[MARCA] !== true) throw new Error('Sem autorização experimental')
    if (!cs.length) throw new Error('Pedido sem coordenadas')
    const spx = coordenadasSpx()
    for (const [lon, lat] of cs) {
      const c = { lat, lon }
      if (!dentroDeGoiania(c)) throw new Error('Fora de Goiânia')
      if (!registro.tem(c)) throw new Error('Coordenada não registrada pelo modo experimental')
      for (const p of spx) if (Math.abs(p.lat - lat) < 0.0002 && Math.abs(p.lon - lon) < 0.0002) throw new Error('Coincide com uma parada da SPX')
    }
  }
}
