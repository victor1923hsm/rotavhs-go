// Guarda o estado do app no aparelho (Etapa 3) e o devolve ao reabrir.
// Observa o estado (zustand) e grava só o que mudou, numa FILA: uma gravação de cada vez, na ordem.
// Cada marcação é gravada na hora, junto com a sessão, numa única transação (tudo ou nada).
// Se uma gravação falhar (ex.: armazenamento cheio), ela NÃO é descartada: a fila para, o app avisa e tenta de
// novo (sozinho a cada 15 s ou pelo botão), sem pular nem reordenar nada.
// Nunca grava posição do GPS (o estado da localização nem é observado aqui).

import { useEstado } from './estado'
import { armazenamentoDexie } from '@/platform/armazenamento/dexie'
import { armazenamentoMemoria } from '@/platform/armazenamento/memoria'
import { decidirConferencia } from '@/core/retencao'
import { eventosDaMudanca, type Armazenamento, type Conferencia, type Sessao } from '@/platform/armazenamento/tipos'

type E = ReturnType<typeof useEstado.getState>

const sessaoDe = (e: E): Sessao => ({
  fase: e.fase, ordem: e.ordem, selecionada: e.selecionada, iniciadaEm: e.iniciadaEm,
  planoAtivo: e.planoAtivo, origemOtimizacao: e.origemOtimizacao, alertas: e.alertas,
})
const mudouSessao = (a: E, e: E) =>
  e.fase !== a.fase || e.ordem !== a.ordem || e.selecionada !== a.selecionada || e.iniciadaEm !== a.iniciadaEm ||
  e.planoAtivo !== a.planoAtivo || e.origemOtimizacao !== a.origemOtimizacao || e.alertas !== a.alertas

export interface Persistencia {
  arm: Armazenamento
  /** Termina quando a fila esvaziar (ou parar numa falha). */
  aguardar: () => Promise<void>
  parar: () => void
  /** Tenta de novo as gravações que falharam. */
  tentarDeNovo: () => void
  /** A rota que estava guardada foi retomada ao abrir. */
  retomada: boolean
}

let atual: Persistencia | null = null
/** A persistência em uso (para a Conferência e as telas de dados). */
export const persistenciaAtual = () => atual

/** Escolhe o IndexedDB; sem ele, a memória (a rota vale só nesta visita). */
export async function abrirArmazenamento(): Promise<Armazenamento> {
  try {
    if (typeof indexedDB === 'undefined') return armazenamentoMemoria()
    const a = armazenamentoDexie()
    await a.db.open()
    return a
  } catch {
    return armazenamentoMemoria()
  }
}

export async function iniciarPersistencia(arm: Armazenamento): Promise<Persistencia> {
  const st = useEstado.getState
  // ---------- fila ----------
  const fila: (() => Promise<unknown>)[] = []
  let rodando = false
  let parada = false
  let esperas: (() => void)[] = []
  let relogio: ReturnType<typeof setInterval> | null = null
  const acordar = () => {
    if (!rodando && (parada || fila.length === 0)) {
      esperas.forEach((f) => f())
      esperas = []
    }
  }
  const processar = async () => {
    if (rodando || parada) return
    rodando = true
    while (fila.length) {
      try {
        await fila[0]!()
        fila.shift()
      } catch {
        parada = true
        if (st().gravacao !== 'falhou') useEstado.setState({ gravacao: 'falhou' })
        relogio ??= setInterval(tentarDeNovo, 15_000)
        break
      }
    }
    rodando = false
    acordar()
  }
  const gravar = (op: () => Promise<unknown>) => {
    fila.push(op)
    void processar()
  }
  const tentarDeNovo = () => {
    if (!parada) return
    parada = false
    void processar().then(() => {
      if (!parada) {
        if (relogio) clearInterval(relogio)
        relogio = null
        if (st().gravacao !== 'ok') useEstado.setState({ gravacao: 'ok' })
      }
    })
  }

  // ---------- 1) limpezas interrompidas (app fechado ou sem energia durante a finalização) ----------
  try {
    await arm.concluirLimpezasPendentes()
  } catch {
    /* fica para a próxima abertura; a lista abaixo mostra o que ainda falta */
  }

  // ---------- 2) ler o que estava guardado ----------
  const [salva, resumos, veiculo, prefs] = await Promise.all([arm.rotaAtiva(), arm.resumos(), arm.lerVeiculo(), arm.lerPreferencias()])
  if (veiculo) useEstado.setState({ veiculo })
  useEstado.setState({ alertasLigados: prefs.alertasLigados, limpezasPendentes: resumos.filter((r) => r.limpeza === 'pendente').map((r) => r.rotaId) })
  st().definirResumos(resumos)
  if (salva) st().restaurar(salva)
  else await arm.salvarRota(st().rotaId, st().rota, sessaoDe(st()), st().planos)
  let pediuPersistencia = false
  const pedir = () => {
    if (pediuPersistencia) return
    pediuPersistencia = true
    gravar(() => arm.pedirPersistencia())
  }
  if (salva && salva.rota.fonte === 'planilha') pedir()

  // ---------- 3) gravar cada mudança ----------
  let antes = st()
  const pararObs = useEstado.subscribe((e) => {
    const a = antes
    antes = e
    // Resumos novos (finalizada/substituída, ou "Desfazer" de um apagado) e apagados.
    if (e.resumos !== a.resumos) {
      const ids = new Set(a.resumos.map((r) => r.rotaId))
      const novos = new Set(e.resumos.map((r) => r.rotaId))
      for (const r of e.resumos) {
        if (ids.has(r.rotaId)) continue
        if (r.limpeza === 'concluida') gravar(() => arm.guardarResumo(r))
        else
          gravar(async () => {
            useEstado.setState({ limpezasPendentes: [...new Set([...st().limpezasPendentes, r.rotaId])] })
            await arm.finalizarRota(r)
            const concluido = { ...r, limpeza: 'concluida' as const, limpaEm: Date.now() }
            useEstado.setState({
              limpezasPendentes: st().limpezasPendentes.filter((x) => x !== r.rotaId),
              resumos: st().resumos.map((x) => (x.rotaId === r.rotaId ? concluido : x)),
            })
          })
      }
      for (const r of a.resumos) if (!novos.has(r.rotaId)) gravar(() => arm.apagarResumo(r.rotaId))
    }
    if (e.rotaId !== a.rotaId) {
      // Rota trocada: a anterior sem resumo (sem marcações, ou descartada por você) é excluída.
      const tinhaResumo = e.resumos.some((r) => r.rotaId === a.rotaId)
      if (!tinhaResumo) gravar(() => arm.apagarRota(a.rotaId))
      const { rotaId, rota, planos } = e
      const s = sessaoDe(e)
      gravar(() => arm.salvarRota(rotaId, rota, s, planos))
      if (rota.fonte === 'planilha') pedir()
      return
    }
    const ev = e.pacotes !== a.pacotes ? eventosDaMudanca(e.rotaId, new Map(e.rota.paradas.map((p) => [p.id, p])), a.pacotes, e.pacotes, Date.now()) : []
    const sessao = mudouSessao(a, e) ? sessaoDe(e) : null
    if (ev.length || sessao) {
      const { rotaId } = e
      // Marcação + sessão na mesma transação: ou as duas ficam, ou nenhuma.
      gravar(() => arm.registrarMudanca(rotaId, ev, sessao))
      if (ev.length) pedir()
    }
    if (e.planos !== a.planos) {
      const { rotaId, planos } = e
      gravar(() => arm.salvarPlanos(rotaId, planos))
    }
    if (e.veiculo !== a.veiculo) {
      const v = e.veiculo
      gravar(() => arm.salvarVeiculo(v))
    }
    if (e.alertasLigados !== a.alertasLigados) {
      const alertasLigados = e.alertasLigados
      gravar(() => arm.salvarPreferencias({ alertasLigados }))
    }
  })

  // ---------- 4) conferência não terminada: prazo de 7 dias, com aviso e carência (Q2) ----------
  await verificarConferencia(arm)
  const aoVoltar = () => {
    if (document.visibilityState === 'visible') void verificarConferencia(arm)
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aoVoltar)

  if (arm.tipo === 'memoria') st().avisar('Este navegador não deixa guardar dados: a rota vale só enquanto o app estiver aberto.')

  const aguardar = () =>
    new Promise<void>((ok) => {
      esperas.push(ok)
      acordar()
    })
  const p: Persistencia = {
    arm,
    aguardar,
    tentarDeNovo,
    parar: () => {
      pararObs()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', aoVoltar)
      if (relogio) clearInterval(relogio)
      if (atual === p) atual = null
    },
    retomada: !!salva,
  }
  atual = p
  return p
}

