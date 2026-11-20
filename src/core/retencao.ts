// Retenção de dados no aparelho (Q1 e Q2): regras puras, sem relógio nem armazenamento.
// Q1 — Rota em uso nunca é apagada sozinha: só avisos (24 h, 7 dias, 30 dias) e as escolhas são suas.
// Q2 — Conferência não terminada: 7 dias desde a última interação, com aviso antes, 24 h de carência depois
//      do aviso de expiração e nunca enquanto a tela Importar estiver aberta.

export const HORA = 60 * 60_000
export const DIA = 24 * HORA

// ---------------- Q1: rotas sem atividade ----------------
export type NivelInatividade = 'recente' | 'dia' | 'semana' | 'abandonada'

export interface Inatividade {
  nivel: NivelInatividade
  /** Dias inteiros sem atividade (0 no primeiro dia). */
  dias: number
  /** Texto curto para a tela; vazio quando recente. */
  texto: string
}

export function inatividade(atualizadaEm: number, agora: number): Inatividade {
  const ms = Math.max(0, agora - atualizadaEm)
  const dias = Math.floor(ms / DIA)
  if (ms >= 30 * DIA) return { nivel: 'abandonada', dias, texto: `Sem atividade há ${dias} dias · potencialmente abandonada` }
  if (ms >= 7 * DIA) return { nivel: 'semana', dias, texto: `Sem atividade há ${dias} dias` }
  if (ms >= DIA) return { nivel: 'dia', dias, texto: dias === 1 ? 'Sem atividade há mais de um dia' : `Sem atividade há ${dias} dias` }
  return { nivel: 'recente', dias, texto: '' }
}

// ---------------- Q2: conferência não terminada ----------------
export const CONFERENCIA_VALIDADE = 7 * DIA
/** A partir daqui o app já avisa que a conferência vai expirar. */
export const CONFERENCIA_AVISO = 6 * DIA
/** Depois do aviso de expiração, ainda fica guardada por este tempo. */
export const CONFERENCIA_CARENCIA = DIA

export interface DadosConferencia {
  atualizadaEm: number
  /** Quando o app avisou que a conferência expirou (começa a carência). Some a cada interação. */
  avisadaExpiracaoEm?: number
}

export type DecisaoConferencia =
  | { acao: 'manter' }
  | { acao: 'avisar-antecedencia'; expiraEm: number }
  | { acao: 'avisar-expiracao'; expiraEm: number; marcarAviso: boolean }
  | { acao: 'descartar' }

/**
 * O que fazer com a conferência guardada agora. Nunca descarta com a tela Importar aberta, nem antes de você
 * ter sido avisado e passarem 24 h desse aviso.
 */
export function decidirConferencia(c: DadosConferencia, agora: number, importarAberto: boolean): DecisaoConferencia {
  const idade = agora - c.atualizadaEm
  if (idade < CONFERENCIA_AVISO) return { acao: 'manter' }
  if (idade < CONFERENCIA_VALIDADE) return { acao: 'avisar-antecedencia', expiraEm: c.atualizadaEm + CONFERENCIA_VALIDADE + CONFERENCIA_CARENCIA }
  const avisada = c.avisadaExpiracaoEm
  if (avisada === undefined || avisada < c.atualizadaEm) return { acao: 'avisar-expiracao', expiraEm: agora + CONFERENCIA_CARENCIA, marcarAviso: true }
  if (importarAberto || agora - avisada < CONFERENCIA_CARENCIA) return { acao: 'avisar-expiracao', expiraEm: avisada + CONFERENCIA_CARENCIA, marcarAviso: false }
  return { acao: 'descartar' }
}
