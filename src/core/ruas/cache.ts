// Chaves do cache de distâncias e trechos (só da rota em uso; apagado ao finalizar/encerrar a rota — regra da Etapa 3).
// Coordenadas arredondadas a 5 casas (~1 m): a mesma parada sempre gera a mesma chave.
import type { Coordenada, IdProvedor, PerfilVeiculo } from './tipos'

export const chaveCoordenada = (c: Coordenada) => `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`

/** Par de pontos (sentido importa: a matriz é assimétrica) + provedor + perfil + versão dos dados do mapa. */
export const chavePar = (de: Coordenada, para: Coordenada, provedor: IdProvedor, perfil: PerfilVeiculo, versao = '') =>
  `${provedor}|${perfil}|${versao}|${chaveCoordenada(de)}>${chaveCoordenada(para)}`

/** Validade máxima de um valor guardado (a rota é apagada antes disso na prática; ver regra da Etapa 3). */
export const VALIDADE_CACHE_MS = 7 * 24 * 3600 * 1000

export interface EntradaCache<T> {
  valor: T
  provedor: IdProvedor
  perfil: PerfilVeiculo
  /** Versão dos dados do mapa informada pelo provedor ('' se ele não informa). */
  versaoDados: string
  criadoEm: number
}

/**
 * Um valor guardado só vale para o mesmo provedor, o mesmo perfil de veículo e a mesma versão dos dados, e dentro
 * da validade. O sentido do trecho já está na chave (chavePar). Fora disso, o par é pedido de novo.
 */
export function entradaValida<T>(
  e: EntradaCache<T> | undefined,
  atual: { provedor: IdProvedor; perfil: PerfilVeiculo; versaoDados?: string; agora: number; validadeMs?: number },
): e is EntradaCache<T> {
  if (!e) return false
  if (e.provedor !== atual.provedor || e.perfil !== atual.perfil) return false
  if (atual.versaoDados !== undefined && atual.versaoDados !== '' && e.versaoDados !== atual.versaoDados) return false
  const idade = atual.agora - e.criadoEm
  return idade >= 0 && idade <= (atual.validadeMs ?? VALIDADE_CACHE_MS)
}
