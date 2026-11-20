#!/usr/bin/env node
// Tamanho do JS (G14): inicial (o que index.html carrega) × bloco do mapa (carregado só na tela Rotas).
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const dist = new URL('../dist/', import.meta.url)
const html = readFileSync(new URL('index.html', dist), 'utf8')
const iniciais = [...html.matchAll(/(?:src|href)="\/(?:[^"]*\/)?(assets\/[^"]+\.js)"/g)].map((m) => m[1])
const kb = (f) => gzipSync(readFileSync(new URL(f, dist))).length / 1024
const todos = readdirSync(new URL('assets/', dist)).filter((f) => f.endsWith('.js')).map((f) => 'assets/' + f)
if (!iniciais.length) {
  console.error('Nenhum JS inicial encontrado em dist/index.html')
  process.exit(1)
}
const inicial = iniciais.reduce((s, f) => s + kb(f), 0)
console.log('JS inicial (gzip):', inicial.toFixed(1), 'KB', inicial <= 150 ? '✓ meta ≤ 150 KB' : '✗ acima da meta de 150 KB')
for (const f of todos.filter((f) => !iniciais.includes(f))) console.log('Carregado sob demanda:', f, kb(f).toFixed(1), 'KB gzip')
process.exit(inicial <= 150 ? 0 : 1)
