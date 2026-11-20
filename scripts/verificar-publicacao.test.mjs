// Testes da verificação "código testado = código publicado".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diferencas, impressoes } from './verificar-publicacao.mjs'

function pasta(arquivos) {
  const d = mkdtempSync(join(tmpdir(), 'pub-'))
  for (const [k, v] of Object.entries(arquivos)) {
    mkdirSync(join(d, k, '..'), { recursive: true })
    writeFileSync(join(d, k), v)
  }
  return d
}

test('mesma versão (LF × CRLF do Windows) dá o mesmo resultado', () => {
  const a = pasta({ 'src/a.ts': 'x\ny\n', 'package.json': '{}' })
  const b = pasta({ 'src/a.ts': 'x\r\ny\r\n', 'package.json': '{}' })
  assert.equal(diferencas(impressoes(a), impressoes(b)).iguais, true)
})

test('detecta arquivo alterado, faltando e a mais; ignora docs, node_modules e dist', () => {
  const a = pasta({ 'src/a.ts': '1', 'src/b.ts': '2', 'docs/x.md': 'a', 'package.json': '{}' })
  const b = pasta({ 'src/a.ts': 'MUDOU', 'src/c.ts': '3', 'docs/x.md': 'outra coisa', 'node_modules/z.js': 'z', 'dist/i.js': 'i', 'package.json': '{}' })
  const d = diferencas(impressoes(a), impressoes(b))
  assert.deepEqual(d.alterados, ['src/a.ts'])
  assert.deepEqual(d.faltando, ['src/b.ts'])
  assert.deepEqual(d.sobrando, ['src/c.ts'])
  assert.equal(d.iguais, false)
})

test('o próprio manifesto não entra na conta', () => {
  const a = pasta({ 'src/a.ts': '1', 'package.json': '{}' })
  const b = pasta({ 'src/a.ts': '1', 'package.json': '{}', 'publicacao.manifesto.json': '{}' })
  assert.equal(diferencas(impressoes(a), impressoes(b)).iguais, true)
})
