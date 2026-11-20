#!/usr/bin/env node
// Verificador de contraste (Etapa 1): lê src/styles/tokens.css e confere os pares marcados com
// "contraste: --a/--b" no tema Sol. Meta: ≥ 7:1 no texto principal (CLAUDE.md, sol forte).
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
const bloco = css.match(/:root,\s*\[data-theme='sol'\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const extra = css.match(/:root \{([\s\S]*?)\n\}/g)?.join('\n') ?? ''
const vars = {}
for (const [, k, v] of (bloco + extra).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) vars[k] = v
const pares = [...bloco.matchAll(/contraste:\s*(--[\w-]+)\/(--[\w-]+)/g)].map((m) => [m[1], m[2]])

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const razao = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
let falhas = 0
for (const [a, b] of pares) {
  if (!vars[a] || !vars[b]) {
    console.log(`?  ${a}/${b}: token não encontrado`)
    falhas++
    continue
  }
  const r = razao(vars[a], vars[b])
  const ok = r >= 7
  if (!ok) falhas++
  console.log(`${ok ? 'OK' : 'FALHA'}  ${a} (${vars[a]}) sobre ${b} (${vars[b]}): ${r.toFixed(2)}:1`)
}
console.log(`\n${pares.length} pares verificados no tema Sol · ${falhas} abaixo de 7:1`)
process.exit(falhas ? 1 : 0)
