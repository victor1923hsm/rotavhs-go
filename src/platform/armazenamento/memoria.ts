// Armazenamento só na memória: usado quando o navegador não oferece IndexedDB (ex.: janela privada em alguns
// navegadores) ou quando o banco não abre. A rota vale só nesta visita, e o app avisa. Mesmo contrato do Dexie.

import type { Veiculo } from '@/core/custo'
import { validarResumo, type ResumoRota } from '@/core/resumo'
import type { RotaImportada } from '@/features/importar/converter'
import { pacotesDosEventos, PREFERENCIAS_PADRAO, type Armazenamento, type Conferencia, type EventoParada, type Plano, type Preferencias, type Sessao } from './tipos'

interface RotaMem {
  rota: RotaImportada
  sessao: Sessao
  status: 'ativa' | 'finalizando'
  criadaEm: number
  atualizadaEm: number
}

export function armazenamentoMemoria(): Armazenamento {
  const rotas = new Map<string, RotaMem>()
  let eventos: EventoParada[] = []
  let planos: Plano[] = []
  const resumos = new Map<string, ResumoRota>()
  let conferencia: Conferencia | null = null
  let veiculo: Veiculo | undefined
  let preferencias: Preferencias = { ...PREFERENCIAS_PADRAO }
  let seq = 0
  const limpar = (rotaId: string) => {
    rotas.delete(rotaId)
    eventos = eventos.filter((e) => e.rotaId !== rotaId)
    planos = planos.filter((p) => p.rotaId !== rotaId)
    const r = resumos.get(rotaId)
    if (r) resumos.set(rotaId, { ...r, limpeza: 'concluida', limpaEm: Date.now() })
  }
  return {
    tipo: 'memoria',
    async rotaAtiva() {
      const ativas = [...rotas.entries()].filter(([, r]) => r.status === 'ativa').sort((a, b) => a[1].criadaEm - b[1].criadaEm)
      const ult = ativas[ativas.length - 1]
      if (!ult) return null
      const [rotaId, r] = ult
      return {
        rotaId, rota: r.rota, ...structuredClone(r.sessao),
        pacotes: pacotesDosEventos(r.rota.paradas, eventos.filter((e) => e.rotaId === rotaId)),
        planos: structuredClone(planos.filter((p) => p.rotaId === rotaId)), criadaEm: r.criadaEm, atualizadaEm: r.atualizadaEm,
      }
    },
    async salvarRota(rotaId, rota, sessao, ps) {
      rotas.set(rotaId, { rota, sessao: structuredClone(sessao), status: 'ativa', criadaEm: ++seq, atualizadaEm: Date.now() })
      planos = [...planos.filter((p) => p.rotaId !== rotaId), ...structuredClone([...ps]).map((p) => ({ ...p, rotaId }))]
    },
    async registrarMudanca(rotaId, ev, sessao) {
      eventos.push(...ev.map((e) => ({ ...e })))
      const r = rotas.get(rotaId)
      if (r && sessao) r.sessao = structuredClone(sessao)
      if (r && (sessao || ev.length)) r.atualizadaEm = Date.now()
    },
    async salvarPlanos(rotaId, ps) {
      planos = [...planos.filter((p) => p.rotaId !== rotaId), ...structuredClone([...ps]).map((p) => ({ ...p, rotaId }))]
    },
    async finalizarRota(resumo) {
      const erros = validarResumo(resumo)
      if (erros.length) throw new Error(`resumo inválido: ${erros.join('; ')}`)
      resumos.set(resumo.rotaId, { ...resumo, limpeza: 'pendente' })
      const r = rotas.get(resumo.rotaId)
      if (r) r.status = 'finalizando'
      limpar(resumo.rotaId)
    },
    async concluirLimpezasPendentes() {
      const ids = [...resumos.values()].filter((r) => r.limpeza === 'pendente').map((r) => r.rotaId)
      ids.forEach(limpar)
      return ids
    },
    async apagarRota(rotaId) {
      rotas.delete(rotaId)
      eventos = eventos.filter((e) => e.rotaId !== rotaId)
      planos = planos.filter((p) => p.rotaId !== rotaId)
    },
    async listarRotas() {
      return [...rotas.entries()].map(([id, r]) => ({ id, status: r.status, fonte: r.rota.fonte, criadaEm: r.criadaEm, atualizadaEm: r.atualizadaEm, visitas: r.rota.paradas.length, pacotes: r.rota.pacotes }))
    },
    async resumos() {
      return [...resumos.values()].sort((a, b) => b.finalizadaEm - a.finalizadaEm)
    },
    async guardarResumo(r) {
      resumos.set(r.rotaId, { ...r })
    },
    async apagarResumo(rotaId) {
      resumos.delete(rotaId)
    },
    async lerConferencia() {
      return conferencia && structuredClone(conferencia)
    },
    async salvarConferencia(c) {
      conferencia = structuredClone(c)
    },
    async apagarConferencia() {
      conferencia = null
    },
    async lerVeiculo() {
      return veiculo && { ...veiculo }
    },
    async salvarVeiculo(v) {
      veiculo = { ...v }
    },
    async lerPreferencias() {
      return { ...preferencias }
    },
    async salvarPreferencias(p) {
      preferencias = { ...p }
    },
    async pedirPersistencia() {
      return false
    },
  }
}
