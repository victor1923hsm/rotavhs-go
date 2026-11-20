// Etapa 3 (conclusão): entrega parcial por pacote, recuperação após interrupção, falhas de gravação,
// finalização com exclusão verificada, conferência, alertas, planos e desempenho com 200 paradas.
// Simulações de interrupção feitas aqui NÃO substituem o teste real de falta de bateria no aparelho.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { decidirAlerta } from '@/core/alertas'
import { textoPacotes } from '@/core/pacotes'
import { armazenamentoDexie, BancoRotaVHS } from '@/platform/armazenamento/dexie'
import { armazenamentoMemoria } from '@/platform/armazenamento/memoria'
import type { Armazenamento } from '@/platform/armazenamento/tipos'
import { PARADAS } from '@/mock/rota-ficticia'
import { rotaGrande } from '@/mock/rota-grande'
import { ROTA_EXEMPLO, parada, situacao, useEstado } from './estado'
import { guardarConferencia, iniciarPersistencia, lerConferencia, type Persistencia } from './persistencia'

const e = () => useEstado.getState()
const MULTI = PARADAS.find((p) => p.pacotes.length >= 3)!
let abertas: Persistencia[] = []
let n = 0
const nome = () => `e3-${++n}`
const abrir = async (arm: Armazenamento) => {
  const p = await iniciarPersistencia(arm)
  abertas.push(p)
  return p
}
const dexie = (nomeBanco: string) => armazenamentoDexie(new BancoRotaVHS(nomeBanco))
/** "Fecha o app" (para de observar) e zera a memória, como numa reabertura. */
async function fechar(p: Persistencia, esperar = true) {
  if (esperar) await p.aguardar()
  p.parar()
  abertas = abertas.filter((x) => x !== p)
  e().descartarRota()
  useEstado.setState({ retomada: null, resumos: [], limpezasPendentes: [], gravacao: 'ok', alertasLigados: true })
}
afterEach(async () => {
  for (const p of [...abertas]) await fechar(p, false)
  e().descartarRota()
  useEstado.setState({ retomada: null, resumos: [], limpezasPendentes: [], gravacao: 'ok', alertasLigados: true })
})

describe('entrega parcial por pacote (R1)', () => {
  it('a visita fica pendente enquanto houver pacote pendente; "2 de 3 entregues · 1 pendente"; só pula ao concluir', async () => {
    const p = await abrir(armazenamentoMemoria())
    e().carregarRota(ROTA_EXEMPLO)
    e().selecionar(MULTI.id)
    e().marcarPacote(MULTI.id, 0, 'entregue')
    e().marcarPacote(MULTI.id, 1, 'entregue')
    expect(e().status[MULTI.id]).toBe('pendente')
    expect(situacao(MULTI.id, e().pacotes)).toBe('em-andamento')
    expect(e().selecionada).toBe(MULTI.id) // não sai da visita
    if (MULTI.pacotes.length === 3) expect(textoPacotes(e().pacotes[MULTI.id]!)).toBe('2 de 3 entregues · 1 pendente')
    // "Sem sucesso (n)" marca só os pendentes; os já marcados não mudam.
    e().marcar('falha')
    expect(e().pacotes[MULTI.id]!.slice(0, 2)).toEqual(['entregue', 'entregue'])
    expect(e().pacotes[MULTI.id]!.slice(2).every((x) => x === 'falha')).toBe(true)
    expect(situacao(MULTI.id, e().pacotes)).toBe('parcial')
    expect(e().status[MULTI.id]).toBe('entregue')
    expect(e().selecionada).not.toBe(MULTI.id) // concluiu: pulou para a próxima
    // Correção: um pacote volta a pendente → a visita volta a ficar pendente (e o código SPX não muda).
    e().marcarPacote(MULTI.id, 0, 'pendente')
    expect(e().status[MULTI.id]).toBe('pendente')
    expect(parada(MULTI.id).pacotes).toEqual(MULTI.pacotes)
    await fechar(p)
  })

  it('ao finalizar, pacotes pendentes contam como não entregues sem alterar o histórico', async () => {
    const nb = nome()
    const p = await abrir(dexie(nb))
    e().selecionar(MULTI.id)
    e().marcarPacote(MULTI.id, 0, 'entregue')
    await p.aguardar()
    const rotaId = e().rotaId
    const eventosAntes = await (p.arm as ReturnType<typeof dexie>).db.stopEvents.where('rotaId').equals(rotaId).toArray()
    const r = e().finalizarRota()
    expect(r.pacotesEntregues).toBe(1)
    expect(r.pacotesPendentes).toBe(r.pacotes - 1)
    expect(r.pendentes).toBe(r.paradas) // a visita parcial ainda tinha pendente
    expect(eventosAntes).toHaveLength(1) // o histórico tinha só o que você marcou (nenhum evento inventado)
    await fechar(p)
  })
})

