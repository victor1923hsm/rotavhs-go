// Estado do modo experimental "Testar roteirização real" (RB-4). Separado do estado das entregas: nada daqui lê ou
// escreve a rota da SPX (só consulta as coordenadas dela para RECUSAR qualquer coincidência no envio).
import { create } from 'zustand'
import { useEstado } from '@/app/estado'
import { baseDeTeste } from '@/app/ruas'
import { obterCofre } from '@/platform/cofre'
import { FalhaProvedor } from '@/core/ruas/tipos'
import { MENSAGENS } from '@/app/ruasOtimizacao'
import { PARTIDAS_PUBLICAS, dentroDeGoiania, type Coord } from './area'
import { apagarTeste, lerTeste, salvarTeste, type ParadaTeste, type TesteSalvo } from './armazem'
import { criarAutorizacao, RegistroExperimental, type AutorizacaoExperimental } from './guarda'
import { calcularTeste, criarProvedor, gerarParadas, registrarTeste, reotimizarOffline, type Progresso } from './motorExperimental'

export type ModoMapa = 'ver' | 'adicionar' | 'partida'

const novoTeste = (): TesteSalvo => ({ id: 'atual', versao: 1, partida: { ...PARTIDAS_PUBLICAS[0]! }, paradas: [], ordem: [], trechos: {}, acessos: {}, atualizadoEm: Date.now() })

/** Coordenadas da rota da SPX carregada (para a guarda recusar coincidências). */
const coordenadasSpx = (): Coord[] =>
  (useEstado.getState().rota?.paradas ?? []).filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number').map((p) => ({ lat: p.lat!, lon: p.lon! }))

interface EstadoExperimental {
  teste: TesteSalvo | null
  modoMapa: ModoMapa
  autorizacao: AutorizacaoExperimental | null
  calculo: Progresso | null
  erro: string | null
  aviso: string | null
  carregar: () => Promise<void>
  definirModoMapa: (m: ModoMapa) => void
  autorizar: () => void
  definirPartida: (c: Coord, nome: string) => Promise<string | null>
  adicionarParada: (c: Coord) => Promise<string | null>
  removerParada: (id: string) => Promise<void>
  alternarVisitada: (id: string) => Promise<void>
  gerar: (n: number) => Promise<void>
  calcular: () => Promise<void>
  reotimizarSemInternet: () => Promise<void>
  cancelar: () => void
  apagarTudo: () => Promise<void>
}

let controle: AbortController | null = null
const registro = new RegistroExperimental()

const mensagemDe = (e: unknown) => {
  if (e instanceof FalhaProvedor) return MENSAGENS[e.tipo] ?? 'O provedor recusou o pedido.'
  return 'Não foi possível concluir o teste.'
}

async function contexto(aut: AutorizacaoExperimental | null) {
  if (!aut) throw new Error('autorize')
  const cofre = await obterCofre()
  if (!cofre.disponivel) throw new Error('pwa')
  const r = await cofre.ler()
  if (!r.valor) throw new Error('sem-chave')
  return criarProvedor({ chave: r.valor, autorizacao: aut, registro, coordenadasSpx, base: baseDeTeste() ?? undefined })
}

const FALHAS_LOCAIS: Record<string, string> = {
  autorize: 'Toque em "Autorizo" antes do primeiro envio.',
  pwa: 'O teste real só funciona no app Android (a chave fica no cofre do aparelho).',
  'sem-chave': 'Cadastre a chave da API em Calcular pelas ruas → Chave da API.',
  vazio: 'Adicione ou gere paradas pendentes primeiro.',
}

