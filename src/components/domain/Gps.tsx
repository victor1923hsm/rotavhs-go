// Estado do GPS, pedido de permissão e alerta de proximidade (P2/P3).
// Leves: ficam no app inicial (o mapa continua carregando só em Rotas).

import { MapPin, X } from 'lucide-react'
import { useEstado, parada } from '@/app/estado'
import { useDinamica } from '@/app/dinamica'
import { rotuloGps, useLocalizacao } from '@/app/localizacao'
import { useLaboratorio } from '@/app/simulador'
import { useIr } from '@/app/navegacao'
import { rotuloStop } from '@/core/parada'

/** Selo DEMONSTRAÇÃO: o que ainda não é funcionalidade aprovada. */
export const SeloDemo = ({ texto = 'DEMONSTRAÇÃO' }: { texto?: string }) => <span className="selo-demo">{texto}</span>

/** Estado do GPS (ativo, buscando sinal, impreciso, indisponível, desativado) + ligar/desligar. */
export function ChipGps() {
  const loc = useLocalizacao()
  const lab = useLaboratorio()
  const { rotulo, tom } = rotuloGps(loc)
  const desligar = () => (loc.simulado ? lab.desligar() : loc.desativar())
  return (
    <div className="gps-linha" role="status" aria-live="polite">
      <span className={`gps-chip ${tom}`}>
        <i aria-hidden="true" /> GPS: {rotulo}
      </span>
      {loc.simulado && <SeloDemo texto="GPS SIMULADO" />}
      {loc.ativa ? (
        <button className="gps-acao" onClick={desligar}>Desligar</button>
      ) : (
        <button className="gps-acao" onClick={() => void loc.pedirAtivacao()}>Ligar GPS</button>
      )}
    </div>
  )
}

/** Explicação antes do pedido do navegador (só quando você liga a função). */
export function PedidoGps() {
  const loc = useLocalizacao()
  if (!loc.explicando) return null
  return (
    <div className="gps-fundo">
      <div className="minha-loc-pedido" role="dialog" aria-modal="true" aria-label="Mostrar sua localização">
        <strong style={{ fontSize: 18 }}>Usar sua localização?</strong>
        <p className="sub" style={{ margin: '6px 0 12px' }}>
          Em seguida, o navegador vai pedir permissão. Sua posição aparece no mapa e serve de ponto de partida para as sugestões de ordem: <b>não é guardada, não é enviada</b> e a ordem das paradas <b>só muda se você aceitar</b>. O GPS desliga quando você tocar em “Desligar” ou fechar o app.
        </p>
        <button className="botao" onClick={loc.confirmarAtivacao}>Permitir localização</button>
        <button className="botao contorno" style={{ marginTop: 8 }} onClick={loc.cancelarExplicacao}>Agora não</button>
      </div>
    </div>
  )
}

/** Alerta de proximidade (DEMONSTRAÇÃO): só avisa; nunca marca a entrega. */
export function AlertaProximidade() {
  const alerta = useDinamica((d) => d.alerta)
  const fechar = useDinamica((d) => d.fecharAlerta)
  const selecionar = useEstado((e) => e.selecionar)
  const status = useEstado((e) => e.status)
  const silenciar = useEstado((e) => e.silenciarAlertasNaRota)
  const ir = useIr()
  if (!alerta || status[alerta.paradaId] !== 'pendente') return null
  const p = parada(alerta.paradaId)
  const n = p.pacotes.length
  return (
    <div className="alerta-perto" role="alert">
      <MapPin size={22} aria-hidden="true" />
      <div className="cresce">
        <SeloDemo />
        <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>Perto da parada {rotuloStop(p)}</div>
        <div className="rotulo" style={{ color: 'inherit' }}>{n} {n === 1 ? 'pacote' : 'pacotes'} · ~{Math.round(alerta.distanciaM)} m</div>
        <div className="rotulo" style={{ color: 'inherit' }}>{p.endereco}</div>
      </div>
      <div style={{ display: 'grid', justifyItems: 'end' }}>
        <div className="linha" style={{ gap: 0 }}>
          <button className="gps-acao" onClick={() => { selecionar(p.id); fechar(); ir('/pedidos') }}>Abrir</button>
          <button className="icone-botao" aria-label="Fechar alerta" onClick={fechar} style={{ background: 'transparent', color: 'inherit' }}><X size={20} /></button>
        </div>
        <button className="gps-acao" style={{ fontSize: 13 }} onClick={() => silenciar(true)}>Silenciar nesta rota</button>
      </div>
    </div>
  )
}
