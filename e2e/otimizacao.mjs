// Teste de ponta a ponta da OTIMIZAÇÃO (fase R-A): importar → OTIMIZAR MINHA ROTA → rota otimizada a partir da
// posição atual (GPS do emulador/navegador). Mede o tempo do toque até a rota pronta e o tempo do algoritmo.
// Casos: 50, 100, 250 e 500 paradas; cancelamento; reotimização das pendentes; origem perto da ÚLTIMA parada da SPX.
//   node e2e/otimizacao.mjs android            (APK no emulador; posição pelo "adb emu geo fix")
//   node e2e/otimizacao.mjs navegador URL      (Chrome com geolocalização simulada)
// Só dados SINTÉTICOS. O relatório tem só contagens, tempos e números de parada (fictícios).
import { execSync } from 'node:child_process'
import { iniciarORSFalso } from './ors-falso.mjs'

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
    await device.shell('cmd location set-location-enabled true').catch(() => {})
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
      for (let t = 1; t <= 10 && !caixa; t++) {
        await device.shell('rm -f /sdcard/ui.xml; uiautomator dump /sdcard/ui.xml').catch(() => {})
        const xml = String(await device.shell('cat /sdcard/ui.xml').catch(() => ''))
        const m = xml.match(/class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
        if (m) caixa = { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) }
        else await esperar(1500)
      }
      if (!caixa) {
        // uiautomator às vezes não responde no emulador: os toques passam a ser feitos pela própria WebView (CDP).
        caixa = 'cdp'
        log('  (uiautomator não respondeu: toques pela entrada de toque da WebView)')
      }
    }
    log('Android:', device.model(), '· processo do app:', String(await device.shell(`pidof ${PKG}`)).trim())
    return {
      android: true,
      pid: async () => String(await device.shell(`pidof ${PKG}`)).trim(),
      /** Servidor de teste local (respostas controladas) visível no emulador como 127.0.0.1. */
      reverso: (porta) => execSync(`adb reverse tcp:${porta} tcp:${porta}`, { stdio: 'ignore' }),
      page,
      async tocar(x, y) {
        if (!caixa) await medir()
        if (caixa === 'cdp') return page.touchscreen.tap(x, y)
        const { iw, ih } = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight }))
        await device.shell(`input tap ${Math.round(caixa.x + (x * caixa.w) / iw)} ${Math.round(caixa.y + (y * caixa.h) / ih)}`)
      },
      mudarPosicao: async () => esperar(8000), // o geo fix roda a cada 2 s: algumas leituras no novo lugar
      // Fecha o app de verdade (processo encerrado) e abre de novo: a rota tem de voltar do armazenamento.
      async reabrir() {
        await device.shell(`am force-stop ${PKG}`)
        await esperar(1500)
        await device.shell(`am start -W -n ${PKG}/.MainActivity`)
        const wv = await device.webView({ pkg: PKG }, { timeout: 60_000 })
        this.page = await wv.page()
        await esperar(3000)
      },
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
    tocar(x, y) {
      return this.page.touchscreen.tap(x, y)
    },
    // Como um GPS de verdade: várias leituras seguidas no novo lugar (o app descarta um salto isolado).
    mudarPosicao: async (p) => {
      for (let i = 0; i < 4; i++) {
        await ctx.setGeolocation({ latitude: p.lat + i * 0.000005, longitude: p.lon, accuracy: 10 })
        await esperar(1200)
      }
    },
    fechar: () => b.close(),
    async reabrir() {
      // No navegador: recarrega a página (tudo o que estava na memória se perde; a rota volta do IndexedDB).
      await this.page.reload()
      await esperar(3000)
    },
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
const botao = async (page, s) => {
  const achou = await page.evaluate((s) => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(s))
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > innerHeight - 100) el.scrollIntoView({ block: 'center', behavior: 'instant' })
    return true
  }, s)
  if (!achou) return null
  await esperar(500) // a rolagem termina antes de medir (senão o toque cai no botão de cima)
  return page.evaluate((s) => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(s))
    if (!el) return null
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const topo = document.elementFromPoint(x, y)
    const livre = !!topo && (topo === el || el.contains(topo))
    const cobre = livre || !topo ? null : `${topo.tagName.toLowerCase()}.${String(topo.className).split(' ').filter(Boolean).join('.')} "${(topo.textContent ?? '').trim().slice(0, 40)}"`
    return { x, y, desabilitado: el.disabled, livre, cobre }
  }, s)
}
/** Espera o botão ficar livre (aviso passageiro por cima, etc.) e toca. */
async function tocarLivre(ctx, s, ms = 12_000) {
  let b = null
  const t0 = Date.now()
  for (;;) {
    b = await botao(ctx.page, s)
    if (b?.livre) break
    if (Date.now() - t0 > ms) throw new Error(b ? `"${s}" coberto por ${b.cobre}` : `botão "${s}" não encontrado`)
    await esperar(500)
  }
  await ctx.tocar(b.x, b.y)
  return b
}
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
  if (!ok || Number(ok[1]) !== n) throw new Error(`a rota não abriu com ${n} paradas · tela: ${(await texto(ctx.page)).replace(/\s+/g, ' ').slice(-400)}`)
  await esperar(1500) // a transição para a tela Rotas termina antes do próximo toque
  await tocarBotao(ctx, 'Agora não', false)
}

