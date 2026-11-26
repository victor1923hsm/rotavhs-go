// Teste de ponta a ponta da OTIMIZAÇÃO (fase R-A): importar → OTIMIZAR MINHA ROTA → rota otimizada a partir da
// posição atual (GPS do emulador/navegador). Mede o tempo do toque até a rota pronta e o tempo do algoritmo.
// Casos: 50, 100, 250 e 500 paradas; cancelamento; reotimização das pendentes; origem perto da ÚLTIMA parada da SPX.
//   node e2e/otimizacao.mjs android            (APK no emulador; posição pelo "adb emu geo fix")
//   node e2e/otimizacao.mjs navegador URL      (Chrome com geolocalização simulada)
// Só dados SINTÉTICOS. O relatório tem só contagens, tempos e números de parada (fictícios).
import { execSync } from 'node:child_process'

const alvo = process.argv[2] ?? 'navegador'
const PKG = 'io.github.victor1923hsm.rotavhsgo'
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)
const C = { lat: -15.8, lon: -47.9 }
const CAB = 'AT ID,Sequence,Stop,SPX TN,Destination Address,Bairro,City,Zipcode/Postal code,Latitude,Longitude'

/** n paradas (1 pacote cada) espalhadas em ~8 × 8 km, em ordem "da SPX" embaralhada (semente fixa). */
function planilha(n) {
  let s = n * 97 + 3
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  const pts = Array.from({ length: n }, () => ({ lat: C.lat + (r() - 0.5) * 0.072, lon: C.lon + (r() - 0.5) * 0.075 }))
  const linhas = pts.map((p, i) => ['AT0000TESTE', i + 1, i + 1, `BR26${String(5000 + i).padStart(10, '0')}X`, `"Rua Teste ${i + 1}, ${10 + (i % 90)}"`, 'Bairro Ficticio', 'Cidade Teste', `70000-${String(i % 1000).padStart(3, '0')}`, p.lat.toFixed(5), p.lon.toFixed(5)].join(','))
  return { csv: [CAB, ...linhas].join('\n') + '\n', pts }
}

let posicao = { ...C }
let relogioGps = null
async function abrir() {
  if (alvo === 'android') {
    const { _android: android } = await import('playwright-core')
    const [device] = await android.devices()
    if (!device) throw new Error('nenhum aparelho Android no adb')
    await device.shell(`pm clear ${PKG}`)
    for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) await device.shell(`pm grant ${PKG} android.permission.${p}`).catch(() => {})
    await device.shell('settings put secure location_mode 3').catch(() => {})
    // GPS do emulador: uma leitura nova a cada 2 s (com variação mínima, para o app ver leituras recentes).
    let k = 0
    const fix = () => {
      const j = (k++ % 2) * 0.00001
      try {
        execSync(`adb emu geo fix ${(posicao.lon + j).toFixed(6)} ${(posicao.lat + j).toFixed(6)}`, { stdio: 'ignore' })
      } catch {
        /* emulador ocupado: tenta de novo no próximo ciclo */
      }
    }
    fix()
    relogioGps = setInterval(fix, 2000)
    await device.shell(`am start -W -n ${PKG}/.MainActivity`)
    const webview = await device.webView({ pkg: PKG }, { timeout: 60_000 })
    const page = await webview.page()
    let caixa = null
    const medir = async () => {
      for (let t = 1; t <= 8 && !caixa; t++) {
        await device.shell('rm -f /sdcard/ui.xml; uiautomator dump /sdcard/ui.xml').catch(() => {})
        const xml = String(await device.shell('cat /sdcard/ui.xml').catch(() => ''))
        const m = xml.match(/class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
        if (m) caixa = { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) }
        else await esperar(1500)
      }
      if (!caixa) throw new Error('não consegui medir a posição da WebView na tela (uiautomator)')
    }
    log('Android:', device.model())
    return {
      page,
      async tocar(x, y) {
        if (!caixa) await medir()
        const { iw, ih } = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight }))
        await device.shell(`input tap ${Math.round(caixa.x + (x * caixa.w) / iw)} ${Math.round(caixa.y + (y * caixa.h) / ih)}`)
      },
      mudarPosicao: async () => {},
      fechar: async () => {
        clearInterval(relogioGps)
        await device.close()
      },
    }
  }
  const { chromium } = await import('playwright-core')
  const url = process.argv[3] ?? 'http://localhost:4173'
  const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, geolocation: { latitude: posicao.lat, longitude: posicao.lon, accuracy: 10 }, permissions: ['geolocation'] })
  const page = await ctx.newPage()
  await page.goto(url + '/pedidos')
  log('Navegador: Chrome', b.version())
  return {
    page,
    tocar: (x, y) => page.touchscreen.tap(x, y),
    // Como um GPS de verdade: várias leituras seguidas no novo lugar (o app descarta um salto isolado).
    mudarPosicao: async (p) => {
      for (let i = 0; i < 4; i++) {
        await ctx.setGeolocation({ latitude: p.lat + i * 0.000005, longitude: p.lon, accuracy: 10 })
        await esperar(1200)
      }
    },
    fechar: () => b.close(),
  }
}

