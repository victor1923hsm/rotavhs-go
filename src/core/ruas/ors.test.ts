// RB-2: cliente ORS com respostas CONTROLADAS (malha fictícia e modelo analítico). Nenhuma chamada real.
import { describe, expect, it } from 'vitest'
import { otimizar } from '../otimizacao/motor'
import { CacheMatriz } from './cacheMatriz'
import { roteirizar, MAX_TENTATIVAS, type AmbienteFluxo } from './fluxo'
import { trechosSemPercurso } from './montagem'
import { provedorORS, ehBaseDeTeste } from './ors'
import { CargaRecusada } from './privacidade'
import { MalhaViaria } from './testes/malhaViaria'
import { orsFalso } from './testes/orsFalso'
import { orsAnalitico } from './testes/orsAnalitico'
import { FalhaProvedor } from './tipos'

const BASE = 'http://127.0.0.1:9/ors/v2'
const amb = (): AmbienteFluxo & { esperas: number[] } => {
  let t = 0
  const esperas: number[] = []
  return { esperas, agora: () => t, esperar: async (ms) => void (esperas.push(ms), (t += ms)) }
}
/** Temporizador manual: o tempo limite dispara quando o teste mandar. */
function relogio() {
  const fila: (() => void)[] = []
  return { agendar: (f: () => void) => (fila.push(f), fila.length - 1), desagendar: () => {}, disparar: () => fila.splice(0).forEach((f) => f()) }
}

describe('cliente ORS: segurança e bloqueio', () => {
  const malha = new MalhaViaria({ lado: 30, semente: 5 })
  it('envio ao ORS REAL fica bloqueado (não chega a chamar o fetch)', async () => {
    const f = orsFalso(malha)
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, liberadoReal: false })
    await expect(p.encaixar([malha.coordenada(40)], 25, 'carro')).rejects.toMatchObject({ tipo: 'bloqueado' })
    expect(f.estado.pedidos).toBe(0)
    expect(ehBaseDeTeste('https://api.heigit.org/openrouteservice/v2')).toBe(false)
    expect(ehBaseDeTeste('http://10.0.2.2:8080/x')).toBe(true)
  })

  it('a chave vai só no cabeçalho; nunca na URL, no corpo nem na mensagem de erro', async () => {
    const f = orsFalso(malha)
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false })
    await p.matriz([malha.coordenada(40), malha.coordenada(400)], [0], [1], 'carro')
    expect(f.estado.cabecalhosAuth[0]).toBe(f.chave)
    expect(f.estado.urls.join()).not.toContain(f.chave)
    expect(f.estado.corpos.join()).not.toContain(f.chave)
    const ruim = provedorORS({ chave: 'TESTE-chave-errada-000000000000', fetch: f.fetch, base: BASE, liberadoReal: false })
    const e = (await ruim.matriz([malha.coordenada(40), malha.coordenada(400)], [0], [1], 'carro').catch((x: unknown) => x)) as FalhaProvedor
    expect(e).toBeInstanceOf(FalhaProvedor)
    expect(e.tipo).toBe('chave')
    expect(e.message).not.toContain('TESTE-chave')
    expect(e.message).not.toMatch(/-15\\.|-48\\./)
  })

  it('só coordenadas e parâmetros técnicos no corpo (a guarda recusa qualquer texto)', async () => {
    const f = orsFalso(malha)
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false })
    await p.encaixar([malha.coordenada(40)], 25, 'carro')
    await p.matriz([malha.coordenada(40), malha.coordenada(400)], [0, 1], [0, 1], 'carro')
    await p.rota([malha.coordenada(40), malha.coordenada(400)], 'carro')
    const textos: string[] = []
    const coletar = (v: unknown): void => {
      if (typeof v === 'string') textos.push(v)
      else if (Array.isArray(v)) v.forEach(coletar)
      else if (v && typeof v === 'object') Object.values(v).forEach(coletar)
    }
    for (const c of f.estado.corpos) coletar(JSON.parse(c))
    expect([...new Set(textos)].sort()).toEqual(['distance', 'duration', 'm'])
    await expect(provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false }).encaixar([{ lat: Number.NaN, lon: 0 }], 25, 'carro')).rejects.toBeInstanceOf(CargaRecusada)
  })

  it('o nome da rua devolvido pelo snap é descartado', async () => {
    const f = orsFalso(malha)
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false })
    const r = await p.encaixar([malha.coordenada(40)], 25, 'carro')
    expect(JSON.stringify(r)).not.toContain('Rua')
  })
})

