// Teste de ponta a ponta: importar planilha SPX → "Confirmar importação" → tela Rotas.
// Roda no APK Android (emulador, toque nativo pelo adb) e no navegador (Chrome).
//   node e2e/importacao.mjs android            (APK instalado no emulador/aparelho)
//   node e2e/importacao.mjs navegador URL       (ex.: http://localhost:4173)
// Só dados SINTÉTICOS. O relatório não tem endereços nem códigos: só contagens, telas e etapas.
import { readFileSync } from 'node:fs'
import { casos } from './planilhas-sinteticas.mjs'

const alvo = process.argv[2] ?? 'navegador'
const PKG = 'io.github.victor1923hsm.rotavhsgo'
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

async function abrir() {
  if (alvo === 'android') {
    const { _android: android } = await import('playwright-core')
    const [device] = await android.devices()
    if (!device) throw new Error('nenhum aparelho Android no adb')
    await device.shell(`pm clear ${PKG}`)
    for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) await device.shell(`pm grant ${PKG} android.permission.${p}`).catch(() => {})
    await device.shell(`am start -W -n ${PKG}/.MainActivity`)
    const webview = await device.webView({ pkg: PKG }, { timeout: 60_000 })
    const page = await webview.page()
    const info = String(await device.shell('dumpsys package com.google.android.webview | grep versionName')).trim().split('\n')[0]
    log('Android:', device.model(), '· WebView', info, '·', String(await device.shell('wm size')).trim())
    // Onde a WebView está na tela (pode não começar no topo: barra de status, versões antigas do WebView).
    let caixa = null
    const medirWebView = async () => {
      await device.shell('uiautomator dump /sdcard/ui.xml')
      const xml = String(await device.shell('cat /sdcard/ui.xml'))
      const m = xml.match(/class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
      caixa = m ? { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) } : { x: 0, y: 0, w: 0, h: 0 }
      log('WebView na tela (px):', JSON.stringify(caixa))
    }
    return {
      page,
      device,
      // Toque NATIVO na tela (adb), como o dedo. CSS px → px da tela pela posição real da WebView.
      async tocar(x, y) {
        if (!caixa) await medirWebView()
        const { iw, ih } = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight }))
        const sx = caixa.w ? caixa.w / iw : await page.evaluate(() => devicePixelRatio)
        const sy = caixa.h ? caixa.h / ih : sx
        await device.shell(`input tap ${Math.round(caixa.x + x * sx)} ${Math.round(caixa.y + y * sy)}`)
      },
      fechar: async () => device.close(),
    }
  }
  const { chromium } = await import('playwright-core')
  const url = process.argv[3] ?? 'http://localhost:4173'
  const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(url + '/pedidos')
  log('Navegador: Chrome', b.version())
  return { page, tocar: (x, y) => page.touchscreen.tap(x, y), fechar: () => b.close() }
}

const ir = (page, rota) =>
  page.evaluate((r) => {
    history.pushState({}, '', r)
    dispatchEvent(new PopStateEvent('popstate'))
  }, rota)

/** Põe o arquivo no campo de arquivo, como se escolhido no aparelho (o conteúdo vem do teste, não do disco do aparelho). */
const escolherArquivo = (page, nome, b64, tipo) =>
  page.evaluate(
    ({ nome, b64, tipo }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bin], nome, { type: tipo }))
      const input = document.querySelector('input[type=file]')
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { nome, b64, tipo },
  )

/** Centro do elemento na tela e quem está por cima dele (para achar camadas invisíveis que roubam o toque). */
const alvoDoToque = (page, seletor) =>
  page.evaluate((s) => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(s))
    if (!el) return null
    const r0 = el.getBoundingClientRect()
    const estavaVisivel = r0.top >= 0 && r0.bottom <= innerHeight
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const topo = document.elementFromPoint(x, y)
    const cobre = topo && topo !== el && !el.contains(topo) ? `${topo.tagName.toLowerCase()}.${String(topo.className).split(' ').join('.')}` : null
    return { x, y, desabilitado: el.disabled, cobre, visivel: estavaVisivel }
  }, seletor)

const texto = (page) => page.evaluate(() => document.body.innerText)

async function fecharPedidoGps(page, tocar) {
  const t = await alvoDoToque(page, 'Agora não')
  if (t) await tocar(t.x, t.y)
}