describe('recuperação após fechar, interromper ou reiniciar', () => {
  it('reabre uma rota com pacotes parcialmente entregues exatamente como estava', async () => {
    const nb = nome()
    const p1 = await abrir(dexie(nb))
    e().definirFase('otimizada')
    e().definirFase('andamento')
    e().selecionar(MULTI.id)
    e().marcarPacote(MULTI.id, 1, 'entregue')
    e().marcarPacote(MULTI.id, 2, 'falha')
    const antes = { pacotes: structuredClone(e().pacotes), ordem: [...e().ordem], sel: e().selecionada, rotaId: e().rotaId }
    await fechar(p1)
    await abrir(dexie(nb))
    expect(e().rotaId).toBe(antes.rotaId)
    expect(e().pacotes).toEqual(antes.pacotes)
    expect(e().ordem).toEqual(antes.ordem)
    expect(e().selecionada).toBe(antes.sel)
    expect(e().retomada).not.toBeNull() // o app oferece "continuar de onde parei"
  })

  it('app interrompido logo depois da marcação (sem esperar nada): a marcação já estava sendo gravada', async () => {
    const nb = nome()
    const p1 = await abrir(dexie(nb))
    e().selecionar(MULTI.id)
    e().marcarPacote(MULTI.id, 0, 'entregue')
    // Sem "fechar" o app: só espera o navegador confirmar a gravação (alguns ms) e lê por outra conexão,
    // como se a aba tivesse sido encerrada logo depois. (Um corte ANTES da confirmação pode perder este toque.)
    const t0 = performance.now()
    await p1.aguardar()
    const ms = performance.now() - t0
    const r = await dexie(nb).rotaAtiva()
    expect(r?.pacotes[MULTI.id]![0]).toBe('entregue')
    expect(ms).toBeLessThan(500)
    await fechar(p1, false)
  })

  it('corrigir uma entrega e recuperar o estado atualizado (com o histórico das duas marcações)', async () => {
    const nb = nome()
    const p1 = await abrir(dexie(nb))
    const id = e().selecionada
    e().marcar('entregue')
    e().selecionar(id)
    e().marcarPacote(id, 0, 'falha') // correção
    await fechar(p1)
    const p2 = await abrir(dexie(nb))
    expect(e().pacotes[id]![0]).toBe('falha')
    const ev = await (p2.arm as ReturnType<typeof dexie>).db.stopEvents.where('rotaId').equals(e().rotaId).toArray()
    expect(ev.filter((x) => x.paradaId === id && x.pacoteIdx === 0).map((x) => x.tipo)).toEqual(['marcar', 'correcao'])
  })

  it('reinício durante a finalização: o resumo fica, nada é dado como limpo e a limpeza termina ao reabrir', async () => {
    const nb = nome()
    const arm = dexie(nb)
    const p1 = await abrir(arm)
    e().marcar('entregue')
    await p1.aguardar()
    const rotaId = e().rotaId
    arm.db.stops.hook('deleting', () => {
      throw new Error('queda durante a limpeza')
    })
    e().finalizarRota()
    await p1.aguardar()
    expect(e().gravacao).toBe('falhou')
    expect(e().limpezasPendentes).toContain(rotaId)
    arm.db.close()
    await fechar(p1, false)
    // Reabre: termina a limpeza sozinho, sem perder o resumo.
    const arm2 = dexie(nb)
    await abrir(arm2)
    expect(e().limpezasPendentes).toEqual([])
    expect(e().resumos.find((r) => r.rotaId === rotaId)?.limpeza).toBe('concluida')
    expect(await arm2.db.stops.where('routeId').equals(rotaId).count()).toBe(0)
    expect(await arm2.db.routes.get(rotaId)).toBeUndefined()
  })

  it('armazenamento cheio: avisa, NÃO perde nem reordena, e grava tudo ao tentar de novo', async () => {
    const base = armazenamentoMemoria()
    let falhas = 2
    const cheio: Armazenamento = {
      ...base,
      registrarMudanca: async (...a) => {
        if (falhas > 0) {
          falhas--
          throw new DOMException('cota excedida', 'QuotaExceededError')
        }
        return base.registrarMudanca(...a)
      },
    }
    const p = await abrir(cheio)
    const a = e().selecionada
    e().marcar('entregue')
    const b = e().selecionada
    e().marcar('falha')
    await p.aguardar()
    expect(e().gravacao).toBe('falhou')
    expect(e().status[a]).toBe('entregue') // continua na tela
    expect((await base.rotaAtiva())!.pacotes[a]![0]).toBe('pendente') // ainda não gravado
    p.tentarDeNovo()
    await p.aguardar()
    p.tentarDeNovo()
    await p.aguardar()
    expect(e().gravacao).toBe('ok')
    const r = (await base.rotaAtiva())!
    expect(r.pacotes[a]!.every((x) => x === 'entregue')).toBe(true)
    expect(r.pacotes[b]!.every((x) => x === 'falha')).toBe(true)
    await fechar(p)
  })

  it('dados inconsistentes não derrubam a retomada (ordem inválida, pacotes com tamanho errado)', () => {
    const rota = ROTA_EXEMPLO
    e().restaurar({
      rotaId: 'x', rota, fase: 'andamento', ordem: ['nao-existe', ...rota.ordemSpx.slice(1)], selecionada: 'nao-existe', iniciadaEm: 1,
      planoAtivo: 'fantasma', origemOtimizacao: null, alertas: { porParada: {}, ultimoEm: null, silenciadoNaRota: false },
      pacotes: { [MULTI.id]: ['entregue'] }, planos: [{ id: 'p', rotaId: 'x', tipo: 'otimizada', criadoEm: 1, ordem: ['a'], km: 1, origem: null }], criadaEm: 1, atualizadaEm: 2,
    })
    expect(e().ordem).toEqual(rota.ordemSpx) // ordem inválida → SPX
    expect(e().selecionada).toBe(rota.ordemSpx[0])
    expect(e().pacotes[MULTI.id]!.every((x) => x === 'pendente')).toBe(true) // tamanho errado → pendentes (nada inventado)
    expect(e().planos.every((p) => p.ordem.length === rota.paradas.length)).toBe(true)
  })
})

