import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { alertasVazios, registrarAviso } from '@/core/alertas'
import { resumoDaRota, duracaoReal, validarResumo, type ResumoRota } from '@/core/resumo'
import type { RotaImportada } from '@/features/importar/converter'
import { ARQUIVO_EXEMPLO, ORDEM_SPX, PARADAS } from '@/mock/rota-ficticia'
import { armazenamentoDexie, BancoRotaVHS, ESQUEMA_V1, VERSAO_BANCO } from './dexie'
import { armazenamentoMemoria } from './memoria'
import { eventosDaMudanca, pacotesDosEventos, type Armazenamento, type Plano, type Sessao } from './tipos'

// Só dados fictícios (mock da Etapa 1).
const ROTA: RotaImportada = { fonte: 'exemplo', arquivo: ARQUIVO_EXEMPLO, paradas: [...PARADAS], ordemSpx: [...ORDEM_SPX], pacotes: PARADAS.reduce((n, p) => n + p.pacotes.length, 0), semCoordenada: 0 }
const SESSAO: Sessao = { fase: 'revisao', ordem: [...ORDEM_SPX], selecionada: ORDEM_SPX[0]!, iniciadaEm: null, planoAtivo: 'r1:spx', origemOtimizacao: null, alertas: alertasVazios() }
const SPX: Plano = { id: 'r1:spx', rotaId: 'r1', tipo: 'spx', criadoEm: 1, ordem: [...ORDEM_SPX], km: 30.9, origem: null }
const VEICULO = { combustivel: 'Gasolina' as const, precoCentavos: 619, consumoKmL: 10 }
const MULTI = PARADAS.find((p) => p.pacotes.length >= 3)!
const pend = () => Object.fromEntries(PARADAS.map((p) => [p.id, p.pacotes.map(() => 'pendente' as const)])) as Record<string, ('pendente' | 'entregue' | 'falha')[]>
let n = 0

const resumoDe = (rotaId: string, pacotes = pend()): ResumoRota =>
  resumoDaRota({ rotaId, fonte: 'exemplo', iniciadaEm: 0, finalizadaEm: 90 * 60000, ordem: ORDEM_SPX, pacotes, km: 30.954, minutos: 183.2, veiculo: VEICULO })

const implementacoes: [string, () => Armazenamento][] = [
  ['IndexedDB (Dexie)', () => armazenamentoDexie(new BancoRotaVHS(`teste-${++n}`))],
  ['memória', () => armazenamentoMemoria()],
]

describe('histórico por pacote (só inclusão)', () => {
  it('o último evento de cada pacote vale; v1 (visita inteira) e P3 (só código) continuam legíveis', () => {
    const [a, b] = ORDEM_SPX.filter((id) => id !== MULTI.id) as [string, string]
    const r = pacotesDosEventos(PARADAS, [
      { paradaId: a, status: 'entregue' }, // v1: visita inteira
      { paradaId: MULTI.id, status: 'entregue', pacote: MULTI.pacotes[1] }, // P3: só o código
      { paradaId: MULTI.id, status: 'falha', pacote: MULTI.pacotes[2], pacoteIdx: 2 }, // v2
      { paradaId: b, status: 'falha' },
      { paradaId: b, status: 'pendente' },
      { paradaId: 'nao-existe', status: 'entregue' },
    ])
    expect(r[a]!.every((x) => x === 'entregue')).toBe(true)
    expect(r[MULTI.id]!.slice(0, 3)).toEqual(['pendente', 'entregue', 'falha'])
    expect(r[b]!.every((x) => x === 'pendente')).toBe(true)
    expect(Object.keys(r)).toHaveLength(PARADAS.length)
  })
  it('classifica cada mudança de pacote: marcar, desfazer, correção (com código e posição)', () => {
    const porId = new Map(PARADAS.map((p) => [p.id, p]))
    const antes = { [MULTI.id]: ['pendente', 'entregue', 'entregue'] as const }
    const depois = { [MULTI.id]: ['entregue', 'pendente', 'falha'] as const }
    const ev = eventosDaMudanca('r', porId, { [MULTI.id]: [...antes[MULTI.id]!] }, { [MULTI.id]: [...depois[MULTI.id]!] }, 5)
    expect(ev.map((e) => [e.pacoteIdx, e.pacote, e.tipo, e.status])).toEqual([
      [0, MULTI.pacotes[0], 'marcar', 'entregue'],
      [1, MULTI.pacotes[1], 'desfazer', 'pendente'],
      [2, MULTI.pacotes[2], 'correcao', 'falha'],
    ])
  })
})