describe('cliente ORS: erros, tempo limite e cancelamento', () => {
  const malha = new MalhaViaria({ lado: 30, semente: 6 })
  const pts = [malha.coordenada(31), malha.coordenada(500)]
  it('sem conexão, 5xx, 429 com Retry-After e cota do dia', async () => {
    const off = orsFalso(malha, { semConexaoAPartirDe: 1 })
    await expect(provedorORS({ chave: off.chave, fetch: off.fetch, base: BASE, liberadoReal: false }).matriz(pts, [0], [1], 'carro')).rejects.toMatchObject({ tipo: 'sem-conexao' })
    const x5 = orsFalso(malha, { falhas5xx: 1 })
    await expect(provedorORS({ chave: x5.chave, fetch: x5.fetch, base: BASE, liberadoReal: false }).matriz(pts, [0], [1], 'carro')).rejects.toMatchObject({ tipo: 'indisponivel', codigo: 503 })
    const lim = orsFalso(malha, { limiteACada: 1 })
    await expect(provedorORS({ chave: lim.chave, fetch: lim.fetch, base: BASE, liberadoReal: false }).matriz(pts, [0], [1], 'carro')).rejects.toMatchObject({ tipo: 'limite-minuto', codigo: 429, esperarMs: 1000 })
    const cota = orsFalso(malha, { cotaDepoisDe: 0 })
    await expect(provedorORS({ chave: cota.chave, fetch: cota.fetch, base: BASE, liberadoReal: false }).matriz(pts, [0], [1], 'carro')).rejects.toMatchObject({ tipo: 'cota-diaria' })
  })

  it('tempo limite: o pedido é abortado e vira "tempo-esgotado"', async () => {
    const f = orsFalso(malha, { travar: true })
    const r = relogio()
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false, agendar: r.agendar, desagendar: r.desagendar })
    const prom = p.matriz(pts, [0], [1], 'carro')
    r.disparar()
    await expect(prom).rejects.toMatchObject({ tipo: 'tempo-esgotado' })
  })

  it('cancelar aborta o pedido em andamento', async () => {
    const f = orsFalso(malha, { travar: true })
    const ctl = new AbortController()
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false })
    const prom = p.matriz(pts, [0], [1], 'carro', ctl.signal)
    ctl.abort()
    await expect(prom).rejects.toMatchObject({ tipo: 'cancelado' })
  })

  it('novas tentativas são LIMITADAS (nunca infinitas)', async () => {
    const f = orsFalso(malha, { falhas5xx: 100 })
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false })
    const r = await roteirizar(p, [malha.coordenada(31), malha.coordenada(500), malha.coordenada(700)], 'carro', amb())
    expect(r.interrompido?.tipo).toBe('indisponivel')
    expect(f.estado.pedidos).toBe(MAX_TENTATIVAS)
  })
})

