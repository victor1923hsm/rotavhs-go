// Importação real (autorização de 2026-11-20): só planilhas FICTÍCIAS no formato da SPX.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { removeRow, type Finding } from '@/core/import/review'
import { buscarParadas, type Parada } from '@/core/parada'
import { lerPlanilha } from './leitura'
import { marcarCoordenadasSuspeitas, rotaDaImportacao } from './converter'

const bytes = (nome: string) => {
  const u = readFileSync(new URL(`../../../test-fixtures/planilhas/${nome}`, import.meta.url))
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}
async function ler(nome: string) {
  const r = await lerPlanilha(bytes(nome), nome)
  if (!r.ok) throw new Error(r.erro)
  return r.leitura
}

describe('importação real: formato SPX', () => {
  it('problemas da planilha: contabilidade fecha e nada é inventado', async () => {
    const l = await ler('12-spx-problemas.xlsx')
    expect(l.resultado.accounting).toEqual({ dataRows: 15, packages: 14, ignored: 1, ok: true })
    const r = rotaDaImportacao(l.resultado, [], l.arquivo)
    const por = (end: string) => r.paradas.find((p) => p.endereco === end)!
    // mesmo endereço e mesmo Stop → uma visita com os pacotes (inclusive o repetido, até você decidir)
    expect(por('Rua Teste 20, 100').pacotes).toEqual(['BR26000000201X', 'BR26000000202X', 'BR26000000202X'])
    // apartamentos diferentes no mesmo Stop: visitas separadas e sinalizadas (Stop original mantido)
    const aptos = r.paradas.filter((p) => p.stop === 2)
    expect(aptos.map((p) => p.endereco)).toEqual(['Rua Teste 21, 50, Apto 101', 'Rua Teste 21, 50, Apto 102'])
    expect(aptos.every((p) => p.parte?.n === 2)).toBe(true)
    // mesma coordenada, endereços diferentes: NÃO agrupa
    expect(por('Rua Teste 22, 10, Bloco A').id).not.toBe(por('Rua Teste 23, 77').id)
    // coordenadas: inválida, trocada (longe da rota) e vazia ficam fora do mapa, sem posição inventada
    expect(por('Rua Teste 24, 5').semCoordenada).toBe(true)
    expect(Number.isNaN(por('Rua Teste 24, 5').lat)).toBe(true)
    expect(por('Rua Teste 25, 9')).toMatchObject({ semCoordenada: true, coordenadaSuspeita: true })
    expect(por('Rua Teste 26, 1').semCoordenada).toBe(true)
    expect(r.semCoordenada).toBe(3)
    expect(r.coordenadasSuspeitas).toBe(1)
    // Stop "-" → "?" (nunca 0); sem código → "linha N"; sem endereço sinalizado
    expect(por('Rua Teste 27, 270').stop).toBeNull()
    expect(por('Rua Teste 28, 280').pacotes).toEqual(['linha 13'])
    expect(l.resultado.stops.some((s) => s.issues.some((i) => i.code === 'sem_endereco'))).toBe(true)
  })

  it('pacote repetido: detectado e resolvido só por decisão sua (sem sumir pacote)', async () => {
    const l = await ler('12-spx-problemas.xlsx')
    const f = l.achados.find((x) => x.kind === 'pacote_repetido') as Extract<Finding, { kind: 'pacote_repetido' }>
    expect(f).toMatchObject({ trackingCode: 'BR26000000202X', rows: [3, 4] })
    const ds = removeRow([], f, 4, 1)
    const r = rotaDaImportacao(l.resultado, ds, l.arquivo)
    expect(r.paradas.find((p) => p.stop === 1)!.pacotes).toEqual(['BR26000000201X', 'BR26000000202X'])
    expect(r.pacotes).toBe(13)
    // não deixa remover a última linha do pacote
    expect(removeRow(ds, f, 3, 2)).toEqual(ds)
  })

  it('CSV no formato SPX (vírgula, acentos): mesmo resultado do .xlsx', async () => {
    const a = rotaDaImportacao((await ler('14-formato-spx.csv')).resultado, [], 'a')
    const b = rotaDaImportacao((await ler('11-formato-spx.xlsx')).resultado, [], 'b')
    expect(a.paradas.map((p) => [p.stop, p.endereco, p.pacotes])).toEqual(b.paradas.map((p) => [p.stop, p.endereco, p.pacotes]))
    expect(a.paradas.map((p) => [p.lat, p.lon])).toEqual(b.paradas.map((p) => [p.lat, p.lon]))
  })

  it('250 paradas / 500 pacotes: tudo lido, nada some ou duplica', async () => {
    const l = await ler('13-spx-250-paradas.xlsx')
    const r = rotaDaImportacao(l.resultado, [], l.arquivo)
    expect(r.paradas).toHaveLength(250)
    expect(r.pacotes).toBe(500)
    const tns = r.paradas.flatMap((p) => p.pacotes)
    expect(new Set(tns).size).toBe(500)
    expect(r.paradas.map((p) => p.stop)).toEqual(Array.from({ length: 250 }, (_, i) => i + 1))
    expect(r.semCoordenada).toBe(0)
  })

  it('erros claros: coluna faltando, formato antigo, arquivo que não é planilha, vazio', async () => {
    const semEnd = await lerPlanilha(bytes('15-spx-sem-endereco.xlsx'), 'x.xlsx')
    expect(semEnd).toMatchObject({ ok: false })
    if (!semEnd.ok) expect(semEnd.erro).toContain('Destination Address')
    const xls = await lerPlanilha(new TextEncoder().encode('qualquer').buffer as ArrayBuffer, 'rota.xls')
    if (!xls.ok) expect(xls.erro).toContain('.xls')
    const falso = await lerPlanilha(new TextEncoder().encode('não sou zip').buffer as ArrayBuffer, 'rota.xlsx')
    if (!falso.ok) expect(falso.erro).toContain('não é uma planilha')
    const vazio = await lerPlanilha(new ArrayBuffer(0), 'rota.csv')
    if (!vazio.ok) expect(vazio.erro).toContain('vazio')
    const pdf = await lerPlanilha(new TextEncoder().encode('%PDF').buffer as ArrayBuffer, 'rota.pdf')
    if (!pdf.ok) expect(pdf.erro).toContain('Formato não aceito')
    expect([xls, falso, vazio, pdf].every((r) => !r.ok)).toBe(true)
    const soCabecalho = await lerPlanilha(new TextEncoder().encode('AT ID,Sequence,Stop,SPX TN,Destination Address\n').buffer as ArrayBuffer, 'r.csv')
    expect(soCabecalho.ok).toBe(false)
    if (!soCabecalho.ok) expect(soCabecalho.erro).toContain('nenhuma linha com pacote')
  })
})