const ir = (page, rota) =>
  page.evaluate((r) => {
    history.pushState({}, '', r)
    dispatchEvent(new PopStateEvent('popstate'))
  }, rota)
const escolherArquivo = (page, nome, b64) =>
  page.evaluate(
    ({ nome, b64 }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bin], nome, { type: 'text/csv' }))
      const input = document.querySelector('input[type=file]')
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { nome, b64 },
  )
const botao = (page, s) =>
  page.evaluate((s) => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(s))
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, desabilitado: el.disabled }
  }, s)
const texto = (page) => page.evaluate(() => document.body.innerText)
async function tocarBotao(ctx, s, obrigatorio = true) {
  const b = await botao(ctx.page, s)
  if (!b) {
    if (obrigatorio) throw new Error(`botão "${s}" não encontrado`)
    return false
  }
  await ctx.tocar(b.x, b.y)
  return true
}
async function aguardar(fn, ms, passo = 200) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await esperar(passo)
  }
}
/** Números das paradas na "Sequência de paradas", na ordem (fictícios). */
const sequencia = (page) => page.evaluate(() => [...document.querySelectorAll('.seq-linha .chip-stop')].map((e) => e.textContent.trim()))

async function importar(ctx, n) {
  const { csv } = planilha(n)
  await ir(ctx.page, '/importar')
  await ctx.page.waitForSelector('input[type=file]', { state: 'attached', timeout: 20_000 })
  await esperar(300)
  await escolherArquivo(ctx.page, `spx-otimizar-${n}.csv`, Buffer.from(csv).toString('base64'))
  if (!(await aguardar(() => botao(ctx.page, 'Confirmar importação'), 30_000, 500))) throw new Error('"Confirmar importação" não apareceu')
  await tocarBotao(ctx, 'Confirmar importação')
  const ok = await aguardar(async () => {
    const dlg = await botao(ctx.page, 'e continuar')
    if (dlg) await ctx.tocar(dlg.x, dlg.y)
    return (await texto(ctx.page)).match(/Revise (\d+) paradas/)
  }, 40_000, 300)
  if (!ok || Number(ok[1]) !== n) throw new Error(`a rota não abriu com ${n} paradas`)
  await esperar(1500) // a transição para a tela Rotas termina antes do próximo toque
  await tocarBotao(ctx, 'Agora não', false)
}

async function otimizar(ctx) {
  const t0 = Date.now()
  await tocarBotao(ctx, 'OTIMIZAR MINHA ROTA')
  const fim = await aguardar(async () => {
    const perm = await botao(ctx.page, 'Permitir localização')
    if (perm) await ctx.tocar(perm.x, perm.y)
    const t = await texto(ctx.page)
    if (t.includes('Não foi possível otimizar')) throw new Error(`o app informou: ${t.split('Não foi possível otimizar')[1].slice(0, 160).trim()}`)
    return t.match(/Otimizada a partir de: sua posição no momento do cálculo · (\d+) paradas em ([\d,]+) s/)
  }, 90_000, 150)
  if (!fim) throw new Error('a rota otimizada não apareceu em 90 s')
  return { totalS: (Date.now() - t0) / 1000, algoritmoS: Number(fim[2].replace(',', '.')), paradas: Number(fim[1]) }
}

