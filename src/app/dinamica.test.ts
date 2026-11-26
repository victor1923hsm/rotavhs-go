import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { linhaRetaKm, type Ponto } from '@/core/geo'
import type { ErroLocalizacao, Leitura, LocationProvider } from '@/platform/localizacao/tipos'
import { PARADAS } from '@/mock/rota-ficticia'
import { ROTA_EXEMPLO, parada, useEstado } from './estado'
import { aoMover, alertaPara, distanciaAoTrecho, DESVIO_MS, iniciarDinamica, reiniciarDinamica, useDinamica } from './dinamica'
import { useLocalizacao, usarProvedor } from './localizacao'
import { deslocar } from './simulador'

// Só dados fictícios: as paradas do modelo de teste e posições inventadas perto delas.
const E = () => useEstado.getState()
const L = () => useLocalizacao.getState()
let ler: (l: Leitura) => void = () => {}
let errar: (e: ErroLocalizacao) => void = () => {}
const gps: LocationProvider = {
  capabilities: { background: false },
  observar(_o, a, b) {
    ler = a
    errar = b
    return () => {}
  },
  permissao: async () => 'granted',
}
const em = (p: Ponto, precisaoM = 8) => ler({ lat: p.lat, lon: p.lon, precisaoM, rumo: null, em: Date.now() })
const andar = (ms: number) => vi.setSystemTime(Date.now() + ms)
const metros = (a: Ponto, b: Ponto) => linhaRetaKm(a, b) * 1000
const proxima = () => E().ordem.find((id) => E().status[id] === 'pendente')!
/** Espera uma ação assíncrona (otimização em segundo plano, com relógio falso). */
async function esperar<T>(p: Promise<T>): Promise<T> {
  let feito = false
  void p.then(() => (feito = true), () => (feito = true))
  for (let i = 0; i < 400 && !feito; i++) await vi.advanceTimersByTimeAsync(5)
  return p
}
const otimizar = () => esperar(E().otimizar())

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-19T10:00:00-03:00'))
  iniciarDinamica()
  usarProvedor(gps)
  E().carregarRota(ROTA_EXEMPLO)
  useEstado.setState({ resumos: [] })
  reiniciarDinamica()
  L().confirmarAtivacao()
})
afterEach(() => {
  L().desativar()
  vi.useRealTimers()
})

describe('otimizar a partir da posição atual (DEMONSTRAÇÃO)', () => {
  it('GPS confiável perto da rota: a otimização parte de você; a 1ª parada é a mais perto', async () => {
    const alvo = PARADAS[40]!
    em(deslocar(alvo, 40, 90))
    await otimizar()
    expect(E().origemOtimizacao).toBe('gps')
    const primeira = parada(E().ordem[0]!)
    const maisPerto = [...PARADAS].sort((a, b) => metros(alvo, a) - metros(alvo, b))[0]!
    expect(metros(primeira, alvo)).toBeLessThanOrEqual(metros(maisPerto, alvo) + 1)
  })
  it('rota de EXEMPLO longe de você (outra cidade) ou GPS negado: usa a posição de teste', async () => {
    em({ lat: -23.55, lon: -46.63 })
    await otimizar()
    expect(E().origemOtimizacao).toBe('teste')
    E().definirFase('revisao')
    useLocalizacao.setState({ estado: 'negada', ativa: false })
    await otimizar()
    expect(E().origemOtimizacao).toBe('teste')
  })
  it('agrupamentos preservados: mesmas paradas, mesmos Stops, mesmos pacotes', async () => {
    em(deslocar(PARADAS[10]!, 30, 0))
    await otimizar()
    expect([...E().ordem].sort()).toEqual(PARADAS.map((p) => p.id).sort())
    for (const p of PARADAS) expect(parada(p.id)).toEqual(p)
    expect(PARADAS.filter((p) => p.stop === 23)).toHaveLength(2) // parada dividida continua separada
  })
})

