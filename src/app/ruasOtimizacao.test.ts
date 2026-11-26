// RB-2 no app: otimização pelas ruas com respostas CONTROLADAS (ORS analítico, rota fictícia). Nenhuma chamada real.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { armazenamentoMemoria } from '@/platform/armazenamento/memoria'
import { _definirCofre, type Cofre } from '@/platform/cofre'
import { orsAnalitico } from '@/core/ruas/testes/orsAnalitico'
import type { RotaImportada } from '@/features/importar/converter'
import { definirObterOrigem, inserirMantendoPosicao, parada, ROTA_EXEMPLO, useEstado } from './estado'
import { iniciarPersistencia, type Persistencia } from './persistencia'
import { CHAVE_BASE_TESTE, useRuas } from './ruas'
import { estimarConsumo, prepararPelasRuas } from './ruasOtimizacao'

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
  it('aplica a ordem pelas ruas, rotulada, com todas as paradas; só coordenadas saem', async () => {
    const antes = [...E().ordem].sort()
    await E().otimizar({ preparar: prepararPelasRuas })
    expect(E().falhaOtimizacao).toBeNull()
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
