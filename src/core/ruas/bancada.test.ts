// Bancada da RB-0 (só roda com BANCADA=1; fora da suíte normal). Dados FICTÍCIOS (malha sintética).
// Mede: pedidos à API (pelos limites do ORS público), espera mínima imposta pelo limite por minuto (relógio simulado,
// SEM latência de rede), bytes recebidos (JSON compacto do provedor sintético), tempo e memória do motor nesta CPU,
// km e minutos do modelo, pontos problemáticos. NÃO mede o ORS real (RB-1, com chave).
import { describe, it } from 'vitest'
import { otimizar } from '../otimizacao/motor'
import { roteirizar } from './fluxo'
import { LIMITES_ORS } from './provedores'
import { preverConsumo } from './relatorio'
import { MalhaViaria } from './testes/malhaViaria'
import { provedorORS } from './ors'
import { orsFalso } from './testes/orsFalso'
import { CacheMatriz } from './cacheMatriz'

// Tipos mínimos do Node (o projeto não inclui @types/node).
declare const process: { env: Record<string, string | undefined>; memoryUsage(): { heapUsed: number } }

describe.runIf(process.env.BANCADA)('bancada RB-0', () => {
  it('50 a 500 paradas', async () => {
    const linhas: Record<string, unknown>[] = []
    for (const n of [50, 100, 150, 200, 300, 500]) {
      const malha = new MalhaViaria({ lado: 70, semente: 1000 + n, areasSemVia: 3 })
      const falso = orsFalso(malha)
      const prov = provedorORS({ chave: falso.chave, fetch: falso.fetch, base: 'http://127.0.0.1:9/ors/v2', liberadoReal: false })
      const tCli0 = performance.now()
      const pontos = [malha.coordenada(35 * 70 + 35), ...malha.pontosDeEntrega(n)]
      let t = 0
      const amb = { agora: () => t, esperar: async (ms: number) => void (t += ms) }
      const r = await roteirizar(prov, pontos, 'carro', amb)
      const msCliente = performance.now() - tCli0
      const m = r.montagem!
      // reotimização com cache: você andou um pouco
      const cache = new CacheMatriz('ors', 'carro', 0)
      cache.atualizar(m, r.coords, r.acessos)
      const antesM = falso.estado.matriz
      const antesS = falso.estado.snap
      const nova = [malha.coordenada(34 * 70 + 33), ...pontos.slice(1)]
      await roteirizar(prov, nova, 'carro', amb, undefined, undefined, { acessosConhecidos: nova.map((x, i) => (i ? cache.acessoConhecido(x) : undefined)), preencher: (mm, cs) => cache.preencher(mm, cs) })
      const reotim = { matriz: falso.estado.matriz - antesM, encaixe: falso.estado.snap - antesS }
      const idx = r.paraMotor
      const { matriz, proibidos } = m.paraMotor(idx)
      const visitas = idx.slice(1).map((i) => ({ id: `v${i}` }))
      const gc = (globalThis as { gc?: () => void }).gc
      gc?.()
      const heap0 = process.memoryUsage().heapUsed
      const t0 = performance.now()
      const res = otimizar({ visitas, matriz, termino: r.finalObrigatorio === undefined ? { tipo: 'livre' } : { tipo: 'visita', id: `v${r.finalObrigatorio}` } })
      const msMotor = performance.now() - t0
      const heap1 = process.memoryUsage().heapUsed
      const usados = res.ordem.map((id) => idx.indexOf(Number(id.slice(1))))
      const seq = [0, ...usados]
      const proib = new Set(proibidos.map(([a, b]) => `${a}>${b}`))
      const contar = (s: number[]) => s.slice(1).filter((b, k) => proib.has(`${s[k]}>${b}`)).length
      const proibidosUsados = contar(seq)
      const proibidosOrdemGerada = contar(idx.map((_, k) => k))
      const prev = preverConsumo(n, LIMITES_ORS)
      linhas.push({
        paradas: n,
        noMotor: idx.length - 1,
        finalSemSaida: r.finalObrigatorio !== undefined,
        pedidos: { ...r.relatorio.pedidos, rotaPrevista: prev.pedidosRota },
        esperaLimiteS: Math.round(t / 1000),
        kbRecebidosMatrizORS: Math.round(r.relatorio.bytesRecebidos / 1024),
        kbEnviados: Math.round(falso.estado.corpos.reduce((a, c) => a + c.length, 0) / 1024),
        msClienteEMalha: Math.round(msCliente),
        reotimizacao: reotim,
        cacheKB: Math.round(JSON.stringify(cache.serializar()).length / 1024),
        matrizKB: Math.round(m.bytes / 1024),
        heapMotorMB: Math.round(((heap1 - heap0) / 1048576) * 10) / 10,
        motorMs: Math.round(msMotor),
        // Ordem de geração (aleatória, NÃO é a da SPX): só referência; com trecho sem percurso é inviável.
        kmOrdemGerada: proibidosOrdemGerada ? null : Math.round(res.kmAtual * 10) / 10,
        trechosSemPercursoOrdemGerada: proibidosOrdemGerada,
        km: Math.round(res.km * 10) / 10,
        minOrdemGerada: proibidosOrdemGerada ? null : Math.round(res.minAtual),
        min: Math.round(res.min),
        confirmar: r.relatorio.problemas.confirmar,
        revisar: r.relatorio.problemas.revisar,
        paresSemPercurso: r.relatorio.problemas.paresSemPercurso,
        proibidosUsados,
        proibidosNoMotor: proibidos.length,
        // Auditoria RB-3: "rotas por dia" pela cota de MATRIZ (500/dia), com o pior caso previsto (todas as paradas
        // encaixadas) e com o que esta rota realmente usou (paradas sem rua não entram na matriz).
        pedidosMatrizPrevistos: prev.pedidosMatriz,
        rotasPorDiaPrevisto: prev.rotasPorDia,
        rotasPorDiaReal: Math.floor(LIMITES_ORS.porDia.matriz / Math.max(1, r.relatorio.pedidos.matriz)),
        rotasPorDiaTracadoRB4: Math.floor(LIMITES_ORS.porDia.rota / prev.pedidosRota),
      })
    }
    const fs = (await import('node:fs' as string)) as { writeFileSync(c: string, d: string): void }
    fs.writeFileSync('/tmp/bancada-ruas.json', JSON.stringify(linhas, null, 1))
  }, 600_000)
})
