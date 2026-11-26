// Roteirização REAL do modo experimental (RB-4): só pontos FICTÍCIOS de Goiânia, registrados aqui.
// Fluxo: encaixe nas ruas → matriz real (assimétrica) → motor v3 (o mesmo das entregas) → traçado pelas ruas
// (directions, por trecho) → comparação com a otimização rápida avaliada pela MESMA matriz.
// O cliente do provedor é criado com a guarda experimental: coordenada que não seja do teste não sai do aparelho.
import { CacheMatriz } from '@/core/ruas/cacheMatriz'
import { MontagemMatriz } from '@/core/ruas/montagem'
import { chaveCoordenada } from '@/core/ruas/cache'
import { planejarRota } from '@/core/ruas/blocos'
import { roteirizar } from '@/core/ruas/fluxo'
import { provedorORS } from '@/core/ruas/ors'
import { LIMITES_ORS } from '@/core/ruas/provedores'
import { registrarPedido, registrarRestante } from '@/core/ruas/consumo'
import type { Coordenada, RoutingProvider, TrechoRuas } from '@/core/ruas/tipos'
import { FalhaProvedor } from '@/core/ruas/tipos'
import { executarTarefa } from '@/core/otimizacao/tarefa'
import { matrizEstimada, type Matriz } from '@/core/otimizacao/matriz'
import { iniciarOtimizacao } from '@/app/otimizador'
import { sortearPontos, type Coord } from './area'
import { guardaExperimental, RegistroExperimental, type AutorizacaoExperimental } from './guarda'
import type { ComparacaoTeste, ParadaTeste, TesteSalvo, TrechoGuardado } from './armazem'
import { transporte } from './transporte'

export const SERVICO_MIN_TESTE = 2

const armazem = () => {
  try {
    return localStorage
  } catch {
    return null
  }
}
const dormir = (ms: number, sinal?: AbortSignal) =>
  new Promise<void>((ok, falha) => {
    const h = setTimeout(ok, ms)
    sinal?.addEventListener('abort', () => (clearTimeout(h), falha(new FalhaProvedor('cancelado'))), { once: true })
  })

export interface Contexto {
  chave: string
  autorizacao: AutorizacaoExperimental
  registro: RegistroExperimental
  coordenadasSpx: () => readonly Coord[]
  /** Base de teste local (só nos testes automáticos); undefined = ORS real. */
  base?: string
}

export async function criarProvedor(c: Contexto): Promise<RoutingProvider & { deTeste: boolean }> {
  const f = await transporte()
  const p = provedorORS({
    chave: c.chave, fetch: f, base: c.base, liberadoReal: true,
    guarda: guardaExperimental(c.autorizacao, c.registro, c.coordenadasSpx),
    aoPedir: (sv) => registrarPedido(armazem(), 'ors', sv, Date.now()),
    aoResponder: (sv, r) => r !== undefined && registrarRestante(armazem(), 'ors', sv, r, Date.now()),
  })
  // Tudo o que o provedor devolve como "acesso na via" de um ponto registrado também passa a ser do teste.
  return {
    ...p,
    async encaixar(pontos, raio, perfil, sinal) {
      const r = await p.encaixar(pontos, raio, perfil, sinal)
      r.forEach((e) => e && c.registro.registrar(e.acesso))
      return r
    },
  }
}

/** Registra no teste todos os pontos já salvos (partida, paradas e acessos). */
export function registrarTeste(t: TesteSalvo, reg: RegistroExperimental) {
  reg.registrar(t.partida)
  t.paradas.forEach((p) => reg.registrar(p))
  Object.values(t.acessos).forEach((a) => reg.registrar(a))
}

/** Gera n paradas fictícias: sorteio na área pública + encaixe na via mais próxima pelo provedor (até 350 m). */
export async function gerarParadas(n: number, prov: RoutingProvider, reg: RegistroExperimental, semente: number, sinal?: AbortSignal): Promise<ParadaTeste[]> {
  const out: ParadaTeste[] = []
  for (let rodada = 0; rodada < 4 && out.length < n; rodada++) {
    const cand = sortearPontos(Math.ceil((n - out.length) * 1.3) + 2, semente + rodada * 7919)
    cand.forEach((p) => reg.registrar(p))
    const r = await prov.encaixar(cand, 350, 'carro', sinal)
    r.forEach((e) => {
      if (e && out.length < n && !out.some((o) => Math.abs(o.lat - e.acesso.lat) < 1e-5 && Math.abs(o.lon - e.acesso.lon) < 1e-5))
        out.push({ id: `t${out.length + 1}`, n: out.length + 1, lat: e.acesso.lat, lon: e.acesso.lon, origem: 'sorteio', visitada: false })
    })
  }
  if (out.length < n) throw new FalhaProvedor('resposta-incompleta')
  return out
}

