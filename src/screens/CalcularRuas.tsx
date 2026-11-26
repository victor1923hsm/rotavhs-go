// Central de otimização (RB-1 + RB-3): modo, andamento, último resultado (origem, destino, distância, tempo,
// paradas, comparação com a ordem anterior), consumo da API (hoje e previsto), provedor, chave e autorização.
// Resultado de servidor de TESTE ou aproximado é rotulado como tal: nunca apresentado como roteirização real.
// A chave nunca aparece na tela depois de guardada; o campo é de senha e é limpo ao guardar ou cancelar.
import { useEffect, useState } from 'react'
import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { LinkFluido } from '@/app/navegacao'
import { useEstado } from '@/app/estado'
import { baseDeTeste, disponibilidade, PROVEDOR_PREVISTO, useRuas } from '@/app/ruas'
import { validarChave } from '@/platform/cofre'
import { SeletorModo } from '@/components/domain/ModoOtimizacao'
import { Comparacao, NOME_ORIGEM, NOME_TERMINO, rotuloDistancias } from '@/components/domain/ResultadoRuas'
import { consumoHoje, estimarConsumo, type Estimativa } from '@/app/ruasOtimizacao'
import { parada } from '@/app/estado'
import { numero } from '@/core/formato'
import { temCoordenada } from '@/core/parada'

const NOME_ETAPA: Record<string, string> = { origem: 'Sua posição atual', encaixe: 'Encaixe das paradas nas ruas', matriz: 'Distâncias e tempos', calculando: 'Melhor ordem' }

