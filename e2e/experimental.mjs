// Teste de ponta a ponta do MODO EXPERIMENTAL "Testar roteirização real" (RB-4), no emulador Android.
//   node e2e/experimental.mjs android            → servidor de respostas controladas local (ors-falso)
//   ORS_CHAVE=... node e2e/experimental.mjs android real
//                                                → OpenRouteService REAL, só com pontos FICTÍCIOS de Goiânia.
// A chave real vem de um segredo do GitHub Actions (nunca do repositório) e nunca é impressa.
import { mkdirSync, writeFileSync } from 'node:fs'
import { iniciarORSFalso } from './ors-falso.mjs'

const PKG = 'io.github.victor1923hsm.rotavhsgo'
const REAL = process.argv[3] === 'real'
const CHAVE = REAL ? process.env.ORS_CHAVE ?? '' : 'TESTE-rotavhs-chave-ficticia-ors-0002'
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)
let device

async function conectar() {
  await device.shell(`am start -W -n ${PKG}/.MainActivity`)
  const webview = await device.webView({ pkg: PKG }, { timeout: 60_000 })
  const page = await webview.page()
  return page
}
let caixa = null
async function medir() {
  for (let t = 1; t <= 8 && !caixa; t++) {
    await device.shell('rm -f /sdcard/ui.xml; uiautomator dump /sdcard/ui.xml').catch(() => {})
    const xml = String(await device.shell('cat /sdcard/ui.xml').catch(() => ''))
    const m = xml.match(/class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    if (m) caixa = { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) }
    else await esperar(1500)
  }
  if (!caixa) caixa = 'js'
}
async function tocarXY(page, x, y) {
  if (!caixa) await medir()
  if (caixa === 'js') return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.click(), { x, y })
  const { iw, ih } = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight }))
  await device.shell(`input tap ${Math.round(caixa.x + (x * caixa.w) / iw)} ${Math.round(caixa.y + (y * caixa.h) / ih)}`)
}
const texto = (page) => page.evaluate(() => document.body.innerText)
const erroTela = (page) => page.evaluate(() => document.querySelector('.ruas-erro')?.innerText ?? '')
async function aguardar(fn, ms, passo = 300) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await esperar(passo)
  }
}
async function tocar(page, s, seletor = 'button, a') {
  const b = await aguardar(async () => {
    const ok = await page.evaluate(({ s, seletor }) => {
      const el = [...document.querySelectorAll(seletor)].find((b) => (b.textContent?.trim().startsWith(s) || b.getAttribute('aria-label')?.startsWith(s)) && !b.disabled)
      if (!el) return false
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
      return true
    }, { s, seletor })
    if (!ok) return null
    await esperar(400)
    return page.evaluate(({ s, seletor }) => {
      const el = [...document.querySelectorAll(seletor)].find((b) => (b.textContent?.trim().startsWith(s) || b.getAttribute('aria-label')?.startsWith(s)) && !b.disabled)
      if (!el) return null
      const q = el.getBoundingClientRect()
      const x = q.left + q.width / 2, y = q.top + q.height / 2
      const topo = document.elementFromPoint(x, y)
      return topo === el || el.contains(topo) ? { x, y } : null
    }, { s, seletor })
  }, 20_000)
  if (!b) throw new Error(`"${s}" não encontrado ou coberto`)
  await tocarXY(page, b.x, b.y)
  await esperar(500)
}
const ir = (page, rota) => page.evaluate((r) => (history.pushState({}, '', r), dispatchEvent(new PopStateEvent('popstate'))), rota)
async function captura(page, nome) {
  await esperar(800)
  const shot = await page.screenshot({ type: 'jpeg', quality: 60, scale: 'css' }).catch(() => null)
  if (!shot) return
  mkdirSync('e2e-saida', { recursive: true })
  writeFileSync(`e2e-saida/exp-${nome}.jpg`, shot)
  const b64 = shot.toString('base64')
  const n = Math.ceil(b64.length / 3000)
  for (let i = 0; i < n; i++) log(`CAP exp-${nome} ${i + 1}/${n} ${b64.slice(i * 3000, (i + 1) * 3000)}`)
}