// ---------- Conferência em andamento (a importação antes de confirmar) ----------
const importarAberto = () => typeof location !== 'undefined' && /\/importar\/?$/.test(location.pathname)

/**
 * Aplica o prazo da conferência (Q2). Avisa antes; ao expirar, avisa de novo e ainda guarda por 24 h.
 * Só descarta depois disso, ao abrir o app, e nunca com a tela Importar aberta. Descartar sempre gera aviso.
 */
export async function verificarConferencia(arm: Armazenamento, agora = Date.now(), naImportar = importarAberto()) {
  try {
    const c = await arm.lerConferencia()
    if (!c) {
      if (useEstado.getState().avisoConferencia) useEstado.setState({ avisoConferencia: null })
      return
    }
    const d = decidirConferencia(c, agora, naImportar)
    if (d.acao === 'manter') useEstado.setState({ avisoConferencia: null })
    else if (d.acao === 'descartar') {
      await arm.apagarConferencia()
      useEstado.setState({ avisoConferencia: null })
      useEstado.getState().avisar(`A conferência não terminada de “${c.arquivo}” passou do prazo e foi descartada (a planilha original não muda).`)
    } else {
      if (d.acao === 'avisar-expiracao' && d.marcarAviso) await arm.salvarConferencia({ ...c, avisadaExpiracaoEm: agora })
      useEstado.setState({ avisoConferencia: { arquivo: c.arquivo, atualizadaEm: c.atualizadaEm, expiraEm: d.expiraEm, expirada: d.acao === 'avisar-expiracao' } })
    }
  } catch {
    /* sem efeito: fica para a próxima verificação; nada é apagado */
  }
}

export async function lerConferencia(): Promise<Conferencia | null> {
  try {
    return (await atual?.arm.lerConferencia()) ?? null
  } catch {
    return null
  }
}
export async function guardarConferencia(arquivo: string, leitura: unknown, decisoes: unknown[]) {
  try {
    await atual?.arm.salvarConferencia({ id: 'atual', arquivo, leitura, decisoes, atualizadaEm: Date.now() })
    // Mexeu na conferência: o prazo recomeça e o aviso some.
    if (useEstado.getState().avisoConferencia) useEstado.setState({ avisoConferencia: null })
  } catch {
    useEstado.getState().avisar('Não consegui guardar a Conferência no aparelho. Termine antes de fechar o app.')
  }
}
export async function descartarConferencia() {
  try {
    await atual?.arm.apagarConferencia()
    useEstado.setState({ avisoConferencia: null })
  } catch {
    /* sem efeito: a conferência será sobrescrita na próxima leitura */
  }
}
