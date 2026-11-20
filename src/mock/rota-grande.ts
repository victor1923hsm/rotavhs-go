// Rota FICTÍCIA grande, só para testes de desempenho (Etapa 3): N paradas, 1 a 4 pacotes por endereço.
// Endereços e códigos inventados ("Rua Teste", "BRTESTE…"); coordenadas numa grade em volta do centro fictício.
import type { Parada } from '@/core/parada'
import type { RotaImportada } from '@/features/importar/converter'

export function rotaGrande(n = 200, semente = 7): RotaImportada {
  let s = semente
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const paradas: Parada[] = []
  let codigo = 0
  for (let i = 0; i < n; i++) {
    const q = 1 + Math.floor(rnd() * 4)
    paradas.push({
      id: `teste-${i + 1}`,
      stop: i + 1,
      pacotes: Array.from({ length: q }, () => `BRTESTE${String(++codigo).padStart(6, '0')}X`),
      endereco: `Rua Teste ${1 + Math.floor(rnd() * 90)}, ${10 + i}`,
      bairro: 'Bairro Fictício',
      semNumero: false,
      lat: -16.70 + Math.floor(i / 15) * 0.002 + rnd() * 0.0008,
      lon: -49.28 + (i % 15) * 0.002 + rnd() * 0.0008,
    })
  }
  return { fonte: 'exemplo', arquivo: 'rota-ficticia-200.xlsx', paradas, ordemSpx: paradas.map((p) => p.id), pacotes: codigo, semCoordenada: 0 }
}
