import { ArrowLeft, Trash2 } from 'lucide-react'
import { LinkFluido } from '@/app/navegacao'
import { useEstado } from '@/app/estado'
import { duracao, numero, reais } from '@/core/formato'
import { duracaoReal } from '@/core/resumo'

const quando = (ms: number) =>
  new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Resumos das rotas finalizadas (G12). Ficam guardados no aparelho até você apagar. */
export function RotasFinalizadas() {
  const { resumos, apagarResumo } = useEstado()
  return (
    <div className="rolagem">
      <div className="linha">
        <LinkFluido to="/estatisticas" className="icone-botao" aria-label="Voltar"><ArrowLeft size={22} /></LinkFluido>
        <h1 className="titulo">Rotas finalizadas</h1>
      </div>
      <p className="sub">Resumo de cada rota, guardado só neste aparelho. Distância, combustível e custo são estimados.</p>
      {resumos.length === 0 && <p className="sub" style={{ marginTop: 24 }}>Nenhuma rota finalizada ainda.</p>}
      {resumos.map((r) => {
        const real = duracaoReal(r)
        return (
          <article key={r.rotaId} className="conta resumo" aria-label={`Rota de ${quando(r.finalizadaEm)}`}>
            <div className="linha">
              <span className="cresce" style={{ fontSize: 15 }}>{quando(r.finalizadaEm)}</span>
              <span className="selo-estado" style={{ background: 'var(--fundo)', color: 'var(--texto)' }}>{r.motivo === 'substituida' ? 'SUBSTITUÍDA' : 'FINALIZADA'}</span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>{r.fonte === 'exemplo' ? 'Rota de exemplo' : 'Planilha da SPX'}</div>
            <div style={{ fontSize: 30, marginTop: 6 }}>{reais(r.custoCentavos)}</div>
            <div className="ln"><span>Entregues</span><span>{r.entregues} de {r.paradas} paradas</span></div>
            {r.falhas > 0 && <div className="ln"><span>Sem sucesso</span><span>{r.falhas}</span></div>}
            {r.pendentes > 0 && <div className="ln"><span>Não visitadas</span><span>{r.pendentes}</span></div>}
            <div className="ln"><span>Pacotes entregues</span><span>{r.pacotesEntregues ?? '—'} de {r.pacotes}</span></div>
            {!!r.pacotesSemSucesso && <div className="ln"><span>Pacotes sem sucesso</span><span>{r.pacotesSemSucesso}</span></div>}
            {!!r.pacotesPendentes && <div className="ln"><span>Pacotes não entregues (pendentes ao finalizar)</span><span>{r.pacotesPendentes}</span></div>}
            {!!r.parciais && <div className="ln"><span>Entregas parciais</span><span>{r.parciais}</span></div>}
            <div className="ln"><span>Distância estimada</span><span>{numero(r.km)} km</span></div>
            <div className="ln"><span>{r.combustivel}</span><span>{numero(r.litros)} L</span></div>
            <div className="ln"><span>Duração</span><span>{real === null ? 'não iniciada' : duracao(real)}</span></div>
            <div className="ln"><span>Detalhes da rota</span><span>{r.limpeza === 'pendente' ? 'limpeza pendente' : 'apagados do aparelho'}</span></div>
            <hr />
            <button className="resumo-apagar" onClick={() => apagarResumo(r.rotaId)} aria-label={`Apagar o resumo de ${quando(r.finalizadaEm)}`}>
              <Trash2 size={16} /> Apagar resumo
            </button>
          </article>
        )
      })}
    </div>
  )
}
