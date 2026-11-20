// Estado do app. A rota, a situação de cada pacote, a ordem, os planos, a posição na lista, os alertas, o
// veículo e os resumos são guardados no aparelho por src/app/persistencia.ts (Etapa 3), que observa este
// estado. O tema fica no localStorage. A situação de CADA PACOTE é a fonte da verdade (R1); a da visita é
// derivada: a visita fica pendente enquanto houver pacote pendente.

import { create } from 'zustand'
import type { Veiculo } from '@/core/custo'
import { linhaRetaKm, percursoEstimadoKm, minutosEstimados, type Ponto } from '@/core/geo'
import { ordemEstimada } from '@/core/ordem'
import { temCoordenada, type Parada, type Status } from '@/core/parada'
import { avaliarSugestao, INTERVALO_MIN_MS } from '@/core/recalculo'
import { resumoDaRota, type ResumoRota } from '@/core/resumo'
import { alertasVazios, atualizarAfastamento, registrarAviso, type EstadoAlertas } from '@/core/alertas'
import { situacaoDaVisita, statusDaVisita, type SituacaoVisita } from '@/core/pacotes'
import { PLANOS_RECENTES, type Fase, type PacotesPorVisita, type Plano, type RotaSalva, type TipoOrigem } from '@/platform/armazenamento/tipos'
import type { RotaImportada } from '@/features/importar/converter'
import { ARQUIVO_EXEMPLO, ORDEM_SPX, PARADAS, POSICAO_TESTE } from '@/mock/rota-ficticia'

export type { Fase }
export type Tema = 'sol' | 'noite'

export const ROTA_EXEMPLO: RotaImportada = {
  fonte: 'exemplo', arquivo: ARQUIVO_EXEMPLO, paradas: [...PARADAS], ordemSpx: [...ORDEM_SPX],
  pacotes: PARADAS.reduce((n, p) => n + p.pacotes.length, 0), semCoordenada: 0,
}

// Rota atual (índices rápidos). Trocada só por carregarRota; os componentes re-renderizam pelo estado.
let ROTA = ROTA_EXEMPLO
let POR_ID = new Map(ROTA.paradas.map((p) => [p.id, p]))
let INDICE_SPX = new Map(ROTA.ordemSpx.map((id, i) => [id, i]))
export const rotaAtual = () => ROTA
export const parada = (id: string): Parada => POR_ID.get(id)!
export const paradas = (ids: readonly string[]): Parada[] => ids.map(parada)

/** Cor fixa por Stop (revisão 8): a mesma na caixa da tela Pedidos e no pino do mapa. */
export const corDaParada = (id: string): 1 | 2 | 3 | 4 => (((INDICE_SPX.get(id) ?? 0) % 4) + 1) as 1 | 2 | 3 | 4

/** Ponto de partida padrão: posição de teste no exemplo; na planilha, a 1ª parada da SPX (null). */
const inicioPadrao = (): Ponto | null => (ROTA.fonte === 'exemplo' ? POSICAO_TESTE : null)

// DEMONSTRAÇÃO (P3): origem dinâmica. Quem fornece é src/app/dinamica.ts (posição atual confiável, perto da
// rota). Este módulo não conhece o GPS: recebe só um ponto, na memória, e nunca o guarda.
let origemExterna: () => Ponto | null = () => null
export function definirOrigemExterna(f: () => Ponto | null) {
  origemExterna = f
}
/** Origem usada na otimização atual (null = a padrão). Só na memória. */
let ORIGEM_USADA: Ponto | null = null
export type { TipoOrigem }

/** Ponto de partida dos cálculos e dos km estimados. */
export const inicioDaRota = (): Ponto | null => ORIGEM_USADA ?? inicioPadrao()

function calcularOtimizada(inicio: Ponto | null = inicioDaRota()): string[] {
  const com = paradas(ROTA.ordemSpx).filter(temCoordenada)
  const sem = ROTA.ordemSpx.filter((id) => !temCoordenada(parada(id)))
  return [...ordemEstimada(com, inicio), ...sem] // sem coordenada: no fim, na ordem da SPX
}

