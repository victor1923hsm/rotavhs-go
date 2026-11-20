// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\address\\address.test.ts (versão de 2026-11-19).
/** Etapa 4.1 — normalizador de endereços (CA-4.02.2 e base do CA-4.06). Dados SINTÉTICOS. */
import { describe, expect, it } from 'vitest'
import { aliasOf, doorKey, matchKey, normalizeAddress, splitFullAddress } from './address'
import { cleanQuadraLoteValue, extractQuadraLote } from './extract'
import { basic, cep5, expand, houseNumber, streetKey } from './normalize'
import { jaroWinkler } from './similarity'

describe('extração de quadra e lote (40+ variações)', () => {
  const casos: [string, string | undefined, string | undefined][] = [
    ['Qd 15 Lt 22', '15', '22'],
    ['QD 15 LT 22', '15', '22'],
    ['qd15 lt22', '15', '22'],
    ['QD15-LT22', '15', '22'],
    ['Qd. 15 Lt. 22', '15', '22'],
    ['Q.15 L.22', '15', '22'],
    ['Q 15 L 22', '15', '22'],
    ['Quadra 15, Lote 22', '15', '22'],
    ['quadra 15 lote 22', '15', '22'],
    ['QUADRA 15 - LOTE 22', '15', '22'],
    ['Qda 15 Lte 22', '15', '22'],
    ['Quad 15 Lt 22', '15', '22'],
    ['Qdr 15 Lt 22', '15', '22'],
    ['Qd 05 Lt 03', '5', '3'],
    ['Quadra 005, Lote 010', '5', '10'],
    ['Qd 15A Lt 22', '15a', '22'],
    ['Qd 15-A Lt 22', '15a', '22'],
    ['Qd 15 A Lt 22', '15a', '22'],
    ['QD 15A LT 22B', '15a', '22b'],
    ['Qd 15 Lt 22 Casa 2', '15', '22'],
    ['Rua 10 Qd 15 Lt 22', '15', '22'],
    ['Lt 22 Qd 15', '15', '22'],
    ['Lote 22 Quadra 15', '15', '22'],
    ['Qd 15', '15', undefined],
    ['Quadra 15', '15', undefined],
    ['Lt 22', undefined, '22'],
    ['Lote 7', undefined, '7'],
    ['Q15 L7', '15', '7'],
    ['Qd:15 Lt:22', '15', '22'],
    ['Qd nº 15 Lt nº 22', '15', '22'],
    ['Qd 15 / Lt 22', '15', '22'],
    ['(Qd 15) (Lt 22)', '15', '22'],
    ['Quadra Quinze', undefined, undefined],
    ['Rua das Acácias, 120', undefined, undefined],
    ['Apto 12 Bloco B', undefined, undefined],
    ['Casa 2', undefined, undefined],
    ['Qd 1 Lt 1', '1', '1'],
    ['Qd 120 Lt 3', '120', '3'],
    ['qD 15 lT 22', '15', '22'],
    ['Quadra 15 Lote 22 Jd Primavera', '15', '22'],
    ['Qd 15 L 22', '15', '22'],
    ['Rua Q Qd 3 Lt 4', '3', '4'],
  ]
  for (const [txt, q, l] of casos) {
    it(`"${txt}" → quadra ${q ?? '—'}, lote ${l ?? '—'}`, () => {
      const r = extractQuadraLote(txt)
      expect(r.quadra).toBe(q)
      expect(r.lote).toBe(l)
    })
  }

  it('colunas próprias de quadra/lote', () => {
    expect(cleanQuadraLoteValue('15')).toBe('15')
    expect(cleanQuadraLoteValue('Qd 015')).toBe('15')
    expect(cleanQuadraLoteValue(7)).toBe('7')
    expect(cleanQuadraLoteValue('15-A')).toBe('15a')
    expect(cleanQuadraLoteValue('')).toBeUndefined()
    expect(cleanQuadraLoteValue('sem quadra')).toBeUndefined()
  })
})

