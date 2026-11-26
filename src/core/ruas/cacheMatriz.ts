// Cache local da matriz pelas ruas (RB-2), UM registro por rota (finalidade = esta rota): guardado na tabela
// distanceCache do aparelho e apagado junto com a rota ao finalizar, encerrar ou excluir (regra da Etapa 3).
// Validade máxima de 7 dias; só vale para o mesmo provedor, perfil de veículo e versão dos dados do mapa.
// Guarda: acessos viários (por coordenada original) e os pares já recebidos (por coordenada de acesso, com sentido).
// Não guarda endereços, códigos, nomes de ruas nem a sua posição como "origem" (só como mais um ponto de acesso).
import { chaveCoordenada, entradaValida, VALIDADE_CACHE_MS } from './cache'
import type { AcessoViario } from './encaixe'
import type { MontagemMatriz } from './montagem'
import type { Coordenada, IdProvedor, PerfilVeiculo } from './tipos'

export interface MatrizGuardada {
  versao: 1
  provedor: IdProvedor
  perfil: PerfilVeiculo
  versaoDados: string
  criadoEm: number
  /** Acesso viário encaixado, por coordenada ORIGINAL (só os encaixados; revisão/confirmação são refeitos). */
  acessos: Record<string, { lat: number; lon: number; distanciaM: number; raioM: number; semVia?: boolean }>
  /** Pontos de acesso (chaves) e a matriz n × n: min/km; NaN = não conhecido; Infinity = sem percurso. */
  pontos: string[]
  min: number[]
  km: number[]
}

/** Máximo de pontos guardados (500 paradas + origens de reotimizações). Acima disso, recomeça. */
const MAX_PONTOS = 700

export class CacheMatriz {
  private idx = new Map<string, number>()
  private pontos: string[] = []
  private min: number[] = []
  private km: number[] = []
  acessos: MatrizGuardada['acessos'] = {}
  versaoDados = ''
  criadoEm: number

  constructor(
    readonly provedor: IdProvedor,
    readonly perfil: PerfilVeiculo,
    agora: number,
    g?: MatrizGuardada,
  ) {
    this.criadoEm = agora
    if (!g) return
    this.criadoEm = g.criadoEm
    this.versaoDados = g.versaoDados
    this.acessos = { ...g.acessos }
    this.pontos = [...g.pontos]
    this.pontos.forEach((p, i) => this.idx.set(p, i))
    this.min = [...g.min]
    this.km = [...g.km]
  }

  /** Lê um registro guardado; inválido (outro provedor/perfil, vencido, formato) = cache vazio. */
  static abrir(dados: unknown, provedor: IdProvedor, perfil: PerfilVeiculo, agora: number): CacheMatriz {
    const g = dados as MatrizGuardada | null | undefined
    const formatoOk = !!g && g.versao === 1 && Array.isArray(g.pontos) && Array.isArray(g.min) && g.min.length === g.pontos.length ** 2 && g.km?.length === g.min.length
    const valido = formatoOk && entradaValida({ valor: 0, provedor: g!.provedor, perfil: g!.perfil, versaoDados: g!.versaoDados, criadoEm: g!.criadoEm }, { provedor, perfil, agora, validadeMs: VALIDADE_CACHE_MS })
    return new CacheMatriz(provedor, perfil, agora, valido ? g! : undefined)
  }

  get tamanho() {
    return this.pontos.length
  }

  acessoConhecido(original: Coordenada): AcessoViario | undefined {
    const a = this.acessos[chaveCoordenada(original)]
    if (!a) return undefined
    // Sem rua até 200 m: não repete as tentativas automáticas (continua aguardando a sua confirmação).
    if (a.semVia) return { original: { lat: original.lat, lon: original.lon }, acesso: null, distanciaM: null, raioM: a.raioM, situacao: 'confirmar' }
    return { original: { lat: original.lat, lon: original.lon }, acesso: { lat: a.lat, lon: a.lon }, distanciaM: a.distanciaM, raioM: a.raioM, situacao: 'encaixado' }
  }

  /** Copia para a montagem os pares já conhecidos entre os pontos de cálculo. */
  preencher(m: MontagemMatriz, coords: readonly Coordenada[]) {
    const N = this.pontos.length
    const g = coords.map((c) => this.idx.get(chaveCoordenada(c)))
    for (let i = 0; i < coords.length; i++) {
      const a = g[i]
      if (a === undefined) continue
      for (let j = 0; j < coords.length; j++) {
        const b = g[j]
        if (b === undefined || i === j) continue
        const v = this.min[a * N + b]
        if (v === undefined || Number.isNaN(v) || v === null) continue
        m.copiar(i, j, v, this.km[a * N + b]!)
      }
    }
    if (this.versaoDados) m.versaoDados = this.versaoDados
  }

  /** Junta ao cache o que a montagem recebeu (só valores vindos do provedor; nada estimado nem "não usado"). */
  atualizar(m: MontagemMatriz, coords: readonly Coordenada[], acessos: readonly AcessoViario[]) {
    if (m.versaoDados && this.versaoDados && m.versaoDados !== this.versaoDados) this.limpar()
    if (m.versaoDados) this.versaoDados = m.versaoDados
    for (const a of acessos)
      if (a.situacao === 'encaixado' && a.acesso) this.acessos[chaveCoordenada(a.original)] = { lat: a.acesso.lat, lon: a.acesso.lon, distanciaM: a.distanciaM ?? 0, raioM: a.raioM ?? 0 }
      else if (a.situacao === 'confirmar' && !a.raioConfirmadoM) this.acessos[chaveCoordenada(a.original)] = { lat: 0, lon: 0, distanciaM: 0, raioM: a.raioM ?? 200, semVia: true }
    const novos = coords.map((c) => chaveCoordenada(c)).filter((k) => !this.idx.has(k))
    if (this.pontos.length + novos.length > MAX_PONTOS) this.limpar()
    const antigo = this.pontos.length
    for (const k of coords.map((c) => chaveCoordenada(c))) {
      if (this.idx.has(k)) continue
      this.idx.set(k, this.pontos.length)
      this.pontos.push(k)
    }
    const N = this.pontos.length
    if (N !== antigo) {
      const min = new Array<number>(N * N).fill(NaN)
      const km = new Array<number>(N * N).fill(NaN)
      for (let i = 0; i < antigo; i++)
        for (let j = 0; j < antigo; j++) {
          min[i * N + j] = this.min[i * antigo + j]!
          km[i * N + j] = this.km[i * antigo + j]!
        }
      for (let i = 0; i < N; i++) min[i * N + i] = km[i * N + i] = 0
      this.min = min
      this.km = km
    }
    const g = coords.map((c) => this.idx.get(chaveCoordenada(c))!)
    for (let i = 0; i < coords.length; i++)
      for (let j = 0; j < coords.length; j++) {
        if (i === j) continue
        const k = i * m.n + j
        if (m.estimado[k] !== 0) continue
        const v = m.min[k]!
        if (Number.isNaN(v)) continue
        this.min[g[i]! * N + g[j]!] = v
        this.km[g[i]! * N + g[j]!] = m.km[k]!
      }
  }

  limpar() {
    this.idx.clear()
    this.pontos = []
    this.min = []
    this.km = []
    this.acessos = {}
    this.versaoDados = ''
  }

  serializar(): MatrizGuardada {
    return { versao: 1, provedor: this.provedor, perfil: this.perfil, versaoDados: this.versaoDados, criadoEm: this.criadoEm, acessos: { ...this.acessos }, pontos: [...this.pontos], min: [...this.min], km: [...this.km] }
  }
}
