// Adaptador de armazenamento (Etapa 3). O app só conhece esta interface: hoje a implementação é o
// IndexedDB do navegador (Dexie); na versão nativa (N1) basta outra implementação com o mesmo contrato.
// Tudo fica SÓ neste aparelho: nada é enviado para fora (CLAUDE.md, G4). Nenhuma posição do GPS é gravada.
//
// Schema v2 (Etapa 3 concluída): situação POR PACOTE (R1), planos de otimização, conferência em andamento,
// estado dos alertas (A6/A7) e finalização com exclusão verificada dos detalhes (regra definitiva de privacidade).

import type { EstadoAlertas } from '@/core/alertas'
import type { Veiculo } from '@/core/custo'
import type { Parada, Status } from '@/core/parada'
import type { ResumoRota } from '@/core/resumo'
import type { RotaImportada } from '@/features/importar/converter'

export type Fase = 'revisao' | 'otimizada' | 'andamento'
export type TipoOrigem = 'gps' | 'teste' | 'primeira'

/** Situação de cada pacote, por visita, na ordem de `Parada.pacotes`. */
export type PacotesPorVisita = Record<string, Status[]>

/** Plano de ordem guardado (para comparar e voltar). Sem coordenadas de GPS: só de onde partiu (tipo). */
export interface Plano {
  id: string
  rotaId: string
  tipo: 'spx' | 'otimizada' | 'sugestao'
  criadoEm: number
  ordem: string[]
  /** km estimados da ordem, no momento em que foi criada. */
  km: number
  origem: TipoOrigem | null
}
/** Guarda a ordem original da SPX + os 5 planos mais recentes. */
export const PLANOS_RECENTES = 5

/** Onde o entregador parou: volta igual ao reabrir o app. */
export interface Sessao {
  fase: Fase
  ordem: string[]
  selecionada: string
  /** Quando tocou em "Iniciar entregas" (ms). null = ainda não iniciou. */
  iniciadaEm: number | null
  planoAtivo: string | null
  origemOtimizacao: TipoOrigem | null
  alertas: EstadoAlertas
}

export interface RotaSalva extends Sessao {
  rotaId: string
  rota: RotaImportada
  /** Situação de cada pacote, reconstruída do histórico de eventos (só inclusão). */
  pacotes: PacotesPorVisita
  planos: Plano[]
  criadaEm: number
  atualizadaEm: number
}

/** Histórico de situação, só inclusão: nada é apagado ou reescrito durante a rota. */
export interface EventoParada {
  rotaId: string
  paradaId: string
  status: Status
  tipo: 'marcar' | 'desfazer' | 'correcao'
  em: number
  /** Código SPX do pacote (v2: sempre presente; v1 sem ele = vale para a visita inteira). */
  pacote?: string
  /** Posição do pacote na visita (v2). Resolve códigos repetidos na mesma visita. */
  pacoteIdx?: number
}

/** Conferência em andamento (a importação antes de confirmar). Apagada ao confirmar ou descartar. */
export interface Conferencia {
  id: 'atual'
  arquivo: string
  /** Resultado da leitura (estrutura da importação, clonável). */
  leitura: unknown
  decisoes: unknown[]
  /** Última interação (cada mudança na conferência). Conta os 7 dias de validade (Q2). */
  atualizadaEm: number
  /** Quando o app avisou que ela expirou (começa a carência de 24 h). Some na próxima interação. */
  avisadaExpiracaoEm?: number
}

export interface Preferencias {
  /** Alertas de proximidade (A7). Desligar não desliga o GPS. */
  alertasLigados: boolean
}
export const PREFERENCIAS_PADRAO: Preferencias = { alertasLigados: true }

/** Rota guardada, sem detalhes (para a tela de dados no aparelho). */
export interface RotaListada {
  id: string
  status: 'ativa' | 'finalizando'
  fonte: 'planilha' | 'exemplo'
  criadaEm: number
  atualizadaEm: number
  visitas: number
  pacotes: number
}