/** Fator de tempo da DEMONSTRAÇÃO com GPS simulado (1 = tempo real). Só encurta esperas no simulador. */
let FATOR_TEMPO = 1
export function definirFatorTempo(f: number) {
  FATOR_TEMPO = Math.max(1, f)
}
/** G8: nunca sugerir trocar a próxima parada quando você está a menos de 200 m dela. */
export const PROTECAO_PROXIMA_M = 200

export type { SituacaoVisita }
let ORDEM_OTIMIZADA = calcularOtimizada()
export const ordemOtimizada = () => ORDEM_OTIMIZADA

export function resumoDaOrdem(ids: readonly string[], inicio: Ponto | null = inicioDaRota()) {
  const com = paradas(ids).filter(temCoordenada)
  const pts: Ponto[] = inicio ? [inicio, ...com] : com
  const km = percursoEstimadoKm(pts)
  return { km, min: minutosEstimados(km, ids.length) }
}

export interface Sugestao {
  ordem: string[]
  ganhoKm: number
  ganhoPct: number
  origem: 'manual' | 'automatica' | 'simulada'
  /** Por que apareceu (P3): depois de uma entrega/tentativa, por desvio, ou pedida por você. */
  motivo?: 'entrega' | 'desvio' | 'manual'
  /** Calculada a partir da sua posição atual (DEMONSTRAÇÃO). */
  daPosicao?: boolean
}

export interface Aviso {
  id: number
  texto: string
  desfazer?: () => void
}

interface Estado {
  rota: RotaImportada
  /** Situação de cada pacote, por visita (fonte da verdade, R1). */
  pacotes: PacotesPorVisita
  /** Planos guardados: a ordem da SPX + os 5 mais recentes. */
  planos: Plano[]
  planoAtivo: string | null
  /** Volta para um plano guardado (só com o seu toque; as marcações não mudam). */
  restaurarPlano: (id: string) => void
  /** Estado dos alertas desta rota (A6/A7), sem posição. */
  alertas: EstadoAlertas
  /** Preferência global: alertas de proximidade ligados (A7). Desligar não desliga o GPS. */
  alertasLigados: boolean
  registrarAlerta: (paradaId: string, agora: number) => void
  atualizarAfastamentos: (distancias: ReadonlyMap<string, number>) => void
  silenciarAlertasNaRota: (sim: boolean) => void
  definirAlertasLigados: (sim: boolean) => void
  /** Rota retomada ao abrir (para oferecer "continuar de onde parei"). */
  retomada: { visitas: number; concluidas: number; pacotesMarcados: number; atualizadaEm: number; parada: number } | null
  fecharRetomada: () => void
  /** Exclui a rota atual SEM resumo (com confirmação na tela) e volta para a de exemplo. */
  descartarRota: () => void
  /** Situação das gravações no aparelho (para avisar e tentar de novo). */
  gravacao: 'ok' | 'falhou'
  /** Rotas finalizadas cuja exclusão dos detalhes ainda não terminou. */
  limpezasPendentes: string[]
  /** Logo depois de importar e conferir: o botão OTIMIZAR MINHA ROTA fica em destaque até ser usado. */
  destacarOtimizar: boolean
  /** Conferência não terminada perto de expirar (Q2): aviso com Continuar / Descartar. */
  avisoConferencia: { arquivo: string; atualizadaEm: number; expiraEm: number; expirada: boolean } | null
  /** De onde saiu a otimização atual (o ponto em si não fica no estado). */
  origemOtimizacao: TipoOrigem | null
  /** OTIMIZAR MINHA ROTA: a partir da sua posição (se houver uma confiável), senão da padrão. */
  otimizar: () => void
  /** Marca (ou corrige) um pacote da visita. Quando não sobra pacote pendente, pula para a próxima. */
  marcarPacote: (paradaId: string, indice: number, st: Status) => void
  /** Reavaliação automática (G8): depois de entrega/tentativa ou por desvio. Só sugere. */
  avaliarAutomatico: (motivo: 'entrega' | 'desvio', agora?: number) => boolean
  /** Identificador da rota no aparelho (novo a cada importação). */
  rotaId: string
  /** Quando tocou em "Iniciar entregas" (ms). */
  iniciadaEm: number | null
  /** Resumos das rotas finalizadas, do mais novo para o mais antigo. */
  resumos: ResumoRota[]
  /** Troca a rota. Se a atual já tinha marcações, ela vira um resumo "substituída" (e os detalhes dela são apagados). */
  carregarRota: (r: RotaImportada) => void
  /** Volta a rota guardada no aparelho, como estava. */
  restaurar: (s: RotaSalva) => void
  definirResumos: (r: ResumoRota[]) => void
  /** Finaliza a rota atual: gera o resumo e volta para a rota de exemplo. */
  finalizarRota: () => ResumoRota
  apagarResumo: (rotaId: string) => void
  fase: Fase
  ordem: string[]
  status: Record<string, Status>
  selecionada: string
  veiculo: Veiculo
  tema: Tema
  sugestao: Sugestao | null
  ultimaAuto: number | null
  aviso: Aviso | null
  buscaAberta: boolean
  definirFase: (f: Fase) => void
  selecionar: (id: string) => void
  /** Marca os pacotes PENDENTES da visita selecionada (os já marcados não mudam) e pula para a próxima. */
  marcar: (st: Exclude<Status, 'pendente'>) => void
  desmarcar: (id: string) => void
  recalcular: () => void
  simularSugestao: () => void
  aceitarSugestao: () => void
  recusarSugestao: () => void
  definirVeiculo: (v: Partial<Veiculo>) => void
  alternarTema: () => void
  avisar: (texto: string, desfazer?: () => void) => void
  fecharAviso: () => void
  abrirBusca: (aberta: boolean) => void
}

