// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\import\\csv.ts (versão de 2026-11-19).
/** Leitor de CSV próprio (RFC 4180): aspas, aspas duplas escapadas, quebras de linha dentro de aspas; separador ; , ou tab. */
export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch: string) => first.split(ch).length - 1
  const opts: [';' | ',' | '\t', number][] = [[';', count(';')], [',', count(',')], ['\t', count('\t')]]
  opts.sort((a, b) => b[1] - a[1])
  return opts[0]![1] > 0 ? opts[0]![0] : ';'
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const d = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === d) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