describe('coordenadas suspeitas e busca', () => {
  const P = (id: string, lat: number, lon: number): Parada => ({ id, stop: 1, pacotes: [`BR${id}X`], endereco: id, bairro: '', semNumero: false, lat, lon })
  it('só marca a que fica longe da mediana; com menos de 3 pontos não marca', () => {
    const ps = [P('a', -15.8, -47.9), P('b', -15.81, -47.91), P('c', -15.82, -47.9), P('d', -47.9, -15.8)]
    expect(marcarCoordenadasSuspeitas(ps)).toBe(1)
    expect(ps.map((p) => !!p.coordenadaSuspeita)).toEqual([false, false, false, true])
    expect(ps[3]!.lat).toBe(-47.9) // não move a coordenada
    expect(marcarCoordenadasSuspeitas([P('a', 0.1, 0.1), P('b', 40, 40)])).toBe(0)
  })
  it('busca por Stop (dígitos curtos ou ?) e por parte do código do pacote', () => {
    const ps = [
      { ...P('1', 0, 0), stop: 12, pacotes: ['BR260000000101X', 'BR260000000102X'] },
      { ...P('2', 0, 0), stop: null, pacotes: ['BR260000000777X'] },
    ]
    expect(buscarParadas(ps, '12').paradas.map((p) => p.id)).toEqual(['1'])
    expect(buscarParadas(ps, '?').paradas.map((p) => p.id)).toEqual(['2'])
    const c = buscarParadas(ps, 'br26 0000000102')
    expect(c.tipo).toBe('codigo')
    expect(c.codigos.get('1')).toEqual(['BR260000000102X'])
    expect(buscarParadas(ps, '0777').paradas).toEqual([]) // 4 dígitos = número de parada
    expect(buscarParadas(ps, '00777').paradas.map((p) => p.id)).toEqual(['2'])
    expect(buscarParadas(ps, 'BR').tipo).toBe('nada')
  })
})