export interface Armazenamento {
  readonly tipo: 'indexeddb' | 'memoria'
  /** A rota ativa mais recente (não finalizada), com as marcações e a posição na lista. */
  rotaAtiva(): Promise<RotaSalva | null>
  /** Guarda uma rota nova como a ativa (paradas, pacotes e o plano da SPX). */
  salvarRota(rotaId: string, rota: RotaImportada, sessao: Sessao, planos: Plano[]): Promise<void>
  /** Grava, numa só transação, os eventos novos e a sessão (tudo ou nada). */
  registrarMudanca(rotaId: string, eventos: readonly EventoParada[], sessao: Sessao | null): Promise<void>
  /** Substitui os planos guardados da rota (a lista já vem podada: SPX + 5 recentes). */
  salvarPlanos(rotaId: string, planos: readonly Plano[]): Promise<void>
  /**
   * Finaliza com exclusão verificada: (1) valida o resumo; (2) grava o resumo com limpeza "pendente" e a
   * rota como "finalizando" (uma transação); (3) confere a gravação; (4) apaga TODOS os detalhes da rota;
   * (5) confere que nada ficou; (6) marca a limpeza como concluída. Se falhar no meio, nada fica marcado
   * como limpo e `concluirLimpezasPendentes` termina depois, sem perder o resumo.
   */
  finalizarRota(resumo: ResumoRota): Promise<void>
  /** Termina limpezas interrompidas (app fechado, falta de energia). Devolve as rotas limpas. */
  concluirLimpezasPendentes(): Promise<string[]>
  /** Exclui definitivamente uma rota não finalizada (sem resumo). */
  apagarRota(rotaId: string): Promise<void>
  listarRotas(): Promise<RotaListada[]>
  resumos(): Promise<ResumoRota[]>
  guardarResumo(resumo: ResumoRota): Promise<void>
  apagarResumo(rotaId: string): Promise<void>
  lerConferencia(): Promise<Conferencia | null>
  salvarConferencia(c: Conferencia): Promise<void>
  apagarConferencia(): Promise<void>
  lerVeiculo(): Promise<Veiculo | undefined>
  salvarVeiculo(v: Veiculo): Promise<void>
  lerPreferencias(): Promise<Preferencias>
  salvarPreferencias(p: Preferencias): Promise<void>
  /** Pede ao navegador para não apagar os dados sozinho (navigator.storage.persist). */
  pedirPersistencia(): Promise<boolean>
}

/** Índice do pacote de um evento (v2 tem pacoteIdx; P3 só o código; v1 nenhum = visita inteira). */
function indicesDoEvento(e: Pick<EventoParada, 'pacote' | 'pacoteIdx'>, p: Parada): number[] {
  if (e.pacoteIdx !== undefined) return e.pacoteIdx >= 0 && e.pacoteIdx < p.pacotes.length ? [e.pacoteIdx] : []
  if (e.pacote !== undefined) {
    const i = p.pacotes.indexOf(e.pacote)
    return i >= 0 ? [i] : []
  }
  return p.pacotes.map((_, i) => i)
}

/**
 * Situação de cada pacote a partir do histórico (o último evento de cada pacote vale).
 * Compatível com v1 (eventos da visita inteira) e com a demonstração P3 (eventos só com o código).
 * Eventos de paradas que não existem são ignorados (dados inconsistentes não derrubam a rota).
 */
export function pacotesDosEventos(paradas: readonly Parada[], eventos: readonly Pick<EventoParada, 'paradaId' | 'status' | 'pacote' | 'pacoteIdx'>[]): PacotesPorVisita {
  const porId = new Map(paradas.map((p) => [p.id, p]))
  const r: PacotesPorVisita = Object.fromEntries(paradas.map((p) => [p.id, p.pacotes.map((): Status => 'pendente')]))
  for (const e of eventos) {
    const p = porId.get(e.paradaId)
    if (!p) continue
    const s = e.status === 'entregue' || e.status === 'falha' ? e.status : 'pendente'
    for (const i of indicesDoEvento(e, p)) r[p.id]![i] = s
  }
  return r
}

/** Eventos a registrar quando a situação dos pacotes muda (comparando antes e depois). */
export function eventosDaMudanca(rotaId: string, paradas: ReadonlyMap<string, Parada>, antes: PacotesPorVisita, depois: PacotesPorVisita, em: number): EventoParada[] {
  const ev: EventoParada[] = []
  for (const [paradaId, novos] of Object.entries(depois)) {
    const velhos = antes[paradaId]
    if (velhos === novos) continue
    const p = paradas.get(paradaId)
    novos.forEach((st, i) => {
      const a = velhos?.[i] ?? 'pendente'
      if (a === st) return
      const tipo = st === 'pendente' ? 'desfazer' : a === 'pendente' ? 'marcar' : 'correcao'
      ev.push({ rotaId, paradaId, status: st, tipo, em, pacote: p?.pacotes[i], pacoteIdx: i })
    })
  }
  return ev
}
