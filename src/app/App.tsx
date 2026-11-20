import { Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { BarChart3, Package, Route as IconeRota } from 'lucide-react'
import { Aviso } from '@/components/ui/Aviso'
import { useEstado } from '@/app/estado'
import { PROTOTIPO } from '@/app/prototipo'
import { ABAS, LinkFluido } from '@/app/navegacao'
import { BuscaParada } from '@/components/domain/BuscaParada'
import { AlertaProximidade, PedidoGps } from '@/components/domain/Gps'
import { Pedidos } from '@/screens/Pedidos'
import { Rotas } from '@/screens/Rotas'
import { Estatisticas } from '@/screens/Estatisticas'
import { AvisoConferencia, GravacaoFalhou, RetomarRota } from '@/components/domain/Retomada'

import { Custo, Importar, Preferencias, RotasFinalizadas, preCarregarTelas } from '@/app/sobDemanda'

/** Enquanto o bloco da tela chega (raro: eles são pré-carregados). */
const Sob = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<div className="rolagem" aria-busy="true"><p className="rotulo">Carregando…</p></div>}>{children}</Suspense>
)

const ROTULOS = [
  { rotulo: 'Pedidos', Icone: Package },
  { rotulo: 'Rotas', Icone: IconeRota },
  { rotulo: 'Estatísticas', Icone: BarChart3 },
] as const

/** Menu flutuante (vidro escuro, cantos arredondados). O destaque da aba ativa desliza até a aba nova. */
function MenuFlutuante() {
  const { pathname } = useLocation()
  const ativa = ABAS.findIndex((a) => pathname === a || pathname.startsWith(a + '/') || (a === '/pedidos' && pathname === '/importar'))
  return (
    <nav className="nav" aria-label="Abas">
      {ativa >= 0 && <span className="aba-pilula" style={{ transform: `translateX(${ativa * 100}%)` }} aria-hidden="true" />}
      {/* Camadas: vidro (nav) → destaque (pílula) → ícones e nomes por cima, também durante as transições. */}
      <div className="abas">
        {ABAS.map((para, i) => {
          const { rotulo, Icone } = ROTULOS[i]!
          return (
            <LinkFluido key={para} to={para} className={`aba ${i === ativa ? 'ativa' : ''}`} aria-current={i === ativa ? 'page' : undefined}>
              <Icone size={22} />
              <span>{rotulo}</span>
            </LinkFluido>
          )
        })}
      </div>
    </nav>
  )
}

export function App() {
  const fonte = useEstado((e) => e.rota.fonte)
  useEffect(preCarregarTelas, [])
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <div className="app">
        <div className="selo">{PROTOTIPO || fonte === 'exemplo' ? 'PROTÓTIPO DE TESTE · dados fictícios' : 'PROTÓTIPO DE TESTE · sua planilha, só neste aparelho'}</div>
        <main className="tela">
          <Routes>
            <Route path="/" element={<Navigate to="/pedidos" replace />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/importar" element={<Sob><Importar /></Sob>} />
            <Route path="/rotas" element={<Rotas />} />
            <Route path="/estatisticas" element={<Estatisticas />} />
            <Route path="/estatisticas/custo" element={<Sob><Custo /></Sob>} />
            <Route path="/estatisticas/rotas" element={<Sob><RotasFinalizadas /></Sob>} />
            <Route path="/estatisticas/preferencias" element={<Sob><Preferencias /></Sob>} />
            <Route path="*" element={<Navigate to="/pedidos" replace />} />
          </Routes>
        </main>
        <MenuFlutuante />
        <AlertaProximidade />
        <Aviso />
        <BuscaParada />
        <PedidoGps />
        <GravacaoFalhou />
        <AvisoConferencia />
        <RetomarRota />
      </div>
    </BrowserRouter>
  )
}
