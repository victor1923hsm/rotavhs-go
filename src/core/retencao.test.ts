import { describe, expect, it } from 'vitest'
import { DIA, HORA, decidirConferencia, inatividade } from './retencao'

const T0 = Date.UTC(2026, 10, 1, 12)

describe('Q1: rotas sem atividade (só avisos, nunca exclusão)', () => {
  it('níveis 24 h / 7 dias / 30 dias', () => {
    expect(inatividade(T0, T0 + 23 * HORA).nivel).toBe('recente')
    expect(inatividade(T0, T0 + DIA).nivel).toBe('dia')
    expect(inatividade(T0, T0 + DIA).texto).toBe('Sem atividade há mais de um dia')
    expect(inatividade(T0, T0 + 3 * DIA).texto).toBe('Sem atividade há 3 dias')
    expect(inatividade(T0, T0 + 7 * DIA).nivel).toBe('semana')
    expect(inatividade(T0, T0 + 30 * DIA - 1).nivel).toBe('semana')
    const a = inatividade(T0, T0 + 31 * DIA)
    expect(a.nivel).toBe('abandonada')
    expect(a.texto).toContain('potencialmente abandonada')
  })
  it('relógio para trás não quebra', () => {
    expect(inatividade(T0, T0 - DIA).nivel).toBe('recente')
  })
})

describe('Q2: conferência não terminada', () => {
  const c = { atualizadaEm: T0 }
  it('mantém antes de 6 dias', () => {
    expect(decidirConferencia(c, T0 + 6 * DIA - 1, false)).toEqual({ acao: 'manter' })
  })
  it('avisa com antecedência entre 6 e 7 dias', () => {
    const d = decidirConferencia(c, T0 + 6 * DIA + HORA, false)
    expect(d.acao).toBe('avisar-antecedencia')
    if (d.acao === 'avisar-antecedencia') expect(d.expiraEm).toBe(T0 + 8 * DIA)
  })
  it('aos 7 dias: avisa e começa a carência, sem descartar', () => {
    const d = decidirConferencia(c, T0 + 7 * DIA, false)
    expect(d).toEqual({ acao: 'avisar-expiracao', expiraEm: T0 + 8 * DIA, marcarAviso: true })
  })
  it('mesmo muito antiga, sem aviso anterior, nunca descarta direto', () => {
    const d = decidirConferencia(c, T0 + 90 * DIA, false)
    expect(d.acao).toBe('avisar-expiracao')
  })
  it('descarta só 24 h depois do aviso', () => {
    const avisada = { atualizadaEm: T0, avisadaExpiracaoEm: T0 + 7 * DIA }
    expect(decidirConferencia(avisada, T0 + 8 * DIA - 1, false).acao).toBe('avisar-expiracao')
    expect(decidirConferencia(avisada, T0 + 8 * DIA, false)).toEqual({ acao: 'descartar' })
  })
  it('nunca descarta com a tela Importar aberta', () => {
    const avisada = { atualizadaEm: T0, avisadaExpiracaoEm: T0 + 7 * DIA }
    expect(decidirConferencia(avisada, T0 + 30 * DIA, true).acao).toBe('avisar-expiracao')
  })
  it('aviso antigo de antes da última interação não vale', () => {
    const d = decidirConferencia({ atualizadaEm: T0 + 2 * DIA, avisadaExpiracaoEm: T0 + DIA }, T0 + 9 * DIA, false)
    expect(d.acao).toBe('avisar-expiracao')
    if (d.acao === 'avisar-expiracao') expect(d.marcarAviso).toBe(true)
  })
})
