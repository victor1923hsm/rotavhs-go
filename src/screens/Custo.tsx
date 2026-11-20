import { useState } from 'react'
import { LinkFluido } from '@/app/navegacao'
import { ArrowLeft } from 'lucide-react'
import { resumoDaOrdem, useEstado } from '@/app/estado'
import { COMBUSTIVEIS, custoEstimado } from '@/core/custo'
import { lerNumero, numero, reais } from '@/core/formato'

export function Custo() {
  const { ordem, veiculo, definirVeiculo, avisar } = useEstado()
  const [preco, setPreco] = useState(numero(veiculo.precoCentavos / 100, 2))
  const [consumo, setConsumo] = useState(numero(veiculo.consumoKmL, 1))
  const km = resumoDaOrdem(ordem).km
  const c = custoEstimado(km, ordem.length, veiculo)
  return (
    <div className="rolagem">
      <div className="linha">
        <LinkFluido to="/estatisticas" className="icone-botao" aria-label="Voltar"><ArrowLeft size={22} /></LinkFluido>
        <h1 className="titulo">Custo das entregas</h1>
      </div>
      <p className="sub">Informe os dados do seu veículo. O app usa os km estimados das rotas importadas para calcular o custo.</p>

      <div className="secao">
        <div className="t">Combustível</div>
        <div className="fichas">
          {COMBUSTIVEIS.map((t) => (
            <button key={t} className={`ficha ${t === veiculo.combustivel ? 'ativa' : ''}`} aria-pressed={t === veiculo.combustivel} onClick={() => definirVeiculo({ combustivel: t })}>{t}</button>
          ))}
        </div>
      </div>
      <div className="secao">
        <label className="t" htmlFor="preco">Preço do combustível</label>
        <div className="entrada">
          <span className="rotulo">R$</span>
          <input id="preco" inputMode="decimal" value={preco} onChange={(ev) => {
            setPreco(ev.target.value)
            const v = lerNumero(ev.target.value)
            definirVeiculo({ precoCentavos: Number.isFinite(v) ? Math.round(v * 100) : 0 })
          }} />
          <span className="rotulo">{veiculo.combustivel === 'GNV' ? 'por m³' : 'por litro'}</span>
        </div>
      </div>
      <div className="secao">
        <label className="t" htmlFor="consumo">Consumo médio do veículo</label>
        <div className="entrada">
          <input id="consumo" inputMode="decimal" value={consumo} onChange={(ev) => {
            setConsumo(ev.target.value)
            const v = lerNumero(ev.target.value)
            definirVeiculo({ consumoKmL: Number.isFinite(v) ? v : 0 })
          }} />
          <span className="rotulo">km/L</span>
        </div>
      </div>

      <div className="conta" aria-live="polite">
        <div className="linha">
          <span className="cresce" style={{ fontSize: 15 }}>Custo da rota</span>
          <span className="selo-estado" style={{ background: 'var(--fundo)', color: 'var(--texto)' }}>ESTIMADO</span>
        </div>
        <div style={{ fontSize: 34, marginTop: 4 }}>{reais(c.totalCentavos)}</div>
        <div className="ln"><span>Distância estimada da rota</span><span>{numero(c.km)} km</span></div>
        <div className="ln"><span>Combustível ({numero(c.km)} ÷ {numero(veiculo.consumoKmL)})</span><span>{numero(c.litros)} L</span></div>
        <div className="ln"><span>Custo ({numero(c.litros)} L × {reais(veiculo.precoCentavos)})</span><span>{reais(c.totalCentavos)}</span></div>
        <hr />
        <div className="ln forte"><span>Custo por km</span><span>{reais(c.porKmCentavos)}</span></div>
        <div className="ln forte"><span>Custo por parada ({ordem.length})</span><span>{reais(c.porParadaCentavos)}</span></div>
      </div>
      <button className="botao" style={{ marginTop: 14 }} onClick={() => avisar('Custos guardados neste aparelho')}>Salvar custos</button>
    </div>
  )
}
