// RB-2 no app: otimização pelas ruas com respostas CONTROLADAS (ORS analítico, rota fictícia). Nenhuma chamada real.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { armazenamentoMemoria } from '@/platform/armazenamento/memoria'
import { _definirCofre, type Cofre } from '@/platform/cofre'
import { orsAnalitico } from '@/core/ruas/testes/orsAnalitico'
import type { RotaImportada } from '@/features/importar/converter'
import { definirObterOrigem, inserirMantendoPosicao, parada, ROTA_EXEMPLO, useEstado } from './estado'
import { iniciarPersistencia, type Persistencia } from './persistencia'
import { CHAVE_BASE_TESTE, useRuas } from './ruas'
import { estimarConsumo, gravarDecisao, lerDecisoes, prepararPelasRuas } from './ruasOtimizacao'

const PLANILHA: RotaImportada = { ...ROTA_EXEMPLO, fonte: 'planilha', arquivo: 'rota-ficticia.csv' }
const E = () => useEstado.getState()
const CHAVE = 'TESTE-chave-ficticia-0123456789'

// localStorage em memória (o ambiente dos testes é Node).
const ls = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => void ls.set(k, v),
  removeItem: (k: string) => void ls.delete(k),
}
const cofreCom = (valor: string | null): Cofre => ({
  disponivel: true,
  existe: async () => (valor ? 'cadastrada' : 'ausente'),
  guardar: async () => {},
  ler: async () => ({ estado: valor ? 'cadastrada' : 'ausente', valor }),
  apagar: async () => {},
})
let ors = orsAnalitico()
let pers: Persistencia | null = null
let deslocamento = 0.001
const origem = () => {
  const p = parada(E().rota.ordemSpx[0]!)
  return { lat: p.lat + deslocamento, lon: p.lon }
}

beforeEach(async () => {
  deslocamento = 0.001
  ls.clear()
  ls.set(CHAVE_BASE_TESTE, 'http://127.0.0.1:9/ors/v2')
  ors = orsAnalitico({ chaveValida: CHAVE })
  ;(globalThis as { fetch?: unknown }).fetch = ors.fetch
  _definirCofre(cofreCom(CHAVE))
  pers = await iniciarPersistencia(armazenamentoMemoria())
  E().carregarRota(PLANILHA)
  await pers.aguardar()
  definirObterOrigem(async () => ({ ponto: origem(), tipo: 'gps' }))
  useRuas.setState({ consentimento: { provedor: 'teste', em: 1, versao: 1 } })
})
afterEach(() => {
  pers?.parar()
  E().descartarRota()
})

const pendentes = () => E().ordem.filter((id) => E().status[id] === 'pendente')