async function main() {
  if (REAL && !CHAVE) {
    log('SEM CHAVE: segredo ORS_CHAVE_TESTE ausente — integração real NÃO validada (nada foi enviado).')
    process.exit(0)
  }
  const { _android: android } = await import('playwright-core')
  ;[device] = await android.devices()
  await device.shell(`pm clear ${PKG}`)
  let page = await conectar()
  await esperar(2500)
  const ors = REAL ? null : await iniciarORSFalso(8766)
  if (!REAL) (await import('node:child_process')).execSync('adb reverse tcp:8766 tcp:8766', { stdio: 'ignore' })
  const resultados = []
  const caso = async (nome, f) => {
    try {
      const d = await f()
      resultados.push(true)
      log(`OK    ${nome} — ${d ?? ''}`)
    } catch (e) {
      resultados.push(false)
      log(`FALHA ${nome} — ERRO: ${String(e.message).replaceAll(CHAVE || '§', '[chave]')}`)
      await captura(page, `falha-${resultados.length}`)
    }
  }
  const rotulo = REAL ? 'OpenRouteService REAL' : 'servidor de teste'
  try {
    if (!REAL) await page.evaluate(() => localStorage.setItem('rotavhsgo.ruasTesteURL', 'http://127.0.0.1:8766/ors/v2'))
    else await page.evaluate(() => localStorage.removeItem('rotavhsgo.ruasTesteURL'))

    await caso(`Cadastrar a chave no cofre (${REAL ? 'chave real, do segredo' : 'chave fictícia'})`, async () => {
      await ir(page, '/estatisticas/ruas')
      await tocar(page, 'Cadastrar chave')
      await page.fill('#chave-api', CHAVE)
      await tocar(page, 'Guardar chave')
      if (!(await aguardar(async () => (await texto(page)).includes('Chave cadastrada'), 10_000))) throw new Error('não cadastrou')
      return 'cadastrada (valor não exibido)'
    })

    let t0
    await caso(`Teste de 10 paradas: gerar, calcular pelas ruas e desenhar o traçado (${rotulo})`, async () => {
      await ir(page, '/estatisticas/testar-ruas')
      await tocar(page, 'Autorizo')
      await tocar(page, 'Gerar 10')
      const gerou = await aguardar(async () => {
        if ((await texto(page)).includes('paradas fictícias geradas')) return true
        const e = await erroTela(page)
        if (e) throw new Error(`não gerou: ${e.slice(0, 200)}`)
        return null
      }, 90_000)
      if (!gerou) throw new Error('não gerou em 90 s')
      t0 = Date.now()
      await tocar(page, 'Calcular pelas ruas (real)')
      const fim = await aguardar(async () => {
        const t = await texto(page)
        if (/Percurso desenhado/.test(t)) return t
        const e = await erroTela(page)
        if (e) throw new Error(e.slice(0, 200))
        return null
      }, 180_000)
      if (!fim) throw new Error('o cálculo não terminou em 180 s')
      const tr = fim.match(/Traçado real pelas ruas: (\d+) trecho/)
      if (!tr || Number(tr[1]) !== 10) throw new Error(`traçado incompleto: ${tr?.[0] ?? 'nenhum'}`)
      await captura(page, `1-tracado-10${REAL ? '-real' : ''}`)
      const linha = (fim.match(/Percurso desenhado[^\n]*\n?[^\n]*/) ?? [''])[0].replace(/\s+/g, ' ')
      const ped = (fim.match(/Pedidos: [^\n]*?traçado/) ?? [''])[0]
      return `toque → pronto ${((Date.now() - t0) / 1000).toFixed(1)} s · ${linha} · ${ped}`
    })

    await caso('Comparação rápida × pelas ruas (mesma matriz) aparece rotulada', async () => {
      const t = await texto(page)
      if (!/Rápida \(aproximada\), medida pelas ruas/.test(t) || !/Pelas ruas \(matriz real\)/.test(t)) throw new Error('sem a comparação')
      return (t.match(/A rápida achava[^\n]*/) ?? [''])[0].slice(0, 220)
    })

    await caso('Reotimizar as pendentes depois de marcar 2 visitadas (reaproveita matriz e traçado)', async () => {
      for (const k of [1, 2]) {
        await tocar(page, `Parada de teste`, `.pino[aria-label*=", ${k}ª na ordem"]`)
        await tocar(page, 'Marcar como visitada')
        await tocar(page, 'Fechar')
      }
      const n0 = ors ? { ...ors.estado } : null
      await tocar(page, 'Reotimizar as pendentes pelas ruas')
      const fim = await aguardar(async () => ((await texto(page)).match(/(Ordem pelas ruas calculada|A ordem atual já era a melhor)[^\n]*/) ?? [null])[0], 120_000)
      if (!fim) throw new Error('não reotimizou')
      await captura(page, `2-reotimizado${REAL ? '-real' : ''}`)
      const ped = ((await texto(page)).match(/Pedidos: [^\n]*?traçado/) ?? [''])[0]
      return `${fim.slice(0, 80)} · ${ped}${n0 ? ` · servidor: +${ors.estado.matriz - n0.matriz} matriz, +${ors.estado.snap - n0.snap} encaixe` : ''}`
    })

    await caso('Sem internet: reotimiza com a matriz e o traçado salvos (sem pedido)', async () => {
      await device.shell('svc wifi disable; svc data disable').catch(() => {})
      await esperar(1500)
      const antes = ors ? ors.estado.pedidos : 0
      await tocar(page, 'Parada de teste', '.pino:not(.entregue):not(.pino-partida)')
      await tocar(page, 'Marcar como visitada')
      await tocar(page, 'Fechar')
      await tocar(page, 'Reotimizar sem internet')
      const fim = await aguardar(async () => ((await texto(page)).match(/Reotimizado sem internet[^\n]*/) ?? [null])[0], 20_000)
      await device.shell('svc wifi enable; svc data enable').catch(() => {})
      if (!fim) throw new Error('não reotimizou sem internet')
      if (ors && ors.estado.pedidos !== antes) throw new Error('fez pedido sem internet')
      await captura(page, `3-offline${REAL ? '-real' : ''}`)
      return fim
    })

    await caso('Fechar e reabrir: o teste e o traçado continuam salvos', async () => {
      await device.shell(`am force-stop ${PKG}`)
      await esperar(1500)
      page = await conectar()
      await esperar(2500)
      await ir(page, '/estatisticas/testar-ruas')
      const t = await aguardar(async () => ((await texto(page)).match(/Traçado real pelas ruas: (\d+) trecho/) ?? [null])[0], 20_000)
      if (!t) throw new Error('o traçado não voltou')
      return t
    })

    await caso('A chave não aparece no logcat', async () => {
      const l = String(await device.shell('logcat -d'))
      if (CHAVE && l.includes(CHAVE.slice(-16))) throw new Error('a chave apareceu no logcat')
      return `nenhuma ocorrência em ${l.split('\n').length} linhas`
    })
  } finally {
    await device.shell('svc wifi enable; svc data enable').catch(() => {})
    await ors?.fechar().catch(() => {})
  }
  const ok = resultados.filter(Boolean).length
  log(`\nRESUMO EXPERIMENTAL (${rotulo}): ${ok}/${resultados.length} casos OK`)
  await device.close().catch(() => {})
  process.exit(ok === resultados.length ? 0 : 1)
}
main().catch((e) => {
  console.error('teste interrompido:', String(e?.message ?? e).replaceAll(CHAVE || '§', '[chave]'))
  process.exit(2)
})
