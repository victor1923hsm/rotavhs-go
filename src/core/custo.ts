// Custo estimado de combustível da rota (G12). Dinheiro sempre em centavos inteiros.

export type Combustivel = 'Gasolina' | 'Etanol' | 'Diesel' | 'GNV'
export const COMBUSTIVEIS: readonly Combustivel[] = ['Gasolina', 'Etanol', 'Diesel', 'GNV']

export interface Veiculo {
  combustivel: Combustivel
  /** Preço do litro (ou m³ no GNV), em centavos. Informado pelo usuário. */
  precoCentavos: number
  /** Consumo médio em km por litro. Informado pelo usuário. */
  consumoKmL: number
}

export interface CustoEstimado {
  km: number
  litros: number
  totalCentavos: number
  porKmCentavos: number
  porParadaCentavos: number
}

/** litros = km ÷ consumo; custo = litros × preço. Tudo estimado (os km são estimados). */
export function custoEstimado(km: number, paradas: number, v: Veiculo): CustoEstimado {
  const consumo = v.consumoKmL > 0 ? v.consumoKmL : 0
  const litros = consumo > 0 ? km / consumo : 0
  const totalCentavos = Math.round(litros * Math.max(0, v.precoCentavos))
  return {
    km,
    litros,
    totalCentavos,
    porKmCentavos: km > 0 ? Math.round(totalCentavos / km) : 0,
    porParadaCentavos: paradas > 0 ? Math.round(totalCentavos / paradas) : 0,
  }
}