describe('otimizar pelas ruas (respostas controladas)', () => {
  it('aplica a ordem pelas ruas (só com o seu toque), rotulada, com todas as paradas; só coordenadas saem', async () => {
    const antes = [...E().ordem].sort()
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toBeNull()
    expect(E().fase).toBe('revisao') // nada muda até você aplicar
    expect(E().resultadoRuas?.resumo.simulado).toBe(true)
    E().aplicarResultadoRuas()
    expect(E().fase).toBe('otimizada')
    expect(E().ultimaOtimizacao?.tipoMatriz).toBe('ruas')
    expect(E().ultimaOtimizacao?.fonte).toBe('servidor de teste')
    expect([...E().ordem].sort()).toEqual(antes)
    // privacidade: nenhum endereço, código SPX ou número de etiqueta nos corpos enviados
    const enviados = ors.estado.corpos.join('\n')
    for (const p of E().rota.paradas) {
      for (const c of p.pacotes) expect(enviados).not.toContain(c)
      if (p.endereco) expect(enviados).not.toContain(p.endereco)
    }
    expect(ors.estado.cabecalhos.every((h) => h.Authorization === CHAVE)).toBe(true)
  })

  it('reotimização das pendentes reaproveita o cache: só a sua posição é pedida de novo', async () => {
    await E().otimizar({ preparar: prepararPelasRuas })
    E().aplicarResultadoRuas()
    E().definirFase('andamento')
    deslocamento = 0.002 // você andou: a nova posição precisa de 1 linha nova
    const m0 = ors.estado.matriz
    const s0 = ors.estado.snap
    await E().recalcular({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toBeNull()
    expect(ors.estado.matriz - m0).toBe(1)
    expect(ors.estado.snap - s0).toBe(1)
  })

  it('estimativa antes de começar usa o cache da rota', async () => {
    const pend = pendentes().map(parada)
    const e1 = await estimarConsumo(E().rotaId, pend, false)
    expect(e1.pedidosMatriz).toBeGreaterThanOrEqual(1)
    expect(e1.paresDoCache).toBe(0)
    await E().otimizar({ preparar: prepararPelasRuas })
    const e2 = await estimarConsumo(E().rotaId, pend, false)
    expect(e2.paresDoCache).toBeGreaterThan(0)
    expect(e2.pedidosMatriz).toBe(1) // só a linha da sua posição (ainda desconhecida antes do cálculo)
  })

  it('parada inacessível: vira "pendente de revisão", mantida na posição anterior (nunca some)', async () => {
    const alvo = parada(E().rota.ordemSpx[3]!)
    ors = orsAnalitico({ chaveValida: CHAVE, inacessiveis: [{ lat: alvo.lat, lon: alvo.lon }] })
    ;(globalThis as { fetch?: unknown }).fetch = ors.fetch
    const antes = [...E().ordem]
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toBeNull()
    expect(E().resultadoRuas?.motivos.find((m) => m.id === alvo.id)?.motivo).toBe('sem-percurso')
    E().aplicarResultadoRuas()
    expect(E().ordem).toContain(alvo.id)
    expect(E().ordem.length).toBe(antes.length)
    expect(E().ultimaOtimizacao?.revisao).toBeGreaterThanOrEqual(1)
  })

  it('chave inválida: mensagem clara, modo "ruas" na falha, rota intacta (sem troca silenciosa)', async () => {
    _definirCofre(cofreCom('TESTE-chave-errada-000000000000'))
    const antes = [...E().ordem]
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toMatch(/recusou a chave/)
    expect(E().falhaModo).toBe('ruas')
    expect(E().fase).toBe('revisao')
    expect(E().ordem).toEqual(antes)
    expect(E().ultimaOtimizacao).toBeNull()
  })

  it('sem conexão: explica e não calcula pelo modo rápido sozinho', async () => {
    ;(globalThis as { fetch?: unknown }).fetch = orsAnalitico({ chaveValida: CHAVE, semConexao: true }).fetch
    const antes = [...E().ordem]
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toMatch(/Sem conexão/)
    expect(E().ordem).toEqual(antes)
    expect(E().fase).toBe('revisao')
  })

  it('cota do dia: para, guarda o que veio e não muda a rota', async () => {
    ;(globalThis as { fetch?: unknown }).fetch = orsAnalitico({ chaveValida: CHAVE, cotaDepoisDe: 0 }).fetch
    const antes = [...E().ordem]
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toMatch(/cota diária/)
    expect(E().ordem).toEqual(antes)
  })

  it('cancelar durante as distâncias: a rota fica como estava, sem falha', async () => {
    ;(globalThis as { fetch?: unknown }).fetch = orsAnalitico({ chaveValida: CHAVE, travar: true }).fetch
    const antes = [...E().ordem]
    const p = E().otimizar({ preparar: prepararPelasRuas })
    for (let i = 0; i < 50 && E().otimizacao?.etapa !== 'encaixe'; i++) await new Promise((r) => setTimeout(r, 5))
    expect(E().otimizacao?.modo).toBe('ruas')
    E().cancelarOtimizacao()
    await p
    expect(E().ordem).toEqual(antes)
    expect(E().falhaOtimizacao).toBeNull()
    expect(E().otimizacao).toBeNull()
  })

  it('envio ao provedor real bloqueado sem servidor de teste (nenhum pedido sai)', async () => {
    ls.delete(CHAVE_BASE_TESTE)
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toMatch(/ainda não está liberado/)
    expect(ors.estado.pedidos).toBe(0)
  })

  it('o modo rápido continua funcionando sem internet', async () => {
    ;(globalThis as { fetch?: unknown }).fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    await E().otimizar()
    expect(E().falhaOtimizacao).toBeNull()
    expect(E().ultimaOtimizacao?.tipoMatriz).toBe('estimada')
  })
})

describe('posição das pendentes de revisão', () => {
  it('cada uma volta logo depois do vizinho anterior que continua na rota', () => {
    expect(inserirMantendoPosicao(['c', 'a', 'd'], ['b'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd'])
    expect(inserirMantendoPosicao(['c', 'd'], ['a', 'b'], ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('RB-3: resultado, comparação e revisão de paradas (respostas controladas)', () => {
  it('compara com a ordem anterior pela mesma matriz; "Manter a ordem atual" não muda nada', async () => {
    const antes = [...E().ordem]
    await E().otimizar({ preparar: prepararPelasRuas })
    const r = E().resultadoRuas!
    expect(r.resumo.tipoMatriz).toBe('ruas')
    expect(r.resumo.kmAntes).toBeGreaterThan(0)
    expect(r.resumo.minDesloc!).toBeLessThanOrEqual(r.resumo.minDeslocAntes!)
    expect(r.resumo.origem).toBe('gps')
    expect(r.resumo.termino).toBe('livre')
    E().manterOrdemAtual()
    expect(E().ordem).toEqual(antes)
    expect(E().resultadoRuas).toBeNull()
  })

  it('não aplica se uma entrega foi marcada depois do cálculo', async () => {
    await E().otimizar({ preparar: prepararPelasRuas })
    const antes = [...E().ordem]
    E().selecionar(E().ordem[0]!)
    E().marcar('entregue')
    E().aplicarResultadoRuas()
    expect(E().ordem).toEqual(antes)
    expect(E().resultadoRuas).toBeNull()
  })

  it('correção da localização: o cálculo usa a corrigida, a original nunca muda; restaurar volta à original', async () => {
    const alvo = parada(E().rota.ordemSpx[3]!)
    ors = orsAnalitico({ chaveValida: CHAVE, inacessiveis: [{ lat: alvo.lat, lon: alvo.lon }] })
    ;(globalThis as { fetch?: unknown }).fetch = ors.fetch
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().resultadoRuas!.motivos.map((m) => m.id)).toContain(alvo.id)
    E().manterOrdemAtual()
    expect((await lerDecisoes(E().rotaId)).revisao.map((r) => r.id)).toContain(alvo.id)
    const corrigida = { lat: alvo.lat + 0.0004, lon: alvo.lon + 0.0003 }
    await gravarDecisao(E().rotaId, alvo.id, alvo, { tipo: 'corrigir', ...corrigida })
    const c0 = ors.estado.corpos.length
    await E().otimizar({ preparar: prepararPelasRuas })
    const novos = ors.estado.corpos.slice(c0).join('\n')
    expect(novos).toContain(String(Math.round(corrigida.lon * 1e6) / 1e6))
    expect(E().resultadoRuas!.motivos.map((m) => m.id)).not.toContain(alvo.id)
    expect(E().resultadoRuas!.resumo.corrigidas).toBe(1)
    expect(parada(alvo.id).lat).toBe(alvo.lat) // a original da parada não mudou
    // poucos pedidos: só os trechos da parada corrigida (+ a sua posição) — o resto vem do cache
    expect(ors.estado.matriz).toBeLessThanOrEqual(4)
    E().manterOrdemAtual()
    await gravarDecisao(E().rotaId, alvo.id, alvo, { tipo: 'restaurar' })
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().resultadoRuas!.motivos.map((m) => m.id)).toContain(alvo.id)
  })

  it('raio maior só com a sua autorização: sem ela, a parada aguarda; com ela, é encaixada', async () => {
    const alvo = parada(E().rota.ordemSpx[5]!)
    ors = orsAnalitico({ chaveValida: CHAVE, semViaAte: [{ lat: alvo.lat, lon: alvo.lon, m: 420 }] })
    ;(globalThis as { fetch?: unknown }).fetch = ors.fetch
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().resultadoRuas!.motivos.find((m) => m.id === alvo.id)?.motivo).toBe('confirmar')
    E().manterOrdemAtual()
    const s0 = ors.estado.snap
    await E().otimizar({ preparar: prepararPelasRuas })
    // não repetiu as tentativas automáticas (só a sua posição foi encaixada)
    expect(ors.estado.snap - s0).toBe(1)
    E().manterOrdemAtual()
    await gravarDecisao(E().rotaId, alvo.id, alvo, { tipo: 'raio', raioM: 500 })
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().resultadoRuas!.motivos.map((m) => m.id)).not.toContain(alvo.id)
  })

  it('posicionar uma parada na sequência à mão: nada some nem duplica', () => {
    const o = [...E().ordem]
    E().posicionarParada(o[0]!, o[4]!)
    expect(E().ordem.length).toBe(o.length)
    expect(new Set(E().ordem).size).toBe(o.length)
    expect(E().ordem.indexOf(o[0]!)).toBe(E().ordem.indexOf(o[4]!) + 1)
  })

  it('cota do dia pelo contador do aparelho: se não couber, nada é enviado', async () => {
    const dia = new Date().toISOString().slice(0, 10)
    ls.set('rotavhsgo.consumoRuas', JSON.stringify({ versao: 1, dia, provedor: 'ors', pedidos: { matriz: 500, encaixe: 0, rota: 0 }, restanteInformado: {} }))
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toMatch(/resta hoje/)
    expect(ors.estado.pedidos).toBe(0)
  })

  it('o contador conta cada pedido que sai (sem coordenadas)', async () => {
    await E().otimizar({ preparar: prepararPelasRuas })
    const c = JSON.parse(ls.get('rotavhsgo.consumoRuas')!)
    expect(c.pedidos.matriz).toBe(ors.estado.matriz)
    expect(c.pedidos.encaixe).toBe(ors.estado.snap)
    expect(JSON.stringify(c)).not.toMatch(/-?\d+\.\d{4,}/)
  })

  it('bloco de matriz todo nulo (issue #1785): dividido até isolar a parada sem rota; as outras entram', async () => {
    const alvo = parada(E().rota.ordemSpx[2]!)
    ors = orsAnalitico({ chaveValida: CHAVE, anulaBloco: [{ lat: alvo.lat, lon: alvo.lon }] })
    ;(globalThis as { fetch?: unknown }).fetch = ors.fetch
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toBeNull()
    const r = E().resultadoRuas!
    expect(r.motivos.map((m) => m.id)).toEqual([alvo.id])
    expect(r.resumo.pedidos!.divisoes).toBeGreaterThan(0)
  })

  it('resposta incompleta: repete (limitado) e segue; se continuar incompleta, para sem aplicar nada', async () => {
    ors = orsAnalitico({ chaveValida: CHAVE, incompletas: 1 })
    ;(globalThis as { fetch?: unknown }).fetch = ors.fetch
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toBeNull()
    expect(E().resultadoRuas).not.toBeNull()
    E().manterOrdemAtual()
    const antes = [...E().ordem]
    ors = orsAnalitico({ chaveValida: CHAVE, incompletas: 99 })
    ;(globalThis as { fetch?: unknown }).fetch = ors.fetch
    ls.delete('rotavhsgo.consumoRuas')
    await E().descartarRota()
    E().carregarRota(PLANILHA)
    await pers!.aguardar()
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toMatch(/incompletas/)
    expect(E().ordem.length).toBe(antes.length)
  }, 30_000)
})