function temaInicial(): Tema {
  try {
    return localStorage.getItem('rotavhsgo.tema') === 'noite' ? 'noite' : 'sol'
  } catch {
    return 'sol'
  }
}

let seqAviso = 0

/** Ponto de partida para recalcular: a última parada visitada, ou a posição de teste. */
function pontoAtual(ordem: readonly string[], status: Record<string, Status>): Ponto | null {
  const externa = origemExterna() // DEMONSTRAÇÃO (P3): a sua posição atual confiável, se houver
  if (externa) return externa
  const visitadas = ordem.filter((id) => status[id] !== 'pendente' && temCoordenada(parada(id)))
  const ultima = visitadas[visitadas.length - 1]
  return ultima ? parada(ultima) : inicioDaRota()
}

/** Recalcula só as pendentes; as já visitadas ficam onde estão (nunca são alteradas). */
function ordemRecalculada(ordem: readonly string[], status: Record<string, Status>) {
  const feitas = ordem.filter((id) => status[id] !== 'pendente')
  const pend = ordem.filter((id) => status[id] === 'pendente' && temCoordenada(parada(id)))
  const semCoord = ordem.filter((id) => status[id] === 'pendente' && !temCoordenada(parada(id)))
  const inicio = pontoAtual(ordem, status)
  const nova = [...ordemEstimada(paradas(pend), inicio), ...semCoord]
  const atualKm = resumoDaOrdem(pend, inicio).km
  const novaKm = resumoDaOrdem(nova, inicio).km
  return { ordem: [...feitas, ...nova], atualKm, novaKm, mudou: nova.join() !== [...pend, ...semCoord].join(), inicio, proximaAtual: pend[0], proximaNova: nova[0] }
}

/** Situação da visita a partir dos pacotes: pendente, em andamento (parte marcada), entregue, sem sucesso, parcial. */
export function situacao(id: string, pacotes: PacotesPorVisita): SituacaoVisita {
  return situacaoDaVisita(pacotes[id] ?? [])
}

/** Status das visitas derivado dos pacotes (pendente enquanto houver pacote pendente). */
function statusDe(pacotes: PacotesPorVisita): Record<string, Status> {
  return Object.fromEntries(Object.entries(pacotes).map(([id, ps]) => [id, statusDaVisita(ps)]))
}

