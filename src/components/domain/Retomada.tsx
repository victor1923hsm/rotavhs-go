// Ao reabrir: a rota guardada já foi retomada; aqui você escolhe continuar, encerrar (com resumo) ou excluir.
// Também avisa quando uma gravação falhou (com "Tentar de novo"). Nenhuma rota ativa é apagada sem o seu toque.

import { useState } from 'react'
import { useLocation } from 'react-router'
import { useEstado } from '@/app/estado'
import { useIr } from '@/app/navegacao'
import { descartarConferencia, persistenciaAtual } from '@/app/persistencia'
import { inatividade } from '@/core/retencao'

export const quando = (ms: number) => new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function RetomarRota() {
  const { retomada, fecharRetomada, finalizarRota, descartarRota, avisar } = useEstado()
  const [confirmar, setConfirmar] = useState<null | 'encerrar' | 'excluir'>(null)
  const ir = useIr()
  if (!retomada) return null
  const ina = inatividade(retomada.atualizadaEm, Date.now())
  return (
    <div className="gps-fundo">
      <div className="minha-loc-pedido" role="dialog" aria-modal="true" aria-label="Rota em andamento encontrada">
        <strong style={{ fontSize: 18 }}>Rota em andamento encontrada</strong>
        <p className="sub" style={{ margin: '6px 0 4px' }}>
          {retomada.concluidas} de {retomada.visitas} paradas concluídas · {retomada.pacotesMarcados} pacotes marcados.
          {retomada.parada >= 0 ? ` Você estava na parada ${retomada.parada}.` : ''}
        </p>
        <p className="rotulo" style={{ margin: '0 0 12px' }}>Última alteração: {quando(retomada.atualizadaEm)}</p>
        {ina.nivel !== 'recente' && (
          <p className={`inatividade ${ina.nivel}`} role="status" style={{ margin: '0 0 12px' }}>
            {ina.texto}.{' '}
            {ina.nivel === 'abandonada'
              ? 'Ela continua guardada até você decidir: continue, encerre com resumo ou exclua.'
              : 'Nada é apagado sozinho; escolha o que fazer.'}
          </p>
        )}
        {confirmar === null && (
          <>
            <button className="botao" onClick={() => { fecharRetomada(); ir('/pedidos') }}>Continuar de onde parei</button>
            <button className="botao contorno" style={{ marginTop: 8 }} onClick={() => setConfirmar('encerrar')}>Encerrar esta rota</button>
            <button className="botao-texto" onClick={() => setConfirmar('excluir')}>Excluir sem resumo</button>
          </>
        )}
        {confirmar === 'encerrar' && (
          <div className="confirmar" role="alertdialog" aria-label="Encerrar a rota">
            <p style={{ margin: '0 0 10px' }}>O resumo fica em Estatísticas. Endereços, códigos e o histórico desta rota serão <b>apagados do aparelho</b>. Pacotes pendentes contam como não entregues.</p>
            <div className="linha">
              <button className="botao" onClick={() => { finalizarRota(); fecharRetomada(); avisar('Rota encerrada · resumo guardado'); ir('/estatisticas') }}>Encerrar</button>
              <button className="botao contorno" onClick={() => setConfirmar(null)}>Voltar</button>
            </div>
          </div>
        )}
        {confirmar === 'excluir' && (
          <div className="confirmar" role="alertdialog" aria-label="Excluir a rota sem resumo">
            <p style={{ margin: '0 0 10px' }}>Todos os dados desta rota serão <b>apagados</b> e <b>não haverá resumo</b>. Isso não pode ser desfeito.</p>
            <div className="linha">
              <button className="botao" onClick={() => { descartarRota(); avisar('Rota excluída do aparelho') }}>Excluir definitivamente</button>
              <button className="botao contorno" onClick={() => setConfirmar(null)}>Voltar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Aviso fixo quando o aparelho não conseguiu guardar (ex.: armazenamento cheio). */
export function GravacaoFalhou() {
  const gravacao = useEstado((e) => e.gravacao)
  if (gravacao !== 'falhou') return null
  return (
    <div className="gravacao-falhou" role="alert">
      <span className="cresce">Não consegui guardar as últimas alterações no aparelho (armazenamento cheio ou indisponível). Elas continuam na tela; não feche o app.</span>
      <button className="gps-acao" onClick={() => persistenciaAtual()?.tentarDeNovo()}>Tentar de novo</button>
    </div>
  )
}

/** Conferência não terminada perto do prazo (Q2). Some na tela Importar (lá ela já está aberta). */
export function AvisoConferencia() {
  const aviso = useEstado((e) => e.avisoConferencia)
  const retomada = useEstado((e) => e.retomada)
  const avisar = useEstado((e) => e.avisar)
  const [depois, setDepois] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const { pathname } = useLocation()
  const ir = useIr()
  if (!aviso || depois || retomada || pathname.endsWith('/importar')) return null
  return (
    <div className="aviso-conferencia" role="alert" aria-label="Conferência não terminada">
      <div className="cresce">
        <strong>{aviso.expirada ? 'Conferência não terminada passou de 7 dias' : 'Conferência não terminada perto do prazo'}</strong>
        <div className="rotulo">
          {aviso.arquivo} · última alteração {quando(aviso.atualizadaEm)}. Será descartada a partir de {quando(aviso.expiraEm)} se você não continuar.
        </div>
        {confirmar ? (
          <div className="linha" style={{ marginTop: 6, gap: 8 }}>
            <button className="gps-acao" onClick={() => void descartarConferencia().then(() => avisar('Conferência descartada'))}>Descartar agora</button>
            <button className="gps-acao" onClick={() => setConfirmar(false)}>Voltar</button>
          </div>
        ) : (
          <div className="linha" style={{ marginTop: 6, gap: 8 }}>
            <button className="gps-acao" onClick={() => ir('/importar')}>Continuar conferência</button>
            <button className="gps-acao" onClick={() => setConfirmar(true)}>Descartar…</button>
            <button className="gps-acao" onClick={() => setDepois(true)}>Depois</button>
          </div>
        )}
      </div>
    </div>
  )
}
