// Motor de otimização v3 (fase R-A, aprovado em 2026-11-25). Implementação própria; nenhum código de terceiros.
// Auditoria e bancada comparativa: docs/ARQUITETURA.md §15.
//
// Regras do RotaVHS que o motor garante:
//  - só reordena visitas PENDENTES; nunca cria, une, remove ou renumera paradas (a saída é uma permutação da entrada);
//  - a origem é SEMPRE o nó 0 da matriz (a posição atual do motorista); nunca começa pela 1ª parada da SPX;
//  - término livre por padrão; destino opcional (uma visita fixa no fim, ou um ponto: o último nó da matriz);
//  - visitas do mesmo endereço confirmado (grupo) andam juntas, sem serem unidas;
//  - matriz ASSIMÉTRICA (mão única, retornos): toda inversão de trecho usa o custo real no sentido invertido;
//  - nunca devolve ordem pior que a atual pela MESMA matriz e critério; a ordem só é aplicada com o toque do usuário;
//  - determinístico para a mesma entrada e o mesmo número de iterações (o tempo só serve de limite de segurança).
//
// Algoritmo: várias soluções iniciais (vizinho mais próximo, inserção mais barata, inserção do mais distante, a ordem
// atual e ordens extras, ex.: a última rota real guardada) → busca local com custo incremental (2-opt assimétrico,
// Or-opt de 1–3 blocos nos dois sentidos, troca de trechos do 3-opt), com listas de vizinhos e marcadores
// "não olhar de novo" → busca local iterada (perturbação local "double-bridge" + busca local; só aceita melhora).
// Até 8 blocos livres: solução exata (todas as permutações).
import type { Matriz } from './matriz'

export type Criterio = 'tempo' | 'distancia' | 'combustivel' | 'inteligente'

export const CRITERIOS: readonly { id: Criterio; nome: string }[] = [
  { id: 'tempo', nome: 'Menor tempo' },
  { id: 'distancia', nome: 'Menor distância' },
  { id: 'combustivel', nome: 'Economia de combustível' },
  { id: 'inteligente', nome: 'Inteligente' },
]

export interface VisitaOtimizacao {
  id: string
  /** Mesmo endereço confirmado na Conferência = mesmo grupo: as visitas andam juntas, sem serem unidas. */
  grupo?: string
}

/** Onde a rota termina. Livre (padrão): na última entrega, onde for melhor. */
export type Termino = { tipo: 'livre' } | { tipo: 'visita'; id: string } | { tipo: 'ponto' }

export interface PedidoOtimizacao {
  /** Só as visitas PENDENTES, na ordem atual. As concluídas nunca entram. */
  visitas: readonly VisitaOtimizacao[]
  /** Nó 0 = origem (posição atual); 1..n = visitas; n+1 = destino quando termino.tipo === 'ponto'. */
  matriz: Matriz
  /** Padrão: menor tempo. */
  criterio?: Criterio
  termino?: Termino
  /** Visita fixada como primeira (opcional). */
  primeira?: string
  /** Ordens extras para começar (ex.: a última rota real guardada). Ids desconhecidos são ignorados. */
  candidatas?: readonly (readonly string[])[]
  /** Minutos parados em cada visita (padrão 2). */
  servicoMin?: number
  /** Limite de tempo de segurança (padrão: pelo tamanho, ver orcamentoMs). */
  limiteMs?: number
  /** Iterações da busca iterada (padrão: pelo tamanho). Mesmo número → mesmo resultado. */
  iteracoes?: number
  semente?: number
  agora?: () => number
  /** Fração concluída (0–1), no máximo a cada ~100 ms. */
  aoProgresso?: (fracao: number) => void
  /** Devolve true para interromper: o motor lança OtimizacaoCancelada (nada é aplicado). */
  cancelado?: () => boolean
}

export interface ResultadoOtimizacao {
  ordem: string[]
  criterio: Criterio
  km: number
  min: number
  kmAtual: number
  minAtual: number
  custo: number
  custoAtual: number
  /** false = a ordem atual já era a melhor pelo modelo (devolvida sem mudança). */
  melhorou: boolean
  tipoMatriz: Matriz['tipo']
  /** De qual solução inicial saiu a vencedora. */
  origemSolucao: 'exata' | 'vizinho' | 'insercao' | 'distante' | 'atual' | 'extra'
  iteracoes: number
  ms: number
}

