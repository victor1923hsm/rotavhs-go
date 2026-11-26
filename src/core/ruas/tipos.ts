// RoutingProvider (RB1, aprovada em 2026-11-26): interface única para qualquer provedor de rotas pelas ruas
// (OpenRouteService agora; Valhalla e OSRM no futuro). O motor de otimização NÃO conhece o provedor: recebe só a Matriz.
//
// Regras que todo provedor respeita (verificadas por src/core/ruas/privacidade.ts e pelos testes):
//  - só recebe COORDENADAS (lat/lon) e parâmetros técnicos; nunca nome, telefone, endereço em texto, código SPX,
//    número da etiqueta, ids internos ou nome do arquivo;
//  - "sem percurso" é um resultado explícito (null), nunca substituído por linha reta;
//  - a geometria devolvida é a do percurso pelas ruas; um provedor sem geometria não desenha nada.

export interface Coordenada {
  lat: number
  lon: number
}

/** Veículo. Hoje: carro (R3). Moto fica prevista (só o Valhalla tem custo de moto pronto). */
export type PerfilVeiculo = 'carro' | 'moto'

export type IdProvedor = 'ors' | 'valhalla' | 'osrm' | 'estimada' | 'sintetico'

/** Limites do provedor, para dividir os pedidos e controlar a cota (valores conferidos na fonte oficial). */
export interface LimitesProvedor {
  /** Pares origem × destino por pedido de matriz. */
  maxParesMatriz: number
  /** Pontos por pedido de rota (traçado). */
  maxPontosRota: number
  /** Pontos por pedido de encaixe na malha. */
  maxPontosEncaixe: number
  /** Pedidos por minuto e por dia, por serviço (Infinity = sem limite, ex.: servidor próprio). */
  porMinuto: { matriz: number; rota: number; encaixe: number }
  porDia: { matriz: number; rota: number; encaixe: number }
}

/** Resultado do encaixe de um ponto na malha viária (null = nenhuma via no raio pedido). */
export interface Encaixe {
  acesso: Coordenada
  /** Distância da coordenada original até o ponto de acesso na via, em metros. */
  distanciaM: number
}

/** Um bloco da matriz: tempos (s) e distâncias (m); null = sem percurso para aquele par. */
export interface BlocoMatriz {
  origens: readonly number[]
  destinos: readonly number[]
  segundos: (number | null)[][]
  metros: (number | null)[][]
  /** Versão/data dos dados do mapa no provedor (para invalidar o cache quando o mapa muda). */
  versaoDados?: string
  /** Tamanho da resposta (bytes), para o relatório de consumo. */
  bytes?: number
}

/** Geometria de um trecho entre dois pontos consecutivos da sequência, pelas ruas. */
export interface TrechoRuas {
  /** Índices na sequência enviada (de → para = de + 1). */
  de: number
  para: number
  /** [lon, lat] (formato GeoJSON). */
  pontos: [number, number][]
  metros: number
  segundos: number
}

export type TipoFalha =
  | 'limite-minuto' // 429: esperar e continuar
  | 'cota-diaria' // 403 por cota: parar e guardar o que já veio
  | 'chave' // chave ausente ou inválida
  | 'indisponivel' // 5xx
  | 'tempo-esgotado' // o provedor não respondeu no tempo limite
  | 'sem-conexao' // sem rede (o pedido nem chegou)
  | 'requisicao' // pedido recusado (parâmetro, limite do pedido)
  | 'resposta-incompleta' // resposta com formato errado, tamanhos diferentes do pedido ou valores inválidos
  | 'cota-ou-chave' // 403 ambíguo ("Daily quota reached or API key unauthorized") sem cabeçalho que desempate
  | 'cota-local' // o consumo previsto passaria do que resta da cota do dia (contador do aparelho)
  | 'bloqueado' // envio ao provedor real ainda não liberado (termos/autorização pendentes)
  | 'cancelado'

/** Falha de provedor. A mensagem nunca contém a chave nem dados da rota (só tipo e código). */
export class FalhaProvedor extends Error {
  constructor(
    readonly tipo: TipoFalha,
    readonly codigo?: number,
    /** Quanto esperar antes de tentar de novo (ex.: Retry-After de um 429). */
    readonly esperarMs?: number,
  ) {
    super(`Falha do provedor de rotas: ${tipo}${codigo ? ` (${codigo})` : ''}`)
    this.name = 'FalhaProvedor'
  }
}

export interface RoutingProvider {
  readonly id: IdProvedor
  readonly limites: LimitesProvedor
  readonly perfis: readonly PerfilVeiculo[]
  /** true = os números e a geometria são pelas ruas; false = estimativa (nunca desenhada como percurso). */
  readonly pelasRuas: boolean
  /** Encaixa cada ponto na via mais próxima até `raioM` metros. Mesma ordem da entrada. */
  encaixar(pontos: readonly Coordenada[], raioM: number, perfil: PerfilVeiculo, sinal?: AbortSignal): Promise<(Encaixe | null)[]>
  /** Matriz de um bloco: `pontos` são TODOS os pontos da rota; `origens`/`destinos` são índices em `pontos`. */
  matriz(pontos: readonly Coordenada[], origens: readonly number[], destinos: readonly number[], perfil: PerfilVeiculo, sinal?: AbortSignal): Promise<BlocoMatriz>
  /** Traçado pelas ruas passando pelos pontos, na ordem. Um provedor sem geometria lança FalhaProvedor('requisicao'). */
  rota(sequencia: readonly Coordenada[], perfil: PerfilVeiculo, sinal?: AbortSignal): Promise<TrechoRuas[]>
}
