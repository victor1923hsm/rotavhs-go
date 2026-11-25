// Preferências de alertas (A7) e dados guardados no aparelho (retenção, exclusão, limpezas pendentes).
// Q1: rotas sem atividade só recebem avisos (24 h, 7 dias, 30 dias); nada é apagado sem o seu toque.
// Q2: conferência não terminada mostra até quando fica guardada. Q3: limpar os mapas guardados (só o mapa).
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { LinkFluido } from '@/app/navegacao'
import { TEMAS, useEstado } from '@/app/estado'
import { descartarConferencia, lerConferencia, persistenciaAtual } from '@/app/persistencia'
import { quando } from '@/components/domain/Retomada'
import { CONFERENCIA_CARENCIA, CONFERENCIA_VALIDADE, inatividade } from '@/core/retencao'
import { infoMapas, limparMapas, mb, type InfoMapas } from '@/platform/mapaCache'
import type { Conferencia, RotaListada } from '@/platform/armazenamento/tipos'

function Inativa({ atualizadaEm }: { atualizadaEm: number }) {
  const i = inatividade(atualizadaEm, Date.now())
  if (i.nivel === 'recente') return null
  return <div className={`inatividade ${i.nivel}`} style={{ marginTop: 6 }}>{i.texto}</div>
}