async function main() {
  const ctx = await abrir()
  const erros = []
  ctx.page.on('pageerror', (e) => erros.push(`pageerror: ${e.name}`))
  await esperar(2500)
  const resultados = []
  const caso = async (nome, f) => {
    const r = { caso: nome, ok: false }
    try {
      r.detalhe = await f()
      r.ok = true
    } catch (e) {
      r.erro = e.message
      const shot = await ctx.page.screenshot({ type: 'jpeg', quality: 35, scale: 'css' }).catch(() => null)
      if (shot) log(`CAPTURA ${nome.replace(/\s+/g, '-')} ${shot.toString('base64')}`)
    }
    log(`${r.ok ? 'OK   ' : 'FALHA'} ${nome} — ${r.detalhe ?? ''}${r.erro ? ` · ERRO: ${r.erro}` : ''}`)
    resultados.push(r)
  }
  const filtro = process.env.FILTRO ?? ''
  for (const n of [50, 100, 250, 500]) {
    if (!`${n} paradas`.includes(filtro) && filtro) continue
    await caso(`${n} paradas: otimizar a partir da posição atual`, async () => {
      const { pts } = planilha(n)
      posicao = { lat: pts[n - 1].lat + 0.0002, lon: pts[n - 1].lon } // ao lado da ÚLTIMA parada da SPX
      await ctx.mudarPosicao(posicao)
      await importar(ctx, n)
      const antes = await sequencia(ctx.page)
      const m = await otimizar(ctx)
      const depois = await sequencia(ctx.page)
      if (m.paradas !== n || depois.length !== n || [...depois].sort().join() !== [...antes].sort().join()) throw new Error('paradas perdidas ou repetidas')
      if (depois[0] === '1') throw new Error('começou pela 1ª parada da SPX')
      const t = await texto(ctx.page)
      if (!t.includes('Só os pinos')) throw new Error('legenda do mapa sem o aviso de "só os pinos"')
      return `toque → rota pronta ${m.totalS.toFixed(1)} s · algoritmo ${m.algoritmoS.toFixed(1)} s · 1ª parada: ${depois[0]} (a SPX começava pela 1; você estava ao lado da ${n})`
    })
  }
  if (!filtro || 'cancelar'.includes(filtro)) {
    await caso('Cancelar durante a otimização (500 paradas)', async () => {
      await importar(ctx, 500)
      const antes = await sequencia(ctx.page)
      await tocarBotao(ctx, 'OTIMIZAR MINHA ROTA')
      const cancelar = await aguardar(() => botao(ctx.page, 'Cancelar'), 20_000, 50)
      if (!cancelar) throw new Error('a janela de andamento não apareceu')
      await ctx.tocar(cancelar.x, cancelar.y)
      const aviso = await aguardar(async () => (await texto(ctx.page)).includes('cancelada'), 5000, 100)
      const t = await texto(ctx.page)
      if (!aviso && !t.includes('Otimizada a partir')) throw new Error('nem cancelou nem terminou')
      if (aviso) {
        if (!t.includes('REVISÃO')) throw new Error('a rota mudou de fase depois de cancelar')
        if ((await sequencia(ctx.page)).join() !== antes.join()) throw new Error('a ordem mudou depois de cancelar')
        return 'cancelada: a ordem e a fase continuaram iguais'
      }
      return 'o cálculo terminou antes do toque em Cancelar (aparelho rápido)'
    })
  }
  if (!filtro || 'reotimizar'.includes(filtro)) {
    await caso('Reotimizar só as pendentes (100 paradas)', async () => {
      const { pts } = planilha(100)
      posicao = { lat: pts[0].lat, lon: pts[0].lon + 0.0002 }
      await ctx.mudarPosicao(posicao)
      await importar(ctx, 100)
      await otimizar(ctx)
      await tocarBotao(ctx, 'Iniciar entregas')
      await esperar(800)
      const t0 = Date.now()
      await tocarBotao(ctx, 'Recalcular pendentes')
      const r = await aguardar(async () => {
        const t = await texto(ctx.page)
        return t.includes('Nova ordem sugerida') ? 'sugestão' : t.includes('já é a melhor') ? 'já era a melhor' : null
      }, 60_000, 150)
      if (!r) throw new Error('o recálculo não respondeu')
      return `${r} em ${((Date.now() - t0) / 1000).toFixed(1)} s (a ordem só muda com o toque)`
    })
  }
  log('\nErros de JavaScript:', erros.length ? erros.join(' | ') : 'nenhum')
  const falhas = resultados.filter((r) => !r.ok).length
  log(`\nRESUMO OTIMIZAÇÃO (${alvo}): ${resultados.length - falhas}/${resultados.length} casos OK`)
  await ctx.fechar()
  process.exit(falhas ? 1 : 0)
}
main().catch((e) => {
  console.error('teste interrompido:', e)
  process.exit(2)
})
