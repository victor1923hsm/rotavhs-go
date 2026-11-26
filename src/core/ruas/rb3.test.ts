// RB-3 (núcleo): auditoria da RB-2 — 403 ambíguo, respostas incompletas, issue #1785, contador de consumo e
// invalidação do cache ao reposicionar uma parada. Só dados FICTÍCIOS, sem rede.
import { describe, expect, it } from 'vitest'
import { CacheMatriz } from './cacheMatriz'
import { chaveCoordenada } from './cache'
import { cabeNaCota, lerConsumo, registrarPedido, registrarRestante, restanteHoje } from './consumo'
import { roteirizar, MAX_PEDIDOS_DIVISAO } from './fluxo'
import { MontagemMatriz } from './montagem'
import { classificar403, provedorORS } from './ors'
import { LIMITES_ORS } from './provedores'
import { orsAnalitico } from './testes/orsAnalitico'
import { FalhaProvedor } from './tipos'

const amb = () => {
  let t = 0
  return { agora: () => t, esperar: async (ms: number) => void (t += ms) }
}
const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: -16.7 + (i % 10) * 0.002, lon: -49.27 + Math.floor(i / 10) * 0.002 }))
const CHAVE = 'TESTE-chave-ficticia-0123456789'
const prov = (o: Parameters<typeof orsAnalitico>[0] = {}) => {
  const a = orsAnalitico({ chaveValida: CHAVE, ...o })
  return { a, p: provedorORS({ chave: CHAVE, fetch: a.fetch, base: 'http://127.0.0.1:9/ors/v2', liberadoReal: false }) }
}

describe('403 do ORS', () => {
  it('distingue chave, cota e o caso ambíguo', () => {
    expect(classificar403('{"error":"Access to this API has been disallowed"}', null)).toBe('chave')
    expect(classificar403('{"error":"Quota exceeded"}', null)).toBe('cota-diaria')
    expect(classificar403('{"error":"Daily quota reached or API key unauthorized"}', null)).toBe('cota-ou-chave')
    expect(classificar403('{"error":"Daily quota reached or API key unauthorized"}', '0')).toBe('cota-diaria')
    expect(classificar403('{"error":"Daily quota reached or API key unauthorized"}', '120')).toBe('chave')
  })
})

describe('respostas incompletas', () => {
  it('matriz com linhas faltando é recusada inteira (nada aplicado pela metade)', () => {
    const m = new MontagemMatriz(3)
    expect(() => m.aplicar({ origens: [0, 1], destinos: [1, 2], segundos: [[1, 2]], metros: [[1, 2]] })).toThrow(FalhaProvedor)
    expect(() => m.aplicar({ origens: [0], destinos: [1], segundos: [['x' as unknown as number]], metros: [[1]] })).toThrow(FalhaProvedor)
    expect(m.conhecido(0, 1)).toBe(false)
  })
  it('o cliente transforma JSON quebrado ou formato errado em "resposta-incompleta"', async () => {
    const p = provedorORS({ chave: CHAVE, base: 'http://127.0.0.1:9', liberadoReal: false, fetch: async () => ({ status: 200, headers: { get: () => null }, text: async () => '{"durations": [[0' }) })
    await expect(p.matriz(pts(2), [0], [1], 'carro')).rejects.toMatchObject({ tipo: 'resposta-incompleta' })
  })
  it('tentativas limitadas: incompleta sempre → para depois de 4', async () => {
    const { a, p } = prov({ incompletas: 999 })
    const r = await roteirizar(p, pts(6), 'carro', amb())
    expect(r.interrompido?.tipo).toBe('resposta-incompleta')
    expect(a.estado.matriz).toBe(4)
  })
})

describe('issue #1785 (um ponto sem rota anula o bloco)', () => {
  it('isola os pontos ruins por bissecção; os outros entram no cálculo; pedidos extras limitados', async () => {
    const P = pts(41)
    const ruins = [P[7]!, P[30]!]
    const { a, p } = prov({ anulaBloco: ruins })
    const r = await roteirizar(p, P, 'carro', amb())
    expect(r.interrompido).toBeUndefined()
    const fora = r.acessos.map((x, i) => (x.situacao === 'revisar' ? i : -1)).filter((i) => i >= 0)
    expect(fora).toEqual([7, 30])
    expect(r.relatorio.pedidos.divisoes).toBeLessThanOrEqual(MAX_PEDIDOS_DIVISAO)
    expect(a.estado.matriz).toBeLessThanOrEqual(1 + MAX_PEDIDOS_DIVISAO)
  })
})

describe('contador local de consumo (sem coordenadas)', () => {
  const arm = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }
  it('conta por serviço, zera no dia seguinte e usa o restante informado pelo provedor', () => {
    const a = arm()
    const t = Date.UTC(2026, 10, 26, 12)
    registrarPedido(a, 'ors', 'matriz', t)
    registrarPedido(a, 'ors', 'matriz', t)
    registrarRestante(a, 'ors', 'matriz', 10, t)
    const c = lerConsumo(a, 'ors', t)
    expect(c.pedidos.matriz).toBe(2)
    expect(restanteHoje(c, LIMITES_ORS).matriz).toBe(10)
    expect(restanteHoje(c, LIMITES_ORS).encaixe).toBe(2000)
    expect(lerConsumo(a, 'ors', t + 24 * 3600e3).pedidos.matriz).toBe(0)
    expect(cabeNaCota({ matriz: 11 }, restanteHoje(c, LIMITES_ORS))).toBe('matriz')
    expect(cabeNaCota({ matriz: 10 }, restanteHoje(c, LIMITES_ORS))).toBeNull()
  })
})

describe('cache ao reposicionar uma parada', () => {
  it('esquecerPonto apaga o acesso e a linha/coluna do ponto; correções sobrevivem ao vencimento', () => {
    const c = new CacheMatriz('ors', 'carro', 0)
    const m = new MontagemMatriz(3)
    m.aplicar({ origens: [0, 1, 2], destinos: [0, 1, 2], segundos: [[0, 60, 60], [60, 0, 60], [60, 60, 0]], metros: [[0, 1, 1], [1, 0, 1], [1, 1, 0]] })
    const coords = pts(3)
    c.atualizar(m, coords, coords.map((p) => ({ original: p, acesso: p, distanciaM: 1, raioM: 25, situacao: 'encaixado' as const })))
    c.correcoes['v1'] = { lat: 1, lon: 2, em: 0 }
    c.esquecerPonto(coords[1]!)
    expect(c.acessoConhecido(coords[1]!)).toBeUndefined()
    const m2 = new MontagemMatriz(3)
    c.preencher(m2, coords)
    expect(m2.conhecido(0, 1)).toBe(false)
    expect(m2.conhecido(1, 2)).toBe(false)
    expect(m2.conhecido(0, 2)).toBe(true)
    // vencido (8 dias): distâncias descartadas, a SUA correção continua
    const v = CacheMatriz.abrir(c.serializar(), 'ors', 'carro', 8 * 24 * 3600e3)
    expect(v.tamanho).toBe(0)
    expect(v.correcoes['v1']).toEqual({ lat: 1, lon: 2, em: 0 })
    expect(chaveCoordenada(coords[0]!)).toBeTruthy()
  })
})
