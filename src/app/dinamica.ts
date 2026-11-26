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
import { definirFatorTempo, definirObterOrigem, definirOrigemExterna, FalhaOrigem, inicioDaRota, parada, paradas, rotaAtual, useEstado, type OrigemObtida } from './estado'
import { definirRotaEmAndamento, origemConfiavel, pedirAltaPrecisao, useLocalizacao } from './localizacao'
import { POSICAO_TESTE } from '@/mock/rota-ficticia'

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
    // Recomeça a contar; o intervalo mínimo evita repetição. O cálculo roda em segundo plano.
    useDinamica.setState({ desvioDesde: null })
    void useEstado.getState().avaliarAutomatico('desvio', agora).then((sugerida) => useDinamica.setState({ ultimaAvaliacao: { motivo: 'desvio', sugerida, em: agora } }))
  }
}

const fator = () => (useLocalizacao.getState().simulado ? FATOR_SIMULADO : 1)

/** Quanto esperar por uma posição confiável ao tocar em OTIMIZAR. */
export const ESPERA_ORIGEM_MS = 20_000

/**
 * Origem da otimização (R-A): SEMPRE a sua posição atual. Liga o GPS se estiver desligado (com a explicação de
 * sempre antes do pedido de permissão) e espera uma leitura confiável. Nunca usa a 1ª parada da SPX.
 * Única exceção: a rota de EXEMPLO (fictícia) usa a posição de teste quando você está longe dela.
 */
export async function obterOrigemAtual(sinal: { cancelado: boolean }, esperaMs = ESPERA_ORIGEM_MS): Promise<OrigemObtida> {
  const exemplo = rotaAtual().fonte === 'exemplo'
  const pronta = () => (exemplo ? origemPertoDaRota() : origemConfiavel())
  const ja = pronta()
  if (ja) return { ponto: { lat: ja.lat, lon: ja.lon }, tipo: 'gps' }
  const loc = useLocalizacao.getState()
  if (exemplo && (loc.ativa || loc.estado === 'negada')) return { ponto: POSICAO_TESTE, tipo: 'teste' }
  if (loc.estado === 'sem-suporte') throw new FalhaOrigem('sem-suporte')
  // Não espera o pedido de permissão terminar: em algumas WebViews a consulta de permissão nunca responde.
  // O laço abaixo acompanha o estado (e a espera só conta enquanto a explicação não está na tela).
  if (!loc.ativa) void loc.pedirAtivacao().catch(() => useLocalizacao.setState({ explicando: true }))
  const liberar = pedirAltaPrecisao() // leituras mais rápidas e precisas só enquanto espera a origem
  try {
    return await esperarOrigem(sinal, esperaMs, exemplo, pronta)
  } finally {
    liberar()
  }
}

async function esperarOrigem(sinal: { cancelado: boolean }, esperaMs: number, exemplo: boolean, pronta: () => Ponto | null): Promise<OrigemObtida> {
  let inicio = Date.now()
  const pedidoEm = Date.now()
  for (;;) {
    if (sinal.cancelado) throw new FalhaOrigem('cancelada')
    if (useLocalizacao.getState().explicando) inicio = Date.now() // você ainda está lendo a explicação
    const o = pronta()
    if (o) return { ponto: { lat: o.lat, lon: o.lon }, tipo: 'gps' }
    const l = useLocalizacao.getState()
    if (exemplo && l.ativa && l.leitura) return { ponto: POSICAO_TESTE, tipo: 'teste' } // longe da rota de exemplo
    if (l.estado === 'negada') throw new FalhaOrigem('negada')
    if (l.estado === 'sem-suporte') throw new FalhaOrigem('sem-suporte')
    // Você fechou a explicação sem ligar (2 s de folga para o pedido de permissão responder).
    if (!l.ativa && !l.explicando && Date.now() - pedidoEm > 2000) throw new FalhaOrigem('cancelada')
    if (Date.now() - inicio > esperaMs) {
      if (exemplo) return { ponto: POSICAO_TESTE, tipo: 'teste' }
      // "Indisponível" pode ser passageiro (o aparelho ainda procurando): só conta no fim da espera.
      throw new FalhaOrigem(l.estado === 'indisponivel' ? 'indisponivel' : 'tempo')
    }
    await new Promise((r) => setTimeout(r, 250))
  }
}

let ligado = false
/** Liga a demonstração (uma vez, ao abrir o app). */
export function iniciarDinamica() {
  if (ligado) return
  ligado = true
  definirOrigemExterna(() => origemPertoDaRota())
  definirObterOrigem(obterOrigemAtual)
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