export const useExperimental = create<EstadoExperimental>()((set, get) => {
  const salvar = async (t: TesteSalvo) => {
    set({ teste: t })
    await salvarTeste(t).catch(() => set({ aviso: 'Não foi possível salvar o teste no aparelho.' }))
  }
  const executar = async (f: (sinal: AbortSignal) => Promise<void>) => {
    if (controle) return
    controle = new AbortController()
    set({ erro: null, aviso: null, calculo: { etapa: 'encaixe', fracao: 0, detalhe: 'Preparando…' } })
    try {
      await f(controle.signal)
    } catch (e) {
      const k = e instanceof Error ? e.message : ''
      if (e instanceof FalhaProvedor && e.tipo === 'cancelado') set({ aviso: 'Cancelado · o teste continua como estava' })
      else set({ erro: FALHAS_LOCAIS[k] ?? mensagemDe(e) })
    } finally {
      controle = null
      set({ calculo: null })
    }
  }
  return {
    teste: null,
    modoMapa: 'ver',
    autorizacao: null,
    calculo: null,
    erro: null,
    aviso: null,
    carregar: async () => {
      const t = (await lerTeste()) ?? novoTeste()
      registrarTeste(t, registro)
      set({ teste: t })
    },
    definirModoMapa: (modoMapa) => set({ modoMapa }),
    autorizar: () => set({ autorizacao: criarAutorizacao(), erro: null }),
    definirPartida: async (c, nome) => {
      if (!dentroDeGoiania(c)) return 'Escolha um ponto dentro de Goiânia.'
      registro.registrar(c)
      const t = get().teste ?? novoTeste()
      // Partida nova: o cálculo recomeça (trechos que saíam da partida antiga não valem mais).
      const acessos = { ...t.acessos }
      delete acessos.partida
      await salvar({ ...t, partida: { lat: c.lat, lon: c.lon, nome }, acessos, comparacao: undefined, paradas: t.paradas.map((p) => ({ ...p, visitada: false })) })
      set({ modoMapa: 'ver' })
      return null
    },
    adicionarParada: async (c) => {
      if (!dentroDeGoiania(c)) return 'Escolha um ponto dentro de Goiânia.'
      const t = get().teste ?? novoTeste()
      if (t.paradas.length >= 100) return 'O teste aceita até 100 paradas.'
      registro.registrar(c)
      const n = Math.max(0, ...t.paradas.map((p) => p.n)) + 1
      const p: ParadaTeste = { id: `t${n}`, n, lat: Math.round(c.lat * 1e6) / 1e6, lon: Math.round(c.lon * 1e6) / 1e6, origem: 'mapa', visitada: false }
      registro.registrar(p)
      await salvar({ ...t, paradas: [...t.paradas, p], ordem: [...t.ordem, p.id], comparacao: undefined })
      return null
    },
    removerParada: async (id) => {
      const t = get().teste
      if (!t) return
      await salvar({ ...t, paradas: t.paradas.filter((p) => p.id !== id), ordem: t.ordem.filter((x) => x !== id), comparacao: undefined })
    },
    alternarVisitada: async (id) => {
      const t = get().teste
      if (!t) return
      // Visitadas ficam no começo da ordem, na ordem em que foram marcadas (simula a entrega feita).
      const paradas = t.paradas.map((p) => (p.id === id ? { ...p, visitada: !p.visitada } : p))
      const vis = t.ordem.filter((x) => paradas.find((p) => p.id === x)!.visitada && x !== id)
      const agora = paradas.find((p) => p.id === id)!.visitada
      const resto = t.ordem.filter((x) => !vis.includes(x) && x !== id)
      const ordem = agora ? [...vis, id, ...resto] : [...vis, ...t.ordem.filter((x) => !vis.includes(x))]
      await salvar({ ...t, paradas, ordem })
    },
    gerar: (n) =>
      executar(async (sinal) => {
        const prov = await contexto(get().autorizacao)
        set({ calculo: { etapa: 'encaixe', fracao: 0, detalhe: `Gerando ${n} paradas fictícias em vias de Goiânia…` } })
        const t = get().teste ?? novoTeste()
        registro.registrar(t.partida)
        const paradas = await gerarParadas(n, prov, registro, Date.now() % 100000, sinal)
        await salvar({ ...t, paradas, ordem: paradas.map((p) => p.id), trechos: {}, acessos: {}, matriz: undefined, comparacao: undefined })
        set({ aviso: `${paradas.length} paradas fictícias geradas (pontos sorteados e encaixados nas vias)` })
      }),
    calcular: () =>
      executar(async (sinal) => {
        const t = get().teste
        if (!t || !t.paradas.some((p) => !p.visitada)) throw new Error('vazio')
        const prov = await contexto(get().autorizacao)
        const r = await calcularTeste(t, prov, sinal, (p) => set({ calculo: p }))
        await salvar(r.teste)
        set({ aviso: `${r.melhorou ? 'Ordem pelas ruas calculada' : 'A ordem atual já era a melhor pelas ruas'}${r.fora.length ? ` · ${r.fora.length} parada(s) sem acesso pelas ruas ficaram no fim (só no teste)` : ''} · traçado salvo no aparelho` })
      }),
    reotimizarSemInternet: () =>
      executar(async () => {
        const t = get().teste
        if (!t) return
        const r = reotimizarOffline(t)
        await salvar(r.teste)
        const s = r.teste.comparacao?.tracado?.semTracado ?? 0
        set({ aviso: `Reotimizado sem internet com a matriz guardada${s ? ` · ${s} trecho(s) sem traçado guardado (só os pinos)` : ' · traçado guardado cobre a rota'}` })
      }),
    cancelar: () => controle?.abort(),
    apagarTudo: async () => {
      controle?.abort()
      await apagarTeste().catch(() => {})
      set({ teste: novoTeste(), aviso: 'Dados do teste apagados do aparelho', erro: null })
    },
  }
})
