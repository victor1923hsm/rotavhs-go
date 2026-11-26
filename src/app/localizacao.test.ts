import { readFileSync } from 'node:fs'

const ler = (f: string) => new TextDecoder().decode(readFileSync(f))
import { beforeEach, describe, expect, it } from 'vitest'
import { circuloGeo, linhaRetaKm } from '@/core/geo'
import { rumoConfiavel, type ErroLocalizacao, type Leitura, type LocationProvider } from '@/platform/localizacao/tipos'
import { useEstado } from './estado'
import { definirRotaEmAndamento, filtrarLeitura, mapaNaTela, origemConfiavel, rotuloGps, SEM_SINAL_MS, useLocalizacao, usarProvedor, verificarSinal } from './localizacao'

// GPS simulado: registra os pedidos (alta/econômico) e quando o monitoramento é encerrado.
function gpsFalso(permissao: 'granted' | 'denied' | 'prompt' = 'prompt') {
  const g = {
    ativos: 0,
    pedidos: [] as boolean[],
    ler: (_l: Leitura) => {},
    erro: (_e: ErroLocalizacao) => {},
    provedor: {
      capabilities: { background: false },
      observar({ alta }, aoLer, aoErro) {
        g.ativos++
        g.pedidos.push(alta)
        g.ler = aoLer
        g.erro = aoErro
        return () => {
          g.ativos--
        }
      },
      permissao: async () => permissao,
    } as LocationProvider,
  }
  return g
}
const L = () => useLocalizacao.getState()
const leitura = (lat: number, lon: number, precisaoM = 8, rumo: number | null = null, em = Date.now()): Leitura => ({ lat, lon, precisaoM, rumo, em })

describe('minha localização (P2)', () => {
  let gps: ReturnType<typeof gpsFalso>
  beforeEach(() => {
    L().desativar()
    useLocalizacao.setState({ estado: 'desligada' })
    gps = gpsFalso()
    usarProvedor(gps.provedor)
  })

  it('explica antes do pedido do navegador; "Agora não" não liga o GPS', async () => {
    const sair = mapaNaTela('cheio')
    await L().pedirAtivacao()
    expect(L().explicando).toBe(true)
    expect(gps.ativos).toBe(0)
    L().cancelarExplicacao()
    expect(gps.ativos).toBe(0)
    await L().pedirAtivacao()
    L().confirmarAtivacao()
    expect(gps.ativos).toBe(1)
    expect(L().estado).toBe('pedindo')
    sair()
  })

  it('permissão já concedida: liga direto, sem explicação', async () => {
    gps = gpsFalso('granted')
    usarProvedor(gps.provedor)
    const sair = mapaNaTela('cheio')
    await L().pedirAtivacao()
    expect(L().explicando).toBe(false)
    expect(gps.ativos).toBe(1)
    sair()
  })

  it('bateria: contínuo e econômico com o app aberto; alta só em tela cheia ou com a rota em andamento; para ao desativar', () => {
    L().confirmarAtivacao()
    expect([gps.ativos, gps.pedidos.at(-1), L().monitorando]).toEqual([1, false, 'economico'])
    const mini = mapaNaTela('mini')
    expect([gps.ativos, gps.pedidos.at(-1), L().monitorando]).toEqual([1, false, 'economico'])
    const cheio = mapaNaTela('cheio')
    expect([gps.ativos, gps.pedidos.at(-1), L().monitorando]).toEqual([1, true, 'alta'])
    cheio()
    expect([gps.ativos, gps.pedidos.at(-1)]).toEqual([1, false])
    definirRotaEmAndamento(true)
    expect([gps.ativos, L().monitorando]).toEqual([1, 'alta'])
    definirRotaEmAndamento(false)
    L().desativar()
    expect([gps.ativos, L().monitorando, L().leitura]).toEqual([0, 'parado', null])
    mini()
    expect(gps.ativos).toBe(0)
  })

  it('arrastar o mapa só desliga a centralização; a posição continua chegando', () => {
    const sair = mapaNaTela('cheio')
    L().confirmarAtivacao()
    gps.ler(leitura(-16.68, -49.26, 8, null, 1_000))
    expect(L().seguir).toBe(true)
    L().soltar()
    expect([L().seguir, L().ativa, gps.ativos]).toEqual([false, true, 1])
    gps.ler(leitura(-16.681, -49.26, 8, null, 20_000))
    expect(L().leitura?.lat).toBe(-16.681)
    void L().pedirAtivacao() // tocar em "Minha localização" volta a centralizar
    expect(L().seguir).toBe(true)
    sair()
  })

  it('permissão negada: para o GPS e explica; GPS desligado e sem sinal são avisados', () => {
    const sair = mapaNaTela('cheio')
    L().confirmarAtivacao()
    gps.erro('indisponivel')
    expect([L().estado, gps.ativos]).toEqual(['indisponivel', 1])
    gps.ler(leitura(-16.68, -49.26, 8, null, 1000))
    expect(L().estado).toBe('ok')
    verificarSinal(1000 + SEM_SINAL_MS + 1)
    expect(L().estado).toBe('sem-sinal')
    expect(L().leitura).not.toBeNull() // mostra a última posição, marcada como antiga
    gps.erro('negada')
    expect([L().estado, L().ativa, gps.ativos, L().leitura]).toEqual(['negada', false, 0, null])
    sair()
  })

  it('a posição real não muda a rota: ordem, status e ponto de partida ficam iguais', () => {
    const antes = { ordem: [...useEstado.getState().ordem], status: { ...useEstado.getState().status }, sel: useEstado.getState().selecionada }
    const sair = mapaNaTela('cheio')
    L().confirmarAtivacao()
    for (let i = 0; i < 20; i++) gps.ler(leitura(-16.6 - i / 1000, -49.2, 8, null, i * 10_000))
    expect(useEstado.getState().ordem).toEqual(antes.ordem)
    expect(useEstado.getState().status).toEqual(antes.status)
    expect(useEstado.getState().selecionada).toBe(antes.sel)
    expect(useEstado.getState().sugestao).toBeNull()
    sair()
  })
})

