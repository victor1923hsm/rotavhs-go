import { LinkFluido } from '@/app/navegacao'
import { Contrast, Moon, Sun } from 'lucide-react'
import { TEMAS, resumoDaOrdem, useEstado } from '@/app/estado'
import { custoEstimado } from '@/core/custo'
import { duracao, numero, reais } from '@/core/formato'
import { MapaEsquema } from '@/components/domain/MapaEsquema'

export function Estatisticas() {
  const { ordem, status, veiculo, tema, alternarTema, resumos } = useEstado()
  const r = resumoDaOrdem(ordem)
  const c = custoEstimado(r.km, ordem.length, veiculo)
  const feitas = ordem.filter((id) => status[id] === 'entregue').length
  const falhas = ordem.filter((id) => status[id] === 'falha').length
  const msg =
    feitas === 0
      ? 'Nenhuma entrega concluída ainda. Marque as entregas na tela Pedidos para acompanhar seu desempenho.'
      : `Você concluiu ${feitas} ${feitas === 1 ? 'parada' : 'paradas'} hoje${falhas ? ` (${falhas} sem sucesso)` : ''}. Acompanhe seu desempenho e veja como a otimização de rotas melhora sua eficiência.`
  return (
    <div className="est">
      <div className="est-folha">
      <div className="est-painel" />
      <div className="est-trilho">
        <button className="icone-botao" style={{ background: 'transparent', color: 'var(--sobre-tinta-claro)', marginBottom: 6 }} aria-label={`Tema: ${TEMAS.find((t) => t.id === tema)?.nome}. Tocar para trocar`} onClick={alternarTema}>
          {tema === 'claro' ? <Sun size={22} /> : tema === 'alta' ? <Contrast size={22} /> : <Moon size={22} />}
        </button>
        <span>6</span>
        <span>7</span>
        <span>8</span>
        <span className="hoje">HOJE</span>
      </div>
      <div className="est-conteudo">
        <h1 className="titulo" style={{ fontSize: 21 }}>Estatísticas</h1>
        <p style={{ fontSize: 16, lineHeight: 1.45, marginTop: 18 }}>{msg}</p>
        <div className="cartao-custo">
          <div className="linha">
            <span className="cresce rotulo" style={{ fontSize: 13 }}>Combustível hoje · estimado</span>
            <LinkFluido to="/estatisticas/custo" className="selo-estado" style={{ fontSize: 13, letterSpacing: 0, fontWeight: 600, textDecoration: 'none', padding: '8px 12px' }}>Editar</LinkFluido>
          </div>
          <div className="linha" style={{ alignItems: 'baseline', marginTop: 2 }}>
            <span style={{ fontSize: 26 }}>{reais(c.totalCentavos)}</span>
            <span className="rotulo">{reais(c.porKmCentavos)}/km</span>
          </div>
          <div className="rotulo">{numero(c.km)} km estimados · {numero(c.litros)} L de {veiculo.combustivel.toLowerCase()}</div>
        </div>
        <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
          {resumos.length > 0 && (
            <LinkFluido to="/estatisticas/rotas" className="selo-estado est-finalizadas">
              Rotas finalizadas · {resumos.length} →
            </LinkFluido>
          )}
          <LinkFluido to="/estatisticas/preferencias" className="selo-estado est-finalizadas">Configurações →</LinkFluido>
        </div>
      </div>
      <div className="est-roda">
        <div className="est-tempo">{duracao(r.min)} <span style={{ fontSize: 13 }}>est.</span></div>
        <div className="est-anel"><MapaEsquema ids={ordem} /></div>
        <div className="est-anel-legenda">
          <div className="rotulo" style={{ color: 'inherit', opacity: 0.7 }}>Distância total est.</div>
          <div style={{ fontSize: 19 }}>{numero(r.km)} km</div>
        </div>
      </div>
      </div>
    </div>
  )
}
