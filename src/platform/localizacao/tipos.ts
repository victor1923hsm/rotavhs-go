// LocationProvider (G1/G7): o app só conhece esta interface. Hoje: Geolocation API do navegador (web.ts).
// Na versão nativa (N1) muda só a implementação. Autorização específica do protótipo: P2 (docs/DECISOES.md).
//
// PRIVACIDADE (P2): a posição fica só na memória, na tela. Nada aqui grava, envia ou registra em log.

export interface Leitura {
  lat: number
  lon: number
  /** Raio de precisão informado pelo aparelho, em metros. */
  precisaoM: number
  /** Direção do movimento em graus (0 = norte), só quando confiável; senão null. */
  rumo: number | null
  /** Velocidade em m/s informada pelo aparelho (null = não informada). Só na memória. */
  velocidadeMs?: number | null
  /** Quando a leitura foi feita (ms). */
  em: number
}

export type ErroLocalizacao = 'negada' | 'indisponivel' | 'tempo' | 'sem-suporte'

export interface Opcoes {
  /** GPS em alta precisão (gasta mais bateria). */
  alta: boolean
}

export interface LocationProvider {
  readonly capabilities: { background: boolean }
  /** Começa a observar; devolve a função que PARA o monitoramento. */
  observar(opcoes: Opcoes, aoLer: (l: Leitura) => void, aoErro: (e: ErroLocalizacao) => void): () => void
  /** Estado da permissão sem pedir nada ao usuário ('prompt' quando o navegador não informa). */
  permissao(): Promise<'granted' | 'denied' | 'prompt'>
}

/** Acima disso a leitura é mostrada, mas avisada como imprecisa (G7: ~50 m). */
export const IMPRECISA_M = 50
/** Rumo só é confiável em movimento (≥ ~5 km/h) e com boa precisão. */
export const VELOCIDADE_RUMO_MS = 1.4

export function rumoConfiavel(heading: number | null | undefined, velocidade: number | null | undefined, precisaoM: number): number | null {
  if (heading === null || heading === undefined || !Number.isFinite(heading)) return null
  if (velocidade === null || velocidade === undefined || !Number.isFinite(velocidade) || velocidade < VELOCIDADE_RUMO_MS) return null
  if (precisaoM > IMPRECISA_M) return null
  return ((heading % 360) + 360) % 360
}
