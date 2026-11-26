// Implementação web do armazenamento: IndexedDB pelo Dexie. Os dados ficam só no navegador deste aparelho.
// v1 (Etapa 3 inicial) → v2 (Etapa 3 concluída): migração SEM apagar o banco (ver `upgrade`).
//
// Gravações importantes com durabilidade "strict" (o navegador só confirma depois de gravar no disco):
// reduz o risco de perder a última marcação numa falta de energia. Não há garantia absoluta: se os dados
// do navegador forem apagados, ou o disco falhar, a rota não volta.

import Dexie, { type EntityTable, type Transaction } from 'dexie'
import { alertasVazios } from '@/core/alertas'
import type { Veiculo } from '@/core/custo'
import type { Parada } from '@/core/parada'
import { validarResumo, type ResumoRota } from '@/core/resumo'
import {
  pacotesDosEventos,
  PREFERENCIAS_PADRAO,
  type Armazenamento,
  type Conferencia,
  type EventoParada,
  type Plano,
  type Preferencias,
  type RotaListada,
  type RotaSalva,
  type Sessao,
} from './tipos'

export interface LinhaRota extends Partial<Sessao> {
  id: string
  status: 'ativa' | 'finalizando' | 'finalizada'
  fonte: 'planilha' | 'exemplo'
  arquivo: string
  ordemSpx: string[]
  pacotes: number
  semCoordenada: number
  criadaEm: number
  atualizadaEm: number
  fase: Sessao['fase']
  ordem: string[]
  selecionada: string
  iniciadaEm: number | null
}
export interface LinhaParada {
  routeId: string
  id: string
  /** Posição na planilha (para devolver as paradas na mesma ordem). */
  pos: number
  p: Parada
}
export interface LinhaPacote {
  seq?: number
  routeId: string
  stopId: string
  codigo: string
}
export interface LinhaEvento extends EventoParada {
  seq?: number
}
export interface LinhaPlano extends Plano {}
export interface LinhaDistancias {
  routeId: string
  origem: 'estimada' | 'ruas'
  dados: unknown
}
export interface LinhaConfig {
  chave: string
  valor: unknown
}

export const NOME_BANCO = 'rotavhsgo'
/** Versão atual do schema. */
export const VERSAO_BANCO = 2

/** Tabelas que guardam detalhes de UMA rota (apagadas ao finalizar). */
const TABELAS_DA_ROTA = ['routes', 'stops', 'packages', 'stopEvents', 'plans', 'distanceCache'] as const

export const ESQUEMA_V1 = {
  routes: 'id, status, criadaEm',
  stops: '[routeId+id], routeId',
  packages: '++seq, routeId, [routeId+stopId]',
  stopEvents: '++seq, rotaId, [rotaId+paradaId]',
  routeSummaries: 'rotaId, finalizadaEm',
  distanceCache: 'routeId',
  settings: 'chave',
}
export const ESQUEMA_V2 = {
  ...ESQUEMA_V1,
  plans: 'id, rotaId, [rotaId+criadoEm]',
  importDrafts: 'id',
}

export class BancoRotaVHS extends Dexie {
  routes!: EntityTable<LinhaRota, 'id'>
  stops!: Dexie.Table<LinhaParada, [string, string]>
  packages!: EntityTable<LinhaPacote, 'seq'>
  stopEvents!: EntityTable<LinhaEvento, 'seq'>
  routeSummaries!: EntityTable<ResumoRota, 'rotaId'>
  distanceCache!: EntityTable<LinhaDistancias, 'routeId'>
  settings!: EntityTable<LinhaConfig, 'chave'>
  plans!: EntityTable<LinhaPlano, 'id'>
  importDrafts!: EntityTable<Conferencia, 'id'>

  constructor(nome = NOME_BANCO) {
    super(nome, { chromeTransactionDurability: 'strict' })
    this.version(1).stores(ESQUEMA_V1)
    this.version(2)
      .stores(ESQUEMA_V2)
      .upgrade((tx) => migrarV1paraV2(tx))
  }
}