/** Planos: guarda a ordem da SPX + os 5 mais recentes (o mais antigo sai). */
function podarPlanos(planos: Plano[]): Plano[] {
  const spx = planos.filter((p) => p.tipo === 'spx')
  const outros = planos.filter((p) => p.tipo !== 'spx').sort((a, b) => a.criadoEm - b.criadoEm)
  return [...spx, ...outros.slice(-PLANOS_RECENTES)]
}
let seqPlano = 0
function novoPlano(rotaId: string, tipo: Plano['tipo'], ordem: string[], origem: TipoOrigem | null): Plano {
  return { id: `${rotaId}:${tipo}:${Date.now().toString(36)}${(++seqPlano).toString(36)}`, rotaId, tipo, criadoEm: Date.now(), ordem: [...ordem], km: Math.round(resumoDaOrdem(ordem).km * 100) / 100, origem }
}

/** Próxima pendente depois de `id`, na ordem da rota (revisão 9). */
function proximaDepois(ordem: readonly string[], id: string, status: Record<string, Status>): string | undefined {
  const i = ordem.indexOf(id)
  for (let k = 1; k <= ordem.length; k++) {
    const c = ordem[(i + k) % ordem.length]!
    if (status[c] === 'pendente') return c
  }
  return undefined
}

const statusInicial = (r: RotaImportada) => Object.fromEntries(r.paradas.map((p) => [p.id, 'pendente' as Status]))
const pacotesIniciais = (r: RotaImportada): PacotesPorVisita => Object.fromEntries(r.paradas.map((p) => [p.id, p.pacotes.map((): Status => 'pendente')]))

export const novoId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

/** Troca os índices da rota atual (módulo) e devolve o estado inicial dela. */
function usarRota(r: RotaImportada) {
  ROTA = r
  POR_ID = new Map(r.paradas.map((p) => [p.id, p]))
  INDICE_SPX = new Map(r.ordemSpx.map((id, i) => [id, i]))
  ORDEM_OTIMIZADA = calcularOtimizada()
  ORIGEM_USADA = null
  const rotaId = novoId()
  const spx: Plano = { id: `${rotaId}:spx`, rotaId, tipo: 'spx', criadoEm: Date.now(), ordem: [...r.ordemSpx], km: Math.round(resumoDaOrdem(r.ordemSpx).km * 100) / 100, origem: null }
  return {
    rota: r, rotaId, iniciadaEm: null, pacotes: pacotesIniciais(r), origemOtimizacao: null as TipoOrigem | null, fase: 'revisao' as Fase, ordem: [...r.ordemSpx],
    status: statusInicial(r), selecionada: r.ordemSpx[0]!, sugestao: null, ultimaAuto: null, planos: [spx], planoAtivo: spx.id as string | null,
    alertas: alertasVazios(), retomada: null,
  }
}

function resumoAtual(e: Estado, motivo: ResumoRota['motivo'], agora: number): ResumoRota {
  const r = resumoDaOrdem(e.ordem)
  return resumoDaRota({
    rotaId: e.rotaId, fonte: e.rota.fonte, motivo, iniciadaEm: e.iniciadaEm, finalizadaEm: agora,
    ordem: e.ordem, pacotes: e.pacotes, km: r.km, minutos: r.min, veiculo: e.veiculo,
  })
}

