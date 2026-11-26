// RB-4 — modo experimental: separação técnica das entregas SPX e fluxo completo (encaixe → matriz → motor →
// traçado) com respostas CONTROLADAS no caminho "real" (com a guarda). Só pontos fictícios.
import { beforeEach, describe, expect, it } from 'vitest'
import { provedorORS } from '@/core/ruas/ors'
import { FalhaProvedor } from '@/core/ruas/tipos'
import { orsAnalitico } from '@/core/ruas/testes/orsAnalitico'
import { PARTIDAS_PUBLICAS, sortearPontos } from './area'
import { criarAutorizacao, guardaExperimental, RegistroExperimental } from './guarda'
import { calcularTeste, criarProvedor, gerarParadas, linhasDoTracado, reotimizarOffline } from './motorExperimental'
import type { TesteSalvo } from './armazem'

const CHAVE = 'TESTE-chave-ficticia-0123456789'
const REAL = 'https://api.heigit.org/openrouteservice/v2'

describe('guarda experimental (separação das entregas SPX)', () => {
  const reg = new RegistroExperimental()
  const p = sortearPontos(3, 7)
  p.forEach((x) => reg.registrar(x))
  const env = (c: { lat: number; lon: number }) => [[c.lon, c.lat]] as [number, number][]

  it('sem autorização, nada sai', () => {
    expect(() => guardaExperimental(null, reg, () => [])(env(p[0]!))).toThrow()
  })
  it('só coordenadas registradas pelo teste, dentro de Goiânia, e nunca coincidentes com a SPX', () => {
    const g = guardaExperimental(criarAutorizacao(), reg, () => [{ lat: p[2]!.lat + 0.00005, lon: p[2]!.lon }])
    expect(() => g(env(p[0]!))).not.toThrow()
    expect(() => g(env({ lat: p[0]!.lat + 0.001, lon: p[0]!.lon }))).toThrow(/não registrada/)
    expect(() => g(env({ lat: -23.55, lon: -46.63 }))).toThrow(/Goiânia/)
    expect(() => g(env(p[2]!))).toThrow(/SPX/)
    expect(() => reg.registrar({ lat: -23.55, lon: -46.63 })).toThrow()
  })
  it('o cliente do provedor recusa o envio real sem guarda, mesmo "liberado" (caso das rotas SPX)', async () => {
    let chamou = false
    const prov = provedorORS({ chave: CHAVE, base: REAL, liberadoReal: true, fetch: async () => ((chamou = true), { status: 200, headers: { get: () => null }, text: async () => '{}' }) })
    await expect(prov.matriz(p, [0], [1], 'carro')).rejects.toMatchObject({ tipo: 'bloqueado' })
    const spx = provedorORS({ chave: CHAVE, base: REAL, liberadoReal: false, guarda: () => {}, fetch: async () => ((chamou = true), { status: 200, headers: { get: () => null }, text: async () => '{}' }) })
    await expect(spx.matriz(p, [0], [1], 'carro')).rejects.toMatchObject({ tipo: 'bloqueado' })
    expect(chamou).toBe(false)
  })
})