describe('filtros de salto e de precisão (P3)', () => {
  const base = leitura(-16.68, -49.26, 10, null, 0)
  it('aceita andar normal; descarta salto impossível; aceita o salto que se confirma', () => {
    expect(filtrarLeitura(leitura(-16.6809, -49.26, 10, null, 10_000), base, null)).toBe('aceita') // 100 m em 10 s
    const longe = leitura(-16.65, -49.26, 15, null, 2_000) // 3,3 km em 2 s
    expect(filtrarLeitura(longe, base, null)).toBe('salto')
    expect(filtrarLeitura(leitura(-16.6501, -49.26, 15, null, 3_000), base, longe)).toBe('aceita')
  })
  it('leitura muito imprecisa não substitui uma boa recente; sem posição boa, é aceita', () => {
    expect(filtrarLeitura(leitura(-16.6805, -49.26, 180, null, 5_000), base, null)).toBe('imprecisa')
    expect(filtrarLeitura(leitura(-16.6805, -49.26, 180, null, 5_000), null, null)).toBe('aceita')
    expect(filtrarLeitura(leitura(-16.6805, -49.26, 180, null, 90_000), base, null)).toBe('aceita') // a boa já é velha
  })
  it('origem dos cálculos: só a leitura recente e precisa', () => {
    usarProvedor(gpsFalso().provedor)
    useLocalizacao.setState({ ativa: true, estado: 'ok', leitura: leitura(-16.68, -49.26, 12, null, 1_000) })
    expect(origemConfiavel(5_000)).toMatchObject({ lat: -16.68, lon: -49.26 })
    expect(origemConfiavel(40_000)).toBeNull() // velha
    useLocalizacao.setState({ leitura: leitura(-16.68, -49.26, 80, null, 1_000) })
    expect(origemConfiavel(5_000)).toBeNull() // imprecisa
    L().desativar()
  })
  it('os cinco estados que aparecem na tela', () => {
    expect(rotuloGps({ ativa: false, estado: 'desligada', leitura: null }).rotulo).toBe('Desativado')
    expect(rotuloGps({ ativa: true, estado: 'pedindo', leitura: null }).rotulo).toBe('Buscando sinal')
    expect(rotuloGps({ ativa: true, estado: 'sem-sinal', leitura: leitura(0, 0) }).rotulo).toBe('Buscando sinal')
    expect(rotuloGps({ ativa: true, estado: 'ok', leitura: leitura(0, 0, 120) }).rotulo).toMatch(/^Impreciso/)
    expect(rotuloGps({ ativa: true, estado: 'indisponivel', leitura: null }).rotulo).toBe('Indisponível')
    expect(rotuloGps({ ativa: true, estado: 'ok', leitura: leitura(0, 0, 9) }).rotulo).toBe('Ativo · ±9 m')
  })
})