describe.each(implementacoes)('armazenamento: %s', (_nome, criar) => {
  it('Q1: marcar um pacote conta como atividade da rota (última alteração)', async () => {
    const arm = criar()
    await arm.salvarRota('r1', ROTA, SESSAO, [SPX])
    const antes = (await arm.listarRotas()).find((r) => r.id === 'r1')!.atualizadaEm
    await new Promise((ok) => setTimeout(ok, 5))
    await arm.registrarMudanca('r1', [{ rotaId: 'r1', paradaId: MULTI.id, status: 'entregue', tipo: 'marcar', em: 2, pacote: MULTI.pacotes[0], pacoteIdx: 0 }], null)
    const depois = (await arm.listarRotas()).find((r) => r.id === 'r1')!
    expect(depois.atualizadaEm).toBeGreaterThan(antes)
    expect(depois.status).toBe('ativa')
  })
  it('guarda e devolve a rota ativa: pacotes, ordem, plano ativo, alertas e posição na lista', async () => {
    const arm = criar()
    expect(await arm.rotaAtiva()).toBeNull()
    await arm.salvarRota('r1', ROTA, SESSAO, [SPX])
    const [a, b, c] = ORDEM_SPX as [string, string, string]
    const pa = PARADAS.find((p) => p.id === a)!
    await arm.registrarMudanca('r1', pa.pacotes.map((pacote, i) => ({ rotaId: 'r1', paradaId: a, status: 'entregue' as const, tipo: 'marcar' as const, em: 1, pacote, pacoteIdx: i })), null)
    await arm.registrarMudanca('r1', [{ rotaId: 'r1', paradaId: MULTI.id, status: 'entregue', tipo: 'marcar', em: 2, pacote: MULTI.pacotes[0], pacoteIdx: 0 }], null)
    const ordem = [c, a, b, ...ORDEM_SPX.slice(3)]
    const otm: Plano = { id: 'r1:o1', rotaId: 'r1', tipo: 'otimizada', criadoEm: 3, ordem, km: 27, origem: 'teste' }
    await arm.salvarPlanos('r1', [SPX, otm])
    const alertas = registrarAviso(alertasVazios(), c, 10)
    await arm.registrarMudanca('r1', [], { ...SESSAO, fase: 'andamento', ordem, selecionada: c, iniciadaEm: 100, planoAtivo: otm.id, alertas: { ...alertas, silenciadoNaRota: true } })
    const r = (await arm.rotaAtiva())!
    expect(r.rotaId).toBe('r1')
    expect(r.rota.paradas).toEqual(PARADAS) // Stops, partes e códigos SPX intactos, na mesma ordem
    expect(r.pacotes[a]!.every((x) => x === 'entregue')).toBe(true)
    expect(r.pacotes[MULTI.id]![0]).toBe('entregue')
    expect(r.pacotes[MULTI.id]!.slice(1).every((x) => x === 'pendente')).toBe(true) // visita parcial: continua pendente
    expect(r).toMatchObject({ fase: 'andamento', ordem, selecionada: c, iniciadaEm: 100, planoAtivo: 'r1:o1' })
    expect(r.planos.map((p) => p.id).sort()).toEqual(['r1:o1', 'r1:spx'])
    expect(r.alertas).toEqual({ ...alertas, silenciadoNaRota: true })
  })

  it('finalizar: valida, guarda o resumo, apaga TODOS os detalhes e marca a limpeza como concluída', async () => {
    const arm = criar()
    await arm.salvarRota('r1', ROTA, SESSAO, [SPX])
    await arm.registrarMudanca('r1', [{ rotaId: 'r1', paradaId: MULTI.id, status: 'entregue', tipo: 'marcar', em: 2, pacote: MULTI.pacotes[0], pacoteIdx: 0 }], null)
    await arm.finalizarRota(resumoDe('r1'))
    expect(await arm.rotaAtiva()).toBeNull()
    expect(await arm.listarRotas()).toEqual([])
    const [s] = await arm.resumos()
    expect(s).toMatchObject({ rotaId: 'r1', limpeza: 'concluida', arquivo: '' })
    expect(validarResumo(s!)).toEqual([])
    await arm.apagarResumo('r1')
    expect(await arm.resumos()).toEqual([])
    await arm.guardarResumo(s!) // "Desfazer"
    expect(await arm.resumos()).toHaveLength(1)
  })

  it('resumo inválido (totais errados ou campo identificável) é recusado e nada é apagado', async () => {
    const arm = criar()
    await arm.salvarRota('r1', ROTA, SESSAO, [SPX])
    await expect(arm.finalizarRota({ ...resumoDe('r1'), entregues: 999 })).rejects.toThrow(/inválido/)
    await expect(arm.finalizarRota({ ...resumoDe('r1'), arquivo: 'planilha-do-joao.xlsx' })).rejects.toThrow(/inválido/)
    await expect(arm.finalizarRota({ ...resumoDe('r1'), endereco: 'Rua X' } as ResumoRota)).rejects.toThrow(/campo não permitido/)
    expect((await arm.rotaAtiva())?.rotaId).toBe('r1')
    expect(await arm.resumos()).toEqual([])
  })

  it('excluir uma rota não finalizada remove tudo dela (sem resumo)', async () => {
    const arm = criar()
    await arm.salvarRota('r1', ROTA, SESSAO, [SPX])
    await arm.apagarRota('r1')
    expect(await arm.rotaAtiva()).toBeNull()
    expect(await arm.listarRotas()).toEqual([])
  })

  it('conferência em andamento, veículo e preferências de alerta voltam iguais', async () => {
    const arm = criar()
    expect(await arm.lerConferencia()).toBeNull()
    const leitura = { arquivo: 'ficticia.xlsx', resultado: { stops: [{ key: 'n:1|x', order: 1 }], packages: [] }, achados: [], ms: 12 }
    await arm.salvarConferencia({ id: 'atual', arquivo: 'ficticia.xlsx', leitura, decisoes: [{ type: 'manter_todas', findingId: 'f1', at: 5 }], atualizadaEm: 9 })
    expect(await arm.lerConferencia()).toMatchObject({ arquivo: 'ficticia.xlsx', leitura, decisoes: [{ type: 'manter_todas' }] })
    await arm.apagarConferencia()
    expect(await arm.lerConferencia()).toBeNull()
    expect(await arm.lerVeiculo()).toBeUndefined()
    await arm.salvarVeiculo(VEICULO)
    expect(await arm.lerVeiculo()).toEqual(VEICULO)
    expect(await arm.lerPreferencias()).toEqual({ alertasLigados: true })
    await arm.salvarPreferencias({ alertasLigados: false })
    expect(await arm.lerPreferencias()).toEqual({ alertasLigados: false })
  })
})

