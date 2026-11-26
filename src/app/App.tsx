import { Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { BarChart3, Package, Route as IconeRota, Wallet } from 'lucide-react'
import { Aviso } from '@/components/ui/Aviso'
import { useEstado } from '@/app/estado'
import { ehFicticia } from '@/app/prototipo'
import { ABAS, LinkFluido } from '@/app/navegacao'
import { BuscaParada } from '@/components/domain/BuscaParada'
import { AlertaProximidade, PedidoGps } from '@/components/domain/Gps'
import { Pedidos } from '@/screens/Pedidos'
import { Rotas } from '@/screens/Rotas'
import { Estatisticas } from '@/screens/Estatisticas'
import { AvisoConferencia, GravacaoFalhou, RetomarRota } from '@/components/domain/Retomada'

import { CalcularRuas, Custo, Financeiro, Importar, Preferencias, RotasFinalizadas, preCarregarTelas } from '@/app/sobDemanda'

/** Enquanto o bloco da tela chega (raro: eles são pré-carregados). */
const Sob = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<div className="rolagem" aria-busy="true"><p className="rotulo">Carregando…</p></div>}>{children}</Suspense>
)

const ROTULOS = [
  { rotulo: 'Pedidos', Icone: Package },
  { rotulo: 'Rotas', Icone: IconeRota },
  { rotulo: 'Estatísticas', Icone: BarChart3 },
  { rotulo: 'Financeiro', Icone: Wallet },
] as const

/** Barra inferior do Figma (V15): encostada no fim da tela, quatro abas, aba ativa em menta.
 *  No tema Escuro ela fica mais clara que a tela, com linha menta no topo (aprovado em 2026-11-24).
 *  O destaque da aba ativa desliza até a aba nova. */
function BarraInferior() {
  const { pathname } = useLocation()
  const ativa = ABAS.findIndex((a) => pathname === a || pathname.startsWith(a + '/') || (a === '/pedidos' && pathname === '/importar'))
  return (
    <nav className="nav" aria-label="Abas">
      {ativa >= 0 && <span className="aba-pilula" style={{ transform: `translateX(${ativa * 100}%)` }} aria-hidden="true" />}
      {/* Camadas: barra (nav) → destaque (pílula) → ícones e nomes por cima, também durante as transições. */}
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

/** Selo do protótipo. Na tela Importar fica neutro: ali você pode estar conferindo outra planilha que não a rota carregada. */
function Selo({ ficticia }: { ficticia: boolean }) {
  const { pathname } = useLocation()
  const texto = pathname.endsWith('/importar') ? 'PROTÓTIPO DE TESTE' : ficticia ? 'PROTÓTIPO DE TESTE · dados fictícios' : 'PROTÓTIPO DE TESTE · sua planilha, só neste aparelho'
  return <div className="selo">{texto}</div>
}

export function App() {
  const ficticia = useEstado((e) => ehFicticia(e.rota))
  useEffect(preCarregarTelas, [])
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <div className="app">
        <Selo ficticia={ficticia} />
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
            <Route path="/estatisticas/ruas" element={<Sob><CalcularRuas /></Sob>} />
            <Route path="/financeiro" element={<Sob><Financeiro /></Sob>} />
            <Route path="*" element={<Navigate to="/pedidos" replace />} />
          </Routes>
        </main>
        <BarraInferior />
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
