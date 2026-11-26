// Chaves do cache de distâncias e trechos (só da rota em uso; apagado ao finalizar/encerrar a rota — regra da Etapa 3).
// Coordenadas arredondadas a 5 casas (~1 m): a mesma parada sempre gera a mesma chave.
import type { Coordenada, IdProvedor, PerfilVeiculo } from './tipos'

export const chaveCoordenada = (c: Coordenada) => `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`

/** Par de pontos (sentido importa: a matriz é assimétrica) + provedor + perfil + versão dos dados do mapa. */
export const chavePar = (de: Coordenada, para: Coordenada, provedor: IdProvedor, perfil: PerfilVeiculo, versao = '') =>
  `${provedor}|${perfil}|${versao}|${chaveCoordenada(de)}>${chaveCoordenada(para)}`
