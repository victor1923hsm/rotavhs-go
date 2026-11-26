import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { linhaRetaKm, type Ponto } from '@/core/geo'
import type { Leitura, LocationProvider } from '@/platform/localizacao/tipos'
import { ROTA_EXEMPLO, parada, useEstado } from './estado'
import { iniciarDinamica, reiniciarDinamica } from './dinamica'
import { useLocalizacao, usarProvedor } from './localizacao'
import { deslocar } from './simulador'
import type { RotaImportada } from '@/features/importar/converter'

// Fase R-A. Só dados FICTÍCIOS: as paradas do modelo de teste, tratadas como se fossem uma planilha importada.
const PLANILHA: RotaImportada = { ...ROTA_EXEMPLO, fonte: 'planilha', arquivo: 'rota-ficticia.csv' }
const E = () => useEstado.getState()
const L = () => useLocalizacao.getState()
let ler: (l: Leitura) => void = () => {}
const gps: LocationProvider = {
  capabilities: { background: false },
  observar(_o, a) {
    ler = a
    return () => {}
  },
  permissao: async () => 'granted',
}
const em = (p: Ponto, precisaoM = 8) => ler({ lat: p.lat, lon: p.lon, precisaoM, rumo: null, em: Date.now() })
async function esperar<T>(p: Promise<T>): Promise<T> {
  let feito = false
  void p.then(() => (feito = true), () => (feito = true))
  for (let i = 0; i < 600 && !feito; i++) await vi.advanceTimersByTimeAsync(100)
  return p
}
const pendentes = () => E().ordem.filter((id) => E().status[id] === 'pendente')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-25T10:00:00-03:00'))
  iniciarDinamica()
  usarProvedor(gps)
  E().carregarRota(PLANILHA)
  reiniciarDinamica()
  L().confirmarAtivacao()
})
afterEach(() => {
  L().desativar()
  vi.useRealTimers()
})

describe('origem: sempre a posição atual do motorista', () => {
  it('parte da sua posição e nunca começa pela 1ª parada da SPX só por ela ser a primeira', async () => {
    const spx = E().rota.ordemSpx
    const ultimaSpx = parada(spx[spx.length - 1]!)
    em(deslocar(ultimaSpx, 30, 0)) // você está ao lado da ÚLTIMA parada da SPX
    await esperar(E().otimizar())
    expect(E().fase).toBe('otimizada')
    expect(E().origemOtimizacao).toBe('gps')
    expect(E().ordem[0]).not.toBe(spx[0])
    const primeira = parada(E().ordem[0]!)
    expect(linhaRetaKm(primeira, ultimaSpx)).toBeLessThan(linhaRetaKm(parada(spx[0]!), ultimaSpx))
    expect(E().rota.ordemSpx).toEqual(spx) // a ordem da SPX continua guardada como referência
  })

  it('sem localização (permissão negada): não otimiza, explica e a rota não muda', async () => {
    L().desativar()
    usarProvedor({ capabilities: { background: false }, permissao: async () => 'denied', observar: (_o, _a, erro) => (erro('negada'), () => {}) })
    const antes = [...E().ordem]
    const p = E().otimizar()
    await vi.advanceTimersByTimeAsync(10)
    expect(L().explicando).toBe(true) // a explicação do app aparece antes do pedido do sistema
    L().confirmarAtivacao() // você toca em "Permitir localização"; o sistema nega
    await esperar(p)
    expect(E().fase).toBe('revisao')
    expect(E().ordem).toEqual(antes)
    expect(E().falhaOtimizacao).toMatch(/permissão de localização/)
    expect(E().otimizacao).toBeNull()
  })

  it('GPS ligado mas sem leitura confiável a tempo: avisa e não usa a 1ª parada', async () => {
    const antes = [...E().ordem]
    em(deslocar(parada(antes[3]!), 10, 0), 400) // precisão ruim: não serve de origem
    await esperar(E().otimizar())
    expect(E().falhaOtimizacao).toMatch(/a tempo/)
    expect(E().ordem).toEqual(antes)
    expect(E().fase).toBe('revisao')
  }, 30_000)
})

describe('segundo plano, cancelamento e integridade', () => {
  it('cancelar durante o cálculo: nada muda e a rota anterior continua', async () => {
    em(deslocar(parada(E().ordem[10]!), 20, 0))
    const antes = [...E().ordem]
    const p = E().otimizar()
    for (let i = 0; i < 50 && E().otimizacao?.etapa !== 'calculando'; i++) await Promise.resolve()
    expect(E().otimizacao?.etapa).toBe('calculando')
    E().cancelarOtimizacao()
    await esperar(p)
    expect(E().otimizacao).toBeNull()
    expect(E().ordem).toEqual(antes)
    expect(E().fase).toBe('revisao')
    expect(E().aviso?.texto).toMatch(/cancelada/)
  })

  it('não perde, duplica nem altera paradas, Stops ou pacotes', async () => {
    em(deslocar(parada(E().ordem[20]!), 20, 0))
    const fotos = E().rota.paradas.map((p) => structuredClone(p))
    await esperar(E().otimizar())
    expect([...E().ordem].sort()).toEqual(PLANILHA.paradas.map((p) => p.id).sort())
    for (const f of fotos) expect(parada(f.id)).toEqual(f)
  })

  it('término: voltar ao ponto de partida e terminar numa parada escolhida', async () => {
    em(deslocar(parada(E().ordem[0]!), 20, 0))
    const alvo = E().ordem[7]!
    E().definirTermino({ tipo: 'parada', id: alvo })
    await esperar(E().otimizar())
    const comCoord = E().ordem.filter((id) => !parada(id).semCoordenada)
    expect(comCoord[comCoord.length - 1]).toBe(alvo)
  })
})

describe('reotimização: só as pendentes', () => {
  it('Recalcular mantém as concluídas no lugar e só sugere (nunca aplica sozinho)', async () => {
    em(deslocar(parada(E().ordem[0]!), 20, 0))
    await esperar(E().otimizar())
    E().definirFase('andamento')
    E().marcar('entregue')
    E().marcar('falha')
    E().marcar('entregue')
    await vi.advanceTimersByTimeAsync(50)
    useEstado.setState({ sugestao: null })
    const feitas = E().ordem.filter((id) => E().status[id] !== 'pendente')
    // Uma ordem ruim das pendentes, para haver o que melhorar.
    const pend = pendentes()
    const ruim = [...feitas, ...pend.slice().reverse()]
    useEstado.setState({ ordem: ruim })
    em(deslocar(parada(pend[0]!), 15, 0))
    await esperar(E().recalcular())
    expect(E().ordem).toEqual(ruim) // não aplicou
    const s = E().sugestao
    expect(s).not.toBeNull()
    expect(s!.ordem.slice(0, feitas.length)).toEqual(feitas)
    expect([...s!.ordem].sort()).toEqual([...ruim].sort())
    expect(s!.ganhoMin).toBeGreaterThan(0)
    E().aceitarSugestao()
    expect(E().ordem.slice(0, feitas.length)).toEqual(feitas)
  })

  it('uma entrega marcada durante o cálculo invalida o resultado (nada é aplicado)', async () => {
    em(deslocar(parada(E().ordem[0]!), 20, 0))
    await esperar(E().otimizar())
    E().definirFase('andamento')
    const p = E().recalcular()
    for (let i = 0; i < 50 && E().otimizacao?.etapa !== 'calculando'; i++) await Promise.resolve()
    useEstado.setState({ status: { ...E().status, [E().ordem[0]!]: 'entregue' } })
    await esperar(p)
    expect(E().sugestao).toBeNull()
  })
})
