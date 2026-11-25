import { useEffect, useMemo, useState } from 'react'
import { LinkFluido, useIr } from '@/app/navegacao'
import { ArrowLeft, FileSpreadsheet, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { ROTA_EXEMPLO, useEstado } from '@/app/estado'
import { addressLine } from '@/core/address/address'
import type { DraftStop } from '@/core/import/build'
import { groupFindings, isResolved, keepAllSeparate, removeRow, undo, type Decision, type Finding } from '@/core/import/review'
import { linhaRetaKm } from '@/core/geo'
import { numero } from '@/core/formato'
import { buscarParadas } from '@/core/parada'
import { rotaDaImportacao } from '@/features/importar/converter'
import { lerArquivo } from '@/features/importar/ler'
import type { Leitura } from '@/features/importar/leitura'
import { ARQUIVO_FICTICIO, PLANILHA_FICTICIA, PROTOTIPO } from '@/app/prototipo'
import { descartarConferencia, guardarConferencia, lerConferencia } from '@/app/persistencia'
import type { RotaImportada } from '@/features/importar/converter'

const MOTIVO: Record<string, string> = { vazia: 'linha vazia', cabecalho_repetido: 'cabeçalho repetido', total: 'linha de total', sem_dados: 'sem dados' }

/** Maior distância em linha reta entre as partes (só para você decidir; nunca é trajeto). */
function espalhamentoM(ss: DraftStop[]): number | null {
  const pts = ss.flatMap((s) => (s.sheetPoint ? [{ lat: s.sheetPoint.lat, lon: s.sheetPoint.lng }] : []))
  let m = 0
  for (const a of pts) for (const b of pts) m = Math.max(m, linhaRetaKm(a, b) * 1000)
  return pts.length > 1 ? Math.round(m) : null
}


export function Importar() {
  const ir = useIr()
  const { carregarRota, avisar, rota } = useEstado()
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [decisoes, setDecisoes] = useState<Decision[]>([])
  const [lote, setLote] = useState<number | null>(null)
  const [retomadaEm, setRetomadaEm] = useState<number | null>(null)
  const [trocar, setTrocar] = useState<null | { nova: RotaImportada; depois: () => void }>(null)
  const [busca, setBusca] = useState('')
  const pacotes = useEstado((e) => e.pacotes)
  const fase = useEstado((e) => e.fase)
  const marcados = Object.values(pacotes).flat().filter((x) => x !== 'pendente').length
  const emUso = marcados > 0 || fase !== 'revisao' || rota.fonte === 'planilha'

  // Conferência em andamento: volta igual se o app fechou no meio (Etapa 3).
  useEffect(() => {
    let vivo = true
    void lerConferencia().then((c) => {
      if (!vivo || !c) return
      setLeitura((l) => l ?? (c.leitura as Leitura))
      setDecisoes((d) => (d.length ? d : (c.decisoes as Decision[])))
      setRetomadaEm(c.atualizadaEm)
    })
    return () => {
      vivo = false
    }
  }, [])
  useEffect(() => {
    if (leitura) void guardarConferencia(leitura.arquivo, leitura, decisoes)
  }, [leitura, decisoes])
  const descartar = () => {
    void descartarConferencia()
    setLeitura(null)
    setDecisoes([])
    setRetomadaEm(null)
  }
  /** Troca a rota em uso só depois do seu "sim" (nada é apagado sem aviso). */
  const usarRota = (nova: RotaImportada, depois: () => void) => {
    if (emUso) setTrocar({ nova, depois })
    else {
      carregarRota(nova)
      depois()
    }
  }

  const porChave = useMemo(() => new Map((leitura?.resultado.stops ?? []).map((s) => [s.key, s])), [leitura])
  const previa = useMemo(() => (leitura ? rotaDaImportacao(leitura.resultado, decisoes, leitura.arquivo) : null), [leitura, decisoes])
  const grupos = useMemo(() => (leitura ? groupFindings(leitura.achados) : []), [leitura])

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    setLendo(true)
    setErro(null)
    setLeitura(null)
    setDecisoes([])
    const r = await lerArquivo(arquivo)
    setLendo(false)
    if (r.ok) setLeitura(r.leitura)
    else setErro(r.erro)
  }

  const agora = () => Date.now()
  const decidir = (f: Finding, tipo: 'juntar' | 'separar') =>
    setDecisoes((ds) => [...ds, tipo === 'juntar' && f.kind !== 'pacote_repetido'
      ? { type: 'agrupar_paradas', findingId: f.id, stopKeys: f.stopKeys, at: agora() }
      : { type: 'manter_todas', findingId: f.id, at: agora() }])

  async function ficticia() {
    setLendo(true)
    try {
      const r = await fetch(import.meta.env.BASE_URL + PLANILHA_FICTICIA)
      if (!r.ok) throw new Error(String(r.status))
      await escolher(new File([await r.blob()], ARQUIVO_FICTICIO))
    } catch {
      setLendo(false)
      setErro('Não consegui abrir a planilha fictícia (precisa de conexão na primeira vez).')
    }
  }

  // Planilha do aparelho (autorizada no protótipo publicado em 2026-11-20): lida e guardada só aqui.
  // A planilha fictícia continua disponível no protótipo, para testar sem dado real.
  const escolha = (
    <>
      <label className="arquivo" style={{ cursor: 'pointer' }}>
        <div className="ic"><FileSpreadsheet size={22} /></div>
        <div className="cresce">
          <div style={{ fontSize: 17 }}>{lendo ? 'Lendo planilha…' : leitura ? leitura.arquivo : 'Escolher planilha da SPX'}</div>
          <div className="rotulo" style={{ color: 'inherit' }}>
            {leitura ? `aba “${leitura.aba}” · lida em ${leitura.ms} ms · toque para trocar` : 'XLSX ou CSV · lida só neste aparelho'}
          </div>
        </div>
        <input
          type="file"
          accept=".xlsx,.csv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/comma-separated-values,application/vnd.ms-excel"
          hidden
          aria-label="Escolher planilha"
          onChange={(e) => {
            void escolher(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      {PROTOTIPO && !leitura && (
        <button className="botao-texto" style={{ minHeight: 44 }} onClick={ficticia} disabled={lendo}>
          Ou testar com a planilha fictícia da SPX
        </button>
      )}
      {!leitura && <AvisoPrivacidade />}
    </>
  )
  // Pacote repetido sem decisão entraria duas vezes na rota: pede a escolha antes de confirmar.
  const repetidosAbertos = leitura ? leitura.achados.filter((f) => f.kind === 'pacote_repetido' && !isResolved(decisoes, f)).length : 0
  const achadasBusca = previa && busca.trim() ? buscarParadas(previa.paradas, busca) : null
  const listaPrevia = previa ? (achadasBusca ? achadasBusca.paradas.map((p) => p.id) : previa.ordemSpx.slice(0, 12)) : []

  return (
    <div className="rolagem">
      <div className="linha">
        <LinkFluido to="/pedidos" className="icone-botao" aria-label="Voltar"><ArrowLeft size={22} /></LinkFluido>
        <h1 className="titulo">Importar rotas</h1>
      </div>
      <p className="sub">Revise a planilha antes de planejar. O arquivo não sai do aparelho.</p>
      {escolha}
      {retomadaEm !== null && leitura && (
        <p className="rotulo" role="status" style={{ marginTop: 8 }}>Conferência retomada: suas escolhas foram guardadas às {new Date(retomadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p>
      )}
      {trocar && (
        <div className="confirmar" role="alertdialog" aria-label="Trocar a rota em uso" style={{ marginTop: 12 }}>
          <strong>Existe uma rota em uso</strong>
          <p className="sub" style={{ margin: '4px 0 10px' }}>
            {marcados > 0
              ? `Ela tem ${marcados} pacote(s) marcados. Ao continuar, ela será encerrada: o resumo fica em Estatísticas e os detalhes (endereços, códigos, histórico) são apagados do aparelho.`
              : 'Ela ainda não tem marcações. Ao continuar, ela será excluída do aparelho.'}
          </p>
          <div className="linha">
            <button className="botao" onClick={() => { const t = trocar; setTrocar(null); carregarRota(t.nova); t.depois() }}>{marcados > 0 ? 'Encerrar e continuar' : 'Excluir e continuar'}</button>
            <button className="botao contorno" onClick={() => setTrocar(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {erro && (
        <div className="cartao" style={{ marginTop: 12, background: 'var(--erro-fundo)', color: 'var(--erro-texto)' }} role="alert">
          <strong>Não consegui ler a planilha</strong>
          <p style={{ margin: '4px 0 0' }}>{erro}</p>
        </div>
      )}

      {!leitura && !lendo && (
        <>
          <p className="sub" style={{ marginTop: 14 }}>
            Rota carregada agora: <b>{rota.arquivo}</b> ({rota.paradas.length} paradas{rota.fonte === 'exemplo' ? ', exemplo fictício' : ''}).
          </p>
          {rota.fonte !== 'exemplo' && (
            <button className="botao contorno" style={{ marginTop: 10 }} onClick={() => usarRota(ROTA_EXEMPLO, () => ir('/rotas'))}>
              Voltar para a rota de exemplo
            </button>
          )}
        </>
      )}

      {leitura && previa && (
        <>
          <div className="numeros3 menta">
            <div><div className="rotulo">Pacotes</div><div className="v">{previa.pacotes}</div></div>
            <div><div className="rotulo">Paradas</div><div className="v">{previa.paradas.length}</div></div>
            <div><div className="rotulo">Distância est.</div><div className="v">{numero(estimarKm(previa))} km</div></div>
          </div>
          <Contabilidade l={leitura} removidas={decisoes.filter((d) => d.type === 'remover_linha').length} suspeitas={previa.coordenadasSuspeitas ?? 0} />

          {grupos.length > 0 && (
            <>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: '18px 0 4px' }}>Conferência · {grupos.length} {grupos.length === 1 ? 'ponto' : 'pontos'} para você ver</h2>
              <p className="sub" style={{ marginTop: 0 }}>Nada é unido, removido ou renumerado sozinho. Cada escolha pode ser desfeita.</p>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <button
                  className="botao menta"
                  onClick={() => {
                    const t = agora()
                    setDecisoes((ds) => [...ds, ...leitura.achados.filter((f) => f.kind === 'stop_dividido' && !isResolved(ds, f)).map((f): Decision => ({ type: 'agrupar_paradas', findingId: f.id, stopKeys: (f as Extract<Finding, { kind: 'stop_dividido' }>).stopKeys, at: t }))])
                    setLote(t)
                  }}
                >
                  Juntar as partes de cada parada dividida
                </button>
                <button
                  className="botao contorno"
                  onClick={() => {
                    const r = keepAllSeparate(decisoes, leitura.achados, agora())
                    setDecisoes(r.decisions)
                    setLote(r.at)
                  }}
                >
                  Manter todas separadas
                </button>
                {lote !== null && (
                  <button className="rotulo" style={{ textDecoration: 'underline', minHeight: 44 }} onClick={() => { setDecisoes((ds) => ds.filter((d) => d.at !== lote)); setLote(null) }}>
                    Desfazer a última escolha em lote
                  </button>
                )}
              </div>
              {grupos.map((g) => (
                <CartaoAchado key={g[0]!.id} grupo={g} decisoes={decisoes} porChave={porChave}
                  decidir={decidir}
                  desfazer={(f) => setDecisoes((ds) => undo(ds, f.id))}
                  remover={(f, linha) => setDecisoes((ds) => removeRow(ds, f, linha, agora()))} />
              ))}
            </>
          )}

          <h2 style={{ fontSize: 17, fontWeight: 600, margin: '18px 0 4px' }}>Prévia das paradas</h2>
          <label className="entrada" style={{ marginTop: 6 }}>
            <Search size={18} aria-hidden />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar parada ou código do pacote"
              aria-label="Buscar parada ou código do pacote na conferência"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
            />
          </label>
          {achadasBusca && (
            <p className="rotulo" role="status" style={{ margin: '6px 2px' }}>
              {achadasBusca.tipo === 'nada' ? 'Digite o número da parada ou 3+ caracteres do código.' : `${achadasBusca.paradas.length} ${achadasBusca.paradas.length === 1 ? 'parada encontrada' : 'paradas encontradas'}`}
            </p>
          )}
          <div className="tabela">
            <div className="cab"><div className="c1">PARADA</div><div className="cresce">ENDEREÇO</div><div className="c3">PACOTES</div></div>
            {listaPrevia.map((id) => {
              const p = previa.paradas.find((x) => x.id === id)!
              return (
                <div key={id} className="lin">
                  <div className="c1"><span className="chip-stop" style={{ background: 'var(--tinta)', color: 'var(--sobre-tinta-claro)' }}>{p.stop ?? '?'}</span></div>
                  <div className="cresce">
                    {p.endereco}{p.outrosEnderecos ? <span className="rotulo"> +{p.outrosEnderecos.length}</span> : null}
                    {p.semCoordenada && <span className="rotulo" style={{ display: 'block', color: 'var(--erro-texto)' }}>{p.coordenadaSuspeita ? 'localização não confirmada · fora do mapa' : 'sem coordenada · fora do mapa'}</span>}
                    {achadasBusca?.tipo === 'codigo' && achadasBusca.codigos.get(id)?.map((c) => <span key={c} className="rotulo" style={{ display: 'block' }}>{c}</span>)}
                    {achadasBusca?.tipo === 'stop' && <span className="rotulo" style={{ display: 'block' }}>{p.pacotes.join(' · ')}</span>}
                  </div>
                  <div className="c3">{p.pacotes.length}</div>
                </div>
              )
            })}
          </div>
          {!achadasBusca && previa.paradas.length > 12 && <p className="rotulo" style={{ marginTop: 8 }}>… e mais {previa.paradas.length - 12} paradas, na ordem da SPX (Sequence). Use a busca para achar uma parada ou um pacote.</p>}

          {repetidosAbertos > 0 && (
            <p className="cartao" role="alert" style={{ marginTop: 16, background: 'var(--erro-fundo)', color: 'var(--erro-texto)' }}>
              {repetidosAbertos === 1 ? 'Há 1 pacote repetido' : `Há ${repetidosAbertos} pacotes repetidos`} na planilha. Escolha acima qual linha remover para cada um antes de confirmar.
            </p>
          )}
          <button
            className="botao"
            style={{ marginTop: 16 }}
            disabled={repetidosAbertos > 0}
            onClick={() =>
              usarRota(previa, () => {
                void descartarConferencia()
                useEstado.setState({ destacarOtimizar: true })
                avisar(`Rota importada: ${previa.paradas.length} paradas · ${previa.pacotes} pacotes`)
                ir('/rotas')
              })
            }
          >
            Confirmar importação →
          </button>
          <p className="rotulo" style={{ marginTop: 8 }}>A rota fica guardada só neste aparelho e volta se o app fechar. Ao finalizar, endereços e códigos são apagados e fica só o resumo.</p>
          <button className="botao-texto" onClick={descartar}>Descartar esta conferência</button>
        </>
      )}
    </div>
  )
}

function estimarKm(r: ReturnType<typeof rotaDaImportacao>): number {
  // km estimados na ordem da SPX, com a rota da prévia (sem carregar no estado).
  const pts = r.ordemSpx.map((id) => r.paradas.find((p) => p.id === id)!).filter((p) => !p.semCoordenada)
  let km = 0
  for (let i = 1; i < pts.length; i++) km += linhaRetaKm(pts[i - 1]!, pts[i]!) * 1.35
  return km
}

function Contabilidade({ l, removidas, suspeitas }: { l: Leitura; removidas: number; suspeitas: number }) {
  const a = l.resultado.accounting
  const motivos = Object.entries(l.resultado.ignored.reduce<Record<string, number>>((t, i) => ((t[i.reason] = (t[i.reason] ?? 0) + 1), t), {}))
  const semNumero = l.resultado.stops.filter((s) => s.originalNumber === null).length
  const semCoord = l.resultado.stops.filter((s) => !s.sheetPoint).length
  const coordInvalida = l.resultado.stops.filter((s) => s.issues.some((i) => i.code === 'coordenada_invalida')).length
  const semEndereco = l.resultado.stops.filter((s) => s.issues.some((i) => i.code === 'sem_endereco')).length
  const semCodigo = l.resultado.packages.filter((p) => !p.trackingCode).length
  return (
    <div className="cartao" style={{ marginTop: 12 }}>
      <span className="selo-estado" style={{ padding: 0, background: 'none' }}>CONTABILIDADE</span>
      <p className="sub" style={{ color: 'var(--texto)' }}>
        {a.ok ? '✓' : '✕'} {a.dataRows} linhas = {a.packages} pacotes + {a.ignored} ignoradas{removidas ? ` (${removidas} removida${removidas > 1 ? 's' : ''} por você)` : ''}
      </p>
      {motivos.map(([m, n]) => <p key={m} className="sub">• {n} {MOTIVO[m] ?? m}</p>)}
      {semNumero > 0 && <p className="sub">• {semNumero} {semNumero > 1 ? 'pacotes vieram' : 'pacote veio'} sem número de parada: {semNumero > 1 ? 'ficam' : 'fica'} como “?”, sem número inventado.</p>}
      {semCoord > 0 && <p className="sub">• {semCoord} {semCoord > 1 ? 'paradas' : 'parada'} sem coordenada{coordInvalida ? ` (${coordInvalida} com valor inválido)` : ''}: {semCoord > 1 ? 'ficam' : 'fica'} na lista, fora do mapa e do cálculo de km. Nenhuma posição é inventada.</p>}
      {suspeitas > 0 && <p className="sub">• {suspeitas} {suspeitas > 1 ? 'paradas' : 'parada'} com coordenada longe demais do resto da rota (mais de 60 km): localização não confirmada, fora do mapa.</p>}
      {semEndereco > 0 && <p className="sub">• {semEndereco} {semEndereco > 1 ? 'linhas' : 'linha'} sem endereço: confira na etiqueta.</p>}
      {semCodigo > 0 && <p className="sub">• {semCodigo} {semCodigo > 1 ? 'pacotes' : 'pacote'} sem código (SPX TN): {semCodigo > 1 ? 'aparecem' : 'aparece'} como “linha N”.</p>}
      <p className="sub">• Colunas reconhecidas: {Object.keys(l.mapeamento).length}.</p>
    </div>
  )
}

function CartaoAchado({ grupo, decisoes, porChave, decidir, desfazer, remover }: {
  grupo: Finding[]
  decisoes: Decision[]
  porChave: Map<string, DraftStop>
  decidir: (f: Finding, t: 'juntar' | 'separar') => void
  desfazer: (f: Finding) => void
  remover: (f: Finding, linha: number) => void
}) {
  return (
    <div className="cartao" style={{ marginTop: 10 }}>
      {grupo.map((f) => {
        const feita = decisoes.filter((d) => d.findingId === f.id).at(-1)
        if (f.kind === 'pacote_repetido') {
          return (
            <div key={f.id}>
              <div className="linha"><TriangleAlert size={18} /><strong className="cresce">Pacote repetido</strong></div>
              <p className="sub">{f.trackingCode} aparece nas linhas {f.rows.join(', ')}.</p>
              <div className="linha" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                {f.rows.slice(1).map((linha) => (
                  <button key={linha} className="botao contorno" style={{ width: 'auto', padding: '0 14px', height: 44, fontSize: 15 }} onClick={() => remover(f, linha)}>Remover linha {linha}</button>
                ))}
                {feita && <button className="rotulo" style={{ textDecoration: 'underline', minHeight: 44 }} onClick={() => desfazer(f)}>Desfazer</button>}
              </div>
            </div>
          )
        }
        const partes = f.stopKeys.map((k) => porChave.get(k)).filter((x): x is DraftStop => !!x)
        const m = espalhamentoM(partes)
        const titulo = f.kind === 'stop_dividido'
          ? `Parada ${f.number} em ${partes.length} endereços`
          : `Mesmo endereço com números diferentes: ${[...new Set(f.numbers.map((n) => n ?? '?'))].join(' e ')}`
        return (
          <div key={f.id} style={{ marginBottom: 6 }}>
            <div className="linha">
              {f.kind === 'mesma_porta' && <TriangleAlert size={18} />}
              <strong className="cresce">{titulo}</strong>
            </div>
            {partes.map((s) => (
              <p key={s.key} className="sub" style={{ marginTop: 3 }}>• {s.originalNumber ?? '?'} · {addressLine(s.address)} <span className="rotulo">({s.packageCount} pct)</span></p>
            ))}
            {m !== null && <p className="rotulo" style={{ marginTop: 4 }}>Distância entre eles: até {m} m em linha reta.</p>}
            {feita ? (
              <div className="linha" style={{ marginTop: 8 }}>
                <span className="selo-estado escuro">{feita.type === 'agrupar_paradas' ? 'MESMO LOCAL' : 'SEPARADAS'}</span>
                <button className="rotulo" style={{ textDecoration: 'underline', minHeight: 44 }} onClick={() => desfazer(f)}>Desfazer</button>
              </div>
            ) : (
              <div className="linha" style={{ marginTop: 8, gap: 8 }}>
                <button className="botao menta" style={{ height: 44, fontSize: 15 }} onClick={() => decidir(f, 'juntar')}>São o mesmo local</button>
                <button className="botao contorno" style={{ height: 44, fontSize: 15 }} onClick={() => decidir(f, 'separar')}>Manter separadas</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


/** O que acontece com a planilha e os dados dela (explicação fixa, antes de escolher o arquivo). */
function AvisoPrivacidade() {
  return (
    <div className="cartao" style={{ marginTop: 12 }} aria-label="Onde ficam os dados da planilha">
      <div className="linha"><ShieldCheck size={18} aria-hidden /><strong className="cresce">Seus dados ficam só neste aparelho</strong></div>
      <p className="sub" style={{ margin: '6px 0 0' }}>
        A planilha é lida aqui no celular. Nada é enviado: nem o arquivo, nem endereços, códigos ou coordenadas. O arquivo em si não é guardado; durante a conferência, os dados lidos ficam no aparelho para não se perderem se o app fechar (até 7 dias).
      </p>
      <p className="sub" style={{ margin: '6px 0 0' }}>
        A rota (paradas, endereços, códigos e suas marcações) fica guardada no navegador deste aparelho para continuar se o app fechar.
        Ao finalizar ou trocar de rota, esses detalhes são apagados e fica só o resumo (quantidades, km e custo estimados).
        Você também pode excluir a rota em Estatísticas → Configurações.
      </p>
      <p className="rotulo" style={{ margin: '6px 0 0' }}>
        O mapa baixa imagens das ruas da região exibida (OpenFreeMap), sem endereços nem códigos. Maps e Waze só recebem o destino quando você toca neles.
      </p>
    </div>
  )
}
