// RB-0: testes da preparação do cálculo pelas ruas (puros, dados FICTÍCIOS, sem rede).
import { describe, expect, it } from 'vitest'
import { otimizar } from '../otimizacao/motor'
import { planejarFaltantes, planejarMatriz, planejarRota } from './blocos'
import { chavePar } from './cache'
import { aplicarEncaixe, confirmarRaioMaior, novoAcesso, planejarEncaixe, pontoDeCalculo, recusarRaioMaior } from './encaixe'
import { roteirizar, type AmbienteFluxo } from './fluxo'
import { esperaNovaTentativa, JanelaDeslizante } from './limitador'
import { CUSTO_PROIBIDO_MIN, MontagemMatriz, trechosSemPercurso } from './montagem'
import { CargaRecusada, coordenadaParaEnvio, ocultarChave, validarCarga } from './privacidade'
import { LIMITES_ORS, PROVEDOR_ESTIMADO } from './provedores'
import { preverConsumo } from './relatorio'
import { MalhaViaria } from './testes/malhaViaria'
import { ProvedorSintetico } from './testes/provedorSintetico'
import { FalhaProvedor, type Coordenada } from './tipos'

/** Relógio simulado: esperar avança o tempo sem dormir de verdade. */
function ambienteSimulado(): AmbienteFluxo & { esperas: number[] } {
  let t = 0
  const esperas: number[] = []
  return {
    esperas,
    agora: () => t,
    esperar: async (ms) => {
      esperas.push(ms)
      t += ms
    },
  }
}

const cobre = (_n: number, blocos: { origens: number[]; destinos: number[] }[]) => {
  const vistos = new Set<string>()
  for (const b of blocos) for (const i of b.origens) for (const j of b.destinos) if (i !== j) vistos.add(`${i}>${j}`)
  return vistos
}

describe('blocos da matriz e do traçado', () => {
  it('cobre todos os pares necessários sem passar do limite por pedido (500 paradas)', () => {
    const n = 500
    const blocos = planejarMatriz(n, LIMITES_ORS.maxParesMatriz)
    for (const b of blocos) expect(b.origens.length * b.destinos.length).toBeLessThanOrEqual(LIMITES_ORS.maxParesMatriz)
    const v = cobre(n, blocos)
    // origem → paradas e paradas → paradas; nenhuma parada → origem (término livre)
    expect(v.size).toBe(n + n * (n - 1))
    expect(v.has('3>0')).toBe(false)
    // 501 linhas × 500 colunas; 7 linhas por pedido (3500 pares) → 72 pedidos
    expect(blocos.length).toBe(72)
  })

  it('100 paradas cabem em 3 pedidos (101 × 100 = 10 100 pares)', () => {
    expect(planejarMatriz(100, 3500).length).toBe(3)
  })

  it('reotimização pede só os pares que faltam (RB4)', () => {
    const conhecidos = new Set(['0>1', '0>2', '1>2', '2>1'])
    const b = planejarFaltantes([0, 1, 2, 3], [1, 2, 3], (i, j) => conhecidos.has(`${i}>${j}`), 3500)
    const v = cobre(3, b)
    expect([...v].sort()).toEqual(['0>3', '1>3', '2>3', '3>1', '3>2'].sort())
  })

  it('traçado em partes de até 50 pontos, cada uma começando onde a outra terminou', () => {
    const p = planejarRota(120, 50)
    expect(p).toEqual([[0, 49], [49, 98], [98, 119]])
  })
})

describe('montagem da matriz', () => {
  it('distingue não recebido, sem percurso e estimado; nunca preenche com linha reta', () => {
    const m = new MontagemMatriz(3)
    m.aplicar({ origens: [0, 1], destinos: [1, 2], segundos: [[60, 120], [0, null]], metros: [[500, 900], [0, null]] })
    expect(m.conhecido(2, 1)).toBe(false)
    expect(() => m.paraMotor([0, 1, 2])).toThrow(/incompleta/)
    m.aplicar({ origens: [2], destinos: [1], segundos: [[90]], metros: [[700]] })
    m.dispensarVoltaAoInicio()
    const { matriz, proibidos } = m.paraMotor([0, 1, 2])
    expect(proibidos).toEqual([[1, 2]])
    expect(matriz.min[1]![2]).toBe(CUSTO_PROIBIDO_MIN)
    expect(matriz.min[0]![1]).toBe(1)
    expect(matriz.tipo).toBe('ruas')
  })

  it('marca os trechos estimados (offline) para a tela rotular', () => {
    const m = new MontagemMatriz(2)
    m.estimar(0, 1, 1.2, 4)
    m.estimar(1, 0, 1.2, 4)
    expect(m.paraMotor([0, 1]).estimados).toEqual([[0, 1], [1, 0]])
  })

  it('recusa misturar versões diferentes dos dados do mapa', () => {
    const m = new MontagemMatriz(2)
    m.aplicar({ origens: [0], destinos: [1], segundos: [[1]], metros: [[1]], versaoDados: 'a' })
    expect(() => m.aplicar({ origens: [1], destinos: [0], segundos: [[1]], metros: [[1]], versaoDados: 'b' })).toThrow(/mudaram/)
  })
})