export type Etapa = 'encaixe' | 'matriz' | 'algoritmo' | 'tracado'
export interface Progresso {
  etapa: Etapa
  fracao: number
  detalhe: string
}

const custoOrdem = (m: Matriz, seq: readonly number[]) => {
  let km = 0
  let min = 0
  for (let k = 0; k + 1 < seq.length; k++) {
    km += m.km[seq[k]!]![seq[k + 1]!]!
    min += m.min[seq[k]!]![seq[k + 1]!]!
  }
  return { km, min }
}

const chaveTrecho = (a: Coordenada, b: Coordenada) => `${chaveCoordenada(a)}>${chaveCoordenada(b)}`

export interface ResultadoTeste {
  teste: TesteSalvo
  ordemNova: string[]
  melhorou: boolean
  fora: string[]
}

/**
 * Calcula (ou reotimiza) o teste: só as paradas NÃO visitadas, a partir da partida (ou da última visitada).
 * Reaproveita a matriz e o traçado guardados; só o que falta é pedido. Não muda o teste salvo: devolve o novo.
 */
export async function calcularTeste(t: TesteSalvo, prov: RoutingProvider, sinal: AbortSignal, progresso: (p: Progresso) => void): Promise<ResultadoTeste> {
  const ms = { encaixe: 0, matriz: 0, algoritmo: 0, tracado: 0 }
  const pend = t.ordem.map((id) => t.paradas.find((p) => p.id === id)!).filter((p) => !p.visitada)
  if (!pend.length) throw new FalhaProvedor('requisicao')
  const visitadas = t.ordem.map((id) => t.paradas.find((p) => p.id === id)!).filter((p) => p.visitada)
  const ultima = visitadas[visitadas.length - 1]
  const origem: Coord = ultima ? { lat: ultima.lat, lon: ultima.lon } : t.partida
  const pontos: Coord[] = [origem, ...pend.map((p) => ({ lat: p.lat, lon: p.lon }))]
  const cache = CacheMatriz.abrir(t.matriz ?? null, 'ors', 'carro', Date.now())
  const t0 = performance.now()
  let fimEncaixe = 0
  const r = await roteirizar(
    prov, pontos, 'carro',
    {
      agora: () => Date.now(),
      esperar: dormir,
      aoProgresso: (etapa, fracao, feitos, total) => {
        if (etapa === 'matriz' && !fimEncaixe) fimEncaixe = performance.now()
        progresso({ etapa, fracao, detalhe: etapa === 'encaixe' ? 'Encaixando os pontos nas ruas…' : `Distâncias e tempos pelas ruas: ${feitos ?? 0} de ${total ?? 0} pedidos` })
      },
    },
    sinal,
    undefined,
    {
      terminoLivre: true,
      acessosConhecidos: pontos.map((p) => cache.acessoConhecido(p)),
      preencher: (m, coords) => cache.preencher(m, coords),
    },
  )
  if (r.montagem) cache.atualizar(r.montagem, r.coords, r.acessos)
  if (r.interrompido) throw r.interrompido
  if (sinal.aborted) throw new FalhaProvedor('cancelado')
  ms.encaixe = (fimEncaixe || performance.now()) - t0
  ms.matriz = performance.now() - (fimEncaixe || t0)

  const m = r.montagem!
  const { matriz } = m.paraMotor(r.paraMotor)
  const idsMotor = r.paraMotor.slice(1).map((k) => pend[r.incluidos[k]! - 1]!.id)
  const fora = pend.filter((p) => !idsMotor.includes(p.id)).map((p) => p.id)
  if (!idsMotor.length) throw new FalhaProvedor('requisicao')
  const termino = r.finalObrigatorio !== undefined ? { tipo: 'visita' as const, id: pend[r.incluidos[r.finalObrigatorio]! - 1]!.id } : { tipo: 'livre' as const }
  const visitas = idsMotor.map((id) => ({ id }))

  // 1) Pelas ruas (Worker, cancelável).
  progresso({ etapa: 'algoritmo', fracao: 0, detalhe: 'Calculando a melhor ordem (motor v3)…' })
  const t1 = performance.now()
  const ex = iniciarOtimizacao({ visitas, pontos: [], matriz, termino, servicoMin: SERVICO_MIN_TESTE }, (f) => progresso({ etapa: 'algoritmo', fracao: f, detalhe: 'Calculando a melhor ordem (motor v3)…' }))
  sinal.addEventListener('abort', () => ex.cancelar(), { once: true })
  const res = await ex.resultado
  ms.algoritmo = performance.now() - t1

  // 2) Rápida (linha reta × 1,35) com os mesmos pontos, avaliada pela MESMA matriz real.
  const pontosMotor = r.paraMotor.map((k) => r.coords[k]!)
  const rapida = executarTarefa({ visitas, pontos: pontosMotor, termino, servicoMin: SERVICO_MIN_TESTE }, () => {}, () => sinal.aborted)
  const pos = new Map(idsMotor.map((id, k) => [id, k + 1]))
  const seqRapida = [0, ...rapida.ordem.map((id) => pos.get(id)!)]
  const seqRuas = [0, ...res.ordem.map((id) => pos.get(id)!)]
  const cR = custoOrdem(matriz, seqRapida)
  const cU = custoOrdem(matriz, seqRuas)
  const estimada = matrizEstimada(pontosMotor)
  const cRm = custoOrdem(estimada, seqRapida)

  // 3) Traçado pelas ruas da nova ordem (só os trechos que faltam).
  const trechos: Record<string, TrechoGuardado> = { ...t.trechos }
  const seqCoords = seqRuas.map((k) => pontosMotor[k]!)
  const faltam: number[] = []
  for (let k = 0; k + 1 < seqCoords.length; k++) if (!trechos[chaveTrecho(seqCoords[k]!, seqCoords[k + 1]!)]) faltam.push(k)
  const t2 = performance.now()
  let pedidosRota = 0
  if (faltam.length) {
    // Partes contíguas de até 50 pontos cobrindo os trechos que faltam.
    const partes = planejarRota(seqCoords.length, LIMITES_ORS.maxPontosRota).filter(([a, b]) => faltam.some((k) => k >= a && k < b))
    for (let i = 0; i < partes.length; i++) {
      if (sinal.aborted) throw new FalhaProvedor('cancelado')
      const [a, b] = partes[i]!
      progresso({ etapa: 'tracado', fracao: i / partes.length, detalhe: `Traçado pelas ruas: ${i + 1} de ${partes.length} pedidos` })
      let tr: TrechoRuas[]
      for (let tentativa = 0; ; tentativa++) {
        try {
          tr = await prov.rota(seqCoords.slice(a, b + 1), 'carro', sinal)
          break
        } catch (e) {
          if (e instanceof FalhaProvedor && (e.tipo === 'limite-minuto' || e.tipo === 'indisponivel') && tentativa < 3) await dormir(e.esperarMs ?? 15_000 * (tentativa + 1), sinal)
          else throw e
        }
      }
      pedidosRota++
      tr.forEach((x, j) => (trechos[chaveTrecho(seqCoords[a + j]!, seqCoords[a + j + 1]!)] = { pontos: x.pontos, metros: x.metros, segundos: x.segundos }))
    }
  }
  ms.tracado = performance.now() - t2
  let km = 0
  let min = 0
  let comTracado = 0
  for (let k = 0; k + 1 < seqCoords.length; k++) {
    const x = trechos[chaveTrecho(seqCoords[k]!, seqCoords[k + 1]!)]
    if (x) {
      km += x.metros / 1000
      min += x.segundos / 60
      comTracado++
    }
  }
  const nTrechos = seqCoords.length - 1

  const visitadasIds = visitadas.map((p) => p.id)
  const ordemNova = [...visitadasIds, ...res.ordem, ...fora]
  const acessos = { ...t.acessos }
  if (!ultima) acessos.partida = r.coords[0]!
  r.paraMotor.slice(1).forEach((k) => (acessos[pend[r.incluidos[k]! - 1]!.id] = r.coords[k]!))
  const comparacao: ComparacaoTeste = {
    rapida: { km: cR.km, min: cR.min, kmModelo: cRm.km, minModelo: cRm.min },
    ruas: { km: cU.km, min: cU.min },
    tracado: { km, min, trechos: nTrechos, semTracado: nTrechos - comTracado },
    ms,
    pedidos: { encaixe: r.relatorio.pedidos.encaixe, matriz: r.relatorio.pedidos.matriz, rota: pedidosRota },
    em: Date.now(),
  }
  return {
    teste: { ...t, ordem: ordemNova, matriz: cache.serializar(), trechos, acessos, comparacao, atualizadoEm: Date.now() },
    ordemNova,
    melhorou: res.melhorou,
    fora,
  }
}

