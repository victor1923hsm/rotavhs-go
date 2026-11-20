// Formatação pt-BR.

export function reais(centavos: number): string {
  return 'R$ ' + (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function numero(v: number, casas = 1): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export function duracao(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

/** Lê um número digitado em pt-BR ("6,19", "1.234,5"). Retorna NaN se não for número. */
export function lerNumero(texto: string): number {
  const limpo = texto.trim().replace(/[^\d,.-]/g, '')
  if (!limpo) return Number.NaN
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  return Number.parseFloat(normal)
}