/** Andamento, último resultado e consumo (RB-3). */
function PainelCalculo() {
  const ot = useEstado((e) => e.otimizacao)
  const cancelar = useEstado((e) => e.cancelarOtimizacao)
  const pend = useEstado((e) => e.resultadoRuas)
  const ult = useEstado((e) => e.ultimaOtimizacao)
  const rotaId = useEstado((e) => e.rotaId)
  const termino = useEstado((e) => e.termino)
  const [est, setEst] = useState<Estimativa | null>(null)
  const [calc, setCalc] = useState(false)
  const hoje = consumoHoje()
  const r = pend?.resumo ?? ult
  const estimar = async () => {
    setCalc(true)
    const e = useEstado.getState()
    const ps = e.ordem.filter((id) => e.status[id] === 'pendente' && temCoordenada(parada(id))).map((id) => ({ id, lat: parada(id).lat!, lon: parada(id).lon! }))
    setEst(await estimarConsumo(rotaId, ps, termino.tipo === 'partida').catch(() => null))
    setCalc(false)
  }
  return (
    <>
      {ot && (
        <div className="secao">
          <div className="t">Andamento do cálculo</div>
          <div className="cartao" role="status" aria-live="polite">
            <div className="linha" style={{ gap: 8 }}>
              <Loader2 size={18} className="girando" aria-hidden="true" />
              <strong className="cresce">{NOME_ETAPA[ot.etapa]} · {ot.modo === 'ruas' ? 'pelas ruas' : 'rápida'}</strong>
              <span>{Math.round(ot.progresso * 100)}%</span>
            </div>
            {ot.detalhe && <p className="rotulo" style={{ margin: '4px 0 0', color: 'inherit' }}>{ot.detalhe}</p>}
            <button className="botao contorno" style={{ marginTop: 8 }} onClick={cancelar}>Cancelar (a rota não muda)</button>
          </div>
        </div>
      )}
      <div className="secao">
        <div className="t">{pend ? 'Resultado esperando a sua decisão' : 'Último cálculo aplicado'}</div>
        {r ? (
          <div className="cartao">
            {r.simulado && <p className="ruas-aviso-teste" role="note">Respostas CONTROLADAS de servidor de teste: <b>não é roteirização real</b>.</p>}
            {r.tipoMatriz !== 'ruas' && <p className="rotulo" style={{ margin: '0 0 6px', color: 'inherit' }}><b>Aproximado:</b> linha reta × 1,35, sem ruas.</p>}
            <dl className="ruas-dados">
              <div><dt>Modo</dt><dd>{r.tipoMatriz === 'ruas' ? 'Pelas ruas' : 'Rápido (aproximado)'}</dd></div>
              <div><dt>Origem usada</dt><dd>{r.origem ? NOME_ORIGEM[r.origem] ?? r.origem : 'Sua posição atual'}</dd></div>
              <div><dt>Destino final</dt><dd>{NOME_TERMINO[r.termino ?? 'livre']}</dd></div>
              <div><dt>Paradas</dt><dd>{r.paradas}{r.revisao ? ` · ${r.revisao} em revisão` : ''}</dd></div>
              <div><dt>Distância total</dt><dd>{numero(r.km)} km ({rotuloDistancias(r)})</dd></div>
              <div><dt>Tempo de deslocamento</dt><dd>{numero(r.minDesloc ?? r.min, 0)} min (estimado; sem o tempo parado nas entregas)</dd></div>
              {r.pedidos && <div><dt>Pedidos ao provedor</dt><dd>{r.pedidos.matriz} de distâncias · {r.pedidos.encaixe} de encaixe</dd></div>}
            </dl>
            <Comparacao r={r} />
            {!!r.revisao && <LinkFluido to="/rotas/revisao" className="gps-acao" style={{ display: 'inline-block', marginTop: 8 }}>Revisar {r.revisao} parada(s)</LinkFluido>}
          </div>
        ) : (
          <p className="rotulo">Nenhum cálculo nesta rota ainda.</p>
        )}
      </div>
      <div className="secao">
        <div className="t">Consumo da API</div>
        <div className="cartao">
          <p className="rotulo" style={{ margin: 0, color: 'inherit' }}>
            Hoje (contagem deste aparelho): <b>{hoje.pedidos.matriz}</b> de {hoje.limites.matriz} pedidos de distâncias · <b>{hoje.pedidos.encaixe}</b> de {hoje.limites.encaixe} de encaixe · <b>{hoje.pedidos.rota}</b> de {hoje.limites.rota} de traçado. Resta: {hoje.resta.matriz} · {hoje.resta.encaixe} · {hoje.resta.rota}.
          </p>
          {est ? (
            <p className="rotulo" style={{ margin: '6px 0 0', color: 'inherit' }}>
              Para as {est.paradas} pendentes agora: <b>{est.pedidosMatriz}</b> pedido(s) de distâncias ({est.paresDoCache} trechos já guardados), {est.pedidosEncaixe}–{est.pedidosEncaixeMax} de encaixe; espera mínima {est.esperaMinimaS ? `${Math.ceil(est.esperaMinimaS / 60)} min` : 'nenhuma'}.{est.excede ? ' Não caberia no que resta hoje.' : ''} Traçado pelas ruas (próxima fase, ainda não usado): {est.pedidosTracadoRB4} pedido(s).
            </p>
          ) : (
            <button className="botao contorno" style={{ marginTop: 8 }} onClick={() => void estimar()} disabled={calc}>{calc ? 'Calculando…' : 'Estimar o consumo para as pendentes'}</button>
          )}
        </div>
      </div>
    </>
  )
}

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => {
      removeEventListener('online', on)
      removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function CalcularRuas() {
  const r = useRuas()
  const avisar = useEstado((e) => e.avisar)
  const online = useOnline()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarApagar, setConfirmarApagar] = useState(false)
  useEffect(() => {
    void r.verificarCofre()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const teste = baseDeTeste()
  const d = disponibilidade(r.cofre, online, teste)
  const temChave = r.cofre === 'cadastrada'
  const podeCadastrar = r.cofre !== 'pwa' && r.cofre !== 'verificando'
  const cancelarEdicao = () => {
    setTexto('')
    setMostrar(false)
    setErro(null)
    setEditando(false)
  }
  const guardar = async () => {
    const v = validarChave(texto)
    if (!v) return setErro('A chave parece incompleta: cole o texto inteiro, sem espaços (de 16 a 4096 caracteres).')
    setErro(null)
    const falha = await r.guardarChave(v)
    setTexto('')
    setMostrar(false)
    if (falha) return setErro(falha)
    setEditando(false)
    avisar(temChave ? 'Chave substituída no cofre seguro' : 'Chave guardada no cofre seguro')
  }
  const apagar = async () => {
    const falha = await r.apagarChave()
    setConfirmarApagar(false)
    if (falha) return setErro(falha)
    avisar('Chave excluída do aparelho')
  }

  return (
    <div className="rolagem">
      <div className="linha">
        <LinkFluido to="/estatisticas/preferencias" className="icone-botao" aria-label="Voltar"><ArrowLeft size={22} /></LinkFluido>
        <h1 className="titulo cresce">Calcular pelas ruas</h1>
        <span className="selo-estado aviso">EM DESENVOLVIMENTO</span>
      </div>

      <div className="cartao ruas-aviso" role="note">
        <strong>Integração pelas ruas em desenvolvimento</strong>
        <p className="rotulo" style={{ margin: '4px 0 0', color: 'inherit' }}>
          O envio ao provedor real <b>ainda não está liberado</b>: nenhuma coordenada é enviada a ele nesta versão. {teste ? <>Está ligado um <b>servidor de TESTE local</b> com respostas controladas (dados fictícios).</> : <>A otimização disponível é a <b>rápida</b> (distâncias aproximadas, sem ruas).</>}
        </p>
      </div>

      <div className="secao">
        <div className="t">Modo de otimização</div>
        <SeletorModo />
      </div>

      <PainelCalculo />

      <div className="secao">
        <div className="t">Provedor de rotas</div>
        <div className={`cartao ruas-estado ${d.tom}`} role="status" aria-live="polite">
          <div className="linha" style={{ gap: 8 }}>
            {r.cofre === 'verificando' && <Loader2 size={18} className="girando" aria-hidden="true" />}
            <strong>{d.titulo}</strong>
          </div>
          <p className="rotulo" style={{ margin: '4px 0 0', color: 'inherit' }}>{d.detalhe}</p>
          <p className="rotulo" style={{ margin: '6px 0 0', color: 'inherit' }}>
            Previsto: {PROVEDOR_PREVISTO.nome} ({PROVEDOR_PREVISTO.uso}) · {PROVEDOR_PREVISTO.consulta}. O app não depende dele: um servidor próprio (Valhalla ou OSRM) poderá substituí-lo.
            {!online && ' · Sem conexão agora.'}
          </p>
        </div>
      </div>

      <div className="secao">
        <div className="t">Chave da API</div>
        {r.cofre === 'pwa' ? (
          <p className="rotulo">No navegador não há cofre seguro: a chave não é pedida nem guardada aqui. Use o app Android para cadastrar.</p>
        ) : (
          <div className="cartao">
            <div className="linha" style={{ gap: 8 }}>
              {temChave ? <ShieldCheck size={20} aria-hidden="true" /> : <KeyRound size={20} aria-hidden="true" />}
              <strong className="cresce">{temChave ? 'Chave cadastrada' : r.cofre === 'verificando' ? 'Verificando…' : 'Nenhuma chave cadastrada'}</strong>
            </div>
            <p className="rotulo" style={{ margin: '4px 0 0', color: 'inherit' }}>
              Guardada cifrada no cofre do Android (Keystore, AES-256-GCM). Não aparece na tela, não vai para backups nem para relatórios. Reinstalar o app apaga a chave.
            </p>

            {editando ? (
              <div style={{ marginTop: 10 }}>
                <label className="rotulo" htmlFor="chave-api" style={{ color: 'inherit' }}>{temChave ? 'Nova chave (substitui a atual)' : 'Cole a chave da API'}</label>
                <div className="entrada">
                  <input
                    id="chave-api"
                    type={mostrar ? 'text' : 'password'}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    inputMode="text"
                    value={texto}
                    onChange={(ev) => setTexto(ev.target.value)}
                    disabled={!!r.ocupado}
                  />
                  <button className="gps-acao" type="button" onClick={() => setMostrar((m) => !m)} aria-pressed={mostrar}>{mostrar ? 'Ocultar' : 'Mostrar'}</button>
                </div>
                <div className="linha" style={{ marginTop: 10, gap: 8 }}>
                  <button className="botao" onClick={() => void guardar()} disabled={!!r.ocupado || !texto.trim()}>
                    {r.ocupado === 'guardar' ? <><Loader2 size={18} className="girando" aria-hidden="true" /> Guardando…</> : temChave ? 'Substituir chave' : 'Guardar chave'}
                  </button>
                  <button className="botao contorno" onClick={cancelarEdicao} disabled={!!r.ocupado}>Cancelar</button>
                </div>
              </div>
            ) : confirmarApagar ? (
              <div className="confirmar" role="alertdialog" aria-label="Excluir a chave" style={{ marginTop: 10 }}>
                <p style={{ margin: '0 0 8px' }}>A chave será <b>apagada do aparelho</b>. Para usar o cálculo pelas ruas depois, será preciso cadastrar de novo.</p>
                <div className="linha">
                  <button className="botao" onClick={() => void apagar()} disabled={!!r.ocupado}>{r.ocupado === 'apagar' ? 'Excluindo…' : 'Excluir chave'}</button>
                  <button className="botao contorno" onClick={() => setConfirmarApagar(false)} disabled={!!r.ocupado}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="linha" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <button className="botao" onClick={() => { setErro(null); setEditando(true) }} disabled={!podeCadastrar}>{temChave ? 'Substituir chave…' : 'Cadastrar chave…'}</button>
                {temChave && <button className="botao contorno" onClick={() => setConfirmarApagar(true)}>Excluir chave…</button>}
                {r.cofre === 'erro' && <button className="botao contorno" onClick={() => void r.verificarCofre()}>Tentar de novo</button>}
              </div>
            )}
            {erro && <p className="ruas-erro" role="alert">{erro}</p>}
          </div>
        )}
      </div>

      <div className="secao">
        <div className="t">Autorização de envio</div>
        {r.consentimento ? (
          <div className="cartao">
            <strong>Autorizado em {new Date(r.consentimento.em).toLocaleDateString('pt-BR')}</strong>
            <p className="rotulo" style={{ margin: '4px 0 8px', color: 'inherit' }}>Provedor: {r.consentimento.provedor}. Só coordenadas, só no momento do cálculo.</p>
            <button className="botao contorno" onClick={() => { r.revogarEnvio(); avisar('Autorização revogada · nada será enviado sem pedir de novo') }}>Revogar autorização</button>
          </div>
        ) : (
          <p className="rotulo">Não autorizado. O app pede a sua autorização antes do primeiro envio, dizendo qual provedor recebe os dados.</p>
        )}
      </div>

      <div className="secao">
        <div className="t">Privacidade</div>
        <p className="rotulo">
          Só saem do aparelho <b>coordenadas</b> (a sua posição no momento do cálculo e as das paradas pendentes) e parâmetros técnicos: nunca nomes, telefones, endereços em texto, códigos SPX, números de etiqueta ou a planilha, e nada vai para telemetria. A sua posição não é enviada de forma contínua.
          Coordenadas de entrega podem ser <b>dados pessoais</b> (LGPD). O que vem do provedor (distâncias e acessos) fica só neste aparelho, por no máximo 7 dias, e é apagado quando a rota é encerrada ou excluída.
        </p>
      </div>
    </div>
  )
}
