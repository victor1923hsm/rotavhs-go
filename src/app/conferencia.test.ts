// Q2 de ponta a ponta com o armazenamento: aviso, carência, proteção da tela Importar e fechar/reabrir.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { armazenamentoDexie, BancoRotaVHS } from '@/platform/armazenamento/dexie'
import { DIA } from '@/core/retencao'
import { useEstado } from './estado'
import { guardarConferencia, iniciarPersistencia, verificarConferencia } from './persistencia'

const e = () => useEstado.getState()
let n = 0
const novoArm = () => armazenamentoDexie(new BancoRotaVHS(`conf-${++n}`))
const T0 = Date.now()

afterEach(() => {
  useEstado.setState({ avisoConferencia: null, retomada: null })
  e().descartarRota()
})

describe('Q2: prazo da conferência', () => {
  it('fecha no meio, reabre dias depois: avisa, guarda 24 h e só então descarta (com aviso)', async () => {
    const arm = novoArm()
    await arm.salvarConferencia({ id: 'atual', arquivo: 'ficticia.xlsx', leitura: { x: 1 }, decisoes: [], atualizadaEm: T0 })
    // reabre 2 dias depois: nada muda
    await verificarConferencia(arm, T0 + 2 * DIA, false)
    expect(e().avisoConferencia).toBeNull()
    // 6 dias e meio: aviso antecipado
    await verificarConferencia(arm, T0 + 6.5 * DIA, false)
    expect(e().avisoConferencia).toMatchObject({ arquivo: 'ficticia.xlsx', expirada: false })
    // 7 dias e 1 h: expirou, mas ainda guardada (carência)
    await verificarConferencia(arm, T0 + 7 * DIA + 3600_000, false)
    expect(e().avisoConferencia?.expirada).toBe(true)
    expect((await arm.lerConferencia())?.avisadaExpiracaoEm).toBe(T0 + 7 * DIA + 3600_000)
    // com a tela Importar aberta, mesmo depois da carência: não descarta
    await verificarConferencia(arm, T0 + 9 * DIA, true)
    expect(await arm.lerConferencia()).not.toBeNull()
    // fora da Importar, depois da carência: descarta e avisa
    await verificarConferencia(arm, T0 + 9 * DIA, false)
    expect(await arm.lerConferencia()).toBeNull()
    expect(e().avisoConferencia).toBeNull()
    expect(e().aviso?.texto).toContain('foi descartada')
  })

  it('qualquer interação recomeça o prazo e tira o aviso', async () => {
    const arm = novoArm()
    const p = await iniciarPersistencia(arm)
    await arm.salvarConferencia({ id: 'atual', arquivo: 'f.xlsx', leitura: {}, decisoes: [], atualizadaEm: T0 - 7 * DIA - 1000 })
    await verificarConferencia(arm, Date.now(), false)
    expect(e().avisoConferencia?.expirada).toBe(true)
    await guardarConferencia('f.xlsx', {}, [{ tipo: 'decisao' }])
    expect(e().avisoConferencia).toBeNull()
    const c = await arm.lerConferencia()
    expect(c?.avisadaExpiracaoEm).toBeUndefined()
    expect(Date.now() - c!.atualizadaEm).toBeLessThan(5000)
    await p.aguardar()
    p.parar()
  })

  it('ao abrir o app, a verificação roda sozinha', async () => {
    const arm = novoArm()
    await arm.salvarConferencia({ id: 'atual', arquivo: 'g.xlsx', leitura: {}, decisoes: [], atualizadaEm: Date.now() - 6.5 * DIA })
    const p = await iniciarPersistencia(arm)
    expect(e().avisoConferencia).toMatchObject({ arquivo: 'g.xlsx', expirada: false })
    await p.aguardar()
    p.parar()
  })
})