async function otimizar(ctx) {
  const t0 = Date.now()
  await tocarLivre(ctx, 'OTIMIZAR MINHA ROTA')
  const comecou = await aguardar(async () => /Obtendo|Calculando|Otimizada a partir|Não foi possível|Usar sua localização/.test(await texto(ctx.page)), 4000, 100)
  if (!comecou) throw new Error('o toque em OTIMIZAR não iniciou nada')
  let ultimo = ''
  const fim = await aguardar(async () => {
    const perm = await botao(ctx.page, 'Permitir localização')
    if (perm && !perm.livre) throw new Error(`"Permitir localização" coberto por ${perm.cobre} (o toque cairia nele)`)
    if (perm) {
      log('  (tocou em "Permitir localização")')
      await ctx.tocar(perm.x, perm.y)
    }
    const t = await texto(ctx.page)
    // Diário do que a tela mostra (só textos de estado; dados sintéticos).
    const estado = (t.match(/GPS: [^\n]*|Obtendo[^\n]*|Calculando[^\n]*|Otimizada a partir[^\n]*|Não foi possível[^\n]*|cancelada[^\n]*|REVISÃO|OTIMIZADA|Usar sua localização\?/g) ?? []).join(' | ')
    if (estado !== ultimo) {
      log(`  [${((Date.now() - t0) / 1000).toFixed(1)} s] ${estado}`)
      ultimo = estado
    }
    if (t.includes('Não foi possível otimizar')) throw new Error(`o app informou: ${t.split('Não foi possível otimizar')[1].slice(0, 160).trim()}`)
    return t.match(/Otimizada a partir de: sua posição no momento do cálculo · (\d+) paradas em ([\d,]+) s/)
  }, 90_000, 150)
  if (!fim) {
    const t = await texto(ctx.page)
    throw new Error(`a rota otimizada não apareceu em 90 s · ${(t.match(/GPS: [^\n]*/) ?? ['GPS: ?'])[0]} · ${(t.match(/Obtendo[^\n]*|Calculando[^\n]*/) ?? ['sem janela de andamento'])[0]}`)
  }
  return { totalS: (Date.now() - t0) / 1000, algoritmoS: Number(fim[2].replace(',', '.')), paradas: Number(fim[1]) }
}