describe('normalização', () => {
  it('acentos, maiúsculas, pontuação e espaços', () => {
    expect(basic('  Jd.  PRIMAVERA – São  José ')).toBe('jd primavera – sao jose')
    expect(basic('Rua São João, nº 12')).toBe('rua sao joao n 12')
  })
  it('abreviações', () => {
    expect(expand('Jd Primavera')).toBe('jardim primavera')
    expect(expand('Jardim Primavera')).toBe('jardim primavera')
    expect(expand('Av. Brasil')).toBe('avenida brasil')
    expect(expand('Res. Bela Vista')).toBe('residencial bela vista')
    expect(expand('Vl. Nova')).toBe('vila nova')
    expect(expand('Cj Habitacional')).toBe('conjunto habitacional')
  })
  it('rua: "R. X" = "Rua X" = "X"', () => {
    expect(streetKey('R. das Acácias')).toBe('das acacias')
    expect(streetKey('Rua das Acacias')).toBe('das acacias')
    expect(streetKey('das acácias')).toBe('das acacias')
    expect(streetKey('Av das Acácias')).toBe('avenida das acacias')
  })
  it('número, S/N e CEP', () => {
    expect(houseNumber('120')).toBe('120')
    expect(houseNumber('0120A')).toBe('120a')
    expect(houseNumber('S/N')).toBe('sn')
    expect(houseNumber('s/n')).toBe('sn')
    expect(houseNumber('Sem número')).toBe('sn')
    expect(houseNumber(77)).toBe('77')
    expect(cep5('04567-000')).toBe('04567')
    expect(cep5('4567000')).toBe('04567')
    expect(cep5('abc')).toBe('')
  })
  it('endereço completo numa coluna só', () => {
    expect(splitFullAddress('R. das Acácias, 120 - Casa 2')).toEqual({ street: 'R. das Acácias', number: '120', rest: 'Casa 2' })
    expect(splitFullAddress('Rua dos Ipês 77 Apto 12')).toEqual({ street: 'Rua dos Ipês', number: '77', rest: 'Apto 12' })
    expect(splitFullAddress('Avenida Central, nº 1450')).toEqual({ street: 'Avenida Central', number: '1450', rest: '' })
    expect(splitFullAddress('Rua Sem Número, S/N').number.toLowerCase()).toBe('s/n')
  })
})

describe('chaves de casamento', () => {
  const base = { city: 'Cidade Teste', uf: 'GO', neighborhood: 'Jd. Primavera' }
  it('mesma quadra escrita de jeitos diferentes → mesma chave', () => {
    const a = normalizeAddress({ ...base, full: 'Rua 10, Qd 15 Lt 22' })
    const b = normalizeAddress({ ...base, neighborhood: 'Jardim Primavera', street: 'R. 10', quadra: 'QD 015', lote: '22' })
    expect(matchKey(a, 'quadra')).toBe(matchKey(b, 'quadra'))
    expect(matchKey(a, 'lote')).toBe(matchKey(b, 'lote'))
    expect(matchKey(a, 'quadra')).toBe('go|cidade teste|jardim primavera|q:15')
  })
  it('Quadra 15 do Jd. Primavera ≠ Quadra 15 da Vila Nova (nem de outra cidade)', () => {
    const a = normalizeAddress({ ...base, quadra: '15' })
    const b = normalizeAddress({ ...base, neighborhood: 'Vila Nova', quadra: '15' })
    const c = normalizeAddress({ ...base, city: 'Outra Cidade', quadra: '15' })
    expect(matchKey(a, 'quadra')).not.toBe(matchKey(b, 'quadra'))
    expect(matchKey(a, 'quadra')).not.toBe(matchKey(c, 'quadra'))
  })
  it('sem cidade e sem bairro não há chave (não chuta)', () => {
    expect(matchKey(normalizeAddress({ quadra: '15' }), 'quadra')).toBeNull()
  })
  it('imóvel por rua + número; S/N não vira chave', () => {
    const n = normalizeAddress({ ...base, street: 'Rua dos Ipês', number: '77' })
    expect(matchKey(n, 'imovel')).toBe('go|cidade teste|jardim primavera|s:dos ipes|n:77')
    expect(matchKey(normalizeAddress({ ...base, street: 'Rua X', number: 'S/N' }), 'imovel')).toBeNull()
    expect(matchKey(n, 'entrada')).toBe('go|cidade teste|jardim primavera|s:dos ipes|n:77|e')
  })
  it('apartamentos diferentes no mesmo número NÃO são a mesma porta', () => {
    const a = normalizeAddress({ ...base, street: 'Rua dos Ipês', number: '77', complement: 'Apto 12' })
    const b = normalizeAddress({ ...base, street: 'Rua dos Ipês', number: '77', complement: 'Apto 13' })
    const c = normalizeAddress({ ...base, street: 'R. dos Ipes', number: '77', complement: 'apartamento 12' })
    expect(doorKey(a)).not.toBe(doorKey(b))
    expect(doorKey(a)).toBe(doorKey(c))
  })
  it('alias = escrita original compactada', () => {
    expect(aliasOf({ full: 'Rua 10, Qd 15 Lt 22', neighborhood: 'Jd. Primavera' })).toBe('rua 10 qd 15 lt 22 jd primavera')
  })
})

describe('similaridade (Jaro-Winkler)', () => {
  it('bairros parecidos ficam acima de 0,92; diferentes, abaixo', () => {
    expect(jaroWinkler('jardim primavera', 'jardim primavera')).toBe(1)
    expect(jaroWinkler('jardim primavera', 'jardim primaveira')).toBeGreaterThan(0.92)
    expect(jaroWinkler('jardim primavera', 'vila nova')).toBeLessThan(0.7)
    expect(jaroWinkler('', 'x')).toBe(0)
  })
})