export class OtimizacaoCancelada extends Error {
  constructor() {
    super('Otimização cancelada')
    this.name = 'OtimizacaoCancelada'
  }
}

/** Custo de um trecho i→j em cada critério (modelo; sempre apresentado como estimativa). */
export function custoArco(m: Matriz, i: number, j: number, c: Criterio): number {
  const km = m.km[i]![j]!
  const min = m.min[i]![j]!
  switch (c) {
    case 'tempo':
      return min
    case 'distancia':
      return km
    case 'combustivel':
      return km + 0.02 * min
    case 'inteligente':
      return min + 1.5 * km
  }
}

/**
 * Limite de tempo de SEGURANÇA por tamanho. A busca termina antes, pelo número de iterações (bancada, CPU de nuvem:
 * 50 → ~0,15 s; 100 → ~0,35 s; 250 → ~0,55 s; 500 → ~0,85 s). No celular, 2–4× mais (a medir no S23 FE).
 */
export function orcamentoMs(n: number): number {
  return n <= 50 ? 1000 : n <= 100 ? 2000 : n <= 250 ? 4000 : 6000
}
/** Iterações padrão da busca iterada (calibradas na bancada: depois disso o ganho é < 0,3%). */
export function iteracoesPadrao(n: number): number {
  return n <= 8 ? 0 : n <= 50 ? 400 : n <= 100 ? 800 : n <= 250 ? 1000 : 1200
}

