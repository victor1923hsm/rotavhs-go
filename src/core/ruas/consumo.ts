// Contador LOCAL do consumo do dia por serviço (RB-3): quantos pedidos este aparelho já mandou hoje ao provedor e
// o último "x-ratelimit-remaining" informado por ele. Só números — nenhuma coordenada, chave ou endereço.
// Serve para a estimativa ANTES de calcular: se o previsto passar do que resta, o cálculo não começa.
// O provedor é quem manda: o contador local não sabe de pedidos feitos com a mesma chave em outro aparelho.
import type { LimitesProvedor } from './tipos'

export type ServicoConsumo = 'matriz' | 'encaixe' | 'rota'

export interface ConsumoDia {
  versao: 1
  /** Dia no fuso UTC (o ORS zera a cota por dia; o horário exato da virada não é documentado). */
  dia: string
  provedor: string
  pedidos: Record<ServicoConsumo, number>
  /** Último restante informado pelo provedor (cabeçalho x-ratelimit-remaining), por serviço. */
  restanteInformado: Partial<Record<ServicoConsumo, number>>
}

export interface Armazem {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export const CHAVE_CONSUMO = 'rotavhsgo.consumoRuas'
const diaUTC = (agora: number) => new Date(agora).toISOString().slice(0, 10)

export function lerConsumo(arm: Armazem | null, provedor: string, agora: number): ConsumoDia {
  const vazio: ConsumoDia = { versao: 1, dia: diaUTC(agora), provedor, pedidos: { matriz: 0, encaixe: 0, rota: 0 }, restanteInformado: {} }
  try {
    const c = JSON.parse(arm?.getItem(CHAVE_CONSUMO) ?? 'null') as ConsumoDia | null
    if (!c || c.versao !== 1 || c.dia !== vazio.dia || c.provedor !== provedor) return vazio
    return { ...vazio, pedidos: { ...vazio.pedidos, ...c.pedidos }, restanteInformado: { ...c.restanteInformado } }
  } catch {
    return vazio
  }
}

function gravar(arm: Armazem | null, c: ConsumoDia) {
  try {
    arm?.setItem(CHAVE_CONSUMO, JSON.stringify(c))
  } catch {
    /* sem armazenamento: o contador vale só nesta visita */
  }
}

export function registrarPedido(arm: Armazem | null, provedor: string, s: ServicoConsumo, agora: number) {
  const c = lerConsumo(arm, provedor, agora)
  c.pedidos[s]++
  gravar(arm, c)
}

export function registrarRestante(arm: Armazem | null, provedor: string, s: ServicoConsumo, restante: number, agora: number) {
  const c = lerConsumo(arm, provedor, agora)
  c.restanteInformado[s] = restante
  gravar(arm, c)
}

/** Quanto ainda resta hoje: o menor entre a conta local e o que o provedor informou por último. */
export function restanteHoje(c: ConsumoDia, limites: LimitesProvedor): Record<ServicoConsumo, number> {
  const r = (s: ServicoConsumo) => {
    const lim = limites.porDia[s === 'matriz' ? 'matriz' : s === 'encaixe' ? 'encaixe' : 'rota']
    const local = Number.isFinite(lim) ? Math.max(0, lim - c.pedidos[s]) : Infinity
    const inf = c.restanteInformado[s]
    return inf === undefined ? local : Math.min(local, inf)
  }
  return { matriz: r('matriz'), encaixe: r('encaixe'), rota: r('rota') }
}

/** O consumo previsto cabe no que resta hoje? Devolve o serviço que não cabe, ou null. */
export function cabeNaCota(previsto: Partial<Record<ServicoConsumo, number>>, resta: Record<ServicoConsumo, number>): ServicoConsumo | null {
  for (const s of ['matriz', 'encaixe', 'rota'] as const) if ((previsto[s] ?? 0) > resta[s]) return s
  return null
}