/** OTIMIZAR (ou Recalcular) no modo "Pelas ruas reais": autoriza, confirma a estimativa e espera o desfecho. */
async function otimizarRuas(ctx, botaoInicial = 'OTIMIZAR MINHA ROTA') {
  const t0 = Date.now()
  await tocarLivre(ctx, botaoInicial)
  let estimativa = ''
  let ultimo = ''
  const fim = await aguardar(async () => {
    for (const s of ['Autorizar e continuar', 'Calcular pelas ruas', 'Permitir localização']) {
      const b = await botao(ctx.page, s)
      if (b?.livre && !b.desabilitado) {
        if (s === 'Calcular pelas ruas') estimativa = ((await texto(ctx.page)).match(/Consumo previsto[\s\S]*?Espera mínima[^\n]*/) ?? [''])[0].replace(/\s+/g, ' ')
        await ctx.tocar(b.x, b.y)
        await esperar(400)
        return null
      }
    }
    const t = await texto(ctx.page)
    const est = (t.match(/Sua posição atual[^\n]*|Encaixe das paradas[^\n]*|Distâncias e tempos[^\n]*|Melhor ordem[^\n]*/g) ?? []).join(' | ')
    if (est && est !== ultimo) {
      log(`  [${((Date.now() - t0) / 1000).toFixed(1)} s] ${est.slice(0, 160)}`)
      ultimo = est
    }
    if (t.includes('Não foi possível calcular pelas ruas')) return { falha: t.split('Não foi possível calcular pelas ruas')[1].slice(0, 200).trim() }
    if (t.includes('Indisponível neste navegador')) return { parar: 'Indisponível neste navegador' }
    if (t.includes('Nova ordem sugerida') || t.includes('já é a melhor')) return { recalculo: t.includes('Nova ordem sugerida') ? 'sugestão' : 'já era a melhor' }
    const m = t.match(/Otimizada a partir de: sua posição no momento do cálculo · (\d+) paradas em ([\d,]+) s · ([^\n·]*)/)
    return m ? { paradas: Number(m[1]), algoritmoS: Number(m[2].replace(',', '.')), rotulo: m[3].trim() } : null
  }, 240_000, 200)
  if (!fim) throw new Error('o cálculo pelas ruas não terminou em 240 s')
  return { ...fim, totalS: (Date.now() - t0) / 1000, estimativa }
}

