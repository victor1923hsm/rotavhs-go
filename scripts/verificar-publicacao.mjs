#!/usr/bin/env node
// Verificação "código testado = código publicado" (decisão de 2026-11-19, antes de qualquer publicação).
//
//   npm run manifesto            → roda TODOS os testes e, só se passarem, grava publicacao.manifesto.json
//                                  (SHA-256 de cada arquivo que entra no build e nos testes).
//   npm run conferir-publicacao  → confere a pasta atual contra o manifesto (o workflow do GitHub também faz
//                                  isso e para a publicação se algo diferir).
//   node scripts/verificar-publicacao.mjs comparar <pastaA> <pastaB>  → compara duas pastas (ex.: a testada e a
//                                  que vai para o GitHub).
//
// Texto é comparado com fim de linha normalizado (LF), igual ao que o Git guarda (.gitattributes: eol=lf);
// assim a mesma versão dá o mesmo resultado no Windows e no Linux.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** O que entra no build, nos testes e na publicação. Documentação fica de fora (pode mudar sem novo teste). */
export const INCLUIR = ['src', 'public', 'scripts', 'test-fixtures', '.github/workflows', 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.app.json', '.npmrc', '.gitignore', '.gitattributes']
const BINARIO = /\.(png|jpg|jpeg|gif|webp|ico|xlsx|xls|woff2?|ttf)$/i
export const MANIFESTO = 'publicacao.manifesto.json'

function listar(raiz, caminho, out) {
  const abs = join(raiz, caminho)
  if (!existsSync(abs)) return
  if (statSync(abs).isDirectory()) {
    for (const nome of readdirSync(abs).sort()) {
      if (nome === 'node_modules' || nome === 'dist' || nome.startsWith('.DS_Store')) continue
      listar(raiz, join(caminho, nome), out)
    }
  } else out.push(caminho.split(sep).join('/'))
}

/** Impressão digital de um arquivo (texto com LF normalizado). */
export function hashArquivo(abs, rel) {
  let dados = readFileSync(abs)
  if (!BINARIO.test(rel)) dados = Buffer.from(dados.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
  return createHash('sha256').update(dados).digest('hex')
}

/** { caminho: sha256 } de tudo o que entra no build e nos testes. */
export function impressoes(raiz) {
  const arquivos = []
  for (const c of INCLUIR) listar(raiz, c, arquivos)
  return Object.fromEntries(arquivos.filter((a) => a !== MANIFESTO).map((a) => [a, hashArquivo(join(raiz, a), a)]))
}

/** Diferenças entre duas listas de impressões. */
export function diferencas(esperado, atual) {
  const faltando = Object.keys(esperado).filter((k) => !(k in atual))
  const sobrando = Object.keys(atual).filter((k) => !(k in esperado))
  const alterados = Object.keys(esperado).filter((k) => k in atual && atual[k] !== esperado[k])
  return { faltando, sobrando, alterados, iguais: !faltando.length && !sobrando.length && !alterados.length }
}

function relatorio(d, rotulo) {
  if (d.iguais) {
    console.log(`✓ ${rotulo}: idêntico.`)
    return 0
  }
  console.log(`✗ ${rotulo}: DIFERENTE — não publique.`)
  for (const [t, l] of [['faltando', d.faltando], ['a mais', d.sobrando], ['alterados', d.alterados]]) if (l.length) console.log(`  ${t} (${l.length}): ${l.slice(0, 30).join(', ')}${l.length > 30 ? ' …' : ''}`)
  return 1
}

function principal(args) {
  const [modo, a, b] = args
  const raiz = process.cwd()
  if (modo === 'gerar') {
    const arquivos = impressoes(raiz)
    const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
    const m = { projeto: pkg.name, versao: pkg.version, geradoEm: new Date().toISOString(), observacao: 'gerado por "npm run manifesto" depois de npm test passar', total: Object.keys(arquivos).length, arquivos }
    writeFileSync(join(raiz, MANIFESTO), JSON.stringify(m, null, 1) + '\n')
    console.log(`✓ ${MANIFESTO}: ${m.total} arquivos (${m.geradoEm}).`)
    return 0
  }
  if (modo === 'conferir') {
    const arq = join(raiz, a ?? MANIFESTO)
    if (!existsSync(arq)) {
      console.log(`✗ ${MANIFESTO} não encontrado: rode "npm run manifesto" na versão testada. Não publique.`)
      return 1
    }
    const m = JSON.parse(readFileSync(arq, 'utf8'))
    return relatorio(diferencas(m.arquivos, impressoes(raiz)), `pasta atual × manifesto de ${m.geradoEm}`)
  }
  if (modo === 'comparar' && a && b) return relatorio(diferencas(impressoes(a), impressoes(b)), `${a} × ${b}`)
  console.log('uso: gerar | conferir [manifesto] | comparar <pastaA> <pastaB>')
  return 2
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join('/').split('/').pop())) process.exit(principal(process.argv.slice(2)))