export function Preferencias() {
  const e = useEstado()
  const [rotas, setRotas] = useState<RotaListada[] | null>(null)
  const [conf, setConf] = useState<Conferencia | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [mapas, setMapas] = useState<InfoMapas | null>(null)
  const [limpandoMapas, setLimpandoMapas] = useState<'pergunta' | 'limpando' | null>(null)
  useEffect(() => {
    void infoMapas().then(setMapas)
  }, [versao])
  const apagarMapas = async () => {
    setLimpandoMapas('limpando')
    const ok = await limparMapas()
    setLimpandoMapas(null)
    setVersao((v) => v + 1)
    e.avisar(ok ? 'Mapas guardados apagados · rotas e entregas continuam no aparelho' : 'Não consegui apagar os mapas guardados')
  }
  useEffect(() => {
    const arm = persistenciaAtual()?.arm
    void arm?.listarRotas().then(setRotas).catch(() => setRotas([]))
    void lerConferencia().then(setConf)
  }, [versao, e.rotaId, e.resumos])
  const outras = (rotas ?? []).filter((r) => r.id !== e.rotaId)
  const emUso = (rotas ?? []).find((r) => r.id === e.rotaId)
  const temMarcacao = Object.values(e.pacotes).some((ps) => ps.some((x) => x !== 'pendente'))
  const excluir = async (id: string) => {
    if (id === e.rotaId) e.descartarRota()
    else await persistenciaAtual()?.arm.apagarRota(id)
    setConfirmar(null)
    setVersao((v) => v + 1)
    e.avisar('Rota excluída do aparelho')
  }
  const tentarLimpeza = async () => {
    const arm = persistenciaAtual()?.arm
    if (!arm) return
    try {
      const feitas = await arm.concluirLimpezasPendentes()
      useEstado.setState({ limpezasPendentes: e.limpezasPendentes.filter((x) => !feitas.includes(x)), resumos: await arm.resumos() })
      e.avisar(feitas.length ? 'Detalhes apagados do aparelho' : 'Nada pendente')
    } catch {
      e.avisar('Ainda não consegui apagar. Tente de novo mais tarde.')
    }
  }
  return (
    <div className="rolagem">
      <div className="linha">
        <LinkFluido to="/estatisticas" className="icone-botao" aria-label="Voltar"><ArrowLeft size={22} /></LinkFluido>
        <h1 className="titulo">Configurações</h1>
      </div>

      <div className="secao">
        <div className="t">Tema</div>
        <div className="fichas">
          {TEMAS.map((t) => (
            <button key={t.id} className={`ficha ${e.tema === t.id ? 'ativa' : ''}`} aria-pressed={e.tema === t.id} onClick={() => e.definirTema(t.id)}>{t.nome}</button>
          ))}
        </div>
        <p className="rotulo" style={{ marginTop: 6 }}>Alta visibilidade: o mesmo desenho, com mais contraste para sol forte.</p>
      </div>

      <div className="secao">
        <div className="t">Alertas de proximidade</div>
        <div className="fichas">
          <button className={`ficha ${e.alertasLigados ? 'ativa' : ''}`} aria-pressed={e.alertasLigados} onClick={() => e.definirAlertasLigados(true)}>Ligados</button>
          <button className={`ficha ${!e.alertasLigados ? 'ativa' : ''}`} aria-pressed={!e.alertasLigados} onClick={() => e.definirAlertasLigados(false)}>Desligados</button>
        </div>
        <p className="rotulo" style={{ marginTop: 6 }}>Desligar os alertas não desliga o GPS. Uma parada só avisa de novo depois de você se afastar mais de 200 m e passarem 10 min.</p>
        {e.alertas.silenciadoNaRota && (
          <p className="sub" style={{ marginTop: 8 }}>
            Silenciados nesta rota. <button className="gps-acao" onClick={() => e.silenciarAlertasNaRota(false)}>Reativar</button>
          </p>
        )}
      </div>

      <div className="secao">
        <div className="t">Dados guardados neste aparelho</div>
        <p className="rotulo">Ficam só neste navegador. Ao finalizar uma rota, endereços, códigos SPX, coordenadas, histórico, planos e a matriz de distâncias são apagados; fica só o resumo. Nenhuma rota em uso é apagada sem o seu toque.</p>
        <div className="cartao dados-cartao">
          <strong>Rota em uso</strong>
          <div className="rotulo">{e.rota.fonte === 'exemplo' ? 'Rota de exemplo (fictícia)' : 'Planilha importada'} · {e.ordem.length} paradas · {e.rota.pacotes} pacotes{emUso ? ` · última alteração ${quando(emUso.atualizadaEm)}` : ''}</div>
          {emUso && <Inativa atualizadaEm={emUso.atualizadaEm} />}
          {confirmar === e.rotaId ? (
            <div className="confirmar" role="alertdialog" aria-label="Excluir a rota sem resumo" style={{ marginTop: 8 }}>
              <p style={{ margin: '0 0 8px' }}>Todos os dados desta rota serão <b>apagados</b> e <b>não haverá resumo</b>.</p>
              <div className="linha">
                <button className="botao" onClick={() => void excluir(e.rotaId)}>Excluir sem resumo</button>
                <button className="botao contorno" onClick={() => setConfirmar(null)}>Cancelar</button>
              </div>
            </div>
          ) : confirmar === 'encerrar' ? (
            <div className="confirmar" role="alertdialog" aria-label="Encerrar a rota com resumo" style={{ marginTop: 8 }}>
              <p style={{ margin: '0 0 8px' }}>O resumo fica em Estatísticas. Endereços, códigos e o histórico desta rota serão <b>apagados do aparelho</b>. Pacotes pendentes contam como não entregues.</p>
              <div className="linha">
                <button className="botao" onClick={() => { e.finalizarRota(); setConfirmar(null); setVersao((v) => v + 1); e.avisar('Rota encerrada · resumo guardado') }}>Encerrar</button>
                <button className="botao contorno" onClick={() => setConfirmar(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="linha" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
              <LinkFluido to="/pedidos" className="gps-acao">Continuar</LinkFluido>
              {temMarcacao && <button className="gps-acao" onClick={() => setConfirmar('encerrar')}>Encerrar com resumo…</button>}
              <button className="gps-acao" onClick={() => setConfirmar(e.rotaId)}>Excluir sem resumo…</button>
            </div>
          )}
        </div>
        {outras.map((r) => (
          <div key={r.id} className="cartao dados-cartao">
            <strong>{r.status === 'finalizando' ? 'Rota finalizada com limpeza pendente' : 'Rota guardada não concluída'}</strong>
            <div className="rotulo">Criada {quando(r.criadaEm)} · última alteração {quando(r.atualizadaEm)} · {r.visitas} paradas · {r.pacotes} pacotes</div>
            {r.status !== 'finalizando' && <Inativa atualizadaEm={r.atualizadaEm} />}
            {confirmar === r.id ? (
              <div className="linha" style={{ marginTop: 8 }}>
                <button className="botao" onClick={() => void excluir(r.id)}>Excluir definitivamente</button>
                <button className="botao contorno" onClick={() => setConfirmar(null)}>Cancelar</button>
              </div>
            ) : (
              <button className="botao-texto" onClick={() => setConfirmar(r.id)}>Excluir definitivamente…</button>
            )}
          </div>
        ))}
        {conf && (
          <div className="cartao dados-cartao">
            <strong>Conferência não terminada</strong>
            <div className="rotulo">{conf.arquivo} · última alteração {quando(conf.atualizadaEm)}</div>
            <div className="rotulo">
              Fica guardada por 7 dias desde a última alteração. Depois disso o app avisa e ainda guarda por mais 24 h; nunca é descartada com a tela Importar aberta.
              {' '}Prazo: {quando(conf.avisadaExpiracaoEm !== undefined && conf.avisadaExpiracaoEm >= conf.atualizadaEm ? conf.avisadaExpiracaoEm + CONFERENCIA_CARENCIA : conf.atualizadaEm + CONFERENCIA_VALIDADE + CONFERENCIA_CARENCIA)}.
            </div>
            <div className="linha" style={{ marginTop: 6, gap: 8 }}>
              <LinkFluido to="/importar" className="gps-acao">Continuar</LinkFluido>
              <button className="gps-acao" onClick={() => void descartarConferencia().then(() => setVersao((v) => v + 1))}>Descartar</button>
            </div>
          </div>
        )}
        {e.limpezasPendentes.length > 0 && (
          <div className="cartao dados-cartao" role="alert">
            <strong>{e.limpezasPendentes.length} rota(s) finalizada(s) com detalhes ainda no aparelho</strong>
            <div className="rotulo">A limpeza foi interrompida. O resumo está guardado.</div>
            <button className="gps-acao" onClick={() => void tentarLimpeza()}>Tentar de novo</button>
          </div>
        )}
        <div className="cartao dados-cartao">
          <strong>Mapas guardados</strong>
          <div className="rotulo">
            {mapas === null ? 'Calculando…' : !mapas.disponivel ? 'Este navegador não guarda mapas.' : mapas.itens === 0 ? 'Nenhuma área do mapa guardada.' : `${mapas.itens} partes do mapa · cerca de ${mb(mapas.bytes)} MB (limite de ~60 MB)`}
          </div>
          <div className="rotulo" style={{ marginTop: 4 }}>Sem internet, o mapa mostra só as áreas que você já abriu com conexão. Limpar apaga só esses mapas; rotas, entregas e resumos continuam no aparelho.</div>
          {limpandoMapas === 'pergunta' ? (
            <div className="confirmar" role="alertdialog" aria-label="Limpar mapas guardados" style={{ marginTop: 8 }}>
              <p style={{ margin: '0 0 8px' }}>Apagar os mapas guardados? Sem internet, o mapa ficará em branco até você abrir as áreas de novo com conexão.</p>
              <div className="linha">
                <button className="botao" onClick={() => void apagarMapas()}>Limpar mapas</button>
                <button className="botao contorno" onClick={() => setLimpandoMapas(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button className="gps-acao" style={{ marginTop: 6 }} disabled={!mapas?.disponivel || mapas.itens === 0 || limpandoMapas === 'limpando'} onClick={() => setLimpandoMapas('pergunta')}>
              {limpandoMapas === 'limpando' ? 'Limpando…' : 'Limpar mapas guardados'}
            </button>
          )}
        </div>
        <p className="rotulo" style={{ marginTop: 8 }}>{e.resumos.length} resumo(s) de rotas finalizadas (sem endereços, códigos ou coordenadas).</p>
      </div>
    </div>
  )
}
