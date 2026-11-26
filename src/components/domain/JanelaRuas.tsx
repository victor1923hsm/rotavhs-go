// Janela "Calcular pelas ruas" (RB-2), carregada SOB DEMANDA: antes de calcular, confere a chave, a liberação do
// envio, a SUA autorização (P-COORD) e mostra a estimativa de consumo. Em qualquer passo: "Usar a otimização
// rápida" ou "Cancelar" (a rota não muda). O modo nunca é trocado em silêncio.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { parada, useEstado } from '@/app/estado'
import { envioPermitido, useRuas } from '@/app/ruas'
import { LinkFluido } from '@/app/navegacao'
import { temCoordenada } from '@/core/parada'

type Modulo = typeof import('@/app/ruasOtimizacao')
type Estimativa = Awaited<ReturnType<Modulo['estimarConsumo']>>
type Passo =
  | { tipo: 'verificando' }
  | { tipo: 'parar'; titulo: string; texto: string; central?: boolean }
  | { tipo: 'consentimento'; provedor: string }
  | { tipo: 'estimativa'; est: Estimativa }

const fmtS = (s: number) => (s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`)

export default function JanelaRuas() {
  const aviso = useRuas((r) => r.avisoRuas)
  const fechar = useRuas((r) => r.fecharAvisoRuas)
  const verificarCofre = useRuas((r) => r.verificarCofre)
  const autorizar = useRuas((r) => r.autorizarEnvio)
  const otimizar = useEstado((e) => e.otimizar)
  const recalcular = useEstado((e) => e.recalcular)
  const avisar = useEstado((e) => e.avisar)
  const [passo, setPasso] = useState<Passo>({ tipo: 'verificando' })

  const avancar = async () => {
    setPasso({ tipo: 'verificando' })
    await verificarCofre()
    const { cofre, consentimento } = useRuas.getState()
    if (cofre === 'pwa') return setPasso({ tipo: 'parar', titulo: 'Indisponível neste navegador', texto: 'O cálculo pelas ruas só existe no app Android, que guarda a chave no cofre seguro do aparelho.' })
    if (cofre === 'erro') return setPasso({ tipo: 'parar', titulo: 'Não consegui acessar o cofre', texto: 'Abra "Calcular pelas ruas" para conferir a chave.', central: true })
    if (cofre !== 'cadastrada') return setPasso({ tipo: 'parar', titulo: 'Falta a chave da API', texto: cofre === 'invalidada' ? 'A chave foi apagada pela segurança do aparelho. Cadastre de novo.' : 'Cadastre a chave da API em "Calcular pelas ruas".', central: true })
    if (!envioPermitido()) return setPasso({ tipo: 'parar', titulo: 'Envio real ainda não liberado', texto: 'Esta versão ainda não envia coordenadas ao provedor real (termos de uso e sua autorização específica pendentes). Nenhuma coordenada foi enviada.' })
    const mod: Modulo = await import('@/app/ruasOtimizacao')
    if (!consentimento) return setPasso({ tipo: 'consentimento', provedor: mod.fonteAtual() })
    const e = useEstado.getState()
    const pend = e.ordem.filter((id) => e.status[id] === 'pendente' && temCoordenada(parada(id))).map(parada)
    const est = await mod.estimarConsumo(e.rotaId, pend, e.termino.tipo === 'partida')
    setPasso({ tipo: 'estimativa', est })
  }

  useEffect(() => {
    if (aviso) void avancar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso])

  if (!aviso) return null
  const rapida = () => {
    fechar()
    void (aviso === 'recalcular' ? recalcular() : otimizar())
  }
  const cancelar = () => {
    fechar()
    avisar('Nada mudou · a rota continua como estava')
  }
  const calcular = async () => {
    const mod: Modulo = await import('@/app/ruasOtimizacao')
    fechar()
    const opcoes = { preparar: mod.prepararPelasRuas }
    void (aviso === 'recalcular' ? recalcular(opcoes) : otimizar(opcoes))
  }
  const botoesSaida = (
    <>
      <button className="botao contorno" onClick={rapida}>Usar a otimização rápida</button>
      <button className="botao contorno" onClick={cancelar}>Cancelar</button>
    </>
  )

  return createPortal(
    <div className="janela-fundo">
      <div className="confirmar janela" role="alertdialog" aria-modal="true" aria-label="Calcular pelas ruas">
        {passo.tipo === 'verificando' && (
          <>
            <strong style={{ fontSize: 18 }}>Calcular pelas ruas</strong>
            <p className="sub" role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 12px' }}>
              <Loader2 size={18} className="girando" aria-hidden="true" /> Conferindo a chave e a autorização…
            </p>
            <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>{botoesSaida}</div>
          </>
        )}
        {passo.tipo === 'parar' && (
          <>
            <strong style={{ fontSize: 18 }}>{passo.titulo}</strong>
            <p className="sub" style={{ margin: '6px 0 12px' }}>{passo.texto} Você pode usar a otimização <b>rápida</b> (sem ruas) ou cancelar: a rota continua como está.</p>
            <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
              {passo.central && <LinkFluido to="/estatisticas/ruas" className="botao" onClick={fechar}>Abrir a central</LinkFluido>}
              {botoesSaida}
            </div>
          </>
        )}
        {passo.tipo === 'consentimento' && (
          <>
            <strong style={{ fontSize: 18 }}>Autorizar o envio de coordenadas?</strong>
            <div className="sub" style={{ margin: '6px 0 12px' }}>
              <p style={{ margin: '0 0 6px' }}>Para calcular pelas ruas, o app envia a <b>{passo.provedor}</b>:</p>
              <ul style={{ margin: '0 0 6px', paddingLeft: 18 }}>
                <li>as coordenadas das paradas pendentes e a <b>sua posição atual</b> (só no momento do cálculo, nunca de forma contínua);</li>
                <li>o destino final, quando você escolhe voltar ao ponto de partida.</li>
              </ul>
              <p style={{ margin: '0 0 6px' }}><b>Nunca</b> são enviados nomes, telefones, endereços em texto, códigos SPX, números de etiqueta nem a planilha. Nada vai para telemetria ou análise.</p>
              <p style={{ margin: 0 }}>Coordenadas de entrega podem ser dados pessoais (LGPD). O que vier do provedor fica só neste aparelho e é apagado quando a rota é encerrada ou excluída. Você pode revogar em "Calcular pelas ruas".</p>
            </div>
            <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="botao" onClick={() => { autorizar(passo.provedor); void avancar() }}>Autorizar e continuar</button>
              {botoesSaida}
            </div>
          </>
        )}
        {passo.tipo === 'estimativa' && (
          <>
            <strong style={{ fontSize: 18 }}>Consumo previsto</strong>
            <ul className="sub" style={{ margin: '6px 0 6px', paddingLeft: 18 }}>
              <li>{passo.est.paradas} paradas pendentes · provedor: {passo.est.fonte}</li>
              <li>Distâncias pelas ruas: <b>{passo.est.pedidosMatriz}</b> pedido(s) (limite do plano gratuito: {passo.est.cotaDiariaMatriz} por dia){passo.est.paresDoCache ? ` · ${passo.est.paresDoCache} trechos já guardados` : ''}</li>
              <li>Encaixe nas ruas: {passo.est.pedidosEncaixe} a {passo.est.pedidosEncaixeMax} pedido(s)</li>
              <li>Espera mínima pelo limite por minuto: {passo.est.esperaMinimaS ? fmtS(passo.est.esperaMinimaS) : 'nenhuma'} (sem contar a rede)</li>
            </ul>
            <p className="rotulo" style={{ margin: '0 0 12px', color: 'inherit' }}>A rota atual continua valendo até você ver o resultado. Dá para cancelar durante o cálculo.</p>
            <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="botao" onClick={() => void calcular()}>Calcular pelas ruas</button>
              {botoesSaida}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
