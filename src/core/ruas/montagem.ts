// Montagem da matriz pelas ruas a partir dos blocos recebidos (na ordem em que chegarem, com retomada).
// Células: desconhecida (NaN) · com percurso · SEM percurso (null do provedor) · estimada (RB4, offline, rotulada).
// Nunca preenche par desconhecido ou sem percurso com linha reta.
import type { Matriz } from '../otimizacao/matriz'
import type { BlocoMatriz } from './tipos'

/** Custo de um par sem percurso para o motor: proibitivo, mas finito (o motor só aceita números). */
export const CUSTO_PROIBIDO_MIN = 100_000
export const CUSTO_PROIBIDO_KM = 10_000

export class MontagemMatriz {
  /** Tempo (min) e distância (km); NaN = ainda não recebido; Infinity = sem percurso. */
  readonly min: Float64Array
  readonly km: Float64Array
  /** 1 = valor estimado (não veio do provedor); 2 = não usado (volta à origem com término livre). */
  readonly estimado: Uint8Array
  versaoDados?: string

  constructor(readonly n: number) {
    this.min = new Float64Array(n * n).fill(NaN)
    this.km = new Float64Array(n * n).fill(NaN)
    this.estimado = new Uint8Array(n * n)
    for (let i = 0; i < n; i++) {
      this.min[i * n + i] = 0
      this.km[i * n + i] = 0
    }
  }

  aplicar(b: BlocoMatriz) {
    if (b.versaoDados) {
      if (this.versaoDados && this.versaoDados !== b.versaoDados) throw new Error('Os dados do mapa mudaram no meio do download: refazer a matriz.')
      this.versaoDados = b.versaoDados
    }
    b.origens.forEach((i, a) =>
      b.destinos.forEach((j, c) => {
        const s = b.segundos[a]?.[c]
        const m = b.metros[a]?.[c]
        const k = i * this.n + j
        if (i === j) return
        if (s === null || m === null || s === undefined || m === undefined) {
          this.min[k] = Infinity
          this.km[k] = Infinity
        } else {
          if (!Number.isFinite(s) || !Number.isFinite(m) || s < 0 || m < 0) throw new Error('Valor inválido na matriz recebida.')
          this.min[k] = s / 60
          this.km[k] = m / 1000
        }
        this.estimado[k] = 0
      }),
    )
  }

  /** Preenche UM par com estimativa (RB4: 1º trecho offline). Fica marcado como estimado. */
  estimar(i: number, j: number, km: number, min: number) {
    const k = i * this.n + j
    this.km[k] = km
    this.min[k] = min
    this.estimado[k] = 1
  }

  /**
   * Término livre: os trechos parada → origem nunca são usados pelo motor. Não são pedidos ao provedor;
   * ficam com 0 só para a matriz ficar completa (marcados como "não usado", fora de proibidos e estimados).
   */
  dispensarVoltaAoInicio() {
    for (let i = 1; i < this.n; i++) {
      const k = i * this.n
      if (Number.isNaN(this.min[k]!)) {
        this.min[k] = 0
        this.km[k] = 0
        this.estimado[k] = 2
      }
    }
  }

  conhecido(i: number, j: number) {
    return !Number.isNaN(this.min[i * this.n + j]!)
  }

  faltantes(): number {
    let f = 0
    for (let k = 0; k < this.n * this.n; k++) if (Number.isNaN(this.min[k]!)) f++
    return f
  }

  /** Pares sem percurso (null do provedor). */
  semPercurso(): [number, number][] {
    const out: [number, number][] = []
    for (let i = 0; i < this.n; i++) for (let j = 0; j < this.n; j++) if (this.min[i * this.n + j] === Infinity) out.push([i, j])
    return out
  }

  /** Pontos que não têm percurso nem de ida nem de volta para nenhum outro (candidatos a "pendente de revisão"). */
  isolados(pontos: readonly number[] = Array.from({ length: this.n }, (_, i) => i)): number[] {
    return pontos.filter((i) => pontos.every((j) => j === i || (this.min[i * this.n + j] === Infinity && this.min[j * this.n + i] === Infinity)))
  }