describe('reavaliação dinâmica e proteção contra oscilação', () => {
  const comecar = async () => {
    em(deslocar(PARADAS[0]!, 50, 0))
    await otimizar()
    E().definirFase('andamento')
  }
  it('a ordem nunca muda sem o seu toque (entregas, desvios e recálculo só sugerem)', async () => {
    await comecar()
    const antes = [...E().ordem]
    for (let i = 0; i < 8; i++) {
      em(deslocar(parada(proxima()), 15, 45))
      E().marcar(i % 3 ? 'entregue' : 'falha')
      await vi.advanceTimersByTimeAsync(50)
      andar(70_000)
      expect(E().ordem).toEqual(antes)
      if (E().sugestao) E().recusarSugestao()
    }
    await esperar(E().recalcular())
    expect(E().ordem).toEqual(antes)
  })
  it('tremor do GPS (±15 m) por 10 minutos: nenhuma sugestão por desvio', async () => {
    await comecar()
    const espia = vi.spyOn(E(), 'avaliarAutomatico')
    const p = parada(proxima())
    for (let t = 0; t < 120; t++) {
      andar(5_000)
      em(deslocar(p, 120 + ((t * 7) % 15), (t * 47) % 360))
    }
    expect(espia).not.toHaveBeenCalled()
    expect(E().sugestao).toBeNull()
  })
  it('desvio de 650 m: só avalia depois de 2 min fora do trecho', async () => {
    await comecar()
    const espia = vi.spyOn(useEstado.getState(), 'avaliarAutomatico')
    useEstado.setState({ avaliarAutomatico: espia })
    const de = { lat: -16.6869, lon: -49.2648 }
    const p = parada(proxima())
    const fora = deslocar(p, 650, 90)
    expect(distanciaAoTrecho(fora, de, p)).toBeGreaterThan(300)
    andar(60_000) // chegar lá leva tempo (senão seria um salto)
    em(fora)
    expect(useDinamica.getState().desvioDesde).not.toBeNull()
    andar(DESVIO_MS / 2)
    em(fora)
    expect(espia).not.toHaveBeenCalled()
    andar(DESVIO_MS / 2 + 1000)
    em(fora)
    expect(espia).toHaveBeenCalledWith('desvio', expect.any(Number))
  })
  it('intervalo mínimo de 60 s entre sugestões automáticas', async () => {
    await comecar()
    useEstado.setState({ ultimaAuto: Date.now() })
    expect(await esperar(E().avaliarAutomatico('desvio', Date.now() + 30_000))).toBe(false)
  })
  it('perto da próxima parada (< 200 m), nunca sugere trocá-la', async () => {
    await comecar()
    const p = parada(proxima())
    em(deslocar(p, 60, 0))
    // Força uma ordem ruim para haver ganho; mesmo assim a próxima protegida não pode mudar.
    const pend = E().ordem.filter((id) => E().status[id] === 'pendente')
    const ruim = [pend[0]!, ...pend.slice(1).reverse()]
    useEstado.setState({ ordem: ruim, ultimaAuto: null })
    await esperar(E().avaliarAutomatico('desvio', Date.now()))
    const s = E().sugestao
    if (s) expect(s.ordem.find((id) => E().status[id] === 'pendente')).toBe(p.id)
  })
})

describe('alerta de proximidade (DEMONSTRAÇÃO)', () => {
  it('avisa a 40 m com boa precisão, uma vez por aproximação; não avisa com precisão ruim; nunca marca', () => {
    E().definirFase('otimizada')
    E().definirFase('andamento')
    const p = parada(proxima())
    em(deslocar(p, 40, 180), 60)
    expect(useDinamica.getState().alerta).toBeNull()
    em(deslocar(p, 40, 180), 10)
    expect(useDinamica.getState().alerta?.paradaId).toBe(p.id)
    useDinamica.getState().fecharAlerta()
    andar(10_000)
    em(deslocar(p, 35, 180), 10)
    expect(useDinamica.getState().alerta).toBeNull() // uma vez por parada
    expect(E().status[p.id]).toBe('pendente') // nada marcado por proximidade
    expect(alertaPara({ ...deslocar(p, 150, 0), precisaoM: 5 })).toBeNull()
  })
})

describe('sem sinal e saltos durante a rota', () => {
  it('salto isolado é descartado e não move a origem; GPS desligado avisa', () => {
    E().definirFase('otimizada')
    E().definirFase('andamento')
    const aqui = deslocar(PARADAS[5]!, 20, 0)
    em(aqui)
    andar(2_000)
    em(deslocar(aqui, 3000, 0))
    expect(L().leitura).toMatchObject({ lat: aqui.lat, lon: aqui.lon })
    expect(L().descartadas.salto).toBe(1)
    errar('indisponivel')
    expect(L().estado).toBe('indisponivel')
    aoMover()
    expect(E().sugestao).toBeNull()
  })
})