describe('IndexedDB: transações, falhas e recuperação', () => {
  it('marcação + sessão são tudo ou nada: se a transação cair no meio, nada fica pela metade', async () => {
    const arm = armazenamentoDexie(new BancoRotaVHS(`teste-${++n}`))
    await arm.salvarRota('r1', ROTA, SESSAO, [SPX])
    arm.db.routes.hook('updating', () => {
      throw new Error('queda simulada no meio da gravação')
    })
    await expect(
      arm.registrarMudanca('r1', [{ rotaId: 'r1', paradaId: MULTI.id, status: 'entregue', tipo: 'marcar', em: 2, pacote: MULTI.pacotes[0], pacoteIdx: 0 }], { ...SESSAO, selecionada: MULTI.id }),
    ).rejects.toThrow()
    const r = (await armazenamentoDexie(new BancoRotaVHS(arm.db.name)).rotaAtiva())!
    expect(r.pacotes[MULTI.id]![0]).toBe('pendente') // o evento não ficou sem a sessão
    expect(r.selecionada).toBe(ORDEM_SPX[0])
  })

  it('limpeza interrompida no meio da finalização: o resumo fica e a limpeza termina na próxima abertura', async () => {
    const nome = `teste-${++n}`
    const arm = armazenamentoDexie(new BancoRotaVHS(nome))
    await arm.salvarRota('r1', ROTA, SESSAO, [SPX])
    arm.db.stopEvents.hook('deleting', () => {
      throw new Error('energia acabou durante a limpeza')
    })
    await arm.registrarMudanca('r1', [{ rotaId: 'r1', paradaId: MULTI.id, status: 'entregue', tipo: 'marcar', em: 2, pacote: MULTI.pacotes[0], pacoteIdx: 0 }], null)
    await expect(arm.finalizarRota(resumoDe('r1'))).rejects.toThrow()
    arm.db.close()
    // "Reabre o app": nova conexão, sem a falha.
    const de2 = armazenamentoDexie(new BancoRotaVHS(nome))
    expect((await de2.resumos())[0]).toMatchObject({ rotaId: 'r1', limpeza: 'pendente' })
    expect(await de2.rotaAtiva()).toBeNull() // a rota "finalizando" não volta como ativa
    expect(await de2.db.stops.where('routeId').equals('r1').count()).toBe(PARADAS.length) // nada foi marcado como limpo indevidamente
    expect(await de2.concluirLimpezasPendentes()).toEqual(['r1'])
    expect(await de2.db.stops.where('routeId').equals('r1').count()).toBe(0)
    expect(await de2.db.stopEvents.where('rotaId').equals('r1').count()).toBe(0)
    expect(await de2.db.plans.where('rotaId').equals('r1').count()).toBe(0)
    expect((await de2.resumos())[0]).toMatchObject({ limpeza: 'concluida' })
  })

  it('rota com dados faltando (corrompida) não derruba a abertura: a anterior válida volta', async () => {
    const arm = armazenamentoDexie(new BancoRotaVHS(`teste-${++n}`))
    await arm.salvarRota('boa', ROTA, SESSAO, [SPX])
    await arm.salvarRota('quebrada', ROTA, SESSAO, [])
    await arm.db.stops.where('routeId').equals('quebrada').delete() // corrompe
    expect((await arm.rotaAtiva())?.rotaId).toBe('boa')
    expect((await arm.listarRotas()).map((r) => r.id).sort()).toEqual(['boa', 'quebrada']) // continua listada para você excluir
  })

  it('armazenamento cheio: a gravação falha com erro (o app avisa e tenta de novo; nada é dado como gravado)', async () => {
    const arm = armazenamentoDexie(new BancoRotaVHS(`teste-${++n}`))
    await arm.salvarRota('r1', ROTA, SESSAO, [SPX])
    arm.db.stopEvents.hook('creating', () => {
      throw new DOMException('cota excedida', 'QuotaExceededError')
    })
    await expect(arm.registrarMudanca('r1', [{ rotaId: 'r1', paradaId: MULTI.id, status: 'entregue', tipo: 'marcar', em: 2, pacote: MULTI.pacotes[0], pacoteIdx: 0 }], null)).rejects.toThrow(/cota/)
  })
})

