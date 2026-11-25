// Motor de otimização próprio (F2). Inspirado nas FUNCIONALIDADES observadas no Spoke e no Optiroute
// (reotimizar só pendentes, preservar concluídas, fixar primeira/última, agrupar), sem código, API nem
// algoritmo deles. Regras do RotaVHS: só reordena visitas; nunca cria, une, remove ou renumera paradas;
// nunca devolve ordem pior que a atual pelo mesmo modelo; a ordem só é aplicada com o toque do usuário.
//
// Algoritmo: blocos (visitas do mesmo endereço confirmado andam juntas) → inserção mais barata →
// melhoria local (Or-opt de 1–3 blocos e inversão de trechos, com custo calculado nos dois sentidos,
// porque a matriz pode ser assimétrica) → comparação com a ordem atual. Determinístico.
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

export interface PedidoOtimizacao {
  /** Só as visitas PENDENTES, na ordem atual. As concluídas nunca entram. */
  visitas: readonly VisitaOtimizacao[]
  /** true = o nó 0 da matriz é o ponto de partida (posição atual ou outro). */
  comOrigem: boolean
  /** Tamanho = visitas (+1 se comOrigem). */
  matriz: Matriz
  criterio: Criterio
  fixas?: { primeira?: string; ultima?: string }
  /** Minutos parados em cada visita (padrão 2). */
  servicoMin?: number
  /** Limite de tempo da melhoria, em ms (padrão 600). */
  limiteMs?: number
  agora?: () => number
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
}

/**
 * Custo de um trecho i→j em cada critério. Pesos do "inteligente" e do "combustível" são do modelo
 * (calibração em campo na F9) e sempre apresentados como estimativa.
 */
export function custoArco(m: Matriz, i: number, j: number, c: Criterio): number {
  const km = m.km[i]![j]!
  const min = m.min[i]![j]!
  switch (c) {
    case 'tempo':
      return min
    case 'distancia':
      return km
    case 'combustivel':
      // Distância + parte do tempo (marcha lenta e arrancadas em trânsito lento).
      return km + 0.02 * min
    case 'inteligente':
      // Equilíbrio entre tempo e distância: 1 km "vale" 1,5 min.
      return min + 1.5 * km
  }
}

interface Bloco {
  nos: number[] // índices na matriz, na ordem interna
  fixo?: 'primeira' | 'ultima'
}

function custoSeq(blocos: readonly Bloco[], m: Matriz, c: Criterio, origem: number | null): number {
  let t = 0
  let ant = origem
  for (const b of blocos) {
    for (const no of b.nos) {
      if (ant !== null) t += custoArco(m, ant, no, c)
      ant = no
    }
  }
  return t
}

function totais(nos: readonly number[], m: Matriz, origem: number | null, servico: number) {
  let km = 0
  let min = 0
  let ant = origem
  for (const no of nos) {
    if (ant !== null) {
      km += m.km[ant]![no]!
      min += m.min[ant]![no]!
    }
    ant = no
  }
  return { km, min: min + servico * nos.length }
}