export const useEstado = create<Estado>((set, get) => ({
  ...usarRota(ROTA),
  resumos: [],
  alertasLigados: true,
  gravacao: 'ok',
  limpezasPendentes: [],
  avisoConferencia: null,
  destacarOtimizar: false,
  carregarRota: (r) => {
    const e = get()
    const marcada = Object.values(e.pacotes).some((ps) => ps.some((x) => x !== 'pendente'))
    const resumos = marcada ? [resumoAtual(e, 'substituida', Date.now()), ...e.resumos] : e.resumos
    set({ ...usarRota(r), resumos })
  },
  restaurar: (s) => {
    const base = usarRota(s.rota)
    const ok = (id: string) => POR_ID.has(id)
    // Dados inconsistentes não derrubam a rota: o que não fecha volta ao padrão seguro.
    const ordemOk = (o: readonly string[]) => o.length === s.rota.paradas.length && new Set(o).size === o.length && o.every(ok)
    const ordem = ordemOk(s.ordem) ? [...s.ordem] : base.ordem
    const pacotes: PacotesPorVisita = { ...base.pacotes }
    for (const p of s.rota.paradas) {
      const ps = s.pacotes[p.id]
      if (ps && ps.length === p.pacotes.length) pacotes[p.id] = [...ps]
    }
    const spx = s.planos.find((p) => p.tipo === 'spx')
    const planos = podarPlanos([...(spx ? [] : base.planos), ...s.planos.filter((p) => ordemOk(p.ordem)).map((p) => ({ ...p, rotaId: s.rotaId }))])
    const planoAtivo = planos.some((p) => p.id === s.planoAtivo) ? s.planoAtivo : (planos[0]?.id ?? null)
    const status = statusDe(pacotes)
    const marcados = Object.values(pacotes).flat().filter((x) => x !== 'pendente').length
    set({
      ...base, rotaId: s.rotaId, iniciadaEm: s.iniciadaEm, fase: s.fase, ordem, pacotes, status, planos, planoAtivo,
      origemOtimizacao: s.origemOtimizacao ?? null, alertas: s.alertas ?? alertasVazios(),
      selecionada: ok(s.selecionada) ? s.selecionada : base.selecionada,
      retomada: marcados > 0 || s.fase !== 'revisao' || s.rota.fonte === 'planilha'
        ? { visitas: ordem.length, concluidas: ordem.filter((id) => status[id] !== 'pendente').length, pacotesMarcados: marcados, atualizadaEm: s.atualizadaEm, parada: parada(ok(s.selecionada) ? s.selecionada : base.selecionada).stop ?? -1 }
        : null,
    })
  },
  fecharRetomada: () => set({ retomada: null }),
  descartarRota: () => set({ ...usarRota(ROTA_EXEMPLO) }),
  definirResumos: (resumos) => set({ resumos }),
  finalizarRota: () => {
    const e = get()
    const resumo = resumoAtual(e, 'finalizada', Date.now())
    set({ ...usarRota(ROTA_EXEMPLO), resumos: [resumo, ...e.resumos] })
    return resumo
  },
  apagarResumo: (rotaId) => {
    const r = get().resumos.find((x) => x.rotaId === rotaId)
    if (!r) return
    set((e) => ({ resumos: e.resumos.filter((x) => x.rotaId !== rotaId) }))
    get().avisar('Resumo apagado', () => set((e) => ({ resumos: [r, ...e.resumos].sort((a, b) => b.finalizadaEm - a.finalizadaEm) })))
  },
  fase: 'revisao',
  ordem: [...ROTA.ordemSpx],
  status: statusInicial(ROTA),
  selecionada: ROTA.ordemSpx[0]!,
  veiculo: { combustivel: 'Gasolina', precoCentavos: 619, consumoKmL: 10 },
  tema: temaInicial(),
  sugestao: null,
  ultimaAuto: null,
  aviso: null,
  buscaAberta: false,

  definirFase: (fase) => {
    if (fase === 'revisao') {
      ORIGEM_USADA = null
      ORDEM_OTIMIZADA = calcularOtimizada()
      set({ fase, ordem: [...ROTA.ordemSpx], sugestao: null, origemOtimizacao: null, planoAtivo: get().planos.find((p) => p.tipo === 'spx')?.id ?? null })
    } else if (fase === 'otimizada') {
      const origem = get().origemOtimizacao ?? (inicioPadrao() ? 'teste' : 'primeira')
      const plano = novoPlano(get().rotaId, 'otimizada', ORDEM_OTIMIZADA, origem)
      set({ fase, ordem: [...ORDEM_OTIMIZADA], sugestao: null, origemOtimizacao: origem, planos: podarPlanos([...get().planos, plano]), planoAtivo: plano.id })
    }
    else {
      const { ordem, status } = get()
      const prox = ordem.find((id) => status[id] === 'pendente')
      set({ fase, selecionada: prox ?? get().selecionada, iniciadaEm: get().iniciadaEm ?? Date.now() })
    }
  },
  selecionar: (selecionada) => set({ selecionada }),

  marcar: (st) => {
    const { selecionada: id, ordem, pacotes } = get()
    const antes = pacotes[id] ?? []
    if (!antes.includes('pendente')) return
    const novos = antes.map((x) => (x === 'pendente' ? st : x))
    const np = { ...pacotes, [id]: novos }
    const ns = statusDe(np)
    set({ pacotes: np, status: ns, selecionada: proximaDepois(ordem, id, ns) ?? id })
    const p = parada(id)
    const parcial = antes.some((x) => x !== 'pendente')
    get().avisar(parcial ? `Parada ${p.stop ?? '?'}: ${novos.filter((x) => x === 'entregue').length} de ${novos.length} entregues` : `Parada ${p.stop ?? '?'} ${st === 'entregue' ? 'entregue' : 'sem sucesso'}`, () => voltarPacotes(id, antes))
    get().avaliarAutomatico('entrega')
  },
  marcarPacote: (id, i, st) => {
    const { ordem, pacotes, selecionada } = get()
    const antes = pacotes[id]
    if (!antes || i < 0 || i >= antes.length || antes[i] === st) return
    const novos = antes.map((x, k) => (k === i ? st : x))
    const np = { ...pacotes, [id]: novos }
    const ns = statusDe(np)
    const concluiu = antes.includes('pendente') && !novos.includes('pendente')
    // Só sai da visita quando não sobra pacote pendente.
    set({ pacotes: np, status: ns, selecionada: concluiu && selecionada === id ? (proximaDepois(ordem, id, ns) ?? id) : selecionada })
    const p = parada(id)
    if (concluiu) {
      get().avisar(`Parada ${p.stop ?? '?'} concluída: ${novos.filter((x) => x === 'entregue').length} de ${novos.length} entregues`, () => voltarPacotes(id, antes))
      get().avaliarAutomatico('entrega')
    }
  },
  desmarcar: (id) => {
    const ps = get().pacotes[id]
    if (!ps) return
    voltarPacotes(id, ps.map((): Status => 'pendente'))
  },

  avaliarAutomatico: (motivo, agora = Date.now()) => {
    // Sugestão automática (G8): só sugere; nunca aplica. Intervalo mínimo e ganho mínimo.
    const { ordem, status, fase, ultimaAuto, sugestao } = get()
    if (fase !== 'andamento' || sugestao) return false
    const r = ordemRecalculada(ordem, status)
    const av = avaliarSugestao(r.atualKm, r.novaKm, ultimaAuto, agora, INTERVALO_MIN_MS / FATOR_TEMPO)
    if (!r.mudou || !av.sugerir) return false
    // Proteção (G8): perto da próxima parada, nunca sugerir trocá-la.
    if (r.inicio && r.proximaAtual && r.proximaNova !== r.proximaAtual && linhaRetaKm(r.inicio, parada(r.proximaAtual)) * 1000 < PROTECAO_PROXIMA_M) return false
    const daPosicao = !!origemExterna()
    set({ sugestao: { ordem: r.ordem, ganhoKm: av.ganhoKm, ganhoPct: av.ganhoPct, origem: 'automatica', motivo, daPosicao }, ultimaAuto: agora })
    return true
  },
  otimizar: () => {
    const externa = origemExterna()
    ORIGEM_USADA = externa ? { lat: externa.lat, lon: externa.lon } : null
    ORDEM_OTIMIZADA = calcularOtimizada()
    const origem: TipoOrigem = externa ? 'gps' : inicioPadrao() ? 'teste' : 'primeira'
    const plano = novoPlano(get().rotaId, 'otimizada', ORDEM_OTIMIZADA, origem)
    set({ fase: 'otimizada', destacarOtimizar: false, ordem: [...ORDEM_OTIMIZADA], sugestao: null, origemOtimizacao: origem, planos: podarPlanos([...get().planos, plano]), planoAtivo: plano.id })
  },
  restaurarPlano: (id) => {
    const p = get().planos.find((x) => x.id === id)
    if (!p || p.id === get().planoAtivo) return
    const { pacotes } = get()
    const ns = statusDe(pacotes)
    set({ ordem: [...p.ordem], planoAtivo: p.id, sugestao: null, selecionada: p.ordem.find((x) => ns[x] === 'pendente') ?? get().selecionada })
    get().avisar(p.tipo === 'spx' ? 'Voltou para a ordem original da SPX' : 'Plano anterior restaurado')
  },

  registrarAlerta: (paradaId, agora) => set((e) => ({ alertas: registrarAviso(e.alertas, paradaId, agora) })),
  atualizarAfastamentos: (d) => {
    const a = get().alertas
    const n = atualizarAfastamento(a, d)
    if (n !== a) set({ alertas: n })
  },
  silenciarAlertasNaRota: (sim) => set((e) => ({ alertas: { ...e.alertas, silenciadoNaRota: sim } })),
  definirAlertasLigados: (alertasLigados) => set({ alertasLigados }),

  recalcular: () => {
    const { ordem, status } = get()
    const r = ordemRecalculada(ordem, status)
    const ganhoKm = Math.max(0, r.atualKm - r.novaKm)
    if (!r.mudou || ganhoKm < 0.01) {
      get().avisar('A ordem atual já é a melhor pelo modelo')
      return
    }
    set({ sugestao: { ordem: r.ordem, ganhoKm, ganhoPct: (ganhoKm / r.atualKm) * 100, origem: 'manual', motivo: 'manual', daPosicao: !!origemExterna() } })
  },
  simularSugestao: () => {
    // Cartão de sugestão com números FICTÍCIOS, só para testar a experiência (Etapa 1).
    const { ordem, status } = get()
    const pend = ordem.filter((id) => status[id] === 'pendente')
    if (pend.length < 3) return
    const trocada = [...ordem]
    const a = trocada.indexOf(pend[1]!)
    const b = trocada.indexOf(pend[2]!)
    ;[trocada[a], trocada[b]] = [trocada[b]!, trocada[a]!]
    set({ sugestao: { ordem: trocada, ganhoKm: 0.6, ganhoPct: 8, origem: 'simulada' } })
  },
  aceitarSugestao: () => {
    const s = get().sugestao
    if (!s) return
    const { status } = get()
    const plano = novoPlano(get().rotaId, 'sugestao', s.ordem, s.daPosicao ? 'gps' : (get().origemOtimizacao ?? null))
    set({ ordem: s.ordem, sugestao: null, planos: podarPlanos([...get().planos, plano]), planoAtivo: plano.id, selecionada: s.ordem.find((id) => status[id] === 'pendente') ?? get().selecionada })
    get().avisar('Nova ordem aplicada')
  },
  recusarSugestao: () => set({ sugestao: null }),

  definirVeiculo: (v) => set((e) => ({ veiculo: { ...e.veiculo, ...v } })),
  alternarTema: () => {
    const tema: Tema = get().tema === 'sol' ? 'noite' : 'sol'
    try {
      localStorage.setItem('rotavhsgo.tema', tema)
    } catch {
      /* sem armazenamento: o tema vale só nesta visita */
    }
    document.documentElement.setAttribute('data-theme', tema)
    set({ tema })
  },
  avisar: (texto, desfazer) => set({ aviso: { id: ++seqAviso, texto, desfazer } }),
  fecharAviso: () => set({ aviso: null }),
  abrirBusca: (buscaAberta) => set({ buscaAberta }),
}))

/** Volta os pacotes de uma visita para uma situação anterior (Desfazer); a visita volta a ser a selecionada. */
function voltarPacotes(id: string, ps: readonly Status[]) {
  const e = useEstado.getState()
  const np = { ...e.pacotes, [id]: [...ps] }
  useEstado.setState({ pacotes: np, status: statusDe(np), selecionada: id })
}