async function casosRuas(ctx, caso) {
  if (!ctx.android) {
    await caso('PWA: "Pelas ruas" indisponível no navegador, oferece a rápida', async () => {
      const { pts } = planilha(50)
      posicao = { lat: pts[0].lat, lon: pts[0].lon + 0.0002 }
      await ctx.mudarPosicao(posicao)
      await importar(ctx, 50)
      await tocarLivre(ctx, 'Pelas ruas reais')
      const r = await otimizarRuas(ctx)
      if (!r.parar) throw new Error('não informou a indisponibilidade')
      await tocarLivre(ctx, 'Usar a otimização rápida')
      const t = await aguardar(async () => ((await texto(ctx.page)).match(/Otimizada a partir de[^\n]*aproximadas, sem ruas/) ? true : null), 60_000, 300)
      if (!t) throw new Error('a otimização rápida não terminou')
      return 'indisponível no PWA (sem cofre); a rápida foi usada só com o seu toque'
    })
    return
  }
  const ors = await iniciarORSFalso(8765)
  ctx.reverso(8765)
  try {
    await ctx.page.evaluate(() => localStorage.setItem('rotavhsgo.ruasTesteURL', 'http://127.0.0.1:8765/ors/v2'))
    await ctx.page.evaluate(() => window.Capacitor.nativePromise('CofreChave', 'guardar', { valor: 'TESTE-rotavhs-chave-ficticia-ors-0001' }))
    await caso('Pelas ruas (servidor de teste): 100 paradas, com 429 no meio', async () => {
      ors.modo('limite')
      const { pts } = planilha(100)
      posicao = { lat: pts[10].lat, lon: pts[10].lon + 0.0002 }
      await ctx.mudarPosicao(posicao)
      await importar(ctx, 100)
      await tocarLivre(ctx, 'Pelas ruas reais')
      const r = await otimizarRuas(ctx)
      if (r.falha) throw new Error(`o app informou: ${r.falha}`)
      if (r.paradas !== 100 || (await sequencia(ctx.page)).length !== 100) throw new Error('paradas perdidas')
      if (!/pelas ruas \(servidor de teste\)/.test(r.rotulo)) throw new Error(`rótulo errado: ${r.rotulo}`)
      if (!ors.estado.recusados429) throw new Error('o servidor não chegou a responder 429')
      const textos = [...ors.estado.textosRecebidos].sort().join(',')
      if (textos !== 'distance,duration,m') throw new Error(`o corpo enviado tinha textos além do técnico: ${textos}`)
      return `toque → rota pronta ${r.totalS.toFixed(1)} s · ${ors.estado.matriz} pedidos de matriz + ${ors.estado.recusados429} recusados (429) · ${ors.estado.snap} de encaixe · estimativa mostrada: "${r.estimativa.slice(0, 120)}"`
    })
    await caso('Reotimizar só as pendentes pelas ruas: reaproveita o cache', async () => {
      ors.modo('normal')
      await tocarLivre(ctx, 'Iniciar entregas')
      await esperar(800)
      const { pts } = planilha(100)
      posicao = { lat: pts[20].lat, lon: pts[20].lon + 0.0003 }
      await ctx.mudarPosicao(posicao)
      const m0 = ors.estado.matriz
      const r = await otimizarRuas(ctx, 'Recalcular pendentes')
      if (r.falha) throw new Error(`o app informou: ${r.falha}`)
      const novos = ors.estado.matriz - m0
      if (novos !== 1) throw new Error(`pediu ${novos} matrizes (esperado: só a linha da nova posição)`)
      return `${r.recalculo ?? 'ok'} em ${r.totalS.toFixed(1)} s · 1 pedido de matriz (só a sua nova posição)`
    })
    await caso('Pelas ruas: chave recusada → explica e oferece a rápida (sem troca silenciosa)', async () => {
      ors.modo('chave-invalida')
      await importar(ctx, 50)
      const antes = await sequencia(ctx.page)
      const r = await otimizarRuas(ctx)
      if (!r.falha || !/recusou a chave/.test(r.falha)) throw new Error(`esperava falha de chave, veio ${JSON.stringify(r).slice(0, 120)}`)
      if ((await sequencia(ctx.page)).join() !== antes.join()) throw new Error('a ordem mudou sozinha')
      await tocarLivre(ctx, 'Usar a otimização rápida')
      const ok = await aguardar(async () => ((await texto(ctx.page)).match(/Otimizada a partir de[^\n]*aproximadas, sem ruas/) ? true : null), 60_000, 300)
      if (!ok) throw new Error('a rápida não terminou depois do toque')
      return 'mensagem clara; rota intacta até o seu toque; a rápida rodou só depois do toque'
    })
    await caso('Pelas ruas: sem conexão → explica, a rota não muda', async () => {
      ors.modo('fechar')
      await importar(ctx, 50)
      const antes = await sequencia(ctx.page)
      const r = await otimizarRuas(ctx)
      if (!r.falha || !/Sem conexão|indisponível|demorou/.test(r.falha)) throw new Error(`esperava falha de conexão, veio ${JSON.stringify(r).slice(0, 120)}`)
      await tocarLivre(ctx, 'Fechar')
      if ((await sequencia(ctx.page)).join() !== antes.join()) throw new Error('a ordem mudou')
      return r.falha.slice(0, 90)
    })
    await caso('Pelas ruas: cancelar durante o cálculo não muda a rota', async () => {
      ors.modo('travar')
      await importar(ctx, 50)
      const antes = await sequencia(ctx.page)
      await tocarLivre(ctx, 'OTIMIZAR MINHA ROTA')
      const cal = await aguardar(() => botao(ctx.page, 'Calcular pelas ruas'), 20_000, 200)
      if (!cal) throw new Error('a estimativa não apareceu')
      await ctx.tocar(cal.x, cal.y)
      const etapa = await aguardar(async () => /Encaixe das paradas|Distâncias e tempos/.test(await texto(ctx.page)), 30_000, 200)
      if (!etapa) throw new Error('as etapas pelas ruas não apareceram')
      await tocarLivre(ctx, 'Cancelar')
      const ok = await aguardar(async () => (await texto(ctx.page)).includes('cancelada'), 10_000, 200)
      ors.modo('normal')
      if (!ok) throw new Error('não confirmou o cancelamento')
      if ((await sequencia(ctx.page)).join() !== antes.join()) throw new Error('a ordem mudou depois de cancelar')
      return 'cancelado na etapa de encaixe/distâncias; ordem e fase iguais'
    })
    await caso('Pelas ruas: 500 paradas (limite de 36 pedidos/min respeitado)', async () => {
      ors.modo('normal')
      const { pts } = planilha(500)
      posicao = { lat: pts[499].lat + 0.0002, lon: pts[499].lon }
      await ctx.mudarPosicao(posicao)
      await importar(ctx, 500)
      const m0 = ors.estado.matriz
      const r = await otimizarRuas(ctx)
      if (r.falha) throw new Error(`o app informou: ${r.falha}`)
      if (r.paradas !== 500) throw new Error('paradas perdidas')
      return `toque → rota pronta ${r.totalS.toFixed(1)} s · algoritmo ${r.algoritmoS.toFixed(1)} s · ${ors.estado.matriz - m0} pedidos de matriz`
    })
  } finally {
    await ctx.page.evaluate(() => {
      localStorage.removeItem('rotavhsgo.ruasTesteURL')
      localStorage.setItem('rotavhsgo.modoOtimizacao', 'rapida')
    }).catch(() => {})
    await ors.fechar()
  }
}