/**
 * Sem internet: reotimiza as pendentes só com a matriz GUARDADA (sem pedir nada). O traçado aparece só nos
 * trechos que já estavam guardados; os outros ficam sem linha (só os pinos).
 */
export function reotimizarOffline(t: TesteSalvo): ResultadoTeste {
  const pend = t.ordem.map((id) => t.paradas.find((p) => p.id === id)!).filter((p) => !p.visitada)
  const visitadas = t.ordem.map((id) => t.paradas.find((p) => p.id === id)!).filter((p) => p.visitada)
  const ultima = visitadas[visitadas.length - 1]
  const origemAcesso = ultima ? t.acessos[ultima.id] : t.acessos.partida
  if (!origemAcesso || !t.matriz) throw new FalhaProvedor('sem-conexao')
  const cache = CacheMatriz.abrir(t.matriz, 'ors', 'carro', Date.now())
  const comAcesso = pend.filter((p) => t.acessos[p.id])
  const coords = [origemAcesso, ...comAcesso.map((p) => t.acessos[p.id]!)]
  const mont = new MontagemMatriz(coords.length)
  cache.preencher(mont, coords)
  mont.dispensarVoltaAoInicio()
  for (let i = 0; i < coords.length; i++) for (let j = 1; j < coords.length; j++) if (i !== j && !mont.conhecido(i, j)) throw new FalhaProvedor('sem-conexao')
  const idx = coords.map((_, i) => i)
  const { matriz } = mont.paraMotor(idx)
  const visitas = comAcesso.map((p) => ({ id: p.id }))
  const res = executarTarefa({ visitas, pontos: [], matriz, servicoMin: SERVICO_MIN_TESTE }, () => {}, () => false)
  const fora = pend.filter((p) => !t.acessos[p.id]).map((p) => p.id)
  const ordemNova = [...visitadas.map((p) => p.id), ...res.ordem, ...fora]
  const pos = new Map(comAcesso.map((p, k) => [p.id, k + 1]))
  const seq = [0, ...res.ordem.map((id) => pos.get(id)!)]
  const c = custoOrdem(matriz, seq)
  let km = 0
  let min = 0
  let com = 0
  for (let k = 0; k + 1 < seq.length; k++) {
    const x = t.trechos[chaveTrecho(coords[seq[k]!]!, coords[seq[k + 1]!]!)]
    if (x) {
      km += x.metros / 1000
      min += x.segundos / 60
      com++
    }
  }
  const comparacao: ComparacaoTeste = {
    rapida: t.comparacao?.rapida ?? { km: NaN, min: NaN, kmModelo: NaN, minModelo: NaN },
    ruas: { km: c.km, min: c.min },
    tracado: { km, min, trechos: seq.length - 1, semTracado: seq.length - 1 - com },
    ms: { encaixe: 0, matriz: 0, algoritmo: 0, tracado: 0 },
    pedidos: { encaixe: 0, matriz: 0, rota: 0 },
    em: Date.now(),
    offline: true,
  }
  return { teste: { ...t, ordem: ordemNova, comparacao, atualizadoEm: Date.now() }, ordemNova, melhorou: res.melhorou, fora }
}


/** Linhas do traçado da ordem atual (só trechos com geometria real; sem geometria = nada desenhado). */
export function linhasDoTracado(t: TesteSalvo): [number, number][][] {
  const pend = t.ordem.map((id) => t.paradas.find((p) => p.id === id)!)
  const visitadas = pend.filter((p) => p.visitada)
  const seqIds = [...visitadas.map((p) => p.id), ...pend.filter((p) => !p.visitada).map((p) => p.id)]
  const coords: (Coordenada | undefined)[] = [t.acessos.partida, ...seqIds.map((id) => t.acessos[id])]
  const out: [number, number][][] = []
  for (let k = 0; k + 1 < coords.length; k++) {
    const a = coords[k]
    const b = coords[k + 1]
    if (!a || !b) continue
    const x = t.trechos[chaveTrecho(a, b)]
    if (x && x.pontos.length > 1) out.push(x.pontos)
  }
  return out
}

export { RegistroExperimental }
