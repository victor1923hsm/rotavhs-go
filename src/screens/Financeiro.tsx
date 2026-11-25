// Financeiro (aba do Figma, V15 aprovada em 2026-11-25). Layout do Figma "Financeiro": título com selo,
// cartão menta de destaque, gráfico da semana, lista recente e dois cartões de números.
// Só mostra o que o app já sabe de verdade: custo de combustível ESTIMADO (km estimados × consumo × preço
// informados por você) e as entregas das rotas. Receitas, abastecimentos e despesas (módulo Q4) ainda não
// existem: aparecem como "em desenvolvimento". Nada aqui sai do aparelho.
import { LinkFluido } from '@/app/navegacao'
import { resumoDaOrdem, useEstado } from '@/app/estado'
import { custoEstimado } from '@/core/custo'
import { reais } from '@/core/formato'
import { semanaFinanceira } from '@/core/financeiro'

export function Financeiro() {
  const { ordem, status, pacotes, veiculo, resumos } = useEstado()
  const r = resumoDaOrdem(ordem)
  const hoje = custoEstimado(r.km, ordem.length, veiculo)
  const entreguesHoje = Object.values(pacotes).reduce((n, ps) => n + ps.filter((x) => x === 'entregue').length, 0)
  const visitasFeitas = ordem.filter((id) => status[id] === 'entregue').length
  const semana = semanaFinanceira(resumos, Date.now(), { entregues: entreguesHoje, custoCentavos: hoje.totalCentavos })
  const maior = Math.max(1, ...semana.dias.map((d) => d.entregas))
  return (
    <div className="rolagem">
      <div className="linha">
        <h1 className="titulo cresce">Financeiro</h1>
        <span className="selo-estado">ESTIMADO</span>
      </div>
      <p className="sub">Cada entrega conta.</p>

      <div className="fin-destaque">
        <span style={{ fontSize: 14 }}>Combustível da rota de hoje · estimado</span>
        <span className="fin-valor">{reais(hoje.totalCentavos)}</span>
        <div className="fin-rodape">
          <span>Por parada</span>
          <b>{reais(hoje.porParadaCentavos)}</b>
        </div>
      </div>

      <div className="linha" style={{ marginTop: 18, alignItems: 'baseline' }}>
        <span className="cresce" style={{ fontSize: 18 }}>Esta semana</span>
        <span style={{ fontSize: 18 }}>{semana.totalEntregas} entregas</span>
      </div>
      <div className="fin-barras" role="img" aria-label={`Entregas por dia nos últimos 7 dias: ${semana.dias.map((d) => `${d.rotulo} ${d.entregas}`).join(', ')}`}>
        {semana.dias.map((d, i) => (
          <div key={i} className="fin-dia">
            <div className={`fin-barra ${d.hoje ? 'hoje' : ''}`} style={{ height: `${Math.max(8, Math.round((d.entregas / maior) * 62))}px` }} />
            <span className="rotulo" style={{ fontSize: 11 }}>{d.rotulo}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 18, marginTop: 16 }}>Rotas recentes</div>
      {semana.recentes.length === 0 && <p className="rotulo" style={{ marginTop: 6 }}>Nenhuma rota finalizada ainda.</p>}
      {semana.recentes.map((x) => (
        <div key={x.id} className="fin-linha">
          <span className="fin-icone" aria-hidden="true">↗</span>
          <div className="cresce">
            <div>{x.data}</div>
            <div className="rotulo">{x.entregas} entregues · {x.km} km estimados</div>
          </div>
          <b style={{ fontWeight: 500 }}>{reais(x.custoCentavos)}</b>
        </div>
      ))}

      <div className="fin-par">
        <div className="cartao">
          <div className="rotulo">Combustível na semana</div>
          <div style={{ fontSize: 22, marginTop: 4 }}>{reais(semana.custoCentavos)}</div>
        </div>
        <div className="cartao">
          <div className="rotulo">Entregas hoje</div>
          <div style={{ fontSize: 22, marginTop: 4 }}>{entreguesHoje}</div>
        </div>
      </div>

      <div className="dados-cartao" style={{ marginTop: 14 }}>
        <div className="selo-estado aviso" style={{ display: 'inline-block' }}>EM DESENVOLVIMENTO</div>
        <p className="rotulo" style={{ marginTop: 8 }}>
          Receita da rota, abastecimentos, despesas e lucro estimado entram numa próxima versão (módulo opcional). Hoje esta tela mostra só o custo estimado de
          combustível e as entregas. {visitasFeitas > 0 ? '' : 'Marque entregas na aba Pedidos para ver os números do dia.'}
        </p>
        <LinkFluido to="/estatisticas/custo" className="selo-estado" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, letterSpacing: 0, padding: '10px 12px', textDecoration: 'none' }}>
          Ajustar combustível e consumo →
        </LinkFluido>
      </div>
    </div>
  )
}