async function main() {
  const ctx = await abrir()
  const erros = []
  ctx.page.on('pageerror', (e) => erros.push(`pageerror: ${e.name}`))
  await esperar(2500)
  // O GPS (do emulador ou simulado) chega à página? Só confirma; a posição é sintética.
  const sonda = await ctx.page.evaluate(() => new Promise((ok) => navigator.geolocation.getCurrentPosition((p) => ok(`ok ±${Math.round(p.coords.accuracy)} m`), (e) => ok(`erro ${e.code}`), { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 })))
  log('GPS de teste chegou à página:', sonda)
  const resultados = []
  const caso = async (nome, f) => {
    const r = { caso: nome, ok: false }
    try {
      r.detalhe = await f()
      r.ok = true
    } catch (e) {
      r.erro = e.message
      if (ctx.pid) r.erro += ` · processo agora: ${await ctx.pid().catch(() => '?')}`
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
      await tocarLivre(ctx, 'OTIMIZAR MINHA ROTA')
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
      await tocarLivre(ctx, 'Iniciar entregas')
      await esperar(800)
      const t0 = Date.now()
      await tocarLivre(ctx, 'Recalcular pendentes')
      const r = await aguardar(async () => {
        const t = await texto(ctx.page)
        return t.includes('Nova ordem sugerida') ? 'sugestão' : t.includes('já é a melhor') ? 'já era a melhor' : null
      }, 60_000, 150)
      if (!r) throw new Error('o recálculo não respondeu')
      return `${r} em ${((Date.now() - t0) / 1000).toFixed(1)} s (a ordem só muda com o toque)`
    })
  }
  if (!filtro || 'reabrir'.includes(filtro)) {
    await caso('Fechar e reabrir o app sem perder a rota (100 paradas, otimizada, em andamento)', async () => {
      const { pts } = planilha(100)
      posicao = { lat: pts[10].lat, lon: pts[10].lon + 0.0002 }
      await ctx.mudarPosicao(posicao)
      await importar(ctx, 100)
      await otimizar(ctx)
      await tocarLivre(ctx, 'Iniciar entregas')
      await esperar(800)
      const antes = await sequencia(ctx.page)
      await ctx.reabrir()
      // O app pergunta se continua a rota encontrada (comportamento esperado ao reabrir).
      const cont = await aguardar(() => botao(ctx.page, 'Continuar de onde parei'), 8000, 300)
      if (cont) await ctx.tocar(cont.x, cont.y)
      await esperar(800)
      await ir(ctx.page, '/rotas')
      const ok = await aguardar(async () => (await sequencia(ctx.page)).length === 100, 20_000, 300)
      if (!ok) throw new Error('a rota não voltou com 100 paradas')
      const depois = await sequencia(ctx.page)
      if (depois.join() !== antes.join()) throw new Error('a ordem mudou depois de reabrir')
      const t = await texto(ctx.page)
      if (!/EM ANDAMENTO|ANDAMENTO/i.test(t) && !t.includes('Recalcular pendentes')) throw new Error('a fase não voltou como "em andamento"')
      return 'mesma ordem otimizada, mesma fase, 100 paradas'
    })
  }
  // Por último: os casos "pelas ruas" deixam o modo escolhido em "Pelas ruas reais".
  if (!filtro || 'ruas'.includes(filtro)) await casosRuas(ctx, caso)
  log('\nErros de JavaScript:', erros.length ? erros.join(' | ') : 'nenhum')
  const falhas = resultados.filter((r) => !r.ok).length
  log(`\nRESUMO OTIMIZAÇÃO (${alvo}): ${resultados.length - falhas}/${resultados.length} casos OK`)
  await ctx.fechar()
  process.exit(falhas ? 1 : 0)
}
main().catch(async (e) => {
  if (alvo === 'android') {
    try {
      console.error('processo do app no momento da interrupção:', execSync(`adb shell pidof ${PKG}`).toString().trim() || '(nenhum)')
    } catch {
      console.error('processo do app no momento da interrupção: (nenhum)')
    }
  }
  console.error('teste interrompido:', e)
  process.exit(2)
})
