// DEMONSTRAÇÃO (P3) — otimização dinâmica pela posição atual e alerta de proximidade.
// As Etapas 5 e 6 (otimização inicial e dinâmica) NÃO estão autorizadas: isto mostra o comportamento
// proposto, rotulado "DEMONSTRAÇÃO" na tela. Regras que valem mesmo aqui:
//  - a sequência NUNCA muda sozinha: só aparece uma sugestão (aceitar / manter);
//  - nada é marcado por proximidade: o alerta só avisa;
//  - os alertas seguem a política A6/A7 (src/core/alertas.ts), com o estado guardado com a rota (Etapa 3);
//  - a posição fica só na memória (nada gravado, enviado ou registrado em log).

import { create } from 'zustand'
import { decidirAlerta } from '@/core/alertas'
import { linhaRetaKm, type Ponto } from '@/core/geo'
import { temCoordenada } from '@/core/parada'
import { definirFatorTempo, definirOrigemExterna, inicioDaRota, parada, paradas, rotaAtual, useEstado } from './estado'
import { definirRotaEmAndamento, origemConfiavel, useLocalizacao } from './localizacao'

/** Desvio relevante (G8): mais de 300 m fora do trecho até a próxima parada, por mais de 2 min. */
export const DESVIO_M = 300
export const DESVIO_MS = 120_000
/** Sua posição só vira origem se estiver perto da rota (senão, a rota de exemplo começaria a 800 km). */
export const LONGE_DA_ROTA_KM = 30
/** Demonstração com GPS simulado: as esperas (2 min, 60 s) passam 12× mais rápido. */
export const FATOR_SIMULADO = 12

const metros = (a: Ponto, b: Ponto) => linhaRetaKm(a, b) * 1000

/** Distância (m) de um ponto ao segmento a–b (aproximação plana, suficiente para centenas de metros). */
export function distanciaAoTrecho(p: Ponto, a: Ponto, b: Ponto): number {
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180)
  const ky = 110_574
  const ax = (a.lon - p.lon) * kx
  const ay = (a.lat - p.lat) * ky
  const bx = (b.lon - p.lon) * kx
  const by = (b.lat - p.lat) * ky
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2))
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/** A posição confiável, se estiver perto da rota carregada. */
export function origemPertoDaRota(agora = Date.now()): Ponto | null {
  const o = origemConfiavel(agora)
  if (!o) return null
  const ps = rotaAtual().paradas.filter(temCoordenada)
  const perto = ps.some((p) => linhaRetaKm(o, p) <= LONGE_DA_ROTA_KM)
  return perto ? { lat: o.lat, lon: o.lon } : null
}

interface Dinamica {
  /** Alerta de proximidade atual (só o id e a distância; a posição não fica aqui). */
  alerta: { paradaId: string; distanciaM: number } | null
  /** Desde quando você está fora do trecho (ms), ou null. */
  desvioDesde: number | null
  /** Resultado da última avaliação por desvio (para você ver o que aconteceu). */
  ultimaAvaliacao: { motivo: 'desvio'; sugerida: boolean; em: number } | null
  fecharAlerta: () => void
}


export const useDinamica = create<Dinamica>((set) => ({
  alerta: null,
  desvioDesde: null,
  ultimaAvaliacao: null,
  fecharAlerta: () => set({ alerta: null }),
}))

/** Próxima parada pendente e o ponto de onde você "vem" (última visitada, ou o início). */
function trechoAtual(): { de: Ponto | null; para: (Ponto & { id: string }) | null } {
  const { ordem, status } = useEstado.getState()
  const proxima = ordem.find((id) => status[id] === 'pendente' && temCoordenada(parada(id)))
  const feitas = ordem.filter((id) => status[id] !== 'pendente' && temCoordenada(parada(id)))
  const ult = feitas[feitas.length - 1]
  return { de: ult ? parada(ult) : inicioDaRota(), para: proxima ? parada(proxima) : null }
}

