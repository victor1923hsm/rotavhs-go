// DEMONSTRAÇÃO (P3): laboratório de GPS simulado, para ver os comportamentos sem sair de casa.
// Anda em passos de 1 s a ~90 km/h (abaixo do filtro de salto), manda leituras a cada 1 s como um GPS de
// verdade e permite provocar: desvio, salto, leitura imprecisa, perda de sinal e GPS desligado.
// Nada aqui toca no GPS do aparelho; as posições são inventadas a partir das paradas FICTÍCIAS.

import { create } from 'zustand'
import { linhaRetaKm, type Ponto } from '@/core/geo'
import { temCoordenada, type Parada } from '@/core/parada'
import { criarSimulador } from '@/platform/localizacao/simulado'
import { inicioDaRota, parada, rotaAtual, useEstado } from './estado'
import { provedorDoAparelho, useLocalizacao, usarProvedor } from './localizacao'

const VELOCIDADE_MS = 25 // ~90 km/h
const PRECISAO_M = 8
const sim = criarSimulador()
let relogio: ReturnType<typeof setInterval> | null = null

interface Laboratorio {
  ligado: boolean
  semSinal: boolean
  andando: boolean
  /** O que o laboratório fez por último (texto para você). */
  registro: string | null
  ligar: () => void
  desligar: () => void
  irParaProxima: () => void
  chegarNaProxima: () => void
  desviar: () => void
  salto: () => void
  imprecisa: () => void
  perderSinal: () => void
  gpsDesligado: () => void
  voltarSinal: () => void
}

let pos: Ponto | null = null
let alvo: Ponto | null = null
let precisao = PRECISAO_M

const metros = (a: Ponto, b: Ponto) => linhaRetaKm(a, b) * 1000
const rumo = (a: Ponto, b: Ponto) => {
  const y = Math.sin(((b.lon - a.lon) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180)
  const x = Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) - Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lon - a.lon) * Math.PI) / 180)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
/** Ponto a `m` metros de `a` na direção `graus` (0 = norte). */
export function deslocar(a: Ponto, m: number, graus: number): Ponto {
  const r = (graus * Math.PI) / 180
  return { lat: a.lat + (m * Math.cos(r)) / 110_574, lon: a.lon + (m * Math.sin(r)) / (111_320 * Math.cos((a.lat * Math.PI) / 180)) }
}

function proximaPendente(): Parada | null {
  const { ordem, status } = useEstado.getState()
  const id = ordem.find((x) => status[x] === 'pendente' && temCoordenada(parada(x)))
  return id ? parada(id) : null
}

function tique() {
  const s = useLaboratorio.getState()
  if (!pos || s.semSinal) return
  let movendo = false
  let r: number | null = null
  if (alvo) {
    const d = metros(pos, alvo)
    if (d <= VELOCIDADE_MS) {
      r = rumo(pos, alvo)
      pos = alvo
      alvo = null
    } else {
      r = rumo(pos, alvo)
      pos = deslocar(pos, VELOCIDADE_MS, r)
      movendo = true
    }
  }
  sim.enviar({ lat: pos.lat, lon: pos.lon, precisaoM: precisao, rumo: movendo ? r : null, velocidadeMs: movendo ? VELOCIDADE_MS : 0 })
  if (s.andando !== movendo) useLaboratorio.setState({ andando: movendo })
}

export const useLaboratorio = create<Laboratorio>((set) => ({
  ligado: false,
  semSinal: false,
  andando: false,
  registro: null,

  ligar: () => {
    const inicio = inicioDaRota() ?? rotaAtual().paradas.find(temCoordenada) ?? null
    if (!inicio) return
    pos = { lat: inicio.lat, lon: inicio.lon }
    alvo = null
    precisao = PRECISAO_M
    usarProvedor(sim.provedor, true)
    useLocalizacao.getState().confirmarAtivacao()
    if (relogio) clearInterval(relogio)
    relogio = setInterval(tique, 1000)
    set({ ligado: true, semSinal: false, registro: 'GPS simulado ligado no início da rota.' })
    tique()
  },
  desligar: () => {
    if (relogio) clearInterval(relogio)
    relogio = null
    pos = alvo = null
    useLocalizacao.getState().desativar()
    usarProvedor(provedorDoAparelho, false)
    set({ ligado: false, semSinal: false, andando: false, registro: null })
  },
  irParaProxima: () => {
    const p = proximaPendente()
    if (!pos || !p) return
    alvo = deslocar(p, 10, rumo(p, pos)) // para a 10 m da porta
    precisao = PRECISAO_M
    set({ registro: `Indo até a parada ${p.stop ?? '?'} (${Math.round(metros(pos, p))} m).` })
  },
  chegarNaProxima: () => {
    const p = proximaPendente()
    if (!pos || !p) return
    alvo = deslocar(p, 30, rumo(p, pos))
    precisao = PRECISAO_M
    set({ registro: `Chegando perto da parada ${p.stop ?? '?'} (até 30 m).` })
  },
  desviar: () => {
    const p = proximaPendente()
    if (!pos || !p) return
    alvo = deslocar(pos, 650, (rumo(pos, p) + 90) % 360)
    set({ registro: 'Saindo 650 m para o lado do trecho até a próxima parada (desvio).' })
  },
  salto: () => {
    if (!pos) return
    // Uma leitura isolada 3 km longe: o filtro descarta.
    const longe = deslocar(pos, 3000, 0)
    sim.enviar({ lat: longe.lat, lon: longe.lon, precisaoM: 15, rumo: null })
    set({ registro: 'Leitura com salto de 3 km enviada (deve ser descartada).' })
  },
  imprecisa: () => {
    precisao = precisao > PRECISAO_M ? PRECISAO_M : 180
    set({ registro: precisao > PRECISAO_M ? 'Precisão piorou para ±180 m.' : 'Precisão voltou para ±8 m.' })
  },
  perderSinal: () => set({ semSinal: true, registro: 'Sinal perdido: sem leituras. "Buscando sinal" aparece em até 30 s.' }),
  gpsDesligado: () => {
    set({ semSinal: true, registro: 'GPS do aparelho desligado (simulado).' })
    sim.erro('indisponivel')
  },
  voltarSinal: () => {
    set({ semSinal: false, registro: 'Sinal de volta.' })
    tique()
  },
}))

/** Só para testes: avança o simulador sem esperar o relógio. */
export const tiqueSimulador = tique
