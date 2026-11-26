// Acesso viário de cada parada (RB5, aprovada em 2026-11-26).
// - A coordenada ORIGINAL da entrega é preservada sempre (é a do pino e do Navegar).
// - Uma coordenada AUXILIAR de acesso (o ponto na via) é usada só no cálculo pelas ruas.
// - Encaixe progressivo: 25 → 50 → 100 → 200 m. Mais que 200 m só com a sua confirmação.
// - Sem via nem depois da confirmação, ou sem percurso válido: "pendente de revisão", com posicionamento manual.
//   Nunca é mandada automaticamente para o fim da rota.
import type { Coordenada, Encaixe } from './tipos'

export const RAIOS_ENCAIXE_M = [25, 50, 100, 200] as const
/** Raios oferecidos depois da sua confirmação (um de cada vez). */
export const RAIOS_COM_CONFIRMACAO_M = [350, 500, 1000] as const

export type SituacaoAcesso =
  | 'pendente' // ainda tentando nos raios automáticos
  | 'encaixado' // tem coordenada de acesso
  | 'confirmar' // nada até 200 m: precisa da sua confirmação para procurar mais longe
  | 'revisar' // sem acesso ou sem percurso: você posiciona na sequência

export interface AcessoViario {
  readonly original: Coordenada
  acesso: Coordenada | null
  distanciaM: number | null
  /** Último raio tentado. */
  raioM: number | null
  situacao: SituacaoAcesso
  /** Raio maior autorizado por você (só depois de 'confirmar'). */
  raioConfirmadoM?: number
  motivoRevisao?: 'sem-via' | 'sem-percurso'
}

export function novoAcesso(original: Coordenada): AcessoViario {
  return { original: { lat: original.lat, lon: original.lon }, acesso: null, distanciaM: null, raioM: null, situacao: 'pendente' }
}

/** Próximo raio para um ponto, ou null se não há tentativa automática a fazer. */
export function proximoRaio(a: AcessoViario): number | null {
  if (a.situacao === 'pendente') {
    const i = a.raioM === null ? 0 : RAIOS_ENCAIXE_M.indexOf(a.raioM as (typeof RAIOS_ENCAIXE_M)[number]) + 1
    return i < RAIOS_ENCAIXE_M.length ? RAIOS_ENCAIXE_M[i]! : null
  }
  if (a.situacao === 'confirmar' && a.raioConfirmadoM && a.raioConfirmadoM !== a.raioM) return a.raioConfirmadoM
  return null
}

/** Agrupa os pontos que precisam de encaixe pelo próximo raio (um pedido por raio). */
export function planejarEncaixe(acessos: readonly AcessoViario[]): { raioM: number; indices: number[] }[] {
  const porRaio = new Map<number, number[]>()
  acessos.forEach((a, i) => {
    const r = proximoRaio(a)
    if (r !== null) porRaio.set(r, [...(porRaio.get(r) ?? []), i])
  })
  return [...porRaio.entries()].sort((x, y) => x[0] - y[0]).map(([raioM, indices]) => ({ raioM, indices }))
}

/** Aplica o resultado de um pedido de encaixe (mesma ordem de `indices`). Não altera a coordenada original. */
export function aplicarEncaixe(acessos: AcessoViario[], indices: readonly number[], raioM: number, resultados: readonly (Encaixe | null)[]) {
  if (resultados.length !== indices.length) throw new Error('Resposta de encaixe com quantidade diferente do pedido.')
  indices.forEach((idx, k) => {
    const a = acessos[idx]!
    const r = resultados[k]
    a.raioM = raioM
    if (r && r.distanciaM <= raioM + 1) {
      a.acesso = { lat: r.acesso.lat, lon: r.acesso.lon }
      a.distanciaM = r.distanciaM
      a.situacao = 'encaixado'
      return
    }
    if (a.situacao === 'pendente') a.situacao = raioM >= RAIOS_ENCAIXE_M[RAIOS_ENCAIXE_M.length - 1]! ? 'confirmar' : 'pendente'
    else if (a.situacao === 'confirmar' && a.raioConfirmadoM === raioM) {
      a.situacao = 'revisar'
      a.motivoRevisao = 'sem-via'
    }
  })
}

/** Você autorizou procurar mais longe (só para pontos em 'confirmar'). */
export function confirmarRaioMaior(a: AcessoViario, raioM: (typeof RAIOS_COM_CONFIRMACAO_M)[number]) {
  if (a.situacao !== 'confirmar') throw new Error('Só pontos aguardando confirmação podem usar raio maior.')
  a.raioConfirmadoM = raioM
}

/** Você recusou procurar mais longe: a parada fica para revisão (posicionamento manual). */
export function recusarRaioMaior(a: AcessoViario) {
  if (a.situacao !== 'confirmar') return
  a.situacao = 'revisar'
  a.motivoRevisao = 'sem-via'
}

/** Encaixada, mas sem percurso válido de/para as outras (matriz): vai para revisão. */
export function marcarSemPercurso(a: AcessoViario) {
  a.situacao = 'revisar'
  a.motivoRevisao = 'sem-percurso'
}

/** Ponto que vai para o cálculo pelas ruas (acesso viário), ou null se não entra (confirmar/revisar). */
export function pontoDeCalculo(a: AcessoViario): Coordenada | null {
  return a.situacao === 'encaixado' && a.acesso ? a.acesso : null
}