describe('fluxo completo pelo cliente ORS (malha fictícia com mão única e conversões proibidas)', () => {
  const malha = new MalhaViaria({ lado: 50, semente: 33, areasSemVia: 2 })
  const pontos = (n: number) => [malha.coordenada(25 * 50 + 25), ...malha.pontosDeEntrega(n)]

  it('100 paradas: 429 no meio, matriz completa, nenhuma parada some, ordem sem trecho impossível', async () => {
    const f = orsFalso(malha, { limiteACada: 2 })
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false })
    const pts = pontos(100)
    const a = amb()
    const r = await roteirizar(p, pts, 'carro', a)
    expect(r.interrompido).toBeUndefined()
    expect(f.estado.recusados429).toBeGreaterThan(0)
    expect(a.esperas).toContain(1000) // respeitou o Retry-After
    const fora = r.acessos.filter((x) => x.situacao === 'confirmar' || x.situacao === 'revisar').length
    expect(r.paraMotor.length - 1 + fora).toBe(100)
    const { matriz, proibidos } = r.montagem!.paraMotor(r.paraMotor)
    const visitas = r.paraMotor.slice(1).map((k) => ({ id: `v${k}` }))
    const res = otimizar({ visitas, matriz, iteracoes: 40, termino: r.finalObrigatorio === undefined ? { tipo: 'livre' } : { tipo: 'visita', id: `v${r.finalObrigatorio}` } })
    const pos = new Map(r.paraMotor.map((k, i) => [k, i]))
    expect(trechosSemPercurso([0, ...res.ordem.map((id) => pos.get(Number(id.slice(1)))!)], proibidos)).toEqual([])
  })

  it('reotimização com cache: só a linha da nova posição é pedida (sem pedidos desnecessários)', async () => {
    const f = orsFalso(malha)
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false })
    const pts = pontos(60)
    const r1 = await roteirizar(p, pts, 'carro', amb())
    const cache = new CacheMatriz('ors', 'carro', 0)
    cache.atualizar(r1.montagem!, r1.coords, r1.acessos)
    const guardado = JSON.parse(JSON.stringify(cache.serializar(), (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)), (_k, v) => (v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : v))
    const c2 = CacheMatriz.abrir(guardado, 'ors', 'carro', 1000)
    const antes = { matriz: f.estado.matriz, snap: f.estado.snap }
    const nova = [malha.coordenada(20 * 50 + 22), ...pts.slice(1)] // você andou
    const r2 = await roteirizar(p, nova, 'carro', amb(), undefined, undefined, {
      acessosConhecidos: nova.map((x, i) => (i === 0 ? undefined : c2.acessoConhecido(x))),
      preencher: (m, cs) => c2.preencher(m, cs),
    })
    expect(r2.interrompido).toBeUndefined()
    expect(f.estado.matriz - antes.matriz).toBe(1) // 1 pedido: a sua nova posição → paradas
    expect(f.estado.snap - antes.snap).toBe(1) // só a sua posição
  })

  it('cache vale só para o mesmo provedor/perfil e por até 7 dias', () => {
    const c = new CacheMatriz('ors', 'carro', 0).serializar()
    c.pontos = ['a']
    c.min = [0]
    c.km = [0]
    expect(CacheMatriz.abrir(c, 'ors', 'carro', 1000).tamanho).toBe(1)
    expect(CacheMatriz.abrir(c, 'valhalla', 'carro', 1000).tamanho).toBe(0)
    expect(CacheMatriz.abrir(c, 'ors', 'moto', 1000).tamanho).toBe(0)
    expect(CacheMatriz.abrir(c, 'ors', 'carro', 8 * 24 * 3600 * 1000).tamanho).toBe(0)
  })

  it('voltar ao ponto de partida: o destino entra só como destino', async () => {
    const f = orsAnalitico()
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false })
    const o = { lat: -10, lon: -50 }
    const pts = [o, { lat: -10.01, lon: -50 }, { lat: -10, lon: -50.01 }, { lat: -10.01, lon: -50.01 }, o]
    const r = await roteirizar(p, pts, 'carro', amb(), undefined, undefined, { destinoFinal: true })
    expect(r.destino).toBe(4)
    expect(r.paraMotor).toEqual([0, 1, 2, 3, 4])
    const { matriz } = r.montagem!.paraMotor(r.paraMotor)
    expect(matriz.min[3]![4]).toBeGreaterThan(0) // parada → destino veio do provedor
  })

  it('analítico: inacessível e sem saída', async () => {
    const ina = { lat: -10.02, lon: -50 }
    const sink = { lat: -10.03, lon: -50 }
    const f = orsAnalitico({ inacessiveis: [ina], soChegada: [sink] })
    const p = provedorORS({ chave: f.chave, fetch: f.fetch, base: BASE, liberadoReal: false })
    const pts = [{ lat: -10, lon: -50 }, { lat: -10.01, lon: -50 }, ina, sink, { lat: -10.005, lon: -50.01 }]
    const r = await roteirizar(p, pts, 'carro', amb())
    expect(r.acessos[2]!.situacao).toBe('revisar') // inacessível: revisão
    expect(r.finalObrigatorio).toBeDefined() // sem saída: válida como última (término livre)
    const { matriz } = r.montagem!.paraMotor(r.paraMotor)
    expect(matriz.min[1]![2]).not.toBe(matriz.min[2]![1]) // assimétrica
  })
})