  /**
   * Paradas que formam, com a origem, um conjunto em que dá para ir de qualquer uma a qualquer outra pelas ruas
   * (o maior componente fortemente conexo alcançável a partir da origem). As demais (só se chega e não se sai, ou
   * vice-versa — mão única sem saída, ilha de dados) não entram no cálculo: vão para revisão (RB5), sem ir para o fim.
   */
  componentePrincipal(): { dentro: number[]; fora: number[] } {
    const n = this.n
    const ok = (i: number, j: number) => i !== j && Number.isFinite(this.min[i * n + j]!) && this.estimado[i * n + j] !== 2
    // Kosaraju sobre as paradas 1..n-1.
    const ordem: number[] = []
    const visto = new Uint8Array(n)
    for (let r = 1; r < n; r++) {
      if (visto[r]) continue
      const pilha: [number, number][] = [[r, 1]]
      visto[r] = 1
      while (pilha.length) {
        const topo = pilha[pilha.length - 1]!
        const [v] = topo
        let avancou = false
        for (let j = topo[1]; j < n; j++) {
          topo[1] = j + 1
          if (!visto[j] && ok(v, j)) {
            visto[j] = 1
            pilha.push([j, 1])
            avancou = true
            break
          }
        }
        if (!avancou) {
          ordem.push(v)
          pilha.pop()
        }
      }
    }
    const comp = new Int32Array(n).fill(-1)
    let nc = 0
    for (let k = ordem.length - 1; k >= 0; k--) {
      const r = ordem[k]!
      if (comp[r]! >= 0) continue
      const fila = [r]
      comp[r] = nc
      while (fila.length) {
        const v = fila.pop()!
        for (let j = 1; j < n; j++) if (comp[j]! < 0 && ok(j, v)) {
          comp[j] = nc
          fila.push(j)
        }
      }
      nc++
    }
    const tamanho = new Int32Array(nc)
    const alcancavel = new Uint8Array(nc)
    for (let j = 1; j < n; j++) if (ok(0, j)) alcancavel[comp[j]!] = 1
    for (let j = 1; j < n; j++) if (alcancavel[comp[j]!]) tamanho[comp[j]!]!++
    let melhor = -1
    for (let c = 0; c < nc; c++) if (tamanho[c]! > 0 && (melhor < 0 || tamanho[c]! > tamanho[melhor]!)) melhor = c
    const dentro: number[] = []
    const fora: number[] = []
    for (let j = 1; j < n; j++) (comp[j] === melhor ? dentro : fora).push(j)
    return { dentro, fora }
  }

  /**
   * Matriz para o motor, restrita aos `pontos` (o 1º é a origem). Exige que tudo esteja conhecido.
   * Sem percurso → custo proibitivo (o motor evita; se a ordem final usar um, a tela avisa).
   */
  paraMotor(pontos: readonly number[]): { matriz: Matriz; proibidos: [number, number][]; estimados: [number, number][] } {
    const proibidos: [number, number][] = []
    const estimados: [number, number][] = []
    const km: number[][] = []
    const min: number[][] = []
    pontos.forEach((i, a) => {
      km.push([])
      min.push([])
      pontos.forEach((j, c) => {
        const k = i * this.n + j
        const vm = this.min[k]!
        if (Number.isNaN(vm)) throw new Error('Matriz incompleta: ainda há pares não recebidos.')
        if (vm === Infinity) {
          proibidos.push([a, c])
          km[a]!.push(CUSTO_PROIBIDO_KM)
          min[a]!.push(CUSTO_PROIBIDO_MIN)
        } else {
          if (this.estimado[k] === 1) estimados.push([a, c])
          km[a]!.push(this.km[k]!)
          min[a]!.push(vm)
        }
      })
    })
    return { matriz: { km, min, tipo: 'ruas' }, proibidos, estimados }
  }

  /** Bytes ocupados (para o relatório de memória). */
  get bytes() {
    return this.min.byteLength + this.km.byteLength + this.estimado.byteLength
  }
}

/**
 * Trechos SEM percurso usados por uma sequência (posições na matriz do motor, 0 = origem).
 * A ordem só pode ser oferecida pelas ruas se o resultado for vazio; senão a tela avisa e nada muda sozinho.
 */
export function trechosSemPercurso(sequencia: readonly number[], proibidos: readonly [number, number][]): [number, number][] {
  const p = new Set(proibidos.map(([a, b]) => `${a}>${b}`))
  const out: [number, number][] = []
  for (let k = 0; k + 1 < sequencia.length; k++) if (p.has(`${sequencia[k]}>${sequencia[k + 1]}`)) out.push([sequencia[k]!, sequencia[k + 1]!])
  return out
}