describe('fluxo experimental completo (respostas controladas, caminho real com guarda)', () => {
  let ors: ReturnType<typeof orsAnalitico>
  let reg: RegistroExperimental
  const ctx = async () => {
    const p = await criarProvedor({ chave: CHAVE, autorizacao: criarAutorizacao(), registro: reg, coordenadasSpx: () => [], base: REAL })
    return p
  }
  beforeEach(() => {
    ors = orsAnalitico({ chaveValida: CHAVE })
    ;(globalThis as { fetch?: unknown }).fetch = ors.fetch
    reg = new RegistroExperimental()
    reg.registrar(PARTIDAS_PUBLICAS[0]!)
  })

  const novo = (): TesteSalvo => ({ id: 'atual', versao: 1, partida: { ...PARTIDAS_PUBLICAS[0]! }, paradas: [], ordem: [], trechos: {}, acessos: {}, atualizadoEm: 0 })

  it('gera 25 paradas em vias, calcula pelas ruas, desenha o traçado, compara com a rápida', async () => {
    const prov = await ctx()
    const paradas = await gerarParadas(25, prov, reg, 42)
    expect(paradas).toHaveLength(25)
    const t0 = { ...novo(), paradas, ordem: paradas.map((p) => p.id) }
    const r = await calcularTeste(t0, prov, new AbortController().signal, () => {})
    expect(new Set(r.ordemNova).size).toBe(25)
    const c = r.teste.comparacao!
    expect(c.ruas.km).toBeLessThanOrEqual(c.rapida.km + 1e-9) // pela mesma matriz, nunca pior que a rápida
    expect(c.tracado!.semTracado).toBe(0)
    expect(c.pedidos.rota).toBe(1)
    const linhas = linhasDoTracado(r.teste)
    expect(linhas).toHaveLength(25)
    expect(linhas.every((l) => l.length >= 2)).toBe(true)
    // Nenhum texto saiu: só coordenadas e parâmetros
    const chaves = new Set(ors.estado.corpos.flatMap((c) => Object.keys(JSON.parse(c) as object)))
    for (const k of chaves) expect(['locations', 'coordinates', 'sources', 'destinations', 'metrics', 'radius', 'instructions', 'elevation', 'units', 'geometry_simplify']).toContain(k)
    expect(ors.estado.urls.every((u) => u.startsWith(REAL))).toBe(true)
  })

  it('reotimizar as pendentes reaproveita matriz e traçado (só a nova origem e os trechos novos)', async () => {
    const prov = await ctx()
    const paradas = await gerarParadas(10, prov, reg, 9)
    let t = (await calcularTeste({ ...novo(), paradas, ordem: paradas.map((p) => p.id) }, prov, new AbortController().signal, () => {})).teste
    const primeiras = t.ordem.slice(0, 3)
    t = { ...t, paradas: t.paradas.map((p) => (primeiras.includes(p.id) ? { ...p, visitada: true } : p)) }
    const m0 = ors.estado.matriz
    const s0 = ors.estado.snap
    const r = await calcularTeste(t, prov, new AbortController().signal, () => {})
    expect(ors.estado.matriz - m0).toBe(0) // origem = parada já calculada: tudo do cache
    expect(ors.estado.snap - s0).toBe(0)
    expect(r.ordemNova.slice(0, 3)).toEqual(primeiras)
  })

  it('sem internet: reotimiza com a matriz salva, sem nenhum pedido; trechos sem traçado ficam só como pinos', async () => {
    const prov = await ctx()
    const paradas = await gerarParadas(10, prov, reg, 3)
    let t = (await calcularTeste({ ...novo(), paradas, ordem: paradas.map((p) => p.id) }, prov, new AbortController().signal, () => {})).teste
    t = { ...t, paradas: t.paradas.map((p) => (p.id === t.ordem[0] ? { ...p, visitada: true } : p)) }
    const n0 = ors.estado.pedidos
    const r = reotimizarOffline(t)
    expect(ors.estado.pedidos).toBe(n0)
    expect(r.teste.comparacao!.offline).toBe(true)
    expect(r.ordemNova[0]).toBe(t.ordem[0])
  })

  it('cancelar não muda o teste salvo', async () => {
    const prov = await ctx()
    const paradas = await gerarParadas(10, prov, reg, 5)
    const t = { ...novo(), paradas, ordem: paradas.map((p) => p.id) }
    const ctl = new AbortController()
    ctl.abort()
    await expect(calcularTeste(t, prov, ctl.signal, () => {})).rejects.toBeInstanceOf(FalhaProvedor)
    expect(t.comparacao).toBeUndefined()
  })
})

describe('separação no código-fonte', () => {
  it('só o modo experimental cria cliente com envio real (liberadoReal: true + guarda)', () => {
    const fontes = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const suspeitos = Object.entries(fontes)
      .filter(([f]) => !f.startsWith('/src/experimental/') && f !== '/src/core/ruas/ors.ts')
      .filter(([, t]) => /liberadoReal:\s*true/.test(t) || /\bguarda:\s*guardaExperimental/.test(t) || /from '@\/experimental\/(guarda|motorExperimental)'/.test(t))
      .map(([f]) => f)
    expect(suspeitos).toEqual([])
    expect(Object.keys(fontes).length).toBeGreaterThan(50)
  })
})
