// Minha localização (autorizações P2 e P3 do protótipo, docs/DECISOES.md).
// Estado SÓ na memória: só a última leitura aceita, nada de histórico; fora do armazenamento (persistencia.ts
// não observa este estado). Nada é enviado, gravado ou registrado em log.
//
// Filtros (G7): leituras com precisão pior que 100 m não substituem uma posição boa recente; saltos
// impossíveis (velocidade > ~200 km/h, maiores que 3× a precisão) são descartados até se confirmarem.
// Bateria: GPS só com a função ligada e o app visível; alta precisão só com o mapa em tela cheia ou com a
// rota em andamento; no resto, modo econômico. Desativar = clearWatch.

import { create } from 'zustand'
import { linhaRetaKm, type Ponto } from '@/core/geo'
import { provedorWeb } from '@/platform/localizacao/web'
import { IMPRECISA_M, type ErroLocalizacao, type Leitura, type LocationProvider } from '@/platform/localizacao/tipos'

export type EstadoGps = 'desligada' | 'pedindo' | 'ok' | 'negada' | 'indisponivel' | 'sem-sinal' | 'sem-suporte'

/** Sem leitura nova por este tempo (com a função ligada): "buscando sinal". */
export const SEM_SINAL_MS = 30_000
/** Pior que isso, a leitura não substitui uma posição boa recente. */
export const DESCARTE_M = 100
/** Velocidade acima disso entre duas leituras = salto (≈ 200 km/h). */
export const SALTO_MS = 55
/** Origem dos cálculos: só leitura com precisão ≤ 50 m e com no máximo 30 s. */
export const ORIGEM_IDADE_MS = 30_000

interface Localizacao {
  /** Você ligou a função (o GPS pode estar pausado: app em segundo plano). */
  ativa: boolean
  estado: EstadoGps
  /** Só a última leitura ACEITA pelos filtros. */
  leitura: Leitura | null
  /** Desde quando só chegam leituras imprecisas demais (a posição mostrada é a última boa). */
  imprecisaDesde: number | null
  /** Precisão da última leitura descartada por imprecisão (para o aviso). */
  precisaoRecebidaM: number | null
  /** Leituras descartadas pelos filtros nesta sessão (só a contagem). */
  descartadas: { salto: number; imprecisa: number }
  /** Centralização automática no mapa. Arrastar o mapa desliga SÓ isto; a posição continua sendo acompanhada. */
  seguir: boolean
  /** Explicação antes do pedido de permissão do navegador. */
  explicando: boolean
  /** O que o GPS está fazendo agora. */
  monitorando: 'parado' | 'economico' | 'alta'
  /** Demonstração: posições do simulador, não do aparelho. */
  simulado: boolean
  pedirAtivacao: () => Promise<void>
  confirmarAtivacao: () => void
  cancelarExplicacao: () => void
  desativar: () => void
  centralizar: () => void
  soltar: () => void
}

let provedor: LocationProvider = provedorWeb
let parar: (() => void) | null = null
let modoAtual: 'parado' | 'economico' | 'alta' = 'parado'
const mapas = { mini: 0, cheio: 0 }
/** Pedidos de alta precisão temporária (ex.: obter a origem ao tocar em OTIMIZAR). */
let altaTemporaria = 0
let rotaEmAndamento = false
let relogioSinal: ReturnType<typeof setInterval> | null = null
let saltoPendente: Leitura | null = null
/** Hora da última leitura RECEBIDA (mesmo descartada): sinal existe, mesmo que ruim. */
let ultimaRecebida = 0