describe('conferência, alertas e planos guardados', () => {
  it('a conferência em andamento volta depois de reabrir', async () => {
    const nb = nome()
    const p1 = await abrir(dexie(nb))
    await guardarConferencia('planilha-ficticia.xlsx', { arquivo: 'planilha-ficticia.xlsx', resultado: { stops: [] } }, [{ type: 'manter_todas', findingId: 'f', at: 1 }])
    await fechar(p1)
    await abrir(dexie(nb))
    expect(await lerConferencia()).toMatchObject({ arquivo: 'planilha-ficticia.xlsx', decisoes: [{ type: 'manter_todas' }] })
  })

  it('alertas: o estado (sem posição) e o "silenciar" voltam; a parada avisada não avisa de novo ao reabrir', async () => {
    const nb = nome()
    const p1 = await abrir(dexie(nb))
    const id = e().ordem[0]!
    e().registrarAlerta(id, 1_000)
    e().definirAlertasLigados(false)
    await fechar(p1)
    await abrir(dexie(nb))
    expect(e().alertas.porParada[id]).toEqual({ em: 1_000, afastou: false })
    expect(e().alertasLigados).toBe(false)
    const ctx = { candidatas: [{ id, distanciaM: 20 }], proximaId: id, precisaoM: 10, velocidadeMs: 0, agora: 5 * 60_000, ligados: true, visivel: false }
    expect(decidirAlerta(ctx, e().alertas)).toBeNull()
    e().silenciarAlertasNaRota(true)
    expect(JSON.stringify(e().alertas)).not.toMatch(/lat|lon|-16\.|-49\./) // nunca posição
  })

  it('planos: SPX + 5 recentes; voltar a um plano anterior não mexe nas marcações; tudo volta ao reabrir', async () => {
    const nb = nome()
    const p1 = await abrir(dexie(nb))
    e().otimizar()
    e().definirFase('andamento')
    e().marcar('entregue')
    for (let i = 0; i < 7; i++) {
      e().simularSugestao()
      e().aceitarSugestao()
    }
    expect(e().planos.filter((p) => p.tipo === 'spx')).toHaveLength(1)
    expect(e().planos.filter((p) => p.tipo !== 'spx')).toHaveLength(5)
    const spx = e().planos.find((p) => p.tipo === 'spx')!
    const pacotes = structuredClone(e().pacotes)
    e().restaurarPlano(spx.id)
    expect(e().ordem).toEqual(spx.ordem)
    expect(e().pacotes).toEqual(pacotes)
    const esperado = { planos: e().planos.map((p) => p.id).sort(), ativo: e().planoAtivo }
    await fechar(p1)
    await abrir(dexie(nb))
    expect(e().planos.map((p) => p.id).sort()).toEqual(esperado.planos)
    expect(e().planoAtivo).toBe(esperado.ativo)
    expect(e().ordem).toEqual(spx.ordem)
  })
})