async function main() {
  const { page, tocar, fechar } = await abrir()
  const erros = []
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.name}`))
  page.on('console', (m) => m.type() === 'error' && erros.push(`console: ${m.text().slice(0, 160)}`))
  await esperar(2500)
  const lista = casos().map((c) => ({ ...c, b64: Buffer.from(c.csv).toString('base64'), tipo: 'text/csv' }))
  for (const [arquivo, nome] of [['11-formato-spx.xlsx', 'XLSX formato SPX (11 pacotes)'], ['13-spx-250-paradas.xlsx', 'XLSX 250 paradas']]) {
    lista.push({ nome, arquivo, b64: readFileSync(new URL(`../test-fixtures/planilhas/${arquivo}`, import.meta.url)).toString('base64'), tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  }
  const resultados = []
  for (const c of lista) {
    const r = { caso: c.nome, ok: false, etapas: [] }
    const etapa = (s) => r.etapas.push(s)
    try {
      await ir(page, '/importar')
      // A tela Importar carrega sob demanda: espera o campo de arquivo existir (aparelho lento: até 20 s).
      await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 20_000 })
      await esperar(300)
      await escolherArquivo(page, c.arquivo, c.b64, c.tipo)
      let pronto = null
      for (let i = 0; i < 60 && !pronto; i++) {
        await esperar(500)
        pronto = await alvoDoToque(page, 'Confirmar importação')
        const t = await texto(page)
        if (!pronto && t.includes('Não consegui ler a planilha')) throw new Error('leitura recusada')
      }
      if (!pronto) throw new Error('botão "Confirmar importação" não apareceu')
      if (c.repetido) {
        // Antes de escolher: o toque precisa RESPONDER (etapa "Validando dados" com o motivo), nunca ficar mudo.
        const b0 = await alvoDoToque(page, 'Confirmar importação')
        await tocar(b0.x, b0.y)
        let aviso = null
        for (let i = 0; i < 20 && !aviso; i++) {
          await esperar(250)
          aviso = await page.evaluate(() => document.querySelector('[data-importacao-erro]')?.textContent ?? null)
        }
        if (!aviso || !aviso.includes('Validando dados')) throw new Error('tocar com pacote repetido pendente não deu resposta')
        etapa('sem escolher o repetido: o app explicou o que falta')
        const voltar = await alvoDoToque(page, 'Voltar')
        await tocar(voltar.x, voltar.y)
        await esperar(400)
        const rem = await alvoDoToque(page, 'Remover linha')
        if (!rem) throw new Error('pacote repetido sem a escolha "Remover linha"')
        await tocar(rem.x, rem.y)
        await esperar(600)
        etapa('pacote repetido: uma linha removida')
      }
      const t0 = await texto(page)
      const m = t0.match(/Pacotes\s*\n?\s*(\d+)\s*\n?\s*Paradas\s*\n?\s*(\d+)/)
      r.pacotes = m ? Number(m[1]) : null
      r.paradas = m ? Number(m[2]) : null
      etapa(`prévia: ${r.paradas} paradas, ${r.pacotes} pacotes`)
      const b = await alvoDoToque(page, 'Confirmar importação')
      etapa(`botão: ${b.desabilitado ? 'DESABILITADO' : 'habilitado'}${b.cobre ? `, COBERTO por ${b.cobre}` : ''}`)
      // Registra o que o toque atingiu (sem dados: só o tipo de elemento e o texto do botão).
      await page.evaluate(() => {
        window.__toques = []
        if (window.__ouvindo) return
        window.__ouvindo = true
        for (const t of ['touchstart', 'pointerdown', 'click'])
          document.addEventListener(t, (e) => {
            const el = e.target instanceof Element ? e.target.closest('button,a,input,label') ?? e.target : null
            window.__toques.push(`${t}→${el ? el.tagName.toLowerCase() + (el.tagName === 'BUTTON' ? `(${el.textContent.trim().slice(0, 24)})` : '') : '?'}`)
          }, { capture: true })
      })
      await tocar(b.x, b.y)
      await esperar(500)
      etapa(`toque: ${(await page.evaluate(() => window.__toques.join(' ')).catch(() => 'página fechou')) || 'NADA chegou à página'}`)
      let caminho = ''
      for (let i = 0; i < 40; i++) {
        await esperar(250)
        caminho = await page.evaluate(() => location.pathname)
        if (caminho.endsWith('/rotas')) break
        const dlg = await alvoDoToque(page, 'e continuar')
        if (dlg) {
          etapa(`pergunta "rota em uso" apareceu ${dlg.visivel ? 'visível' : 'FORA DA TELA'}`)
          await tocar(dlg.x, dlg.y)
        }
        const falha = await page.evaluate(() => document.querySelector('[data-importacao-erro]')?.textContent ?? null)
        if (falha) throw new Error(`o app informou: ${falha.slice(0, 200)}`)
      }
      if (!caminho.endsWith('/rotas')) throw new Error(`continuou em ${caminho} depois do toque (nada aconteceu)`)
      await esperar(900)
      await fecharPedidoGps(page, tocar)
      const t1 = await texto(page)
      const n = t1.match(/Revise (\d+) paradas/)
      r.paradasNaRota = n ? Number(n[1]) : null
      if (c.pacotes !== undefined && r.pacotes !== c.pacotes) throw new Error(`pacotes: esperado ${c.pacotes}, prévia mostrou ${r.pacotes}`)
      if (r.paradasNaRota !== r.paradas) throw new Error(`Rotas mostra ${r.paradasNaRota} paradas; a prévia tinha ${r.paradas}`)
      etapa(`tela Rotas: ${r.paradasNaRota} paradas`)
      r.ok = true
    } catch (e) {
      r.erro = e.message
      const shot = await page.screenshot({ type: 'jpeg', quality: 35, scale: 'css' }).catch(() => null)
      if (shot) log(`CAPTURA ${c.arquivo} ${shot.toString('base64')}`)
    }
    log(`${r.ok ? 'OK   ' : 'FALHA'} ${r.caso} — ${r.etapas.join(' · ')}${r.erro ? ` · ERRO: ${r.erro}` : ''}`)
    resultados.push(r)
  }
  log('\nErros de JavaScript:', erros.length ? erros.join(' | ') : 'nenhum')
  const falhas = resultados.filter((r) => !r.ok).length
  log(`\nRESUMO (${alvo}): ${resultados.length - falhas}/${resultados.length} casos OK`)
  await fechar()
  process.exit(falhas ? 1 : 0)
}
main().catch((e) => {
  console.error('teste interrompido:', e)
  process.exit(2)
})
