// Telas secundárias carregadas só quando abertas (Q6, G14: JS inicial ≤ 150 KB).
// Depois que o app abre e fica ocioso, os blocos são baixados em segundo plano para que a primeira
// abertura de cada tela seja instantânea (sem tela em branco no meio da transição) — também sem internet,
// porque o service worker já os guarda.
import { lazy } from 'react'

const carregar = {
  importar: () => import('@/screens/Importar'),
  custo: () => import('@/screens/Custo'),
  rotasFinalizadas: () => import('@/screens/RotasFinalizadas'),
  preferencias: () => import('@/screens/Preferencias'),
  financeiro: () => import('@/screens/Financeiro'),
  calcularRuas: () => import('@/screens/CalcularRuas'),
  revisaoParadas: () => import('@/screens/RevisaoParadas'),
  testarRoteirizacao: () => import('@/experimental/TestarRoteirizacao'),
  laboratorio: () => import('@/components/domain/Laboratorio'),
}

export const Importar = lazy(() => carregar.importar().then((m) => ({ default: m.Importar })))
export const Custo = lazy(() => carregar.custo().then((m) => ({ default: m.Custo })))
export const RotasFinalizadas = lazy(() => carregar.rotasFinalizadas().then((m) => ({ default: m.RotasFinalizadas })))
export const Preferencias = lazy(() => carregar.preferencias().then((m) => ({ default: m.Preferencias })))
export const Financeiro = lazy(() => carregar.financeiro().then((m) => ({ default: m.Financeiro })))
export const CalcularRuas = lazy(() => carregar.calcularRuas().then((m) => ({ default: m.CalcularRuas })))
export const RevisaoParadas = lazy(() => carregar.revisaoParadas().then((m) => ({ default: m.RevisaoParadas })))
export const TestarRoteirizacao = lazy(() => carregar.testarRoteirizacao().then((m) => ({ default: m.TestarRoteirizacao })))
export const Laboratorio = lazy(() => carregar.laboratorio().then((m) => ({ default: m.Laboratorio })))

let feito = false
/** Baixa os blocos das telas secundárias quando o aparelho estiver ocioso (uma vez). */
export function preCarregarTelas() {
  if (feito || typeof window === 'undefined') return
  feito = true
  const fila = Object.values(carregar)
  const ocioso = (f: () => void) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 1500)
  const proximo = () => {
    const f = fila.shift()
    if (!f) return
    void f().catch(() => { /* sem conexão: carrega quando a tela abrir */ }).finally(() => ocioso(proximo))
  }
  ocioso(proximo)
}