describe('acesso viário progressivo (RB5)', () => {
  const p: Coordenada = { lat: -15.9, lon: -48.3 }

  it('tenta 25, 50, 100 e 200 m; depois pede confirmação; preserva a coordenada original', () => {
    const acessos = [novoAcesso(p)]
    const raios: number[] = []
    for (let k = 0; k < 6; k++) {
      const plano = planejarEncaixe(acessos)
      if (!plano.length) break
      raios.push(plano[0]!.raioM)
      aplicarEncaixe(acessos, [0], plano[0]!.raioM, [null])
    }
    expect(raios).toEqual([25, 50, 100, 200])
    expect(acessos[0]!.situacao).toBe('confirmar')
    expect(acessos[0]!.original).toEqual(p)
    expect(pontoDeCalculo(acessos[0]!)).toBeNull()
  })

  it('raio maior só com confirmação; sem via mesmo assim → revisão (nunca vai sozinho para o fim)', () => {
    const a = novoAcesso(p)
    a.situacao = 'confirmar'
    a.raioM = 200
    expect(planejarEncaixe([a])).toEqual([])
    confirmarRaioMaior(a, 500)
    expect(planejarEncaixe([a])).toEqual([{ raioM: 500, indices: [0] }])
    aplicarEncaixe([a], [0], 500, [null])
    expect(a.situacao).toBe('revisar')
    expect(a.motivoRevisao).toBe('sem-via')
    const b = novoAcesso(p)
    b.situacao = 'confirmar'
    recusarRaioMaior(b)
    expect(b.situacao).toBe('revisar')
  })

  it('usa a coordenada auxiliar de acesso no cálculo, sem tocar na original', () => {
    const acessos = [novoAcesso(p)]
    aplicarEncaixe(acessos, [0], 25, [{ acesso: { lat: -15.9001, lon: -48.3 }, distanciaM: 11 }])
    expect(pontoDeCalculo(acessos[0]!)).toEqual({ lat: -15.9001, lon: -48.3 })
    expect(acessos[0]!.original).toEqual(p)
  })
})

describe('privacidade dos pedidos (requisitos 12 e 13)', () => {
  it('aceita só coordenadas e parâmetros técnicos', () => {
    expect(() => validarCarga({ locations: [[-48.3, -15.9]], sources: [0], destinations: [0], metrics: ['distance', 'duration'] })).not.toThrow()
    expect(() => validarCarga({ coordinates: [[-48.3, -15.9]], instructions: false, geometry_simplify: false })).not.toThrow()
  })
  it('recusa endereço, nome, código SPX, número da etiqueta ou id interno', () => {
    expect(() => validarCarga({ locations: [[-48.3, -15.9]], address: 'Rua Fictícia 1' })).toThrow(CargaRecusada)
    expect(() => validarCarga({ locations: [[-48.3, -15.9]], id: 'BR000000000000F' })).toThrow(CargaRecusada)
    expect(() => validarCarga({ locations: ['Rua Fictícia 1'] })).toThrow(CargaRecusada)
    expect(() => validarCarga({ metrics: ['stop 12'] })).toThrow(CargaRecusada)
  })
  it('limita a precisão enviada e esconde a chave nas mensagens', () => {
    expect(coordenadaParaEnvio({ lat: -15.123456789, lon: -48.987654321 })).toEqual([-48.987654, -15.123457])
    expect(ocultarChave('falha com abcdef123456 no pedido', 'abcdef123456')).toBe('falha com [chave oculta] no pedido')
  })
  it('chave de cache depende do sentido, do provedor e da versão dos dados', () => {
    const a = { lat: 1, lon: 2 }, b = { lat: 3, lon: 4 }
    expect(chavePar(a, b, 'ors', 'carro')).not.toBe(chavePar(b, a, 'ors', 'carro'))
    expect(chavePar(a, b, 'ors', 'carro', 'v1')).not.toBe(chavePar(a, b, 'ors', 'carro', 'v2'))
  })
})