export const useLocalizacao = create<Localizacao>((set, get) => ({
  ativa: false,
  estado: 'desligada',
  leitura: null,
  descartadas: { salto: 0, imprecisa: 0 },
  imprecisaDesde: null,
  precisaoRecebidaM: null,
  seguir: true,
  explicando: false,
  monitorando: 'parado',
  simulado: false,

  pedirAtivacao: async () => {
    if (get().ativa) {
      set({ seguir: true })
      return
    }
    // Pede a permissão de forma clara: primeiro a explicação do app; o navegador só pergunta depois.
    // Algumas WebViews nunca respondem à consulta de permissão: depois de 1,5 s, mostra a explicação e pede.
    const p = get().simulado ? 'granted' : await Promise.race([provedor.permissao(), new Promise<'prompt'>((r) => setTimeout(() => r('prompt'), 1500))])
    if (p === 'granted') get().confirmarAtivacao()
    else set({ explicando: true })
  },
  confirmarAtivacao: () => {
    set({ ativa: true, explicando: false, seguir: true, estado: 'pedindo', descartadas: { salto: 0, imprecisa: 0 } })
    sincronizar()
  },
  cancelarExplicacao: () => set({ explicando: false }),
  desativar: () => {
    set({ ativa: false, estado: 'desligada', leitura: null, seguir: true, explicando: false, imprecisaDesde: null, precisaoRecebidaM: null })
    saltoPendente = null
    sincronizar()
  },
  centralizar: () => set({ seguir: true }),
  soltar: () => {
    if (get().seguir) set({ seguir: false })
  },
}))

const st = useLocalizacao.getState
const metros = (a: Ponto, b: Ponto) => linhaRetaKm(a, b) * 1000

/** Filtro de uma leitura nova em relação à última aceita. */
export function filtrarLeitura(nova: Leitura, anterior: Leitura | null, pendente: Leitura | null): 'aceita' | 'imprecisa' | 'salto' {
  if (!anterior) return 'aceita'
  const recente = nova.em - anterior.em < 60_000
  if (nova.precisaoM > DESCARTE_M && anterior.precisaoM <= DESCARTE_M && recente) return 'imprecisa'
  const d = metros(anterior, nova)
  const dt = Math.max(1, (nova.em - anterior.em) / 1000)
  const tolerancia = 3 * Math.max(nova.precisaoM, anterior.precisaoM, 20)
  if (d > tolerancia && d / dt > SALTO_MS) {
    // Um salto que se repete no mesmo lugar é real (ex.: o GPS corrigiu depois de um túnel).
    if (pendente && metros(pendente, nova) <= Math.max(50, 2 * nova.precisaoM)) return 'aceita'
    return 'salto'
  }
  return 'aceita'
}

function aoLer(l: Leitura) {
  ultimaRecebida = l.em
  const r = filtrarLeitura(l, st().leitura, saltoPendente)
  const d = st().descartadas
  if (r === 'salto') {
    saltoPendente = l
    useLocalizacao.setState({ descartadas: { ...d, salto: d.salto + 1 } })
    return
  }
  if (r === 'imprecisa') {
    useLocalizacao.setState({ descartadas: { ...d, imprecisa: d.imprecisa + 1 }, imprecisaDesde: st().imprecisaDesde ?? l.em, precisaoRecebidaM: l.precisaoM, estado: 'ok' })
    return
  }
  saltoPendente = null
  useLocalizacao.setState({ leitura: l, estado: 'ok', imprecisaDesde: null, precisaoRecebidaM: null })
}
function aoErro(e: ErroLocalizacao) {
  if (e === 'negada') {
    // Permissão negada: o monitoramento para (não fica insistindo).
    useLocalizacao.setState({ estado: 'negada', ativa: false, leitura: null })
    sincronizar()
  } else if (e === 'sem-suporte') {
    useLocalizacao.setState({ estado: 'sem-suporte', ativa: false, leitura: null })
    sincronizar()
  } else if (e === 'tempo') {
    if (st().estado !== 'ok' || !st().leitura) useLocalizacao.setState({ estado: 'sem-sinal' })
  } else {
    useLocalizacao.setState({ estado: 'indisponivel' })
  }
}

/** Liga, troca o modo ou para o GPS conforme a função, a visibilidade do app, o mapa e a rota. */
export function sincronizar() {
  const visivel = typeof document === 'undefined' || document.visibilityState !== 'hidden'
  const desejado = !st().ativa || !visivel ? 'parado' : mapas.cheio > 0 || rotaEmAndamento || altaTemporaria > 0 ? 'alta' : 'economico'
  if (desejado === modoAtual) return
  parar?.()
  parar = null
  modoAtual = desejado
  if (desejado !== 'parado') parar = provedor.observar({ alta: desejado === 'alta' }, aoLer, aoErro)
  if (relogioSinal) clearInterval(relogioSinal)
  relogioSinal = desejado === 'parado' ? null : setInterval(verificarSinal, 5_000)
  useLocalizacao.setState({ monitorando: desejado })
}

