#!/usr/bin/env node
// Copiado do RotaVHS (só leitura, G3), com o cenário 11-formato-spx acrescentado no Go: D:\Projetos Claude\RotaVHS\frontend\scripts\\gerar-planilhas.mjs (versão de 2026-11-19).
/**
 * Gera planilhas SINTÉTICAS (.xlsx e .csv) para os testes do importador (CA-4.11.1).
 * Nomes e telefones são FICTÍCIOS. Nenhum dado real.
 * Escritor .xlsx mínimo (OOXML + ZIP "stored"), só com o node:zlib (CRC32) — sem dependências.
 *
 * Uso: npm run planilhas   (grava em test-fixtures/planilhas/)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32 } from 'node:zlib'

const OUT = new URL('../test-fixtures/planilhas/', import.meta.url)
mkdirSync(OUT, { recursive: true })

// ── ZIP (sem compressão) ────────────────────────────────────────────────
function zip(files) {
  const chunks = []
  const central = []
  let offset = 0
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8')
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8
    local.writeUInt16LE(0, 8) // stored
    local.writeUInt32LE(0, 10)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, nameBuf, data)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt32LE(0, 12)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const cdBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cdBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, cdBuf, end])
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const colName = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)))

function sheetXml(rows) {
  const body = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          if (v === null || v === undefined || v === '') return ''
          const ref = `${colName(ci)}${ri + 1}`
          return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
        })
        .join('')
      return `<row r="${ri + 1}">${cells}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

function xlsx(sheets) {
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)]),
  ]
  return zip(files)
}

// ── Dados SINTÉTICOS ────────────────────────────────────────────────────
const CAB = ['Sequência', 'Código do pacote', 'Destinatário', 'Telefone', 'Endereço', 'Complemento', 'Bairro', 'Cidade', 'UF', 'CEP']
const padrao = [
  CAB,
  [3, 'BR0000000000001', 'Cliente Fictício A', '(62) 90000-0001', 'Rua das Acácias, 120', 'Casa 2', 'Jd. Primavera', 'Cidade Teste', 'GO', '74000-001'],
  [3, 'BR0000000000002', 'Cliente Fictício A', '(62) 90000-0001', 'Rua das Acácias, 120', 'Casa 2', 'Jd. Primavera', 'Cidade Teste', 'GO', '74000-001'],
  [7, 'BR0000000000003', 'Cliente Fictício B', '(62) 90000-0002', 'R. dos Ipês, 77', 'Apto 12 Bloco B', 'Jardim Primavera', 'Cidade Teste', 'GO', '74000001'],
  [12, 'BR0000000000004', 'Cliente Fictício C', '(62) 90000-0003', 'Rua 10', 'Qd 15 Lt 22', 'Jd Primavera', 'Cidade Teste', 'GO', '74000-001'],
  [25, 'BR0000000000005', 'Cliente Fictício D', '(62) 90000-0004', 'Av. Central, 1450', '', 'Vila Nova', 'Cidade Teste', 'GO', '74000-002'],
]

const cenarios = {
  '01-padrao': [{ name: 'Rota', rows: padrao }],
  '02-cabecalho-linha-4': [{ name: 'Rota', rows: [['RELATÓRIO DE ROTA — DADOS FICTÍCIOS'], ['Gerado em 16/11/2026'], [], ...padrao] }],
  '03-colunas-outra-ordem-ingles': [
    {
      name: 'Sheet1',
      rows: [
        ['Phone', 'Recipient', 'Stop', 'Street', 'Number', 'District', 'City', 'State', 'Zip', 'Tracking Number'],
        ['(62) 90000-0009', 'Cliente Fictício E', 41, 'Rua das Flores', '15', 'Centro', 'Cidade Teste', 'GO', '74000-003', 'SPX000000000001'],
        ['(62) 90000-0010', 'Cliente Fictício F', 42, 'Rua das Flores', '30', 'Centro', 'Cidade Teste', 'GO', '74000-003', 'SPX000000000002'],
      ],
    },
  ],
  '04-sem-coluna-parada': [
    {
      name: 'Rota',
      rows: [
        ['Código', 'Endereço', 'Bairro', 'Cidade'],
        ['BR0000000000011', 'Rua A, 10', 'Centro', 'Cidade Teste'],
        ['BR0000000000012', 'Rua A, 10', 'Centro', 'Cidade Teste'],
        ['BR0000000000013', 'Rua B, 20', 'Centro', 'Cidade Teste'],
      ],
    },
  ],
  '05-quadra-lote-colunas-e-texto': [
    {
      name: 'Rota',
      rows: [
        ['Parada', 'Código', 'Logradouro', 'Número', 'Quadra', 'Lote', 'Complemento', 'Bairro', 'Cidade'],
        [1, 'BR0000000000021', 'Rua 10', 'S/N', 'QD 15', '22', '', 'Jd. Primavera', 'Cidade Teste'],
        [2, 'BR0000000000022', 'Rua 10', 'S/N', '', '', 'Q.15 L.23', 'Jd. Primavera', 'Cidade Teste'],
        [3, 'BR0000000000023', 'Rua 11', 'S/N', '', '', 'Quadra 05, Lote 01', 'Jd. Primavera', 'Cidade Teste'],
      ],
    },
  ],
  '06-duplicados-e-conflitos': [
    {
      name: 'Rota',
      rows: [
        CAB,
        [1, 'BR0000000000031', 'Cliente Fictício G', '(62) 90000-0011', 'Rua X, 1', '', 'Centro', 'Cidade Teste', 'GO', ''],
        [1, 'BR0000000000031', 'Cliente Fictício G', '(62) 90000-0011', 'Rua X, 1', '', 'Centro', 'Cidade Teste', 'GO', ''],
        [2, 'BR0000000000032', 'Cliente Fictício H', '(62) 90000-0012', 'Rua Y, 5', '', 'Centro', 'Cidade Teste', 'GO', ''],
        [2, 'BR0000000000033', 'Cliente Fictício I', '(62) 90000-0013', 'Rua Z, 9', '', 'Centro', 'Cidade Teste', 'GO', ''],
        [4, 'BR0000000000034', 'Cliente Fictício J', '(62) 90000-0014', 'Rua Y, 5', '', 'Centro', 'Cidade Teste', 'GO', ''],
        [5, 'BR0000000000035', 'Cliente Fictício K', '(62) 90000-0015', 'Rua W, 8', 'Apto 101', 'Centro', 'Cidade Teste', 'GO', ''],
        [6, 'BR0000000000036', 'Cliente Fictício L', '(62) 90000-0016', 'Rua W, 8', 'Apto 102', 'Centro', 'Cidade Teste', 'GO', ''],
      ],
    },
  ],
  '07-linhas-vazias-e-total': [
    { name: 'Rota', rows: [CAB, padrao[1], [], padrao[3], CAB, padrao[4], [], ['', '', '', '', '', '', '', '', 'TOTAL', 4]] },
  ],
  '08-coordenadas': [
    {
      name: 'Rota',
      rows: [
        ['Seq', 'Tracking', 'Endereço', 'Bairro', 'Cidade', 'Latitude', 'Longitude', 'Qtd volumes'],
        [9, 'BR0000000000041', 'Rua das Acácias, 200', 'Jd. Primavera', 'Cidade Teste', '-15,80012', '-47,90034', 3],
        [10, 'BR0000000000042', 'Rua das Acácias, 210', 'Jd. Primavera', 'Cidade Teste', 'abc', '', 1],
      ],
    },
  ],
  '09-duas-abas': [
    { name: 'Resumo', rows: [['Motorista', 'Data'], ['Fictício', '16/11/2026']] },
    { name: 'Entregas', rows: padrao },
  ],
  // RotaVHS Go (Etapa 2): o formato REAL da SPX conferido em 2026-11-19 (só as colunas; dados FICTÍCIOS).
  // Stop e Sequence "-" (sem número), Stop dividido (3: dois locais), vários pacotes por Stop, números e coordenadas como número.
  '11-formato-spx': [
    {
      name: 'Sheet1',
      rows: [
        ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'],
        ['AT0000TESTE', 1, 1, 'BR260000000101X', 'Rua Teste 1, 10', 'Bairro Ficticio', 'Cidade Teste', '70000-001', -15.80012, -47.90034],
        ['AT0000TESTE', 2, 1, 'BR260000000102X', 'Rua Teste 1, 10', 'Bairro Ficticio', 'Cidade Teste', '70000-001', -15.80012, -47.90034],
        ['AT0000TESTE', 3, 2, 'BR260000000103X', 'Rua Teste 2, 25, Lote 4', 'Bairro Ficticio', 'Cidade Teste', '70000-002', -15.80105, -47.90112],
        ['AT0000TESTE', 4, 3, 'BR260000000104X', 'Rua Teste 3, 7', 'Bairro Ficticio', 'Cidade Teste', '70000-003', -15.80210, -47.90201],
        ['AT0000TESTE', 5, 3, 'BR260000000105X', 'Rua Teste 9, 300', 'Bairro Ficticio', 'Cidade Teste', '70000-009', -15.80390, -47.90020],
        ['AT0000TESTE', 6, 4, 'BR260000000106X', 'Rua Teste 4, S/N, Quadra 2 Lote 8', 'Bairro Ficticio', 'Cidade Teste', '70000-004', -15.80301, -47.90305],
        ['AT0000TESTE', 7, 4, 'BR260000000107X', 'Rua Teste 4, S/N, Quadra 2 Lote 8', 'Bairro Ficticio', 'Cidade Teste', '70000-004', -15.80301, -47.90305],
        ['AT0000TESTE', 8, 4, 'BR260000000108X', 'Rua Teste 4, S/N, Quadra 2 Lote 8', 'Bairro Ficticio', 'Cidade Teste', '70000-004', -15.80301, -47.90305],
        ['AT0000TESTE', 9, 5, 'BR260000000109X', 'Rua Teste 5, 51', 'bairro ficticio', 'Cidade Teste', '70000-005', -15.80402, -47.90410],
        ['AT0000TESTE', '-', '-', 'BR260000000110X', 'Rua Teste 6, 60', 'Bairro Ficticio', 'Cidade Teste', '70000-006', -15.80500, -47.90500],
        ['AT0000TESTE', '-', '-', 'BR260000000111X', 'Rua Teste 7, 70', 'Bairro Ficticio', 'Cidade Teste', '70000-007', -15.79900, -47.89900],
      ],
    },
  ],
}

// ── RotaVHS Go (importação real, 2026-11-20): cenários do formato SPX, todos FICTÍCIOS ──
const SPX = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude']
const tn = (n) => `BR26${String(n).padStart(9, '0')}X`
// Problemas: pacote repetido, mesmo endereço (agrupa), mesma coordenada com endereços diferentes, aptos/blocos,
// coordenada inválida e fora da região, Stop "-", linha sem código, linha sem endereço, linha vazia.
cenarios['12-spx-problemas'] = [
  {
    name: 'Sheet1',
    rows: [
      SPX,
      ['AT0000TESTE', 1, 1, tn(201), 'Rua Teste 20, 100', 'Bairro Ficticio', 'Cidade Teste', '70000-020', -15.8101, -47.9101],
      ['AT0000TESTE', 2, 1, tn(202), 'Rua Teste 20, 100', 'Bairro Ficticio', 'Cidade Teste', '70000-020', -15.8101, -47.9101],
      ['AT0000TESTE', 3, 1, tn(202), 'Rua Teste 20, 100', 'Bairro Ficticio', 'Cidade Teste', '70000-020', -15.8101, -47.9101],
      ['AT0000TESTE', 4, 2, tn(203), 'Rua Teste 21, 50, Apto 101', 'Bairro Ficticio', 'Cidade Teste', '70000-021', -15.8110, -47.9110],
      ['AT0000TESTE', 5, 2, tn(204), 'Rua Teste 21, 50, Apto 102', 'Bairro Ficticio', 'Cidade Teste', '70000-021', -15.8110, -47.9110],
      ['AT0000TESTE', 6, 3, tn(205), 'Rua Teste 22, 10, Bloco A', 'Bairro Ficticio', 'Cidade Teste', '70000-022', -15.8120, -47.9120],
      ['AT0000TESTE', 7, 4, tn(206), 'Rua Teste 23, 77', 'Bairro Ficticio', 'Cidade Teste', '70000-023', -15.8120, -47.9120],
      ['AT0000TESTE', 8, 5, tn(207), 'Rua Teste 24, 5', 'Bairro Ficticio', 'Cidade Teste', '70000-024', 'abc', 'xyz'],
      ['AT0000TESTE', 9, 6, tn(208), 'Rua Teste 25, 9', 'Bairro Ficticio', 'Cidade Teste', '70000-025', -47.9130, -15.8130],
      ['AT0000TESTE', 10, 7, tn(209), 'Rua Teste 26, 1', 'Bairro Ficticio', 'Cidade Teste', '70000-026', '', ''],
      ['AT0000TESTE', '-', '-', tn(210), 'Rua Teste 27, 270', 'Bairro Ficticio', 'Cidade Teste', '70000-027', -15.8140, -47.9140],
      ['AT0000TESTE', 12, 8, '', 'Rua Teste 28, 280', 'Bairro Ficticio', 'Cidade Teste', '70000-028', -15.8150, -47.9150],
      ['AT0000TESTE', 13, 9, tn(212), '', 'Bairro Ficticio', 'Cidade Teste', '', -15.8160, -47.9160],
      [],
      ['AT0000TESTE', 14, 10, tn(213), 'Rua Teste 29, 290', 'Bairro Ficticio', 'Cidade Teste', '70000-029', -15.8170, -47.9170],
    ],
  },
]
// Rota grande: 250 paradas, 1 a 3 pacotes cada, numa grade de ~6 km (coordenadas fictícias).
{
  const rows = [SPX]
  let n = 1000
  let seq = 1
  for (let stop = 1; stop <= 250; stop++) {
    const q = 1 + (stop % 3)
    const lat = -15.80 - Math.floor((stop - 1) / 16) * 0.0035
    const lng = -47.90 - ((stop - 1) % 16) * 0.0035
    for (let k = 0; k < q; k++)
      rows.push(['AT0000TESTE', seq++, stop, tn(++n), `Rua Teste ${100 + stop}, ${stop * 3}`, `Bairro Ficticio ${1 + (stop % 9)}`, 'Cidade Teste', '70000-100', Number(lat.toFixed(5)), Number(lng.toFixed(5))])
  }
  cenarios['13-spx-250-paradas'] = [{ name: 'Sheet1', rows }]
}
// Sem a coluna de endereço: deve dizer qual coluna faltou.
cenarios['15-spx-sem-endereco'] = [{ name: 'Sheet1', rows: [['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Bairro', 'City'], ['AT0000TESTE', 1, 1, tn(301), 'Bairro Ficticio', 'Cidade Teste']] }]

for (const [nome, sheets] of Object.entries(cenarios)) writeFileSync(new URL(`${nome}.xlsx`, OUT), xlsx(sheets))

// CSV (separador ; e acentos), como o Excel brasileiro exporta
const csv = padrao.map((r) => r.map((v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(';')).join('\r\n')
writeFileSync(new URL('10-padrao.csv', OUT), '﻿' + csv, 'utf8')

// O formato SPX também em CSV (vírgula, como exporta o navegador), com acentos.
const spxCsv = cenarios['11-formato-spx'][0].rows
  .map((r) => r.map((v) => (/[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(','))
  .join('\r\n')
writeFileSync(new URL('14-formato-spx.csv', OUT), spxCsv.replace('Bairro Ficticio', 'Bairro Fictício'), 'utf8')

console.log(`planilhas sintéticas: ${Object.keys(cenarios).length} .xlsx + 2 .csv em test-fixtures/planilhas/`)
