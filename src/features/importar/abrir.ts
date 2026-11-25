// Abrir a rota importada em etapas visíveis (correção do 2.0.0-teste.6: o botão nunca fica sem resposta).
// Cada etapa mostra o andamento; se uma falhar, a tela diz qual foi e o motivo, e permite tentar de novo.
// As mensagens NUNCA trazem endereços, códigos SPX ou nomes: só contagens e o nome da etapa.
import type { RotaImportada } from './converter'

export const ETAPAS_ABRIR = ['Validando dados', 'Organizando encomendas', 'Criando paradas', 'Salvando rota', 'Abrindo rota'] as const
export type EtapaAbrir = (typeof ETAPAS_ABRIR)[number]

export class FalhaAbrir extends Error {
  constructor(
    readonly etapa: EtapaAbrir,
    motivo: string,
  ) {
    super(motivo)
    this.name = 'FalhaAbrir'
  }
}

/** 1) Validando dados: a prévia pode virar rota? (só contagens nas mensagens) */
export function validarDados(r: RotaImportada | null, repetidosAbertos: number): void {
  const e: EtapaAbrir = 'Validando dados'
  if (!r) throw new FalhaAbrir(e, 'Não há planilha lida. Escolha a planilha de novo.')
  if (repetidosAbertos > 0)
    throw new FalhaAbrir(e, repetidosAbertos === 1 ? 'Há 1 pacote repetido sem escolha. Escolha qual linha remover (acima) e toque de novo.' : `Há ${repetidosAbertos} pacotes repetidos sem escolha. Escolha qual linha remover em cada um (acima) e toque de novo.`)
  if (r.paradas.length === 0) throw new FalhaAbrir(e, 'A planilha não gerou nenhuma parada.')
  const ids = new Set(r.paradas.map((p) => p.id))
  if (ids.size !== r.paradas.length) throw new FalhaAbrir(e, 'Duas paradas ficaram com o mesmo identificador.')
  if (r.ordemSpx.length !== r.paradas.length || r.ordemSpx.some((id) => !ids.has(id)) || new Set(r.ordemSpx).size !== r.ordemSpx.length)
    throw new FalhaAbrir(e, 'A ordem da SPX não bate com as paradas lidas.')
}

/** 2) Organizando encomendas: nenhum pacote perdido nem duplicado entre paradas. */
export function conferirEncomendas(r: RotaImportada): void {
  const e: EtapaAbrir = 'Organizando encomendas'
  const todos = r.paradas.flatMap((p) => p.pacotes)
  if (todos.length !== r.pacotes) throw new FalhaAbrir(e, `A contagem de pacotes não fecha (${todos.length} nas paradas, ${r.pacotes} na planilha).`)
  const repetidos = todos.length - new Set(todos).size
  if (repetidos > 0) throw new FalhaAbrir(e, `${repetidos} pacote(s) apareceram em mais de uma parada.`)
  const vazias = r.paradas.filter((p) => p.pacotes.length === 0).length
  if (vazias > 0) throw new FalhaAbrir(e, `${vazias} parada(s) ficaram sem pacote.`)
}

export interface PassosAbrir {
  /** Troca a rota em uso pela nova (estado global). */
  criar: () => void
  /** A rota em uso agora é a nova? */
  criada: () => boolean
  /** Espera a gravação no aparelho terminar; devolve false se a gravação falhou. */
  salvar: () => Promise<boolean>
  /** Vai para a tela Rotas; devolve true quando a tela abriu. */
  abrir: () => Promise<boolean>
  /** Avisa a etapa atual (para a tela mostrar o andamento). */
  progresso: (i: number) => void
  /** Pausa curta entre as etapas, para a tela desenhar o andamento. */
  respirar?: () => Promise<void>
}

/** Roda as 5 etapas em ordem. Lança FalhaAbrir com a etapa e o motivo, ou termina com a tela Rotas aberta. */
export async function abrirRotaImportada(r: RotaImportada | null, repetidosAbertos: number, p: PassosAbrir): Promise<void> {
  const respirar = p.respirar ?? (() => new Promise<void>((ok) => setTimeout(ok, 60)))
  const passo = async (i: number, f: () => void | Promise<void>) => {
    p.progresso(i)
    await respirar()
    try {
      await f()
    } catch (e) {
      if (e instanceof FalhaAbrir) throw e
      // Erro inesperado: só o tipo do erro (a mensagem poderia conter dados da planilha).
      throw new FalhaAbrir(ETAPAS_ABRIR[i]!, `Erro interno (${e instanceof Error ? e.name : typeof e}). Toque em "Tentar de novo".`)
    }
  }
  await passo(0, () => validarDados(r, repetidosAbertos))
  const rota = r!
  await passo(1, () => conferirEncomendas(rota))
  await passo(2, () => {
    p.criar()
    if (!p.criada()) throw new FalhaAbrir('Criando paradas', 'A rota nova não ficou ativa.')
  })
  await passo(3, async () => {
    if (!(await p.salvar())) throw new FalhaAbrir('Salvando rota', 'Não consegui guardar a rota no aparelho (armazenamento cheio ou bloqueado). Ela continua aberta só nesta visita; toque em "Tentar de novo" para gravar.')
  })
  await passo(4, async () => {
    if (!(await p.abrir())) throw new FalhaAbrir('Abrindo rota', 'A tela Rotas não abriu. Toque em "Tentar de novo" ou use a aba Rotas.')
  })
}