describe('desempenho com 200 paradas fictícias (Node + fake-indexeddb, não é o celular)', () => {
  it('mede abrir, recuperar, marcar, parcial, tamanho e finalizar com limpeza', async () => {
    const rota = rotaGrande(200)
    expect(rota.paradas).toHaveLength(200)
    const nb = nome()
    const t = () => performance.now()
    let t0 = t()
    const p1 = await abrir(dexie(nb))
    e().carregarRota(rota)
    await p1.aguardar()
    const salvar = t() - t0
    e().definirFase('otimizada')
    e().definirFase('andamento')
    await p1.aguardar()
    // marcar uma entrega (visita inteira) até estar gravada
    t0 = t()
    e().marcar('entregue')
    await p1.aguardar()
    const marcar = t() - t0
    const multi = rota.paradas.find((p) => p.pacotes.length >= 3)!
    t0 = t()
    e().marcarPacote(multi.id, 0, 'entregue')
    await p1.aguardar()
    const parcial = t() - t0
    for (let i = 0; i < 60; i++) e().marcar(i % 5 ? 'entregue' : 'falha')
    await p1.aguardar()
    const db = (p1.arm as ReturnType<typeof dexie>).db
    const bytes = new TextEncoder().encode(JSON.stringify([await db.routes.toArray(), await db.stops.toArray(), await db.packages.toArray(), await db.stopEvents.toArray(), await db.plans.toArray()])).length
    await fechar(p1)
    t0 = t()
    const p2 = await abrir(dexie(nb))
    const recuperar = t() - t0
    expect(e().ordem).toHaveLength(200)
    t0 = t()
    e().finalizarRota()
    await p2.aguardar()
    const finalizar = t() - t0
    expect(await (p2.arm as ReturnType<typeof dexie>).db.stops.count()).toBe(ROTA_EXEMPLO.paradas.length) // só a rota de exemplo nova
    const m = { salvarRota_ms: Math.round(salvar), marcar_ms: Math.round(marcar), parcial_ms: Math.round(parcial), recuperar_ms: Math.round(recuperar), finalizar_e_limpar_ms: Math.round(finalizar), tamanho_kb: Math.round(bytes / 1024), pacotes: rota.pacotes }
    console.log('MEDIDAS_200', JSON.stringify(m))
    expect(bytes).toBeLessThan(1_000_000)
    expect(marcar).toBeLessThan(500)
    expect(recuperar).toBeLessThan(3000)
  })
})