function rng(semente: number) {
  let s = semente >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

const NUM_VIZINHOS = 16

/**
 * Busca sobre "blocos" (super-nós). s[0] = início fixo (S), s[N-1] = fim fixo (E). Custo plano W×W.
 * Todos os movimentos preservam s[0] e s[N-1]; o custo é exato para matriz assimétrica.
 */
class Busca {
  readonly W: number
  readonly S: number
  readonly E: number
  s: number[]
  pos: Int32Array
  F: Float64Array
  B: Float64Array
  private sujo = true
  readonly fora: Int32Array[] // melhores sucessores (blocos ∪ {E})
  readonly dentro: Int32Array[] // melhores antecessores (blocos ∪ {S})
  private fila: number[] = []
  private naFila: Uint8Array
  passos = 0

  constructor(
    readonly K: number,
    readonly c: Float64Array,
    private readonly parar: () => boolean,
  ) {
    this.W = K + 2
    this.S = K
    this.E = K + 1
    this.s = []
    this.pos = new Int32Array(this.W)
    this.F = new Float64Array(this.W)
    this.B = new Float64Array(this.W)
    this.naFila = new Uint8Array(this.W)
    const v = Math.min(NUM_VIZINHOS, K)
    const idx = Array.from({ length: K + 1 }, (_, i) => i)
    this.fora = []
    this.dentro = []
    for (let a = 0; a < K; a++) {
      const outs = idx.map((b) => (b === K ? this.E : b)).filter((b) => b !== a)
      outs.sort((x, y) => this.cc(a, x) - this.cc(a, y) || x - y)
      this.fora.push(Int32Array.from(outs.slice(0, v)))
      const ins = idx.map((b) => (b === K ? this.S : b)).filter((b) => b !== a)
      ins.sort((x, y) => this.cc(x, a) - this.cc(y, a) || x - y)
      this.dentro.push(Int32Array.from(ins.slice(0, v)))
    }
    // S também precisa dos seus melhores sucessores (para a troca de trechos que começa logo depois dele).
    const doInicio = idx.slice(0, K).sort((x, y) => this.cc(this.S, x) - this.cc(this.S, y) || x - y)
    this.fora.push(Int32Array.from(doInicio.slice(0, v))) // fora[S]
    this.dentro.push(new Int32Array(0)) // dentro[S] (não usado)
  }

  cc(a: number, b: number): number {
    return this.c[a * this.W + b]!
  }

  usar(ordem: readonly number[]) {
    this.s = [this.S, ...ordem, this.E]
    this.reindexar()
  }

  private reindexar() {
    const s = this.s
    for (let i = 0; i < s.length; i++) this.pos[s[i]!] = i
    this.sujo = true
  }

  private prefixos() {
    if (!this.sujo) return
    const s = this.s
    this.F[0] = 0
    this.B[0] = 0
    for (let i = 1; i < s.length; i++) {
      this.F[i] = this.F[i - 1]! + this.cc(s[i - 1]!, s[i]!)
      this.B[i] = this.B[i - 1]! + this.cc(s[i]!, s[i - 1]!)
    }
    this.sujo = false
  }

  custo(): number {
    let t = 0
    for (let i = 1; i < this.s.length; i++) t += this.cc(this.s[i - 1]!, this.s[i]!)
    return t
  }

  ordem(): number[] {
    return this.s.slice(1, -1)
  }

  ativar(...nos: number[]) {
    for (const v of nos) {
      if (v >= this.K || this.naFila[v]) continue
      this.naFila[v] = 1
      this.fila.push(v)
    }
  }

  ativarTodos() {
    for (let i = this.s.length - 2; i >= 1; i--) this.ativar(this.s[i]!)
  }

  /** Busca local até não haver melhora (ou parar). */
  melhorar() {
    while (this.fila.length) {
      if ((++this.passos & 63) === 0 && this.parar()) {
        this.fila.length = 0
        this.naFila.fill(0)
        return
      }
      const v = this.fila.pop()!
      this.naFila[v] = 0
      if (this.doisOpt(v) || this.orOpt(v) || this.trocaTrechos(v)) this.ativar(v)
    }
  }

  // --- 2-opt: inverte s[i..k] (1 ≤ i < k ≤ N-2). Novas ligações s[i-1]→s[k] e s[i]→s[k+1]. ---
  private deltaDois(i: number, k: number): number {
    const s = this.s
    this.prefixos()
    const a = s[i - 1]!, b = s[i]!, c = s[k]!, d = s[k + 1]!
    return this.cc(a, c) + (this.B[k]! - this.B[i]!) + this.cc(b, d) - this.cc(a, b) - (this.F[k]! - this.F[i]!) - this.cc(c, d)
  }
  private aplicarDois(i: number, k: number) {
    const s = this.s
    const a = s[i - 1]!, b = s[i]!, c = s[k]!, d = s[k + 1]!
    for (let x = i, y = k; x < y; x++, y--) {
      const t = s[x]!
      s[x] = s[y]!
      s[y] = t
    }
    this.reindexar()
    this.ativar(a, b, c, d)
  }
  private doisOpt(v: number): boolean {
    const N = this.s.length
    const p = this.pos[v]!
    const tentar = (i: number, k: number) => {
      if (i < 1 || k > N - 2 || i >= k) return false
      if (this.deltaDois(i, k) < -1e-9) {
        this.aplicarDois(i, k)
        return true
      }
      return false
    }
    for (const a of this.dentro[v]!) if (tentar(this.pos[a]! + 1, p)) return true // v = s[k], nova a→v
    for (const b of this.fora[v]!) if (tentar(p, this.pos[b]! - 1)) return true // v = s[i], nova v→b
    for (const b of this.fora[v]!) if (b < this.K && tentar(p + 1, this.pos[b]!)) return true // v = s[i-1], nova v→s[k]
    for (const a of this.dentro[v]!) if (a < this.K && tentar(this.pos[a]!, p - 1)) return true // v = s[k+1], nova s[i]→v
    return false
  }

  // --- Or-opt: move s[i..j] (até 3 blocos), direto ou invertido, para entre s[q] e s[q+1]. ---
  private orOpt(v: number): boolean {
    const N = this.s.length
    const p = this.pos[v]!
    this.prefixos()
    for (let L = 1; L <= 3; L++) {
      for (const [i, j] of [[p, p + L - 1], [p - L + 1, p]] as const) {
        if (i < 1 || j > N - 2) continue
        if (this.tentarOr(i, j)) return true
        if (L === 1) break
      }
    }
    return false
  }
  private tentarOr(i: number, j: number): boolean {
    const s = this.s
    const N = s.length
    const pi = s[i - 1]!, si = s[i]!, sj = s[j]!, nx = s[j + 1]!
    const fw = this.F[j]! - this.F[i]!
    const rv = this.B[j]! - this.B[i]!
    const tirar = this.cc(pi, nx) - this.cc(pi, si) - this.cc(sj, nx)
    const qs = new Set<number>()
    for (const x of this.dentro[si]!) qs.add(this.pos[x]!)
    for (const y of this.fora[sj]!) qs.add(this.pos[y]! - 1)
    if (j > i) {
      for (const x of this.dentro[sj]!) qs.add(this.pos[x]!)
      for (const y of this.fora[si]!) qs.add(this.pos[y]! - 1)
    }
    let melhor = -1e-9, mq = -1, minv = false
    for (const q of qs) {
      if (q < 0 || q > N - 2 || (q >= i - 1 && q <= j)) continue
      const x = s[q]!, y = s[q + 1]!
      const base = tirar - this.cc(x, y)
      const dir = base + this.cc(x, si) + this.cc(sj, y)
      if (dir < melhor) {
        melhor = dir
        mq = q
        minv = false
      }
      if (j > i) {
        const inv = base + this.cc(x, sj) + rv - fw + this.cc(si, y)
        if (inv < melhor) {
          melhor = inv
          mq = q
          minv = true
        }
      }
    }
    if (mq < 0) return false
    const trecho = s.slice(i, j + 1)
    if (minv) trecho.reverse()
    const x = s[mq]!, y = s[mq + 1]!
    s.splice(i, trecho.length)
    const ins = mq < i ? mq + 1 : mq + 1 - trecho.length
    s.splice(ins, 0, ...trecho)
    this.reindexar()
    this.ativar(pi, nx, x, y, si, sj)
    return true
  }

  // --- 3-opt (troca de trechos, sem inverter): A=s[i..j], B=s[j+1..k] → B A. ---
  private deltaTroca(i: number, j: number, k: number): number {
    const s = this.s
    return this.cc(s[i - 1]!, s[j + 1]!) + this.cc(s[k]!, s[i]!) + this.cc(s[j]!, s[k + 1]!) - this.cc(s[i - 1]!, s[i]!) - this.cc(s[j]!, s[j + 1]!) - this.cc(s[k]!, s[k + 1]!)
  }
  private aplicarTroca(i: number, j: number, k: number) {
    const s = this.s
    const pts = [s[i - 1]!, s[i]!, s[j]!, s[j + 1]!, s[k]!, s[k + 1]!]
    const A = s.slice(i, j + 1)
    const B = s.slice(j + 1, k + 1)
    s.splice(i, k - i + 1, ...B, ...A)
    this.reindexar()
    this.ativar(...pts)
  }
  private trocaTrechos(v: number): boolean {
    const N = this.s.length
    const p = this.pos[v]!
    // v = s[i-1]: nova ligação v→s[j+1]
    const i = p + 1
    if (i <= N - 3) {
      for (const b of this.fora[v]!) {
        if (b >= this.K) continue
        const j = this.pos[b]! - 1
        if (j < i || j > N - 3) continue
        const si = this.s[i]!
        for (const a of this.dentro[si]!) {
          const k = this.pos[a]!
          if (a >= this.K || k <= j || k > N - 2) continue
          if (this.deltaTroca(i, j, k) < -1e-9) {
            this.aplicarTroca(i, j, k)
            return true
          }
        }
        const sj = this.s[j]!
        for (const y of this.fora[sj]!) {
          const k = this.pos[y]! - 1
          if (k <= j || k > N - 2) continue
          if (this.deltaTroca(i, j, k) < -1e-9) {
            this.aplicarTroca(i, j, k)
            return true
          }
        }
      }
    }
    // v = s[k]: nova ligação v→s[i]
    const k = p
    for (const a of this.fora[v]!) {
      if (a >= this.K) continue
      const ii = this.pos[a]!
      if (ii >= k || ii < 1) continue
      const pre = this.s[ii - 1]!
      for (const b of this.fora[pre]!) {
        if (b >= this.K) continue
        const j = this.pos[b]! - 1
        if (j < ii || j >= k) continue
        if (this.deltaTroca(ii, j, k) < -1e-9) {
          this.aplicarTroca(ii, j, k)
          return true
        }
      }
    }
    return false
  }

  /** Perturbação local: double-bridge numa janela (A B C D → A C B D). */
  perturbar(r: () => number) {
    const s = this.s
    const M = s.length - 2
    if (M < 8) return
    const w = Math.min(M, 30 + Math.floor(r() * 30))
    const ini = 1 + Math.floor(r() * (M - w + 1))
    const cortes = [0, 0, 0].map(() => 1 + Math.floor(r() * (w - 1))).sort((a, b) => a - b)
    const x = ini + cortes[0]!, y = ini + cortes[1]!, z = ini + cortes[2]!
    if (x === y || y === z) return
    const pontos = [s[x - 1]!, s[x]!, s[y - 1]!, s[y]!, s[z - 1]!, s[z]!]
    const nova = [...s.slice(0, x), ...s.slice(y, z), ...s.slice(x, y), ...s.slice(z)]
    this.s = nova
    this.reindexar()
    this.ativar(...pontos)
  }
}

interface Bloco {
  nos: number[] // índices na matriz, na ordem interna
}

/** Otimiza. Lança OtimizacaoCancelada se `cancelado()` ficar true. */
export function otimizar(p: PedidoOtimizacao): ResultadoOtimizacao {
  const agora = p.agora ?? (() => Date.now())
  const t0 = agora()
  const criterio = p.criterio ?? 'tempo'
  const servico = p.servicoMin ?? 2
  const termino: Termino = p.termino ?? { tipo: 'livre' }
  const n = p.visitas.length
  const esperado = n + 1 + (termino.tipo === 'ponto' ? 1 : 0)
  const m = p.matriz
  if (m.km.length !== esperado || m.min.length !== esperado) throw new Error(`Matriz com ${m.km.length} nós; esperado ${esperado}.`)
  for (let i = 0; i < esperado; i++) {
    for (let j = 0; j < esperado; j++) {
      const a = m.km[i]?.[j], b = m.min[i]?.[j]
      if (!Number.isFinite(a) || !Number.isFinite(b) || a! < 0 || b! < 0) throw new Error('Matriz com trecho sem percurso ou valor inválido.')
    }
  }
  const ids = p.visitas.map((v) => v.id)
  if (new Set(ids).size !== n) throw new Error('Visitas repetidas na entrada.')
  const noDe = new Map(ids.map((id, i) => [id, i + 1]))
  const destino = termino.tipo === 'ponto' ? n + 1 : -1
  const arco = (i: number, j: number) => custoArco(m, i, j, criterio)
  const limite = t0 + (p.limiteMs ?? orcamentoMs(n))
  let ultimoAviso = t0
  const parar = () => {
    if (p.cancelado?.()) throw new OtimizacaoCancelada()
    return agora() > limite
  }
  const avisar = (f: number) => {
    const t = agora()
    if (p.aoProgresso && t - ultimoAviso >= 100) {
      ultimoAviso = t
      p.aoProgresso(Math.min(1, f))
    }
  }

  // Blocos: visitas do mesmo grupo, na ordem atual (a 1ª aparição define a posição do bloco).
  const blocos: Bloco[] = []
  const porGrupo = new Map<string, Bloco>()
  const blocoDoNo = new Map<number, Bloco>()
  for (const v of p.visitas) {
    const no = noDe.get(v.id)!
    let b = v.grupo ? porGrupo.get(v.grupo) : undefined
    if (b) b.nos.push(no)
    else {
      b = { nos: [no] }
      if (v.grupo) porGrupo.set(v.grupo, b)
      blocos.push(b)
    }
    blocoDoNo.set(no, b)
  }
  const blocoDe = (id?: string) => (id === undefined || !noDe.has(id) ? undefined : blocoDoNo.get(noDe.get(id)!))
  const fixaInicio = blocoDe(p.primeira)
  let fixaFim = termino.tipo === 'visita' ? blocoDe(termino.id) : undefined
  if (fixaFim && fixaFim === fixaInicio) fixaFim = undefined
  const livres = blocos.filter((b) => b !== fixaInicio && b !== fixaFim)
  const K = livres.length
  const indiceLivre = new Map(livres.map((b, i) => [b, i]))
  const primeiroNo = (b: Bloco) => b.nos[0]!
  const ultimoNo = (b: Bloco) => b.nos[b.nos.length - 1]!

  // Matriz dos blocos livres + S (início) + E (fim).
  const W = K + 2
  const c = new Float64Array(W * W)
  const noInicio = fixaInicio ? ultimoNo(fixaInicio) : 0
  const custoFim = (b: Bloco) => (fixaFim ? arco(ultimoNo(b), primeiroNo(fixaFim)) : destino >= 0 ? arco(ultimoNo(b), destino) : 0)
  for (let a = 0; a < K; a++) {
    for (let b = 0; b < K; b++) if (a !== b) c[a * W + b] = arco(ultimoNo(livres[a]!), primeiroNo(livres[b]!))
    c[K * W + a] = arco(noInicio, primeiroNo(livres[a]!))
    c[a * W + K + 1] = custoFim(livres[a]!)
  }
  c[K * W + K + 1] = fixaFim ? arco(noInicio, primeiroNo(fixaFim)) : destino >= 0 ? arco(noInicio, destino) : 0
  const busca = new Busca(K, c, parar)
  const custoDe = (ordem: readonly number[]) => {
    let t = 0, a = K
    for (const v of ordem) {
      t += c[a * W + v]!
      a = v
    }
    return t + c[a * W + K + 1]!
  }

  // Soluções iniciais.
  const candidatas: { ordem: number[]; origem: ResultadoOtimizacao['origemSolucao'] }[] = []
  const deIds = (lista: readonly string[]): number[] | null => {
    const vistos = new Set<number>()
    const out: number[] = []
    for (const id of lista) {
      const b = blocoDe(id)
      if (!b) continue
      const k = indiceLivre.get(b)
      if (k === undefined || vistos.has(k)) continue
      vistos.add(k)
      out.push(k)
    }
    return out.length === K ? out : null
  }
  const atual = deIds(ids)!
  let melhorOrdem: number[]
  let origemSolucao: ResultadoOtimizacao['origemSolucao']
  let iteracoes = 0

  if (K <= 8) {
    // Exata: todas as permutações (no máximo 40.320).
    melhorOrdem = atual
    let melhorCusto = custoDe(atual)
    const usado = new Uint8Array(K)
    const cur: number[] = []
    const rec = (custo: number, ult: number) => {
      if (custo >= melhorCusto - 1e-12) return
      if (cur.length === K) {
        const total = custo + c[ult * W + K + 1]!
        if (total < melhorCusto - 1e-12) {
          melhorCusto = total
          melhorOrdem = [...cur]
        }
        return
      }
      for (let v = 0; v < K; v++) {
        if (usado[v]) continue
        usado[v] = 1
        cur.push(v)
        rec(custo + c[ult * W + v]!, v)
        cur.pop()
        usado[v] = 0
      }
    }
    rec(0, K)
    origemSolucao = 'exata'
  } else {
    candidatas.push({ ordem: atual, origem: 'atual' })
    candidatas.push({ ordem: vizinhoMaisProximo(K, c, W), origem: 'vizinho' })
    candidatas.push({ ordem: insercao(K, c, W, 'barata'), origem: 'insercao' })
    candidatas.push({ ordem: insercao(K, c, W, 'distante'), origem: 'distante' })
    for (const extra of p.candidatas ?? []) {
      const o = deIds(extra)
      if (o) candidatas.push({ ordem: o, origem: 'extra' })
    }
    avisar(0.05)
    let melhorCusto = Infinity
    melhorOrdem = atual
    origemSolucao = 'atual'
    candidatas.forEach((cand, idx) => {
      busca.usar(cand.ordem)
      busca.ativarTodos()
      busca.melhorar()
      const custo = busca.custo()
      if (custo < melhorCusto - 1e-9) {
        melhorCusto = custo
        melhorOrdem = busca.ordem()
        origemSolucao = cand.origem
      }
      avisar(0.05 + (0.25 * (idx + 1)) / candidatas.length)
    })
    // Busca local iterada.
    const total = p.iteracoes ?? iteracoesPadrao(K)
    const r = rng(p.semente ?? 20261125)
    busca.usar(melhorOrdem)
    for (; iteracoes < total && !parar(); iteracoes++) {
      busca.perturbar(r)
      busca.melhorar()
      const custo = busca.custo()
      if (custo < melhorCusto - 1e-9) {
        melhorCusto = custo
        melhorOrdem = busca.ordem()
      } else busca.usar(melhorOrdem)
      avisar(0.3 + (0.7 * (iteracoes + 1)) / total)
    }
  }
  if (p.cancelado?.()) throw new OtimizacaoCancelada()

  // De volta para visitas.
  const blocosFinais = [...(fixaInicio ? [fixaInicio] : []), ...melhorOrdem.map((k) => livres[k]!), ...(fixaFim ? [fixaFim] : [])]
  const nosFinais = blocosFinais.flatMap((b) => b.nos)
  const custoNos = (nos: readonly number[]) => {
    let t = 0, a = 0
    for (const no of nos) {
      t += arco(a, no)
      a = no
    }
    return t + (destino >= 0 ? arco(a, destino) : 0)
  }
  const totais = (nos: readonly number[]) => {
    let km = 0, min = 0, a = 0
    for (const no of [...nos, ...(destino >= 0 ? [destino] : [])]) {
      km += m.km[a]![no]!
      min += m.min[a]![no]!
      a = no
    }
    return { km, min: min + servico * nos.length }
  }
  let custoFinal = custoNos(nosFinais)
  const nosAtual = ids.map((id) => noDe.get(id)!)
  const custoAtual = custoNos(nosAtual)
  // "Nunca pior": se a ordem atual respeita as fixações e não é mais cara, ela fica.
  const respeita = (!fixaInicio || fixaInicio.nos.includes(nosAtual[0]!)) && (!fixaFim || fixaFim.nos.includes(nosAtual[nosAtual.length - 1]!))
  let final = nosFinais
  let mudou = true
  if (respeita && custoAtual <= custoFinal + 1e-9) {
    final = nosAtual
    custoFinal = custoAtual
    mudou = false
  }
  const ordem = final.map((no) => ids[no - 1]!)
  if (ordem.length !== n || new Set(ordem).size !== n) throw new Error('Falha interna: a ordem perdeu ou repetiu visitas.')
  const t = totais(final)
  const ta = totais(nosAtual)
  p.aoProgresso?.(1)
  return {
    ordem, criterio, km: t.km, min: t.min, kmAtual: ta.km, minAtual: ta.min, custo: custoFinal, custoAtual,
    melhorou: mudou && ordem.join('\u0000') !== ids.join('\u0000'), tipoMatriz: m.tipo, origemSolucao, iteracoes, ms: agora() - t0,
  }
}

/** Vizinho mais próximo a partir de S (índice K). */
function vizinhoMaisProximo(K: number, c: Float64Array, W: number): number[] {
  const livre = new Uint8Array(K).fill(1)
  const out: number[] = []
  let a = K
  for (let n = 0; n < K; n++) {
    let b = -1, bd = Infinity
    for (let v = 0; v < K; v++) if (livre[v] && c[a * W + v]! < bd) {
      bd = c[a * W + v]!
      b = v
    }
    livre[b] = 0
    out.push(b)
    a = b
  }
  return out
}

/** Inserção (mais barata ou do mais distante) com custo de inserção guardado por bloco (≈ O(K²)). */
function insercao(K: number, c: Float64Array, W: number, modo: 'barata' | 'distante'): number[] {
  const S = K, E = K + 1
  const prox = new Int32Array(W).fill(-1)
  prox[S] = E
  const cc = (a: number, b: number) => c[a * W + b]!
  const melhorCusto = new Float64Array(K)
  const melhorAnt = new Int32Array(K)
  const livre = new Uint8Array(K).fill(1)
  const recalcular = (v: number) => {
    let bc = Infinity, ba = S
    for (let a = S; a !== E; a = prox[a]!) {
      const b = prox[a]!
      const d = cc(a, v) + cc(v, b) - cc(a, b)
      if (d < bc) {
        bc = d
        ba = a
      }
    }
    melhorCusto[v] = bc
    melhorAnt[v] = ba
  }
  for (let v = 0; v < K; v++) recalcular(v)
  for (let n = 0; n < K; n++) {
    let u = -1
    for (let v = 0; v < K; v++) {
      if (!livre[v]) continue
      if (u < 0 || (modo === 'barata' ? melhorCusto[v]! < melhorCusto[u]! : melhorCusto[v]! > melhorCusto[u]!)) u = v
    }
    const a = melhorAnt[u]!, b = prox[a]!
    prox[a] = u
    prox[u] = b
    livre[u] = 0
    for (let v = 0; v < K; v++) {
      if (!livre[v]) continue
      if (melhorAnt[v] === a) recalcular(v)
      else {
        const d1 = cc(a, v) + cc(v, u) - cc(a, u)
        const d2 = cc(u, v) + cc(v, b) - cc(u, b)
        if (d1 < melhorCusto[v]!) {
          melhorCusto[v] = d1
          melhorAnt[v] = a
        }
        if (d2 < melhorCusto[v]!) {
          melhorCusto[v] = d2
          melhorAnt[v] = u
        }
      }
    }
  }
  const out: number[] = []
  for (let a = prox[S]!; a !== E; a = prox[a]!) out.push(a)
  return out
}