describe('limite por minuto', () => {
  it('janela de 60 s com folga de 90% (40/min → 36/min)', () => {
    const j = JanelaDeslizante.comFolga(40)
    for (let k = 0; k < 36; k++) {
      expect(j.esperaAte(k * 10)).toBe(0)
      j.registrar(k * 10)
    }
    expect(j.esperaAte(400)).toBe(60_000 - 400)
    expect(esperaNovaTentativa(0)).toBe(15_000)
    expect(esperaNovaTentativa(5, 2000)).toBe(2000)
  })
  it('previsão de consumo para 500 paradas no ORS público', () => {
    const p = preverConsumo(500, LIMITES_ORS)
    expect(p.pedidosMatriz).toBe(72)
    expect(p.pedidosRota).toBe(11)
    expect(p.esperaMinimaMatrizS).toBe(60) // 36 no 1º minuto, 36 no 2º
    expect(p.rotasPorDia).toBe(6)
  })
})

describe('malha sintética: regras de trânsito (requisito 6)', () => {
  it('mão única gera matriz assimétrica', () => {
    const malha = new MalhaViaria({ lado: 30, semente: 3, maoUnica: 0.6, conversoesProibidas: 0 })
    const o = 5 * 30 + 5
    const ida = malha.caminhos(o).segundos
    let pares = 0, assimetricos = 0
    for (let d = 0; d < 900; d += 7) {
      const volta = malha.caminhos(d).segundos[o]!
      if (d === o || !Number.isFinite(ida[d]!) || !Number.isFinite(volta)) continue
      pares++
      if (Math.abs(ida[d]! - volta) > 1) assimetricos++
    }
    expect(pares).toBeGreaterThan(50)
    expect(assimetricos / pares).toBeGreaterThan(0.2)
  })

  it('conversão proibida obriga a dar a volta (o caminho fica mais longo, nunca mais curto)', () => {
    const livre = new MalhaViaria({ lado: 20, semente: 7, maoUnica: 0, semPassagem: 0, semAcesso: 0, conversoesProibidas: 0 })
    const restrita = new MalhaViaria({ lado: 20, semente: 7, maoUnica: 0, semPassagem: 0, semAcesso: 0, conversoesProibidas: 1 })
    const o = 10 * 20 + 2
    const a = livre.caminhos(o).segundos
    const b = restrita.caminhos(o).segundos
    let maior = 0
    for (let d = 0; d < 400; d++) {
      if (!Number.isFinite(a[d]!)) continue
      expect(b[d]!).toBeGreaterThanOrEqual(a[d]! - 1e-9)
      if (b[d]! > a[d]! + 1) maior++
    }
    expect(maior).toBeGreaterThan(0)
  })

  it('área sem via: o encaixe automático não acha, e a parada vai para confirmação', async () => {
    const malha = new MalhaViaria({ lado: 40, semente: 11, areasSemVia: 1 })
    const [cx, cy] = malha.areas[0]!
    const fazenda = malha.coordenadaContinua(cx, cy)
    const prov = new ProvedorSintetico(malha)
    const pts = [malha.coordenada(2 * 40 + 2), fazenda, malha.coordenada(5 * 40 + 30)]
    const r = await roteirizar(prov, pts, 'carro', ambienteSimulado())
    expect(r.acessos[1]!.situacao).toBe('confirmar')
    expect(r.incluidos).not.toContain(1)
    expect(r.relatorio.problemas.confirmar).toBe(1)
  })
})

describe('componente principal (sem percurso de ida e volta → revisão)', () => {
  it('parada só de chegada (mão única sem saída) fica fora do motor', () => {
    const m = new MontagemMatriz(4)
    const S = 60
    // 0 → 1, 2, 3; 1 ↔ 2; 3 só recebe (ninguém sai de 3)
    m.aplicar({ origens: [0, 1, 2, 3], destinos: [1, 2, 3], segundos: [[S, S, S], [0, S, S], [S, 0, S], [null, null, 0]], metros: [[1, 1, 1], [0, 1, 1], [1, 0, 1], [null, null, 0]] })
    m.dispensarVoltaAoInicio()
    expect(m.componentePrincipal()).toEqual({ dentro: [1, 2], fora: [3] })
  })
  it('detecta trecho sem percurso numa sequência', () => {
    expect(trechosSemPercurso([0, 2, 1, 3], [[1, 3], [3, 1]])).toEqual([[1, 3]])
    expect(trechosSemPercurso([0, 1, 2], [[1, 3]])).toEqual([])
  })
})