export function verificarSinal(agora = Date.now()) {
  const { estado, leitura } = st()
  if (estado === 'ok' && leitura && agora - Math.max(leitura.em, ultimaRecebida) > SEM_SINAL_MS) useLocalizacao.setState({ estado: 'sem-sinal' })
}

/** Um mapa entrou na tela (devolve a função para quando ele sair). */
export function mapaNaTela(modo: 'mini' | 'cheio'): () => void {
  mapas[modo]++
  sincronizar()
  return () => {
    mapas[modo]--
    sincronizar()
  }
}

/** Alta precisão só enquanto for preciso (devolve a função que libera). */
export function pedirAltaPrecisao(): () => void {
  altaTemporaria++
  sincronizar()
  let liberado = false
  return () => {
    if (liberado) return
    liberado = true
    altaTemporaria--
    sincronizar()
  }
}

/** Rota em andamento: alta precisão enquanto a função estiver ligada (alertas e desvio precisam dela). */
export function definirRotaEmAndamento(sim: boolean) {
  rotaEmAndamento = sim
  sincronizar()
}

export const imprecisa = (l: Leitura | null) => !!l && l.precisaoM > IMPRECISA_M

/** A atualização mais recente e confiável, para os cálculos. null = não há uma confiável agora. */
export function origemConfiavel(agora = Date.now()): (Ponto & { precisaoM: number }) | null {
  const { ativa, estado, leitura, imprecisaDesde } = st()
  if (!ativa || estado !== 'ok' || !leitura || imprecisaDesde !== null || imprecisa(leitura) || agora - leitura.em > ORIGEM_IDADE_MS) return null
  return { lat: leitura.lat, lon: leitura.lon, precisaoM: leitura.precisaoM }
}

/** Os cinco estados que você vê: ativo, buscando sinal, impreciso, indisponível, desativado. */
export function rotuloGps(s: Pick<Localizacao, 'ativa' | 'estado' | 'leitura'> & Partial<Pick<Localizacao, 'imprecisaDesde' | 'precisaoRecebidaM'>>): { rotulo: string; tom: 'ok' | 'buscando' | 'aviso' | 'erro' | 'off' } {
  if (s.estado === 'negada') return { rotulo: 'Desativado · permissão negada', tom: 'erro' }
  if (s.estado === 'sem-suporte') return { rotulo: 'Desativado · sem suporte', tom: 'erro' }
  if (!s.ativa) return { rotulo: 'Desativado', tom: 'off' }
  if (s.estado === 'indisponivel') return { rotulo: 'Indisponível', tom: 'erro' }
  if (s.estado === 'pedindo' || s.estado === 'sem-sinal' || !s.leitura) return { rotulo: 'Buscando sinal', tom: 'buscando' }
  if (s.imprecisaDesde != null) return { rotulo: `Impreciso · ±${Math.round(s.precisaoRecebidaM ?? 0)} m (mostrando a última posição boa)`, tom: 'aviso' }
  if (imprecisa(s.leitura)) return { rotulo: `Impreciso · ±${Math.round(s.leitura.precisaoM)} m`, tom: 'aviso' }
  return { rotulo: `Ativo · ±${Math.round(s.leitura.precisaoM)} m`, tom: 'ok' }
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sincronizar)

/** Troca o provedor (GPS do aparelho ↔ simulador da demonstração, ou o GPS falso dos testes). */
export function usarProvedor(p: LocationProvider, simulado = false) {
  parar?.()
  parar = null
  modoAtual = 'parado'
  saltoPendente = null
  provedor = p
  useLocalizacao.setState({ simulado, leitura: null, estado: st().ativa ? 'pedindo' : st().estado })
  sincronizar()
}
export const provedorDoAparelho = provedorWeb
