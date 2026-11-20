// Laboratório de DEMONSTRAÇÃO (P3): GPS simulado para ver desvio, salto, sinal perdido e proximidade.
import { useEffect, useState } from 'react'
import { useDinamica, DESVIO_MS, FATOR_SIMULADO } from '@/app/dinamica'
import { useLocalizacao } from '@/app/localizacao'
import { useLaboratorio } from '@/app/simulador'
import { SeloDemo } from './Gps'

export function Laboratorio() {
  const lab = useLaboratorio()
  const loc = useLocalizacao()
  const desvioDesde = useDinamica((d) => d.desvioDesde)
  const avaliacao = useDinamica((d) => d.ultimaAvaliacao)
  const [, tic] = useState(0)
  useEffect(() => {
    if (desvioDesde === null) return
    const t = setInterval(() => tic((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [desvioDesde])
  const realAtivo = loc.ativa && !loc.simulado
  return (
    <details className="lab">
      <summary>
        <span className="cresce">Laboratório: GPS simulado</span>
        <SeloDemo />
      </summary>
      <p className="sub" style={{ margin: '6px 0 10px' }}>
        Posições inventadas perto das paradas fictícias, para ver a otimização dinâmica, o desvio e os alertas sem sair de casa. As esperas da demonstração passam {FATOR_SIMULADO}× mais rápido (desvio: {DESVIO_MS / 1000 / FATOR_SIMULADO} s em vez de {DESVIO_MS / 60000} min; intervalo entre sugestões: 5 s em vez de 60 s).
      </p>
      {!lab.ligado ? (
        <button className="botao contorno" onClick={lab.ligar} disabled={realAtivo}>
          {realAtivo ? 'Desligue o GPS real para simular' : 'Ligar GPS simulado'}
        </button>
      ) : (
        <>
          <div className="lab-grade">
            <button onClick={lab.irParaProxima}>Ir até a próxima parada</button>
            <button onClick={lab.chegarNaProxima}>Chegar perto (30 m)</button>
            <button onClick={lab.desviar}>Desviar 650 m</button>
            <button onClick={lab.salto}>Salto de 3 km</button>
            <button onClick={lab.imprecisa}>Precisão ±180 m / ±8 m</button>
            {lab.semSinal ? <button onClick={lab.voltarSinal}>Sinal de volta</button> : <button onClick={lab.perderSinal}>Perder sinal</button>}
            <button onClick={lab.gpsDesligado}>GPS desligado</button>
            <button onClick={lab.desligar}>Desligar simulador</button>
          </div>
          <p className="rotulo" style={{ margin: '8px 2px 0' }} aria-live="polite">
            {lab.andando ? 'Andando… ' : ''}
            {lab.registro}
            {desvioDesde !== null && ` · Fora do trecho há ${Math.round((Date.now() - desvioDesde) / 1000)} s`}
            {avaliacao && ` · Desvio avaliado: ${avaliacao.sugerida ? 'nova ordem sugerida' : 'a ordem atual continua a melhor pelo modelo (ou é cedo para outra sugestão)'}`}
            {` · Descartadas: ${loc.descartadas.salto} salto(s), ${loc.descartadas.imprecisa} imprecisa(s)`}
          </p>
        </>
      )}
    </details>
  )
}