describe('fluxo completo com o provedor sintético', () => {
  const malha = new MalhaViaria({ lado: 50, semente: 21, areasSemVia: 2 })
  const pontos = (n: number) => [malha.coordenada(25 * 50 + 25), ...malha.pontosDeEntrega(n)]

  it('respeita o limite por minuto, refaz depois de 429 e entrega uma matriz completa ao motor', async () => {
    const prov = new ProvedorSintetico(malha, { ...LIMITES_ORS, maxParesMatriz: 400, porMinuto: { ...LIMITES_ORS.porMinuto, matriz: 4 } }, { limiteMinutoACada: 3 })
    const amb = ambienteSimulado()
    const r = await roteirizar(prov, pontos(40), 'carro', amb)
    expect(r.interrompido).toBeUndefined()
    expect(r.montagem!.faltantes()).toBe(0)
    expect(prov.contagem.recusados429).toBeGreaterThan(0)
    expect(amb.esperas.some((w) => w >= 15_000)).toBe(true)
    const { matriz, proibidos } = r.montagem!.paraMotor(r.paraMotor)
    // no motor só entram paradas do componente principal; a ordem final não pode usar trecho sem percurso
    const visitas = r.paraMotor.slice(1).map((i) => ({ id: `v${i}` }))
    const res = otimizar({ visitas, matriz, iteracoes: 50 })
    expect(new Set(res.ordem).size).toBe(visitas.length)
    expect(res.tipoMatriz).toBe('ruas')
    const pos = new Map(r.paraMotor.map((l, k) => [l, k]))
    expect(trechosSemPercurso([0, ...res.ordem.map((id) => pos.get(Number(id.slice(1)))!)], proibidos)).toEqual([])
    // nenhuma parada some: ou vai para o motor, ou fica para confirmação/revisão
    const fora = r.acessos.filter((a) => a.situacao === 'confirmar' || a.situacao === 'revisar').length
    expect(visitas.length + fora).toBe(40)
  })

  it('cota diária: para limpo, guarda o que já veio e informa (a rota atual não muda)', async () => {
    const prov = new ProvedorSintetico(malha, { ...LIMITES_ORS, maxParesMatriz: 300 }, { cotaDepoisDe: 2 })
    const r = await roteirizar(prov, pontos(40), 'carro', ambienteSimulado())
    expect(r.interrompido?.tipo).toBe('cota-diaria')
    expect(r.montagem!.faltantes()).toBeGreaterThan(0)
    expect(r.relatorio.pedidos.matriz).toBe(2)
  })

  it('cancelar interrompe sem resultado parcial aplicado', async () => {
    const prov = new ProvedorSintetico(malha)
    const ctl = new AbortController()
    ctl.abort()
    await expect(roteirizar(prov, pontos(10), 'carro', ambienteSimulado(), ctl.signal)).rejects.toBeInstanceOf(FalhaProvedor)
  })

  it('traçado: cada trecho segue a malha (pontos vizinhos na grade), nenhuma reta longa', async () => {
    const prov = new ProvedorSintetico(malha)
    const seq = [malha.coordenada(25 * 50 + 25), malha.coordenada(30 * 50 + 40), malha.coordenada(10 * 50 + 12)]
    const trechos = await prov.rota(seq, 'carro')
    for (const t of trechos)
      for (let k = 1; k < t.pontos.length; k++) {
        const [x1, y1] = malha.grade({ lon: t.pontos[k - 1]![0], lat: t.pontos[k - 1]![1] })
        const [x2, y2] = malha.grade({ lon: t.pontos[k]![0], lat: t.pontos[k]![1] })
        expect(Math.abs(x2 - x1) + Math.abs(y2 - y1)).toBeCloseTo(1, 5)
      }
  })

  it('provedor estimado não tem traçado (nada de linha reta desenhada como percurso)', async () => {
    expect(PROVEDOR_ESTIMADO.pelasRuas).toBe(false)
    await expect(PROVEDOR_ESTIMADO.rota([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }], 'carro')).rejects.toBeInstanceOf(FalhaProvedor)
  })
})
