// Malha viária SINTÉTICA (fictícia) com regras de trânsito, para testar o caminho completo da R-B sem provedor real:
// mão única, quarteirões sem passagem, vias SEM ACESSO para carro (privadas) e CONVERSÕES PROIBIDAS (à esquerda e
// retorno em certos cruzamentos). O caminho mínimo é calculado sobre estados (cruzamento, sentido de chegada), então
// uma conversão proibida realmente obriga a dar a volta. Nada aqui vem de dados reais. Centro fictício no cerrado.
import type { Coordenada } from '../tipos'

export interface OpcoesMalha {
  lado?: number
  semente?: number
  /** Fração de ruas locais em mão única. */
  maoUnica?: number
  /** Fração de quarteirões sem passagem. */
  semPassagem?: number
  /** Fração de ruas sem acesso para carro (privadas, só pedestres). */
  semAcesso?: number
  /** Fração de cruzamentos com conversão à esquerda e retorno proibidos. */
  conversoesProibidas?: number
  /** Áreas de 7 × 7 quarteirões sem nenhuma via (ex.: fazenda, condomínio fechado), para testar o encaixe. */
  areasSemVia?: number
}

/** Direção de deslocamento na grade: 0 leste, 1 sul, 2 oeste, 3 norte (y cresce para o sul). */
type Dir = 0 | 1 | 2 | 3
interface Aresta {
  para: number
  dir: Dir
  metros: number
  segundos: number
}

const CENTRO = { lat: -15.9, lon: -48.3 } // fictício
const PASSO_M = 100
const M_POR_GRAU_LAT = 111_320

export class MalhaViaria {
  readonly lado: number
  readonly arestas: Aresta[][]
  /** Cruzamentos com conversão à esquerda e retorno proibidos. */
  readonly proibeConversao: Uint8Array
  /** Nós que têm pelo menos uma via para carro (onde dá para encaixar). */
  readonly usavel: Uint8Array
  /** Centros das áreas sem via (em quarteirões). */
  readonly areas: [number, number][] = []
  private readonly r: () => number

  constructor(o: OpcoesMalha = {}) {
    const lado = (this.lado = o.lado ?? 60)
    let s = (o.semente ?? 1) >>> 0 || 1
    this.r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
    const r = this.r
    const N = lado * lado
    this.arestas = Array.from({ length: N }, () => [])
    this.proibeConversao = new Uint8Array(N)
    this.usavel = new Uint8Array(N)
    const maoUnica = o.maoUnica ?? 0.35
    const semPassagem = o.semPassagem ?? 0.06
    const semAcesso = o.semAcesso ?? 0.03
    const via = (a: number, b: number, dir: Dir, kmh: number) => {
      this.arestas[a]!.push({ para: b, dir, metros: PASSO_M, segundos: (PASSO_M / 1000 / kmh) * 3600 })
      this.usavel[a] = 1
      this.usavel[b] = 1
    }
    for (let k = 0; k < (o.areasSemVia ?? 0); k++) this.areas.push([10 + Math.floor(r() * (lado - 20)), 10 + Math.floor(r() * (lado - 20))])
    const naArea = (v: number) => this.areas.some(([cx, cy]) => Math.abs((v % lado) - cx) <= 3 && Math.abs(Math.floor(v / lado) - cy) <= 3)
    const ligar = (a: number, b: number, dirAB: Dir, avenida: boolean) => {
      if (naArea(a) || naArea(b)) return
      const kmh = avenida ? 40 : 22
      const dirBA = ((dirAB + 2) % 4) as Dir
      if (!avenida && r() < semPassagem + semAcesso) return // sem passagem ou só pedestres: não existe para carro
      if (!avenida && r() < maoUnica) return r() < 0.5 ? via(a, b, dirAB, kmh) : via(b, a, dirBA, kmh)
      via(a, b, dirAB, kmh)
      via(b, a, dirBA, kmh)
    }
    for (let y = 0; y < lado; y++)
      for (let x = 0; x < lado; x++) {
        const v = y * lado + x
        if (x + 1 < lado) ligar(v, v + 1, 0, y % 8 === 0)
        if (y + 1 < lado) ligar(v, v + lado, 1, x % 8 === 0)
        if (r() < (o.conversoesProibidas ?? 0.15)) this.proibeConversao[v] = 1
      }
  }

  coordenada(no: number): Coordenada {
    const x = no % this.lado
    const y = Math.floor(no / this.lado)
    const dLat = -(y - this.lado / 2) * PASSO_M / M_POR_GRAU_LAT
    const dLon = ((x - this.lado / 2) * PASSO_M) / (M_POR_GRAU_LAT * Math.cos((CENTRO.lat * Math.PI) / 180))
    return { lat: CENTRO.lat + dLat, lon: CENTRO.lon + dLon }
  }

  /** Posição contínua (em "quarteirões") de uma coordenada. */
  grade(c: Coordenada): [number, number] {
    const x = ((c.lon - CENTRO.lon) * M_POR_GRAU_LAT * Math.cos((CENTRO.lat * Math.PI) / 180)) / PASSO_M + this.lado / 2
    const y = (-(c.lat - CENTRO.lat) * M_POR_GRAU_LAT) / PASSO_M + this.lado / 2
    return [x, y]
  }

