// Armazenamento do modo experimental: um banco SEPARADO ("rotavhsgo-experimental") só com dados fictícios do teste.
// Nunca contém nada das rotas da SPX, e as rotas da SPX nunca leem daqui. "Apagar dados do teste" apaga tudo.
import Dexie, { type EntityTable } from 'dexie'
import type { MatrizGuardada } from '@/core/ruas/cacheMatriz'

export interface ParadaTeste {
  id: string
  /** Número de exibição (1, 2, 3…) — só do teste. */
  n: number
  lat: number
  lon: number
  origem: 'sorteio' | 'mapa'
  visitada: boolean
}

export interface TrechoGuardado {
  pontos: [number, number][]
  metros: number
  segundos: number
}

export interface ComparacaoTeste {
  /** Ordem da otimização RÁPIDA (linha reta × 1,35) avaliada pela MESMA matriz pelas ruas. */
  rapida: { km: number; min: number; kmModelo: number; minModelo: number }
  /** Ordem da otimização PELAS RUAS (matriz real). */
  ruas: { km: number; min: number }
  /** Percurso desenhado (directions): soma real dos trechos da ordem pelas ruas. */
  tracado: { km: number; min: number; trechos: number; semTracado: number } | null
  ms: { encaixe: number; matriz: number; algoritmo: number; tracado: number }
  pedidos: { encaixe: number; matriz: number; rota: number }
  em: number
  offline?: boolean
}

export interface TesteSalvo {
  id: 'atual'
  versao: 1
  partida: { lat: number; lon: number; nome: string }
  paradas: ParadaTeste[]
  /** Ordem atual (ids). */
  ordem: string[]
  matriz?: MatrizGuardada
  /** Traçado por par de pontos ("lon,lat>lon,lat" das coordenadas de cálculo). */
  trechos: Record<string, TrechoGuardado>
  /** Coordenadas de cálculo (acesso na via) por id de parada e da partida ("partida"). */
  acessos: Record<string, { lat: number; lon: number }>
  comparacao?: ComparacaoTeste
  atualizadoEm: number
}

class BancoExperimental extends Dexie {
  testes!: EntityTable<TesteSalvo, 'id'>
  constructor() {
    super('rotavhsgo-experimental')
    this.version(1).stores({ testes: 'id' })
  }
}

let banco: BancoExperimental | null = null
const db = () => (banco ??= new BancoExperimental())

export async function lerTeste(): Promise<TesteSalvo | null> {
  try {
    return (await db().testes.get('atual')) ?? null
  } catch {
    return null
  }
}

export async function salvarTeste(t: TesteSalvo): Promise<void> {
  await db().testes.put({ ...t, atualizadoEm: Date.now() })
}

export async function apagarTeste(): Promise<void> {
  await db().testes.clear()
}