describe('direção e precisão', () => {
  it('rumo só com movimento e boa precisão', () => {
    expect(rumoConfiavel(90, 5, 10)).toBe(90)
    expect(rumoConfiavel(-90, 5, 10)).toBe(270)
    expect(rumoConfiavel(90, 0.5, 10)).toBeNull() // parado: a bússola do GPS não vale
    expect(rumoConfiavel(90, 5, 120)).toBeNull() // imprecisa
    expect(rumoConfiavel(null, 5, 10)).toBeNull()
    expect(rumoConfiavel(Number.NaN, 5, 10)).toBeNull()
  })
  it('círculo de precisão com o raio certo', () => {
    const c = circuloGeo(-16.68, -49.26, 100)
    expect(c[0]).toEqual(c.at(-1))
    for (const [lon, lat] of c) expect(linhaRetaKm({ lat: -16.68, lon: -49.26 }, { lat, lon }) * 1000).toBeCloseTo(100, 0)
  })
})

describe('privacidade da localização (P2)', () => {
  const arquivos = ['src/app/localizacao.ts', 'src/app/dinamica.ts', 'src/app/simulador.ts', 'src/platform/localizacao/web.ts', 'src/platform/localizacao/tipos.ts', 'src/platform/localizacao/simulado.ts', 'src/components/domain/MinhaLocalizacao.tsx', 'src/components/domain/Gps.tsx', 'src/components/domain/Laboratorio.tsx']
  it('não grava, não envia e não registra a posição em log', () => {
    for (const f of arquivos) {
      const codigo = ler(f).replace(/\/\/.*$/gm, '')
      expect(codigo, f).not.toMatch(/localStorage|sessionStorage|indexedDB|Dexie|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|console\./)
    }
  })
  it('o armazenamento do app não conhece a localização', () => {
    for (const f of ['src/app/persistencia.ts', 'src/app/estado.ts', 'src/platform/armazenamento/dexie.ts']) expect(ler(f), f).not.toMatch(/localizacao|geolocation/i)
  })
})

describe('chip do GPS (correção 2.0.0-teste.8)', () => {
  it('as classes de estado do chip não coincidem com classes de tela inteira do app', () => {
    // Antes: o estado "Buscando sinal" usava a classe "busca", a mesma da tela de busca (absolute, inset: 0),
    // e o chip cobria a tela toda, bloqueando os toques (inclusive o OTIMIZAR MINHA ROTA).
    const css = ler('src/styles/app.css')
    const globais = new Set([...css.matchAll(/^\.([a-z][\w-]*)\s*[,{]/gm)].map((m) => m[1]))
    const tons = new Set<string>()
    const base = { ativa: true, estado: 'ok' as const, leitura: { lat: 0, lon: 0, precisaoM: 5, rumo: null, em: 0 } }
    for (const s of [base, { ...base, estado: 'pedindo' as const }, { ...base, leitura: { ...base.leitura, precisaoM: 300 } }, { ...base, estado: 'indisponivel' as const }, { ...base, ativa: false }, { ...base, estado: 'negada' as const }])
      tons.add(rotuloGps(s).tom)
    for (const t of tons) expect(globais.has(t), `classe ".${t}" já existe no app.css`).toBe(false)
  })
})
