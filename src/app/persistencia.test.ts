import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { armazenamentoDexie, BancoRotaVHS } from '@/platform/armazenamento/dexie'
import { ROTA_EXEMPLO, useEstado } from './estado'
import { iniciarPersistencia } from './persistencia'

const e = () => useEstado.getState()
const abrir = (nome: string) => iniciarPersistencia(armazenamentoDexie(new BancoRotaVHS(nome)))
const db = (p: Awaited<ReturnType<typeof abrir>>) => (p.arm as ReturnType<typeof armazenamentoDexie>).db

/** "Fecha o app": para de gravar e devolve o estado da memória para a rota de exemplo. */
async function fechar(p: Awaited<ReturnType<typeof abrir>>) {
  await p.aguardar()
  p.parar()
  e().descartarRota()
  useEstado.setState({ rotaId: 'outra', retomada: null, resumos: [], limpezasPendentes: [], veiculo: { combustivel: 'Gasolina', precoCentavos: 619, consumoKmL: 10 } })
}

describe('sessão recuperável (Etapa 3)', () => {
  it('fechar e reabrir mantém a rota, a situação de cada pacote, a ordem e a posição na lista', async () => {
    const p1 = await abrir('sessao')
    expect(p1.retomada).toBe(false)
    const rotaId = e().rotaId
    e().definirFase('otimizada')
    e().definirFase('andamento')
    const a = e().selecionada
    e().marcar('entregue')
    const b = e().selecionada
    e().marcar('falha')
    e().aviso?.desfazer?.() // desfaz a falha
    e().marcar('entregue')
    const c = e().selecionada
    e().definirVeiculo({ combustivel: 'Etanol', precoCentavos: 459, consumoKmL: 7.5 })
    const esperado = { ordem: [...e().ordem], pacotes: structuredClone(e().pacotes), iniciadaEm: e().iniciadaEm, planoAtivo: e().planoAtivo }
    await fechar(p1)
    expect(e().rotaId).toBe('outra')

    const p2 = await abrir('sessao')
    expect(p2.retomada).toBe(true)
    expect(e().rotaId).toBe(rotaId)
    expect(e().fase).toBe('andamento')
    expect(e().ordem).toEqual(esperado.ordem)
    expect(e().pacotes).toEqual(esperado.pacotes)
    expect(e().status[a]).toBe('entregue')
    expect(e().status[b]).toBe('entregue')
    expect(e().selecionada).toBe(c)
    expect(e().iniciadaEm).toBe(esperado.iniciadaEm)
    expect(e().planoAtivo).toBe(esperado.planoAtivo)
    expect(e().veiculo).toEqual({ combustivel: 'Etanol', precoCentavos: 459, consumoKmL: 7.5 })
    expect(e().retomada).toMatchObject({ concluidas: 2, visitas: esperado.ordem.length })
    // O histórico é só de inclusão, por pacote: marcar, marcar (falha), desfazer, marcar.
    const ev = await db(p2).stopEvents.where('rotaId').equals(rotaId).toArray()
    expect(ev.every((x) => x.pacote !== undefined && x.pacoteIdx !== undefined)).toBe(true)
    expect([...new Set(ev.filter((x) => x.paradaId === b).map((x) => `${x.tipo}:${x.status}`))]).toEqual(['marcar:falha', 'desfazer:pendente', 'marcar:entregue'])
    await fechar(p2)
  })

  it('finalizar gera o resumo, apaga os detalhes e o resumo continua ao reabrir; apagar e desfazer', async () => {
    const p1 = await abrir('finalizar')
    e().definirFase('otimizada')
    e().definirFase('andamento')
    e().marcar('entregue')
    e().marcar('falha')
    const antiga = e().rotaId
    const r = e().finalizarRota()
    expect(r).toMatchObject({ rotaId: antiga, entregues: 1, falhas: 1, pendentes: e().ordem.length - 2, motivo: 'finalizada', kmTipo: 'estimado', arquivo: '' })
    expect(r.custoCentavos).toBeGreaterThan(0)
    expect(e().rotaId).not.toBe(antiga) // volta para a rota de exemplo, nova e limpa
    await p1.aguardar()
    expect(await db(p1).stops.where('routeId').equals(antiga).count()).toBe(0)
    expect(await db(p1).routes.get(antiga)).toBeUndefined()
    expect((await db(p1).routeSummaries.get(antiga))?.limpeza).toBe('concluida')
    await fechar(p1)

    const p2 = await abrir('finalizar')
    expect(e().resumos.map((x) => x.rotaId)).toEqual([antiga])
    expect(e().rotaId).not.toBe(antiga)
    e().apagarResumo(antiga)
    expect(e().resumos).toEqual([])
    e().aviso?.desfazer?.()
    expect(e().resumos.map((x) => x.rotaId)).toEqual([antiga])
    e().apagarResumo(antiga)
    await fechar(p2)

    await abrir('finalizar').then(fechar)
    expect(await armazenamentoDexie(new BancoRotaVHS('finalizar')).resumos()).toEqual([])
  })

  it('importar outra rota com marcações: a anterior vira "substituída" e seus detalhes são apagados; sem marcações, é excluída', async () => {
    const p = await abrir('troca')
    const vazia = e().rotaId
    e().carregarRota(ROTA_EXEMPLO)
    expect(e().resumos).toEqual([])
    e().marcar('entregue')
    const marcada = e().rotaId
    e().carregarRota(ROTA_EXEMPLO)
    expect(e().resumos.map((x) => [x.rotaId, x.motivo])).toEqual([[marcada, 'substituida']])
    await p.aguardar()
    expect(await db(p).routes.get(vazia)).toBeUndefined()
    expect(await db(p).routes.get(marcada)).toBeUndefined()
    expect(await db(p).stops.where('routeId').equals(marcada).count()).toBe(0)
    expect((await db(p).routeSummaries.get(marcada))?.limpeza).toBe('concluida')
    expect((await db(p).routes.where('status').equals('ativa').toArray()).map((x) => x.id)).toEqual([e().rotaId])
    await fechar(p)
  })
})