describe('migração v1 → v2 (sem apagar o banco)', () => {
  it('rota ativa, marcações e resumos antigos sobrevivem; rotas finalizadas da v1 têm os detalhes apagados', async () => {
    const nome = `migracao-${++n}`
    const v1 = new Dexie(nome)
    v1.version(1).stores(ESQUEMA_V1)
    await v1.open()
    const MULTIv1 = MULTI
    const sessaoV1 = { fase: 'andamento', ordem: [...ORDEM_SPX], selecionada: MULTIv1.id, iniciadaEm: 50 }
    const base = { fonte: 'exemplo', arquivo: ARQUIVO_EXEMPLO, ordemSpx: [...ORDEM_SPX], pacotes: ROTA.pacotes, semCoordenada: 0, criadaEm: 1, atualizadaEm: 2 }
    await v1.table('routes').bulkPut([{ id: 'ativa', status: 'ativa', ...base, ...sessaoV1 }, { id: 'velha', status: 'finalizada', ...base, criadaEm: 0, ...sessaoV1 }])
    for (const id of ['ativa', 'velha']) await v1.table('stops').bulkPut(PARADAS.map((p, pos) => ({ routeId: id, id: p.id, pos, p })))
    await v1.table('stopEvents').bulkAdd([
      { rotaId: 'ativa', paradaId: ORDEM_SPX[0], status: 'entregue', tipo: 'marcar', em: 3 }, // v1: visita inteira
      { rotaId: 'ativa', paradaId: MULTIv1.id, status: 'entregue', tipo: 'marcar', em: 4 },
      { rotaId: 'ativa', paradaId: MULTIv1.id, status: 'falha', tipo: 'marcar', em: 4, pacote: MULTIv1.pacotes[1] }, // P3
      { rotaId: 'velha', paradaId: ORDEM_SPX[0], status: 'entregue', tipo: 'marcar', em: 3 },
    ])
    await v1.table('routeSummaries').put({ ...resumoDe('velha'), arquivo: 'nome-antigo.xlsx', limpeza: undefined })
    v1.close()

    const arm = armazenamentoDexie(new BancoRotaVHS(nome))
    await arm.db.open()
    expect(arm.db.verno).toBe(VERSAO_BANCO)
    const r = (await arm.rotaAtiva())!
    expect(r.rotaId).toBe('ativa')
    expect(r.fase).toBe('andamento')
    expect(r.selecionada).toBe(MULTIv1.id)
    expect(r.pacotes[ORDEM_SPX[0]!]!.every((x) => x === 'entregue')).toBe(true)
    expect(r.pacotes[MULTIv1.id]![1]).toBe('falha') // evento P3 ganhou a posição do pacote
    expect(r.pacotes[MULTIv1.id]![0]).toBe('entregue')
    expect(r.planos.map((p) => p.tipo)).toEqual(['spx'])
    expect(r.alertas).toEqual(alertasVazios())
    expect((await arm.db.stopEvents.where('rotaId').equals('ativa').toArray()).find((e) => e.pacote === MULTIv1.pacotes[1])?.pacoteIdx).toBe(1)
    const velho = (await arm.resumos()).find((s) => s.rotaId === 'velha')!
    expect(velho).toMatchObject({ limpeza: 'pendente', arquivo: '' })
    expect(await arm.concluirLimpezasPendentes()).toEqual(['velha'])
    expect(await arm.db.stops.where('routeId').equals('velha').count()).toBe(0)
    expect(await arm.db.stops.where('routeId').equals('ativa').count()).toBe(PARADAS.length) // a ativa não foi tocada
  })
})