/** Alerta de proximidade pela política A6/A7: devolve a parada a avisar (ou null). Não grava nada. */
export function alertaPara(pos: Ponto & { precisaoM: number; velocidadeMs?: number | null }, agora = Date.now()): { paradaId: string; distanciaM: number } | null {
  const e = useEstado.getState()
  const pend = paradas(e.ordem.filter((id) => e.status[id] === 'pendente')).filter(temCoordenada)
  const candidatas = pend.map((p) => ({ id: p.id, distanciaM: metros(pos, p) }))
  const c = decidirAlerta(
    { candidatas, proximaId: trechoAtual().para?.id, precisaoM: pos.precisaoM, velocidadeMs: pos.velocidadeMs ?? null, agora, ligados: e.alertasLigados, visivel: !!useDinamica.getState().alerta },
    e.alertas,
  )
  return c && { paradaId: c.id, distanciaM: c.distanciaM }
}

/** Processa uma leitura aceita pelos filtros (chamado a cada posição nova). */
export function aoMover(agora = Date.now()) {
  const loc = useLocalizacao.getState()
  const l = loc.leitura
  const e = useEstado.getState()
  if (!loc.ativa || !l || loc.estado !== 'ok') return
  // 1) Alerta de proximidade (política A6/A7; nunca marca nada). Distâncias só na memória.
  const avisadas = Object.keys(e.alertas.porParada)
  if (avisadas.length) e.atualizarAfastamentos(new Map(avisadas.map((id) => [id, metros(l, parada(id))])))
  const a = alertaPara(l, agora)
  if (a) {
    useEstado.getState().registrarAlerta(a.paradaId, agora)
    useDinamica.setState({ alerta: a })
  }
  // 2) Desvio (só com a rota em andamento e uma posição confiável).
  if (e.fase !== 'andamento' || !origemPertoDaRota(agora)) {
    useDinamica.setState({ desvioDesde: null })
    return
  }
  const { de, para } = trechoAtual()
  if (!para) return
  const fora = de ? distanciaAoTrecho(l, de, para) : metros(l, para)
  const desde = useDinamica.getState().desvioDesde
  if (fora <= DESVIO_M) {
    if (desde !== null) useDinamica.setState({ desvioDesde: null })
    return
  }
  if (desde === null) {
    useDinamica.setState({ desvioDesde: agora })
    return
  }
  if (agora - desde >= DESVIO_MS / fator()) {
    const sugerida = useEstado.getState().avaliarAutomatico('desvio', agora)
    // Recomeça a contar; o intervalo mínimo evita repetição.
    useDinamica.setState({ desvioDesde: null, ultimaAvaliacao: { motivo: 'desvio', sugerida, em: agora } })
  }
}

const fator = () => (useLocalizacao.getState().simulado ? FATOR_SIMULADO : 1)

let ligado = false
/** Liga a demonstração (uma vez, ao abrir o app). */
export function iniciarDinamica() {
  if (ligado) return
  ligado = true
  definirOrigemExterna(() => origemPertoDaRota())
  definirRotaEmAndamento(useEstado.getState().fase === 'andamento')
  useEstado.subscribe((e, a) => {
    if (e.fase !== a.fase) definirRotaEmAndamento(e.fase === 'andamento')
    if (e.rotaId !== a.rotaId) useDinamica.setState({ alerta: null, desvioDesde: null })
    // Silenciar ou desligar os alertas tira o que estiver na tela (o GPS continua).
    if ((e.alertas.silenciadoNaRota && !a.alertas.silenciadoNaRota) || (!e.alertasLigados && a.alertasLigados)) useDinamica.setState({ alerta: null })
  })
  useLocalizacao.subscribe((l, a) => {
    if (l.simulado !== a.simulado) definirFatorTempo(l.simulado ? FATOR_SIMULADO : 1)
    if (l.leitura !== a.leitura) aoMover()
    if (!l.ativa && a.ativa) useDinamica.setState({ alerta: null, desvioDesde: null })
  })
}

/** Só para testes. */
export function reiniciarDinamica() {
  useDinamica.setState({ alerta: null, desvioDesde: null, ultimaAvaliacao: null })
}
