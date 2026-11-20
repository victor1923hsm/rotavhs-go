// Resumo da rota finalizada (G12 + regra definitiva de privacidade da Etapa 3): só números operacionais e
// financeiros. NUNCA guarda endereços, coordenadas, códigos SPX, identificadores de paradas nem nomes.
// É a única coisa da rota que fica no aparelho depois de finalizar.

import { custoEstimado, type Combustivel, type Veiculo } from './custo'
import { contar, statusDaVisita } from './pacotes'
import type { Status } from './parada'

export interface ResumoRota {
  /** Identificador aleatório da rota (UUID), sem relação com endereços. */
  rotaId: string
  /** Mantido por compatibilidade com resumos antigos; nos novos é sempre '' (o nome do arquivo não é guardado). */
  arquivo: string
  fonte: 'planilha' | 'exemplo'
  /** 'substituida' = outra rota foi importada antes de finalizar esta. */
  motivo: 'finalizada' | 'substituida'
  iniciadaEm: number | null
  finalizadaEm: number
  /** Visitas (paradas). */
  paradas: number
  pacotes: number
  /** Visitas concluídas com ao menos um pacote entregue. */
  entregues: number
  /** Visitas concluídas sem nenhum pacote entregue. */
  falhas: number
  /** Visitas com pacote pendente ao finalizar (contam como não entregues). */
  pendentes: number
  pacotesEntregues?: number
  pacotesSemSucesso?: number
  /** Pendentes ao finalizar: contados como NÃO entregues (o histórico não é alterado). */
  pacotesPendentes?: number
  /** Visitas concluídas com entregue + sem sucesso. */
  parciais?: number
  /** Sempre estimado nesta fase (linha reta × fator urbano). */
  km: number
  kmTipo: 'estimado'
  minutosEstimados: number
  combustivel: Combustivel
  litros: number
  custoCentavos: number
  /** Exclusão dos detalhes da rota: 'pendente' até ser conferida; 'concluida' depois. Ausente = resumo antigo. */
  limpeza?: 'pendente' | 'concluida'
  limpaEm?: number
}

export interface DadosResumo {
  rotaId: string
  fonte: 'planilha' | 'exemplo'
  motivo?: ResumoRota['motivo']
  iniciadaEm: number | null
  finalizadaEm: number
  ordem: readonly string[]
  /** Situação de cada pacote, por visita. */
  pacotes: Readonly<Record<string, readonly Status[]>>
  km: number
  minutos: number
  veiculo: Veiculo
}

export function resumoDaRota(d: DadosResumo): ResumoRota {
  const c = custoEstimado(d.km, d.ordem.length, d.veiculo)
  let entregues = 0
  let falhas = 0
  let pendentes = 0
  let parciais = 0
  let pacotes = 0
  let pacotesEntregues = 0
  let pacotesSemSucesso = 0
  let pacotesPendentes = 0
  for (const id of d.ordem) {
    const ps = d.pacotes[id] ?? []
    const n = contar(ps)
    pacotes += n.total
    pacotesEntregues += n.entregues
    pacotesSemSucesso += n.falhas
    pacotesPendentes += n.pendentes
    const st = statusDaVisita(ps)
    if (st === 'pendente') pendentes++
    else if (st === 'entregue') {
      entregues++
      if (n.falhas > 0) parciais++
    } else falhas++
  }
  return {
    rotaId: d.rotaId,
    arquivo: '',
    fonte: d.fonte,
    motivo: d.motivo ?? 'finalizada',
    iniciadaEm: d.iniciadaEm,
    finalizadaEm: d.finalizadaEm,
    paradas: d.ordem.length,
    pacotes,
    entregues,
    falhas,
    pendentes,
    pacotesEntregues,
    pacotesSemSucesso,
    pacotesPendentes,
    parciais,
    km: Math.round(d.km * 100) / 100,
    kmTipo: 'estimado',
    minutosEstimados: Math.round(d.minutos),
    combustivel: d.veiculo.combustivel,
    litros: Math.round(c.litros * 100) / 100,
    custoCentavos: c.totalCentavos,
  }
}

/** Campos permitidos no resumo: qualquer outro é recusado (nada de endereço, código ou coordenada). */
const CAMPOS = new Set<string>([
  'rotaId', 'arquivo', 'fonte', 'motivo', 'iniciadaEm', 'finalizadaEm', 'paradas', 'pacotes', 'entregues', 'falhas', 'pendentes',
  'pacotesEntregues', 'pacotesSemSucesso', 'pacotesPendentes', 'parciais', 'km', 'kmTipo', 'minutosEstimados', 'combustivel',
  'litros', 'custoCentavos', 'limpeza', 'limpaEm',
])

/** Confere os totais e que o resumo não carrega dados identificáveis. Devolve a lista de problemas. */
export function validarResumo(r: ResumoRota): string[] {
  const erros: string[] = []
  for (const k of Object.keys(r)) if (!CAMPOS.has(k)) erros.push(`campo não permitido: ${k}`)
  if (r.arquivo !== '') erros.push('o resumo não guarda o nome do arquivo')
  const nums: (keyof ResumoRota)[] = ['paradas', 'pacotes', 'entregues', 'falhas', 'pendentes', 'km', 'minutosEstimados', 'litros', 'custoCentavos']
  for (const k of nums) {
    const v = r[k] as number
    if (!Number.isFinite(v) || v < 0) erros.push(`${k} inválido`)
  }
  if (r.entregues + r.falhas + r.pendentes !== r.paradas) erros.push('visitas: entregues + sem sucesso + pendentes ≠ total')
  if (r.pacotesEntregues !== undefined && r.pacotesEntregues + (r.pacotesSemSucesso ?? 0) + (r.pacotesPendentes ?? 0) !== r.pacotes) {
    erros.push('pacotes: entregues + sem sucesso + pendentes ≠ total')
  }
  if (!Number.isInteger(r.custoCentavos)) erros.push('custo não está em centavos inteiros')
  return erros
}

/** Duração real (de "Iniciar entregas" até finalizar), em minutos. null = nunca iniciou. */
export const duracaoReal = (r: Pick<ResumoRota, 'iniciadaEm' | 'finalizadaEm'>): number | null =>
  r.iniciadaEm === null ? null : Math.max(0, Math.round((r.finalizadaEm - r.iniciadaEm) / 60000))