/**
 * v1 → v2, sem apagar nada:
 *  - eventos da demonstração P3 só com o código do pacote ganham `pacoteIdx`;
 *  - rotas ativas ganham o plano da SPX (e o da ordem atual, se for diferente), plano ativo e alertas vazios;
 *  - rotas finalizadas da v1 (que guardavam endereços) têm o resumo marcado com limpeza "pendente": a nova regra
 *    de privacidade apaga os detalhes delas na abertura seguinte (o resumo fica).
 */
export async function migrarV1paraV2(tx: Transaction) {
  const stops = tx.table<LinhaParada>('stops')
  const eventos = tx.table<LinhaEvento>('stopEvents')
  const routes = tx.table<LinhaRota>('routes')
  const plans = tx.table<LinhaPlano>('plans')
  const resumos = tx.table<ResumoRota>('routeSummaries')
  const cache = new Map<string, Parada>()
  const paradaDe = async (rotaId: string, id: string) => {
    const k = `${rotaId}|${id}`
    if (!cache.has(k)) {
      const l = await stops.get([rotaId, id])
      if (l) cache.set(k, l.p)
    }
    return cache.get(k)
  }
  const comCodigo = await eventos.filter((e) => e.pacote !== undefined && e.pacoteIdx === undefined).toArray()
  for (const e of comCodigo) {
    const p = await paradaDe(e.rotaId, e.paradaId)
    const i = p ? p.pacotes.indexOf(e.pacote!) : -1
    if (i >= 0) await eventos.update(e.seq!, { pacoteIdx: i })
  }
  for (const r of await routes.toArray()) {
    if (r.status === 'finalizada') {
      await routes.update(r.id, { status: 'finalizando' })
      const s = await resumos.get(r.id)
      if (s) await resumos.update(r.id, { limpeza: 'pendente', arquivo: '' })
      continue
    }
    const spx: LinhaPlano = { id: `${r.id}:spx`, rotaId: r.id, tipo: 'spx', criadoEm: r.criadaEm, ordem: [...r.ordemSpx], km: 0, origem: null }
    await plans.put(spx)
    let ativo = spx.id
    if (r.ordem && r.ordem.join() !== r.ordemSpx.join()) {
      const atual: LinhaPlano = { id: `${r.id}:migrado`, rotaId: r.id, tipo: 'otimizada', criadoEm: r.atualizadaEm, ordem: [...r.ordem], km: 0, origem: null }
      await plans.put(atual)
      ativo = atual.id
    }
    await routes.update(r.id, { planoAtivo: ativo, origemOtimizacao: null, alertas: alertasVazios() })
  }
  // Resumos antigos: o nome do arquivo não é mais guardado.
  await resumos.toCollection().modify((s) => {
    s.arquivo = ''
  })
}

