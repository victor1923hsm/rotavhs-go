// Transições entre telas (View Transitions API do navegador, sem biblioteca; CLAUDE.md).
// Direção como no iOS: tela interna entra pela direita e volta pela esquerda; entre abas, desliza para o lado da aba.
// Sem suporte do navegador ou com "reduzir movimento": troca direto, sem animação.

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useHref, useLocation, useNavigate } from 'react-router'

/** As quatro abas do Figma (V15, 2026-11-25): Pedidos · Rotas · Estatísticas · Financeiro. */
export const ABAS = ['/pedidos', '/rotas', '/estatisticas', '/financeiro'] as const
/** Telas internas e a aba de onde saem. */
const PAI: Record<string, string> = { '/importar': '/pedidos', '/estatisticas/custo': '/estatisticas', '/estatisticas/rotas': '/estatisticas', '/estatisticas/preferencias': '/estatisticas' }

export type Direcao = 'frente' | 'tras' | 'aba-direita' | 'aba-esquerda' | 'nenhuma'

const abaDe = (rota: string): string => PAI[rota] ?? rota

export function direcaoEntre(de: string, para: string): Direcao {
  if (de === para) return 'nenhuma'
  if (PAI[para] === de) return 'frente'
  if (PAI[de] === para) return 'tras'
  const i = ABAS.indexOf(abaDe(de) as (typeof ABAS)[number])
  const j = ABAS.indexOf(abaDe(para) as (typeof ABAS)[number])
  if (i >= 0 && j >= 0 && i !== j) return j > i ? 'aba-direita' : 'aba-esquerda'
  return PAI[para] ? 'frente' : 'tras'
}

const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Navega com transição. A rota muda dentro da transição (flushSync), para o navegador capturar antes e depois. */
export function useIr() {
  const navegar = useNavigate()
  const { pathname } = useLocation()
  return (para: string) => {
    const direcao = direcaoEntre(pathname, para)
    const doc = document as Document & { startViewTransition?: (f: () => void) => unknown }
    if (direcao === 'nenhuma' || !doc.startViewTransition || semMovimento()) {
      navegar(para)
      return
    }
    document.documentElement.dataset.direcao = direcao
    doc.startViewTransition(() => flushSync(() => navegar(para)))
  }
}

/** Link comum (abre com o teclado, tem href), mas navega com transição. */
export function LinkFluido({ to, children, ...resto }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const ir = useIr()
  const href = useHref(to) // com o endereço base (ex.: /rotavhs-go/ no GitHub Pages)
  return (
    <a
      {...resto}
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        resto.onClick?.(e)
        ir(to)
      }}
    >
      {children}
    </a>
  )
}