export function otimizar(p: PedidoOtimizacao): ResultadoOtimizacao {
  const servico = p.servicoMin ?? 2
  const agora = p.agora ?? (() => Date.now())
  const fim = agora() + (p.limiteMs ?? 600)
  const desloc = p.comOrigem ? 1 : 0
  const origem = p.comOrigem ? 0 : null
  const n = p.visitas.length
  const esperado = n + desloc
  if (p.matriz.km.length !== esperado) throw new Error(`Matriz com ${p.matriz.km.length} nós; esperado ${esperado}.`)
  const noDe = new Map(p.visitas.map((v, i) => [v.id, i + desloc]))
  const idDe = (no: number) => p.visitas[no - desloc]!.id

  // Blocos: visitas do mesmo grupo, na ordem atual (a primeira aparição define a posição do bloco).
  const blocos: Bloco[] = []
  const porGrupo = new Map<string, Bloco>()
  for (const v of p.visitas) {
    const no = noDe.get(v.id)!
    if (v.grupo) {
      const b = porGrupo.get(v.grupo)
      if (b) {
        b.nos.push(no)
        continue
      }
      const novo: Bloco = { nos: [no] }
      porGrupo.set(v.grupo, novo)
      blocos.push(novo)
    } else blocos.push({ nos: [no] })
  }
  const blocoDe = (id?: string) => (id === undefined ? undefined : blocos.find((b) => b.nos.includes(noDe.get(id) ?? -1)))
  const primeira = blocoDe(p.fixas?.primeira)
  const ultima = blocoDe(p.fixas?.ultima)
  if (primeira) primeira.fixo = 'primeira'
  if (ultima && ultima !== primeira) ultima.fixo = 'ultima'

  // Ordem atual exatamente como está (cada visita no seu lugar): é a referência do "nunca pior".
  const atual: Bloco[] = p.visitas.map((v) => ({ nos: [noDe.get(v.id)!] }))
  const custoAtual = custoSeq(atual, p.matriz, p.criterio, origem)
  const idsAtual = p.visitas.map((v) => v.id)

  // Inserção mais barata dos blocos livres entre a primeira (fixa) e a última (fixa).
  const livres = blocos.filter((b) => !b.fixo)
  const cab = primeira ? [primeira] : []
  const cauda = ultima && ultima !== primeira ? [ultima] : []
  let meio: Bloco[] = []
  for (const b of livres) {
    let melhorPos = 0
    let melhor = Infinity
    for (let pos = 0; pos <= meio.length; pos++) {
      const tentativa = [...cab, ...meio.slice(0, pos), b, ...meio.slice(pos), ...cauda]
      const c = custoSeq(tentativa, p.matriz, p.criterio, origem)
      if (c < melhor - 1e-12) {
        melhor = c
        melhorPos = pos
      }
      if (agora() > fim && pos > 0) break
    }
    meio.splice(melhorPos, 0, b)
  }

  // Melhoria local no meio (cabeça e cauda fixas).
  const total = (x: Bloco[]) => custoSeq([...cab, ...x, ...cauda], p.matriz, p.criterio, origem)
  let custo = total(meio)
  let melhorou = true
  let voltas = 0
  while (melhorou && voltas++ < 50 && agora() < fim) {
    melhorou = false
    // Or-opt: move trechos de 1 a 3 blocos para outra posição.
    for (let tam = 1; tam <= 3 && !melhorou; tam++) {
      for (let i = 0; i + tam <= meio.length && agora() < fim; i++) {
        const trecho = meio.slice(i, i + tam)
        const resto = [...meio.slice(0, i), ...meio.slice(i + tam)]
        for (let pos = 0; pos <= resto.length; pos++) {
          if (pos === i) continue
          const nova = [...resto.slice(0, pos), ...trecho, ...resto.slice(pos)]
          const c = total(nova)
          if (c < custo - 1e-9) {
            meio = nova
            custo = c
            melhorou = true
            break
          }
        }
        if (melhorou) break
      }
    }
    // Inversão de trechos (2-opt), avaliada pelo custo completo (vale para matriz assimétrica).
    for (let i = 0; i < meio.length - 1 && !melhorou && agora() < fim; i++) {
      for (let k = i + 1; k < meio.length; k++) {
        const nova = [...meio.slice(0, i), ...meio.slice(i, k + 1).reverse(), ...meio.slice(k + 1)]
        const c = total(nova)
        if (c < custo - 1e-9) {
          meio = nova
          custo = c
          melhorou = true
          break
        }
      }
    }
  }

  let final = [...cab, ...meio, ...cauda]
  let custoFinal = custoSeq(final, p.matriz, p.criterio, origem)
  // Com primeira/última fixadas, a ordem atual só vale como referência se também respeitar as fixações.
  const naPonta = (b: Bloco | undefined, id: string | undefined) => !b || id === undefined || b.nos.map(idDe).includes(id)
  const atualRespeita = naPonta(primeira, idsAtual[0]) && (!ultima || ultima === primeira || naPonta(ultima, idsAtual[idsAtual.length - 1]))
  let mudou = true
  if (atualRespeita && custoAtual <= custoFinal + 1e-9) {
    final = atual
    custoFinal = custoAtual
    mudou = false
  }
  const nos = final.flatMap((b) => b.nos)
  const nosAtual = atual.flatMap((b) => b.nos)
  const t = totais(nos, p.matriz, origem, servico)
  const ta = totais(nosAtual, p.matriz, origem, servico)
  const ordem = nos.map(idDe)
  return {
    ordem,
    criterio: p.criterio,
    km: t.km,
    min: t.min,
    kmAtual: ta.km,
    minAtual: ta.min,
    custo: custoFinal,
    custoAtual,
    melhorou: mudou && ordem.join('\u0000') !== idsAtual.join('\u0000'),
    tipoMatriz: p.matriz.tipo,
  }
}