describe('resumo da rota', () => {
  it('pacotes pendentes ao finalizar contam como não entregues; visita parcial; sem dados identificáveis', () => {
    const ps = pend()
    const ids = ORDEM_SPX.slice(0, 3)
    ps[ids[0]!] = ps[ids[0]!]!.map(() => 'entregue')
    ps[ids[1]!] = ps[ids[1]!]!.map(() => 'falha')
    ps[MULTI.id] = MULTI.pacotes.map((_, i) => (i === 0 ? 'entregue' : i === 1 ? 'falha' : 'pendente'))
    const r = resumoDe('r', ps)
    expect(r.paradas).toBe(PARADAS.length)
    expect(r.pacotes).toBe(ROTA.pacotes)
    expect(r.pacotesEntregues! + r.pacotesSemSucesso! + r.pacotesPendentes!).toBe(r.pacotes)
    expect(r.entregues + r.falhas + r.pendentes).toBe(r.paradas)
    expect(r.pacotesPendentes).toBeGreaterThan(0)
    expect(validarResumo(r)).toEqual([])
    expect(JSON.stringify(r)).not.toMatch(/Rua|Av\.|BR2|-16\.|-49\./) // nada de endereço, código SPX ou coordenada
    expect(duracaoReal(r)).toBe(90)
    expect(duracaoReal({ ...r, iniciadaEm: null })).toBeNull()
  })
})
