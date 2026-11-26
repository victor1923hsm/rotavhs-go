// Teste de ponta a ponta da RB-1: central "Calcular pelas ruas", modo de otimização e COFRE DA CHAVE.
//   node e2e/ruas.mjs android            (APK no emulador: cofre nativo, Keystore, AES-256-GCM)
//   node e2e/ruas.mjs navegador URL      (PWA: cofre indisponível, nada guardado)
// Só uma chave FICTÍCIA de teste. Nenhuma chamada a provedor de rotas. Capturas das telas vão para o log
// para e2e-saida/ (no GitHub Actions, enviadas como artefato "telas-rb1").
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const alvo = process.argv[2] ?? 'navegador'
const PKG = 'io.github.victor1923hsm.rotavhsgo'
const APK = process.env.APK ?? ''
const FICTICIA = 'TESTE-rotavhs-chave-ficticia-0123456789abcdef'
const FICTICIA2 = 'TESTE-rotavhs-chave-substituta-9876543210fedcba'
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

let device = null
async function abrir() {
  if (alvo === 'android') {
    const { _android: android } = await import('playwright-core')
    ;[device] = await android.devices()
    if (!device) throw new Error('nenhum aparelho Android no adb')
    await device.shell(`pm clear ${PKG}`)
    return conectar()
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

let caixa = null
/** Posição da WebView na tela (para tocar com "input tap", um toque nativo de verdade). */
async function medirWebView() {
  for (let t = 1; t <= 6 && !caixa; t++) {
    await device.shell('rm -f /sdcard/ui.xml; uiautomator dump /sdcard/ui.xml').catch(() => {})
    const xml = String(await device.shell('cat /sdcard/ui.xml').catch(() => ''))
    const m = xml.match(/class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    if (m) caixa = { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) }
    else await esperar(1500)
  }
  if (!caixa) caixa = 'js'
}
async function conectar() {
  await device.shell(`am start -W -n ${PKG}/.MainActivity`)
  const webview = await device.webView({ pkg: PKG }, { timeout: 60_000 })
  const page = await webview.page()
  return {
    page,
    async tocar(x, y) {
      if (!caixa) await medirWebView()
      if (caixa === 'js') {
        // uiautomator não respondeu: clique pelo próprio elemento no ponto (último recurso)
        return this.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.click(), { x, y })
      }
      const { iw, ih } = await this.page.evaluate(() => ({ iw: innerWidth, ih: innerHeight }))
      await device.shell(`input tap ${Math.round(caixa.x + (x * caixa.w) / iw)} ${Math.round(caixa.y + (y * caixa.h) / ih)}`)
    },
    fechar: () => device.close(),
  }
}

async function reabrir(ctx) {
  await device.shell(`am force-stop ${PKG}`)
  await esperar(1000)
  const novo = await conectar()
  ctx.page = novo.page
  await esperar(2500)
}

const ir = (page, rota) =>
  page.evaluate((r) => {
    history.pushState({}, '', r)
    dispatchEvent(new PopStateEvent('popstate'))
  }, rota)
const texto = (page) => page.evaluate(() => document.body.innerText)
async function aguardar(fn, ms, passo = 200) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await esperar(passo)
  }
}
async function tocar(ctx, s) {
  const b = await aguardar(async () => {
    const r = await ctx.page.evaluate((s) => {
      const el = [...document.querySelectorAll('button, a')].find((b) => b.textContent?.trim().startsWith(s) && !b.disabled)
      if (!el) return null
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
      return true
    }, s)
    if (!r) return null
    await esperar(400)
    return ctx.page.evaluate((s) => {
      const el = [...document.querySelectorAll('button, a')].find((b) => b.textContent?.trim().startsWith(s) && !b.disabled)
      if (!el) return null
      const q = el.getBoundingClientRect()
      const x = q.left + q.width / 2, y = q.top + q.height / 2
      const topo = document.elementFromPoint(x, y)
      return topo === el || el.contains(topo) ? { x, y } : null
    }, s)
  }, 12_000, 300)
  if (!b) throw new Error(`botão "${s}" não encontrado ou coberto`)
  await ctx.tocar(b.x, b.y)
  await esperar(500)
}
async function digitarChave(ctx, valor) {
  const ok = await aguardar(() => ctx.page.$('#chave-api'), 8000)
  if (!ok) throw new Error('campo da chave não apareceu')
  const tipo = await ctx.page.$eval('#chave-api', (e) => e.type)
  if (tipo !== 'password') throw new Error(`o campo da chave não é protegido (type=${tipo})`)
  await ctx.page.fill('#chave-api', valor)
}
async function captura(ctx, nome) {
  await esperar(600)
  const shot = await ctx.page.screenshot({ type: 'jpeg', quality: 70, scale: 'css' }).catch(() => null)
  if (!shot) return
  mkdirSync('e2e-saida', { recursive: true })
  writeFileSync(`e2e-saida/${alvo}-${nome}.jpg`, shot)
  log(`TELA ${nome} (e2e-saida/${alvo}-${nome}.jpg)`)
}
const nativo = (ctx, metodo, opcoes = {}) => ctx.page.evaluate(({ metodo, opcoes }) => window.Capacitor.nativePromise('CofreChave', metodo, opcoes), { metodo, opcoes })
const sh = async (c) => String(await device.shell(c).catch((e) => `ERRO ${e.message}`))

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
      await captura(ctx, `falha-${nome.replace(/\W+/g, '-').slice(0, 40)}`)
    }
    log(`${r.ok ? 'OK   ' : 'FALHA'} ${nome} — ${r.detalhe ?? ''}${r.erro ? ` · ERRO: ${r.erro}` : ''}`)
    resultados.push(r)
  }

  await caso('Central "Calcular pelas ruas" abre com o aviso de desenvolvimento', async () => {
    await ir(ctx.page, '/estatisticas/ruas')
    const t = await aguardar(async () => {
      const t = await texto(ctx.page)
      return t.includes('Calcular pelas ruas') && !t.includes('Verificando o cofre') ? t : null
    }, 15_000)
    if (!t) throw new Error('a tela não terminou de abrir')
    if (!t.includes('em desenvolvimento') || !t.includes('nenhuma coordenada é enviada')) throw new Error('sem o aviso de desenvolvimento')
    if (alvo === 'android' && !t.includes('Nenhuma chave cadastrada')) throw new Error('o cofre não começou vazio')
    if (alvo !== 'android' && !t.includes('Indisponível neste navegador')) throw new Error('o PWA não informou a indisponibilidade')
    await captura(ctx, alvo === 'android' ? '1-central-sem-chave' : 'pwa-central')
    return alvo === 'android' ? 'sem chave cadastrada' : 'PWA: cofre indisponível, sem campo de chave'
  })

  if (alvo === 'android') {
    await caso('Cofre: cadastrar a chave (campo protegido)', async () => {
      await tocar(ctx, 'Cadastrar chave')
      await digitarChave(ctx, FICTICIA)
      await captura(ctx, '2-cadastrar-chave')
      await tocar(ctx, 'Guardar chave')
      const t = await aguardar(async () => ((await texto(ctx.page)).includes('Chave cadastrada') ? texto(ctx.page) : null), 10_000)
      if (!t) throw new Error('não mostrou "Chave cadastrada"')
      if (t.includes(FICTICIA)) throw new Error('a chave apareceu na tela')
      const v = await ctx.page.$('#chave-api')
      if (v) throw new Error('o campo continuou aberto depois de guardar')
      await captura(ctx, '3-chave-cadastrada')
      const r = await nativo(ctx, 'ler')
      if (r.valor !== FICTICIA || r.estado !== 'cadastrada') throw new Error('o valor lido do cofre não confere')
      return 'guardada; a tela não mostra o valor; leitura nativa confere'
    })

    await caso('Cofre: o arquivo do app só tem o texto cifrado', async () => {
      const xml = await sh(`run-as ${PKG} cat shared_prefs/rotavhsgo_cofre.xml`)
      if (!xml.includes('name="c1"')) throw new Error(`arquivo do cofre não encontrado (${xml.slice(0, 80)})`)
      if (xml.includes(FICTICIA) || xml.includes('rotavhs-chave')) throw new Error('a chave está em texto claro no arquivo')
      const outros = await sh(`run-as ${PKG} sh -c "grep -rl rotavhs-chave-ficticia shared_prefs app_webview databases files 2>/dev/null"`)
      if (outros.trim() && !outros.startsWith('ERRO')) throw new Error(`a chave aparece em: ${outros.trim().slice(0, 120)}`)
      return 'só IV + texto cifrado (AES-256-GCM); a chave não está em localStorage, IndexedDB nem arquivos'
    })

    await caso('Cofre: continua cadastrada depois de fechar e reabrir o app', async () => {
      await reabrir(ctx)
      await ir(ctx.page, '/estatisticas/ruas')
      const t = await aguardar(async () => ((await texto(ctx.page)).includes('Chave cadastrada') ? true : null), 15_000)
      if (!t) throw new Error('a chave sumiu ao reabrir')
      return 'cadastrada'
    })

    await caso('Cofre: substituir a chave', async () => {
      await tocar(ctx, 'Substituir chave')
      await digitarChave(ctx, FICTICIA2)
      await captura(ctx, '4-substituir-chave')
      await tocar(ctx, 'Substituir chave')
      await aguardar(async () => ((await ctx.page.$('#chave-api')) ? null : true), 10_000)
      const r = await nativo(ctx, 'ler')
      if (r.valor !== FICTICIA2) throw new Error('o valor não foi substituído')
      return 'nova chave no lugar da antiga'
    })

    await caso('Cofre: cancelar a substituição não muda nada', async () => {
      await tocar(ctx, 'Substituir chave')
      await digitarChave(ctx, 'TESTE-rotavhs-nao-deve-ficar-000000000000')
      await tocar(ctx, 'Cancelar')
      const r = await nativo(ctx, 'ler')
      if (r.valor !== FICTICIA2) throw new Error('cancelar alterou a chave')
      return 'a chave anterior continua'
    })

    await caso('Cofre: formato inválido é recusado com mensagem', async () => {
      await tocar(ctx, 'Substituir chave')
      await digitarChave(ctx, 'curta demais')
      await tocar(ctx, 'Substituir chave')
      const t = await aguardar(async () => ((await texto(ctx.page)).includes('parece incompleta') ? true : null), 5000)
      if (!t) throw new Error('sem mensagem de erro')
      await captura(ctx, '5-erro-formato')
      await tocar(ctx, 'Cancelar')
      const r = await nativo(ctx, 'ler')
      if (r.valor !== FICTICIA2) throw new Error('a chave anterior mudou')
      return 'recusado; a anterior continua'
    })

    await caso('Cofre: material adulterado vira "invalidada" e é apagado', async () => {
      await device.shell(`am force-stop ${PKG}`)
      const xml = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map><string name="c1">AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA</string></map>`
      const b64 = Buffer.from(xml).toString('base64')
      await sh(`run-as ${PKG} sh -c "echo ${b64} | base64 -d > shared_prefs/rotavhsgo_cofre.xml"`)
      const conf = await sh(`run-as ${PKG} cat shared_prefs/rotavhsgo_cofre.xml`)
      if (!conf.includes('AAAAAAAAAAAAAAAA:')) throw new Error(`não consegui adulterar o arquivo (${conf.slice(0, 60)})`)
      await reabrir(ctx)
      await ir(ctx.page, '/estatisticas/ruas')
      const t = await aguardar(async () => ((await texto(ctx.page)).includes('apagada pela segurança') ? true : null), 15_000)
      if (!t) throw new Error('não informou a invalidação')
      await captura(ctx, '6-chave-invalidada')
      const r = await nativo(ctx, 'existe')
      if (r.estado !== 'ausente') throw new Error(`depois de invalidar, o estado ficou ${r.estado}`)
      return 'informado na tela; material apagado; cadastrar de novo'
    })

    await caso('Cofre: excluir a chave', async () => {
      await tocar(ctx, 'Cadastrar chave')
      await digitarChave(ctx, FICTICIA)
      await tocar(ctx, 'Guardar chave')
      await aguardar(async () => ((await texto(ctx.page)).includes('Chave cadastrada') ? true : null), 10_000)
      await tocar(ctx, 'Excluir chave')
      await captura(ctx, '7-excluir-chave')
      await tocar(ctx, 'Excluir chave')
      const t = await aguardar(async () => ((await texto(ctx.page)).includes('Nenhuma chave cadastrada') ? true : null), 10_000)
      if (!t) throw new Error('não voltou para "Nenhuma chave"')
      const r = await nativo(ctx, 'ler')
      if (r.valor !== null) throw new Error('o valor continuou no cofre')
      const xml = await sh(`run-as ${PKG} cat shared_prefs/rotavhsgo_cofre.xml`)
      if (xml.includes('name="c1"')) throw new Error('o texto cifrado ficou no arquivo')
      return 'apagada (texto cifrado e chave do Keystore)'
    })

    await caso('Backup do app desligado', async () => {
      const d = await sh(`dumpsys package ${PKG}`)
      const flags = (d.match(/pkgFlags=\[[^\]]*\]/) ?? [''])[0]
      if (flags.includes('ALLOW_BACKUP')) throw new Error(`backup permitido: ${flags}`)
      return flags || 'sem ALLOW_BACKUP'
    })

    if (APK) {
      await caso('Reinstalar o app apaga a chave', async () => {
        await tocar(ctx, 'Cadastrar chave')
        await digitarChave(ctx, FICTICIA)
        await tocar(ctx, 'Guardar chave')
        await aguardar(async () => ((await texto(ctx.page)).includes('Chave cadastrada') ? true : null), 10_000)
        await device.close().catch(() => {})
        execSync(`adb uninstall ${PKG}`, { stdio: 'ignore' })
        execSync(`adb install -r ${APK}`, { stdio: 'ignore' })
        const { _android: android } = await import('playwright-core')
        ;[device] = await android.devices()
        const novo = await conectar()
        ctx.page = novo.page
        await esperar(2500)
        const r = await nativo(ctx, 'existe')
        if (r.estado !== 'ausente') throw new Error(`depois de reinstalar: ${r.estado}`)
        return 'ausente depois de reinstalar'
      })
    }
  }

  await caso('Modo "Pelas ruas reais": OTIMIZAR abre o aviso e Cancelar não muda nada', async () => {
    await ir(ctx.page, '/rotas')
    await aguardar(async () => ((await texto(ctx.page)).includes('OTIMIZAR MINHA ROTA') ? true : null), 15_000)
    const antes = await ctx.page.evaluate(() => [...document.querySelectorAll('.seq-linha .chip-stop')].map((e) => e.textContent.trim()).join())
    await tocar(ctx, 'Pelas ruas reais')
    await captura(ctx, '8-modo-pelas-ruas')
    await tocar(ctx, 'OTIMIZAR MINHA ROTA')
    const t = await aguardar(async () => ((await texto(ctx.page)).includes('Cálculo pelas ruas em desenvolvimento') ? true : null), 5000)
    if (!t) throw new Error('o aviso não apareceu')
    await captura(ctx, '9-aviso-em-desenvolvimento')
    await tocar(ctx, 'Cancelar')
    const tt = await texto(ctx.page)
    if (tt.includes('Otimizada a partir') || !tt.includes('REVISÃO')) throw new Error('a rota mudou depois de cancelar')
    const depois = await ctx.page.evaluate(() => [...document.querySelectorAll('.seq-linha .chip-stop')].map((e) => e.textContent.trim()).join())
    if (antes !== depois) throw new Error('a ordem mudou')
    await tocar(ctx, 'Rápida')
    return 'aviso mostrado; nada calculado nem simulado; a rota não mudou'
  })

  if (alvo === 'android') {
    await caso('A chave de teste não aparece no logcat', async () => {
      const l = await sh('logcat -d')
      const achou = ['rotavhs-chave-ficticia', 'rotavhs-chave-substituta', 'rotavhs-nao-deve-ficar'].filter((k) => l.includes(k))
      if (achou.length) throw new Error(`apareceu no logcat: ${achou.join(', ')}`)
      return `nenhuma ocorrência em ${l.split('\n').length} linhas`
    })
  }

  log('\nErros de JavaScript:', erros.length ? erros.join(' | ') : 'nenhum')
  const falhas = resultados.filter((r) => !r.ok).length
  log(`\nRESUMO RB-1 (${alvo}): ${resultados.length - falhas}/${resultados.length} casos OK`)
  await ctx.fechar().catch(() => {})
  process.exit(falhas ? 1 : 0)
}
main().catch((e) => {
  console.error('teste interrompido:', e)
  process.exit(2)
})