export function armazenamentoDexie(db = new BancoRotaVHS()): Armazenamento & { db: BancoRotaVHS } {
  /** Apaga TODOS os detalhes de uma rota (paradas, pacotes, eventos, planos, matriz, a própria rota). */
  const apagarDetalhes = async (rotaId: string) => {
    await db.transaction('rw', [db.routes, db.stops, db.packages, db.stopEvents, db.plans, db.distanceCache], async () => {
      await db.stops.where('routeId').equals(rotaId).delete()
      await db.packages.where('routeId').equals(rotaId).delete()
      await db.stopEvents.where('rotaId').equals(rotaId).delete()
      await db.plans.where('rotaId').equals(rotaId).delete()
      await db.distanceCache.delete(rotaId)
      await db.routes.delete(rotaId)
    })
  }
  /** Confere que nada da rota ficou acessível nas tabelas do app. */
  const restaDaRota = async (rotaId: string) =>
    (await db.stops.where('routeId').equals(rotaId).count()) +
    (await db.packages.where('routeId').equals(rotaId).count()) +
    (await db.stopEvents.where('rotaId').equals(rotaId).count()) +
    (await db.plans.where('rotaId').equals(rotaId).count()) +
    ((await db.distanceCache.get(rotaId)) ? 1 : 0) +
    ((await db.routes.get(rotaId)) ? 1 : 0)

  const limpar = async (rotaId: string) => {
    await apagarDetalhes(rotaId)
    const resta = await restaDaRota(rotaId)
    if (resta > 0) throw new Error(`limpeza incompleta: ${resta} registro(s) da rota ainda existem`)
    await db.routeSummaries.update(rotaId, { limpeza: 'concluida', limpaEm: Date.now() })
  }

  return {
    tipo: 'indexeddb',
    db,

    async rotaAtiva(): Promise<RotaSalva | null> {
      return db.transaction('r', [db.routes, db.stops, db.stopEvents, db.plans], async () => {
        const ativas = await db.routes.where('status').equals('ativa').sortBy('criadaEm')
        // Da mais nova para a mais antiga: uma rota com dados faltando (corrompida) não impede as outras.
        for (const r of ativas.reverse()) {
          const linhas = await db.stops.where('routeId').equals(r.id).toArray()
          if (!linhas.length) continue
          linhas.sort((a, b) => a.pos - b.pos)
          const paradas = linhas.map((l) => l.p)
          const ids = new Set(paradas.map((p) => p.id))
          const eventos = await db.stopEvents.where('rotaId').equals(r.id).sortBy('seq')
          const planos = (await db.plans.where('rotaId').equals(r.id).sortBy('criadoEm')).filter((p) => p.ordem.length === paradas.length && p.ordem.every((id) => ids.has(id)))
          return {
            rotaId: r.id,
            rota: { fonte: r.fonte, arquivo: r.arquivo, paradas, ordemSpx: r.ordemSpx.filter((id) => ids.has(id)), pacotes: r.pacotes, semCoordenada: r.semCoordenada },
            pacotes: pacotesDosEventos(paradas, eventos),
            planos,
            fase: r.fase,
            ordem: r.ordem,
            selecionada: r.selecionada,
            iniciadaEm: r.iniciadaEm,
            planoAtivo: r.planoAtivo ?? null,
            origemOtimizacao: r.origemOtimizacao ?? null,
            alertas: r.alertas ?? alertasVazios(),
            criadaEm: r.criadaEm,
            atualizadaEm: r.atualizadaEm,
          }
        }
        return null
      })
    },

    async salvarRota(rotaId, rota, sessao, planos) {
      const agora = Date.now()
      await db.transaction('rw', [db.routes, db.stops, db.packages, db.plans], async () => {
        await db.routes.put({
          id: rotaId, status: 'ativa', fonte: rota.fonte, arquivo: rota.arquivo, ordemSpx: [...rota.ordemSpx],
          pacotes: rota.pacotes, semCoordenada: rota.semCoordenada, criadaEm: agora, atualizadaEm: agora, ...structuredClone(sessao),
        })
        await db.stops.bulkPut(rota.paradas.map((p, pos) => ({ routeId: rotaId, id: p.id, pos, p })))
        await db.packages.bulkAdd(rota.paradas.flatMap((p) => p.pacotes.map((codigo) => ({ routeId: rotaId, stopId: p.id, codigo }))))
        await db.plans.bulkPut(planos.map((p) => ({ ...p, rotaId, ordem: [...p.ordem] })))
      })
    },

    async registrarMudanca(rotaId, eventos, sessao) {
      await db.transaction('rw', [db.routes, db.stopEvents], async () => {
        if (eventos.length) await db.stopEvents.bulkAdd(eventos.map((e) => ({ ...e })))
        if (sessao) await db.routes.update(rotaId, { ...structuredClone(sessao), atualizadaEm: Date.now() })
        else if (eventos.length) await db.routes.update(rotaId, { atualizadaEm: Date.now() })
      })
    },

    async salvarPlanos(rotaId, planos) {
      await db.transaction('rw', [db.plans], async () => {
        await db.plans.where('rotaId').equals(rotaId).delete()
        await db.plans.bulkPut(planos.map((p) => ({ ...p, rotaId, ordem: [...p.ordem] })))
      })
    },

    async finalizarRota(resumo) {
      // 1) validar
      const erros = validarResumo(resumo)
      if (erros.length) throw new Error(`resumo inválido: ${erros.join('; ')}`)
      // 2) gravar o resumo (limpeza pendente) e marcar a rota como "finalizando", juntos
      const r = { ...resumo, limpeza: 'pendente' as const }
      await db.transaction('rw', [db.routeSummaries, db.routes], async () => {
        await db.routeSummaries.put(r)
        if (await db.routes.get(resumo.rotaId)) await db.routes.update(resumo.rotaId, { status: 'finalizando', atualizadaEm: Date.now() })
      })
      // 3) conferir a gravação antes de apagar qualquer coisa
      const lido = await db.routeSummaries.get(resumo.rotaId)
      if (!lido || lido.paradas !== r.paradas || lido.pacotes !== r.pacotes || lido.custoCentavos !== r.custoCentavos) throw new Error('o resumo não foi confirmado no aparelho')
      // 4–6) apagar os detalhes, conferir e marcar a limpeza como concluída
      await limpar(resumo.rotaId)
    },

    async concluirLimpezasPendentes() {
      const feitas: string[] = []
      const pendentes = new Set<string>([
        ...(await db.routeSummaries.filter((s) => s.limpeza === 'pendente').primaryKeys()),
        ...(await db.routes.where('status').anyOf('finalizando', 'finalizada').primaryKeys()),
      ])
      for (const id of pendentes) {
        if (!(await db.routeSummaries.get(id))) continue // sem resumo guardado: nunca apaga (nada se perde)
        await limpar(id)
        feitas.push(id)
      }
      return feitas
    },

    async apagarRota(rotaId) {
      await apagarDetalhes(rotaId)
    },

    async listarRotas(): Promise<RotaListada[]> {
      const rs = await db.routes.where('status').anyOf('ativa', 'finalizando').toArray()
      return Promise.all(
        rs.map(async (r) => ({
          id: r.id,
          status: r.status === 'ativa' ? 'ativa' : 'finalizando',
          fonte: r.fonte,
          criadaEm: r.criadaEm,
          atualizadaEm: r.atualizadaEm,
          visitas: await db.stops.where('routeId').equals(r.id).count(),
          pacotes: r.pacotes,
        })),
      )
    },

    async resumos() {
      return db.routeSummaries.orderBy('finalizadaEm').reverse().toArray()
    },
    async guardarResumo(resumo) {
      await db.routeSummaries.put(resumo)
    },
    async apagarResumo(rotaId) {
      await db.routeSummaries.delete(rotaId)
    },

    async lerConferencia() {
      return (await db.importDrafts.get('atual')) ?? null
    },
    async salvarConferencia(c) {
      await db.importDrafts.put(structuredClone(c))
    },
    async apagarConferencia() {
      await db.importDrafts.delete('atual')
    },

    async lerVeiculo() {
      return (await db.settings.get('veiculo'))?.valor as Veiculo | undefined
    },
    async salvarVeiculo(v) {
      await db.settings.put({ chave: 'veiculo', valor: { ...v } })
    },
    async lerPreferencias() {
      return { ...PREFERENCIAS_PADRAO, ...((await db.settings.get('preferencias'))?.valor as Partial<Preferencias> | undefined) }
    },
    async salvarPreferencias(p) {
      await db.settings.put({ chave: 'preferencias', valor: { ...p } })
    },

    async lerMatrizRuas(rotaId) {
      const l = await db.distanceCache.get(rotaId)
      return l?.origem === 'ruas' ? l.dados : null
    },
    async salvarMatrizRuas(rotaId, dados) {
      // Só grava para uma rota que existe (nunca recria dados de uma rota já apagada).
      await db.transaction('rw', [db.routes, db.distanceCache], async () => {
        const r = await db.routes.get(rotaId)
        if (!r || r.status !== 'ativa') return
        await db.distanceCache.put({ routeId: rotaId, origem: 'ruas', dados })
      })
    },

    async pedirPersistencia() {
      try {
        if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
        if (await navigator.storage.persisted?.()) return true
        const ok = await navigator.storage.persist()
        await db.settings.put({ chave: 'persistencia', valor: { pedidaEm: Date.now(), concedida: ok } })
        return ok
      } catch {
        return false
      }
    },
  }
}

export { TABELAS_DA_ROTA }