  /** Cruzamento com via de carro mais próximo, até raioM. */
  encaixar(c: Coordenada, raioM: number): { no: number; distanciaM: number } | null {
    const [gx, gy] = this.grade(c)
    const alcance = Math.ceil(raioM / PASSO_M) + 1
    let melhor: { no: number; distanciaM: number } | null = null
    for (let y = Math.max(0, Math.floor(gy) - alcance); y <= Math.min(this.lado - 1, Math.ceil(gy) + alcance); y++)
      for (let x = Math.max(0, Math.floor(gx) - alcance); x <= Math.min(this.lado - 1, Math.ceil(gx) + alcance); x++) {
        const no = y * this.lado + x
        if (!this.usavel[no]) continue
        const d = Math.hypot(x - gx, y - gy) * PASSO_M
        if (d <= raioM && (!melhor || d < melhor.distanciaM)) melhor = { no, distanciaM: d }
      }
    return melhor
  }

  /** Conversão permitida ao chegar em `no` vindo na direção `chegada` e sair na direção `saida`? */
  permitida(no: number, chegada: Dir | 4, saida: Dir): boolean {
    if (chegada === 4) return true
    const retorno = saida === (chegada + 2) % 4
    if (retorno) return this.arestas[no]!.length === 1 // retorno só em rua sem saída
    if (!this.proibeConversao[no]) return true
    return saida !== (chegada + 3) % 4 // esquerda proibida
  }

  /**
   * Caminhos mínimos (por tempo) de `origem` a todos os nós, respeitando as conversões. Estado = no*5 + chegada.
   * Devolve, por nó, o melhor tempo/distância e o estado final (para reconstruir o traçado).
   */
  caminhos(origem: number) {
    const S = this.lado * this.lado * 5
    const t = new Float64Array(S).fill(Infinity)
    const m = new Float64Array(S)
    const ant = new Int32Array(S).fill(-1)
    const inicio = origem * 5 + 4
    t[inicio] = 0
    const heap: number[] = [inicio]
    const menor = (a: number, b: number) => t[heap[a]!]! < t[heap[b]!]!
    const subir = (k: number) => {
      while (k > 0) {
        const p = (k - 1) >> 1
        if (!menor(k, p)) break
        ;[heap[k], heap[p]] = [heap[p]!, heap[k]!]
        k = p
      }
    }
    const descer = (k: number) => {
      for (;;) {
        const a = 2 * k + 1, b = a + 1
        let x = k
        if (a < heap.length && menor(a, x)) x = a
        if (b < heap.length && menor(b, x)) x = b
        if (x === k) return
        ;[heap[k], heap[x]] = [heap[x]!, heap[k]!]
        k = x
      }
    }
    const visto = new Uint8Array(S)
    while (heap.length) {
      const e = heap[0]!
      const ult = heap.pop()!
      if (heap.length) {
        heap[0] = ult
        descer(0)
      }
      if (visto[e]) continue
      visto[e] = 1
      const no = Math.floor(e / 5)
      const chegada = (e % 5) as Dir | 4
      for (const a of this.arestas[no]!) {
        if (!this.permitida(no, chegada, a.dir)) continue
        const f = a.para * 5 + a.dir
        const nt = t[e]! + a.segundos
        if (nt < t[f]!) {
          t[f] = nt
          m[f] = m[e]! + a.metros
          ant[f] = e
          heap.push(f)
          subir(heap.length - 1)
        }
      }
    }
    const N = this.lado * this.lado
    const melhorT = new Float64Array(N).fill(Infinity)
    const melhorM = new Float64Array(N)
    const estado = new Int32Array(N).fill(-1)
    for (let e = 0; e < S; e++) {
      const no = Math.floor(e / 5)
      if (t[e]! < melhorT[no]!) {
        melhorT[no] = t[e]!
        melhorM[no] = m[e]!
        estado[no] = e
      }
    }
    return {
      segundos: melhorT,
      metros: melhorM,
      /** Sequência de nós de `origem` até `destino` (vazia se não há caminho). */
      trajeto: (destino: number): number[] => {
        let e = estado[destino]!
        if (e < 0) return []
        const nos: number[] = []
        while (e >= 0) {
          nos.push(Math.floor(e / 5))
          e = ant[e]!
        }
        return nos.reverse()
      },
    }
  }

  /** Pontos de entrega fictícios: perto de cruzamentos (0–60 m fora da via); uma fração no meio das áreas sem via. */
  pontosDeEntrega(n: number, foraDaMalha = 0.02): Coordenada[] {
    const r = this.r
    const nb = Math.max(3, Math.floor(n / 40))
    const centros = Array.from({ length: nb }, () => [6 + r() * (this.lado - 12), 6 + r() * (this.lado - 12)] as const)
    const pts: Coordenada[] = []
    while (pts.length < n) {
      if (this.areas.length && r() < foraDaMalha) {
        const [cx, cy] = this.areas[Math.floor(r() * this.areas.length)]!
        pts.push(this.coordenadaContinua(cx + (r() - 0.5) * 0.4, cy + (r() - 0.5) * 0.4))
        continue
      }
      const c = centros[Math.floor(r() * nb)]!
      const gx = Math.round(Math.min(this.lado - 1, Math.max(0, c[0] + (r() - 0.5) * 14)))
      const gy = Math.round(Math.min(this.lado - 1, Math.max(0, c[1] + (r() - 0.5) * 14)))
      const off = r() * 0.6 // até 60 m da esquina
      const ang = r() * 2 * Math.PI
      pts.push(this.coordenadaContinua(gx + Math.cos(ang) * off, gy + Math.sin(ang) * off))
    }
    return pts
  }

  coordenadaContinua(gx: number, gy: number): Coordenada {
    const dLat = (-(gy - this.lado / 2) * PASSO_M) / M_POR_GRAU_LAT
    const dLon = ((gx - this.lado / 2) * PASSO_M) / (M_POR_GRAU_LAT * Math.cos((CENTRO.lat * Math.PI) / 180))
    return { lat: CENTRO.lat + dLat, lon: CENTRO.lon + dLon }
  }
}
