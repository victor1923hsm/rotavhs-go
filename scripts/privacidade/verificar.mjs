#!/usr/bin/env node
// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\scripts\privacidade\verificar.mjs (2026-11-19).
// Adaptação: caminho das planilhas sintéticas permitidas = test-fixtures/planilhas/ (o Go não tem a pasta frontend/).
/**
 * Verificador de privacidade do RotaVHS (sem dependências; Node puro).
 *
 * Procura, nos arquivos que iriam para o Git, sinais de: planilhas reais, telefones, CPF/CNPJ,
 * e-mails pessoais, nomes de destinatários, chaves/tokens/credenciais e arquivos secretos.
 *
 * SAÍDA: só arquivo, linha (quando houver), categoria e quantidade. NUNCA imprime nenhuma parte
 * do valor encontrado (nem trecho mascarado).
 *
 * LIMITE IMPORTANTE: é uma rede de segurança por padrões. Não garante ausência de dados
 * sensíveis (ex.: um nome real solto num texto, sem campo de destinatário, não é reconhecido).
 *
 * Uso:
 *   node scripts/privacidade/verificar.mjs --staged     # conteúdo PREPARADO (índice do git, git add)
 *   node scripts/privacidade/verificar.mjs --all        # todos os arquivos versionados (conteúdo do índice)
 *   node scripts/privacidade/verificar.mjs <arquivos…>  # arquivos do disco
 * Saída 0 = nada encontrado · 1 = bloqueio · 2 = erro de uso.
 *
 * Exceções:
 *   - texto: "privacidade:permitir" na própria linha (falso positivo revisado). A saída informa
 *     quantas linhas foram liberadas assim.
 *   - binário que não dá para verificar: só por caminho + SHA-256 exatos em
 *     scripts/privacidade/excecoes.json (qualquer alteração no arquivo invalida a exceção).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

/** Planilhas sintéticas versionadas (geradas por script, sem dados reais). */
const PLANILHAS_PERMITIDAS = [/^test-fixtures\/planilhas\//]
/** Marcação explícita numa linha para um falso positivo revisado por você. */
export const PERMITIR_LINHA = 'privacidade:permitir'
export const ARQUIVO_EXCECOES = 'scripts/privacidade/excecoes.json'
const MAX_BYTES = 5 * 1024 * 1024
const ZIP_MAX_ENTRADA = 20 * 1024 * 1024
const ZIP_MAX_TOTAL = 50 * 1024 * 1024
const ZIP_MAX_ENTRADAS = 5000
const ZIP_MAX_PROFUNDIDADE = 2
/** Leitura do índice em lotes de até ~16 MB (memória baixa mesmo em commits grandes). */
const LOTE_BYTES = 16 * 1024 * 1024

// ---------- regras de CAMINHO ----------
const REGRAS_CAMINHO = [
  { regra: 'dados-reais', teste: (p) => /(^|\/)samples\/real\//.test(p), msg: 'arquivo de samples/real/ (dados reais nunca vão para o Git)' },
  { regra: 'arquivo-env', teste: (p) => /(^|\/)\.env(\.|$)/.test(p) && !/\.env\.example$/.test(p), msg: 'arquivo .env (segredos)' },
  {
    regra: 'arquivo-secreto',
    teste: (p) => /\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk)$/i.test(p) || /(^|\/)(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$/.test(p) || /(^|\/)(credentials|service-account)[^/]*\.json$/i.test(p),
    msg: 'arquivo de chave/credencial',
  },
  {
    regra: 'planilha',
    teste: (p) => /\.(xlsx|xlsm|xls|ods|csv|tsv)$/i.test(p) && !PLANILHAS_PERMITIDAS.some((r) => r.test(p)),
    msg: 'planilha fora de test-fixtures/planilhas/ (pode ser uma planilha real de entregas)',
  },
]

/** Descrições fixas (nunca contêm o dado) para achados que não são de conteúdo. */
const DESCRICOES = {
  'arquivo-grande': 'acima de 5 MB: não verificado (confira se não é um dump de dados)',
  'binario-nao-reconhecido': 'binário de tipo desconhecido: não dá para verificar (revise e, se for seguro, registre o SHA-256 em excecoes.json)',
  'binario-nao-verificavel': 'PDF ou formato fechado: o conteúdo não é verificado (revise e registre o SHA-256 em excecoes.json)',
  'compactado-nao-verificavel': 'arquivo compactado que não pôde ser aberto (criptografado, corrompido, ZIP64 ou acima dos limites)',
  'imagem-com-exif': 'foto com metadados EXIF (podem conter localização GPS e dados do aparelho)',
}
/** Achados que dizem "não deu para verificar": os únicos que uma exceção por SHA-256 pode liberar. */
const REGRAS_BINARIO = new Set(Object.keys(DESCRICOES).filter((r) => r !== 'arquivo-grande'))

// ---------- utilidades ----------
const soDigitos = (s) => s.replace(/\D/g, '')

/**
 * Número de assinante fictício aceito nos testes (8 dígitos, sem o 9 do celular):
 * começa com 0000 (ex.: 90000-0001, 0000-1234) ou repete um só dígito (ex.: 99999-9999).
 * Um número real terminado em 0000 NÃO é fictício: é bloqueado.
 */
export function telefoneFicticio(local) {
  const assinante = local.length === 9 ? local.slice(1) : local
  return /^0000/.test(assinante) || /^(\d)\1{7}$/.test(assinante)
}

export function cpfValido(valor) {
  const d = soDigitos(valor)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export function cnpjValido(valor) {
  const d = soDigitos(valor)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

const PLACEHOLDER =
  /^(?:<.*>|\$\{.*\}|\$\w+|%\w+%|x{3,}|\*{3,}|\.{3}|changeme|change[-_]?me|placeholder|null|none|undefined|redacted|password|senha|secret|token)$|troque|substitua|preencha|sua[_-]?chave|seu[_-]?token|your[_-]|sint[eé]tic|synthetic|\bteste?\b|test[-_]|[-_]test|fake|dummy|exemplo|example|aqui\b/i
const EMAILS_PERMITIDOS = [/@anthropic\.com$/i, /@example\.(com|org|net)$/i, /@[a-z0-9.-]+\.(test|example|invalid|localhost)$/i, /@users\.noreply\.github\.com$/i]
/** Arquivos de lock (gerados, de terceiros): sem a regra de e-mail (trazem e-mails públicos de mantenedores). */
const ARQUIVO_LOCK = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|uv\.lock)$/

// ---------- telefones ----------
/** DDDs brasileiros válidos (Anatel). */
const DDD = '(?:1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])'
/** Fronteiras numéricas: não pode estar colado a letra/dígito/underscore nem fazer parte de decimal, ID com hífen ou caminho. */
const ANTES = '(?<![\\w.,/-])'
const DEPOIS = '(?![\\w]|[.,-]\\d)'
/**
 * Com DDD: (+55|55|(+55))? + (0|0xx)? + DDD (com ou sem parênteses) + 9XXXX-XXXX / 9 XXXX-XXXX / XXXX-XXXX (fixo 2–5),
 * com ou sem pontuação. Grupos: 1 país · 2/3 DDD · 4 primeiro bloco · 5 últimos 4 dígitos.
 */
const RE_TEL_DDD = new RegExp(
  `${ANTES}(\\+\\s?55[\\s.-]?|\\(\\+?55\\)\\s?|55[\\s.-]?)?(?:\\(\\s?(?:0(?:xx)?)?(${DDD})\\s?\\)|(?:0(?:xx)?)?(${DDD}))[\\s.-]{0,2}(9[\\s.]?\\d{4}|[2-5]\\d{3})[\\s.-]?(\\d{4})${DEPOIS}`,
  'gi',
)
/** Sem DDD: 9XXXX-XXXX, 9 XXXX-XXXX, 9XXXXXXXX, XXXX-XXXX (fixo 2–5). Grupos: 1 primeiro bloco · 2 separador · 3 últimos 4. */
const RE_TEL_LOCAL = new RegExp(`(?<![\\w.,/()+-])(9[\\s.]?\\d{4}|[2-5]\\d{3})([\\s.-]?)(\\d{4})${DEPOIS}`, 'g')
/** Palavras que dão CONTEXTO de telefone na mesma linha (exigidas para os formatos ambíguos). */
const CONTEXTO_TELEFONE = /(?<![a-z])(?:tel(?:efones?)?|fones?|cel(?:ular(?:es)?)?|whats(?:app)?|zap|wpp|contato|phone|mobile|ligar|liga[çc][aã]o|recado)(?![a-z])/i

// ---------- credenciais ----------
const RE_CREDENCIAL = new RegExp(
  '(?<![\\w-])([\\w-]*?(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|senha|private[_-]?key|chave[_-]?api))(?![\\w-])["\'`]?[ \\t]*([:=])(?![=>])[ \\t]*' +
    '(?:(["\'`])([^"\'`\\r\\n]{1,200})\\3|([^\\s"\'`,;{}()\\[\\]<>]+))',
  'gi',
)
const EXPRESSAO_CODIGO = /^(?:process\.env|import\.meta|os\.environ|os\.getenv|env\.|settings\.|config\.|cfg\.|self\.|this\.|ctx\.|req\.|request\.|props\.|opts\.|options\.)/i

/** envEstilo: o valor de um .env não é código, então identificadores curtos também contam. */
export function credencialValida(valor, entreAspas, envEstilo = false) {
  const v = valor.trim()
  if (!v || PLACEHOLDER.test(v) || EXPRESSAO_CODIGO.test(v) || v.includes('(') || /^[$%<{]/.test(v)) return false
  if (/\s/.test(v)) return false // frases (rótulos de tela) não são segredos
  if (/^[A-Za-z_$][\w$]*(?:\.[\w$]+)+$/.test(v)) return false // acesso a membro: config.orsKey
  const temLetra = /[A-Za-z]/.test(v)
  const digitos = (v.match(/\d/g) ?? []).length
  if (envEstilo) return v.length >= 8 && temLetra && (digitos > 0 || v.length >= 20)
  if (/^[A-Za-z_$][\w$]*$/.test(v)) {
    // identificador de código (sha256Hex, base64Url, token2) vs. chave aleatória (h7Gk2mPq9xZ4): letras e dígitos alternados
    const alternancias = (v.match(/[A-Za-z](?=\d)|\d(?=[A-Za-z])/g) ?? []).length
    return (v.length >= 16 && digitos >= 4) || (v.length >= 10 && alternancias >= 4)
  }
  if (entreAspas) return v.length >= 16 || (v.length >= 8 && temLetra && digitos > 0)
  return v.length >= 8 && temLetra && (digitos > 0 || v.length >= 20)
}

// ---------- nomes de destinatário ----------
/** Campos de destinatário (inclui os sinônimos da importação: core/import/fields.ts). Nomes genéricos como "nome"/"name" ficam de fora. */
const CHAVE_NOME =
  '(?:nome[\\s_-]?(?:d[oa][\\s_-]?)?(?:destinat[aá]rio|cliente|recebedor|comprador)|destinat[aá]rio(?:[\\s_-]?nome)?|recebedor|comprador|cliente|recipient(?:[\\s_-]?name)?|receiver(?:[\\s_-]?name)?|customer[\\s_-]?name|buyer(?:[\\s_-]?name)?|consignee(?:[\\s_-]?name)?)'
const RE_NOME = new RegExp(
  `(?<![\\p{L}\\d_])${CHAVE_NOME}(?![\\p{L}\\d_])["'\`*_]*[ \\t]*[:=](?![=>])[ \\t*_]*(?:(["'\`])([^"'\`\\r\\n]{1,80})\\1|([^\\r\\n,;|"'\`<>{}()\\[\\]=:*]{2,80}))`,
  'giu',
)
const NOME_FICTICIO = /fict[ií]ci|\bteste?\b|exemplo|sint[eé]tic|^cliente\s+\S+$|cliente\s*\S{0,12}\s*\d|fulan|beltran|ciclan|apagad|an[oô]nim|\bfake\b|dummy|\bmock/i
const ROTULO = /^(?:destinat[aá]rio|recebedor|comprador|cliente|nome|name|recipient|receiver|buyer|customer|consignee|string|null|undefined|none|true|false)$/i
const PALAVRA_NOME = /^(?:\p{Lu}[\p{Ll}'’]+|\p{Lu}{2,}|\p{Lu}\.?|d[aeo]s?|e)$/u

export function pareceNome(valor, entreAspas) {
  const s = valor.trim().replace(/[.\s]+$/, '')
  if (s.length < 3 || NOME_FICTICIO.test(s) || ROTULO.test(s)) return false
  if (!/^\p{L}[\p{L}'’.\s-]*$/u.test(s)) return false // só letras (nada de código, números, parênteses)
  const palavras = s.split(/\s+/)
  if (palavras.length > 6) return false
  if (entreAspas) return palavras.length >= 2 || /^\p{Lu}/u.test(s)
  return palavras.length >= 2 && /^\p{Lu}/u.test(s) && palavras.every((p) => PALAVRA_NOME.test(p))
}

// ---------- regras de CONTEÚDO (a ordem importa: um trecho já reconhecido não é contado de novo) ----------
const REGRAS_CONTEUDO = [
  { regra: 'chave-privada', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/g },
  { regra: 'token-aws', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { regra: 'token-github', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { regra: 'token-google', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { regra: 'token-slack', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { regra: 'token-api', re: /\b(?:sk|rk)-(?:live|test|ant|proj)?[-_]?[A-Za-z0-9_-]{20,}\b/g },
  { regra: 'token-jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    regra: 'credencial',
    re: /\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s:/@'"]+:([^\s@/'"]+)@[^\s'"]+/gi, // usuário:senha numa URL
    valido: (m) => !PLACEHOLDER.test(m[1]) && !/^[$<{*%]/.test(m[1]),
  },
  {
    regra: 'credencial',
    re: /\b(?:Bearer|Basic)\s+([A-Za-z0-9._~+/=-]{12,})/g,
    valido: (m) => !PLACEHOLDER.test(m[1]) && /\d/.test(m[1]) && /[A-Za-z]/.test(m[1]),
  },
  {
    regra: 'credencial',
    re: RE_CREDENCIAL,
    // grupos: 1 chave · 2 operador · 3 aspas · 4 valor entre aspas · 5 valor sem aspas
    valido: (m) => {
      const env = m[2] === '=' && /^[A-Z][A-Z0-9_]*$/.test(m[1]) // CHAVE_EM_MAIUSCULAS=valor (.env, shell, CI)
      return m[4] !== undefined ? credencialValida(m[4], true, env) : credencialValida(m[5] ?? '', false, env)
    },
  },
  { regra: 'cpf', re: new RegExp(`${ANTES}\\d{3}[.\\s]?\\d{3}[.\\s]?\\d{3}[\\s.-]?\\d{2}${DEPOIS}`, 'g'), valido: (m) => cpfValido(m[0]) },
  { regra: 'cnpj', re: /(?<![\w.,/-])\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}(?![\w]|[.,-]\d)/g, valido: (m) => cnpjValido(m[0]) },
  {
    regra: 'telefone',
    re: RE_TEL_DDD,
    valido: (m, ctx) => {
      const local = soDigitos(m[4]) + m[5]
      // fixo totalmente sem pontuação (10/12 dígitos) parece timestamp/ID: só com contexto
      if (/^\d+$/.test(m[0]) && local.length === 8 && !ctx.contextoTelefone) return false
      return !telefoneFicticio(local)
    },
  },
  {
    regra: 'telefone',
    re: RE_TEL_LOCAL,
    valido: (m, ctx) => {
      const local = soDigitos(m[1]) + m[3]
      if (telefoneFicticio(local)) return false
      if (ctx.contextoTelefone) return true
      return local.length === 9 && m[2] === '-' // sem contexto: só o celular no formato clássico 9XXXX-XXXX
    },
  },
  {
    regra: 'email',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    valido: (m, ctx) =>
      !ctx.lock && !EMAILS_PERMITIDOS.some((r) => r.test(m[0])) && !/^[\w.-]+@\d/.test(m[0]) && !/@(?:types|vitejs|fontsource|vite-pwa|tailwindcss|testing-library|eslint)\b/.test(m[0]),
  },
  {
    regra: 'nome-destinatario',
    re: RE_NOME,
    valido: (m) => (m[2] !== undefined ? pareceNome(m[2], true) : pareceNome(m[3] ?? '', false)),
  },
]

/** Varre uma linha; devolve Map(regra → quantidade). Nada do valor sai daqui. */
function varrerLinha(texto, lock) {
  const ctx = { contextoTelefone: CONTEXTO_TELEFONE.test(texto), lock }
  const ocupados = []
  const contagem = new Map()
  const temDigito = /\d/.test(texto)
  for (const r of REGRAS_CONTEUDO) {
    if (!temDigito && (r.regra === 'cpf' || r.regra === 'cnpj' || r.regra === 'telefone')) continue
    r.re.lastIndex = 0
    for (const m of texto.matchAll(r.re)) {
      const ini = m.index
      const fim = ini + m[0].length
      if (ocupados.some(([a, b]) => ini < b && fim > a)) continue
      if (r.valido && !r.valido(m, ctx)) continue
      ocupados.push([ini, fim])
      contagem.set(r.regra, (contagem.get(r.regra) ?? 0) + 1)
    }
  }
  return contagem
}

// ---------- decodificação e binários ----------
const comeca = (b, i, s) => b.length >= i + s.length && b.toString('latin1', i, i + s.length) === s

function tipoBinario(b) {
  if (comeca(b, 0, '\x89PNG\r\n\x1a\n')) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (comeca(b, 0, 'GIF87a') || comeca(b, 0, 'GIF89a')) return 'gif'
  if (comeca(b, 0, 'RIFF') && comeca(b, 8, 'WEBP')) return 'webp'
  if (b.length > 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico'
  if (comeca(b, 0, 'wOFF') || comeca(b, 0, 'wOF2') || comeca(b, 0, 'OTTO') || comeca(b, 0, '\x00\x01\x00\x00')) return 'fonte'
  if (comeca(b, 0, 'PK\x03\x04') || comeca(b, 0, 'PK\x05\x06')) return 'zip'
  if (comeca(b, 0, '%PDF')) return 'pdf'
  return null
}

function temExif(b, tipo) {
  const amostra = b.subarray(0, 256 * 1024)
  if (tipo === 'jpeg') return amostra.includes('Exif\x00\x00', 0, 'latin1')
  if (tipo === 'png' || tipo === 'webp') return amostra.includes(tipo === 'png' ? 'eXIf' : 'EXIF', 0, 'latin1')
  return false
}

/** Texto (UTF-8, UTF-8 com BOM, UTF-16 LE/BE com ou sem BOM) ou null = binário. */
export function decodificar(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString('utf8', 3)
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2)
  if (buf[0] === 0xfe && buf[1] === 0xff) return trocarBytes(buf.subarray(2)).toString('utf16le')
  const amostra = buf.subarray(0, 8000)
  if (!amostra.includes(0)) return buf.toString('utf8')
  // UTF-16 sem BOM: texto latino tem zero em quase todo byte alto (ímpar no LE, par no BE).
  const n = amostra.length - (amostra.length % 2)
  let zPar = 0
  let zImpar = 0
  for (let i = 0; i < n; i += 2) {
    if (amostra[i] === 0) zPar++
    if (amostra[i + 1] === 0) zImpar++
  }
  const pares = n / 2
  if (pares >= 4 && zImpar / pares > 0.7 && zPar / pares < 0.05) return buf.toString('utf16le')
  if (pares >= 4 && zPar / pares > 0.7 && zImpar / pares < 0.05) return trocarBytes(buf).toString('utf16le')
  return null
}
function trocarBytes(b) {
  const c = Buffer.from(b.subarray(0, b.length - (b.length % 2)))
  return c.swap16()
}

/** XML (planilha/documento dentro de ZIP) → texto: um parágrafo/célula por linha, sem marcação. */
function xmlParaTexto(xml) {
  return xml
    .replace(/<\/(?:[\w]+:)?(?:t|r|span)>/g, '') // trechos de formatação dentro da mesma célula/parágrafo
    .replace(/<\/[^>]*>|<[^>]*\/>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) => {
      const mapa = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
      if (mapa[e.toLowerCase()]) return mapa[e.toLowerCase()]
      const cod = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(cod) && cod < 0x110000 ? String.fromCodePoint(cod) : ' '
    })
}

// ---------- análise de um arquivo ----------
function novoColetor() {
  const mapa = new Map()
  return {
    liberadas: 0,
    add(arquivo, linha, regra, qtd = 1) {
      const k = `${arquivo}\u0000${linha}\u0000${regra}`
      const a = mapa.get(k)
      if (a) a.quantidade += qtd
      else mapa.set(k, { arquivo, linha, regra, quantidade: qtd })
    },
    lista: () => [...mapa.values()],
  }
}

function varrerTexto(arquivo, texto, col, comLinhas) {
  const lock = ARQUIVO_LOCK.test(arquivo)
  const linhas = texto.split(/\r?\n|\r/)
  for (let i = 0; i < linhas.length; i++) {
    const t = linhas[i]
    if (!t) continue
    const cont = varrerLinha(t, lock)
    if (!cont.size) continue
    if (t.includes(PERMITIR_LINHA)) {
      col.liberadas++
      continue
    }
    for (const [regra, qtd] of cont) col.add(arquivo, comLinhas ? i + 1 : 0, regra, qtd)
  }
}

function regrasCaminho(p, col) {
  for (const r of REGRAS_CAMINHO) if (r.teste(p)) col.add(p, 0, r.regra)
}

function analisarConteudo(arquivo, buf, col, prof, dentroZip) {
  const tipo = tipoBinario(buf)
  if (tipo === 'zip') {
    if (prof >= ZIP_MAX_PROFUNDIDADE) col.add(arquivo, 0, 'compactado-nao-verificavel')
    else analisarZip(arquivo, buf, col, prof)
    return
  }
  if (tipo === 'pdf') return col.add(arquivo, 0, 'binario-nao-verificavel')
  if (tipo) {
    if (temExif(buf, tipo)) col.add(arquivo, 0, 'imagem-com-exif')
    return // imagem/fonte reconhecida pela assinatura: o conteúdo visual não é verificável (limite documentado)
  }
  const texto = decodificar(buf)
  if (texto === null) return col.add(arquivo, 0, 'binario-nao-reconhecido')
  if (dentroZip && /\.(xml|rels|vml|html?)$/i.test(arquivo)) varrerTexto(arquivo, xmlParaTexto(texto), col, false)
  else varrerTexto(arquivo, texto, col, true)
}

/** Lê o ZIP (xlsx/ods/docx/zip) sem dependências, com limites de tamanho/quantidade (anti zip-bomb). */
function analisarZip(arquivo, buf, col, prof) {
  const falha = (alvo = arquivo) => col.add(alvo, 0, 'compactado-nao-verificavel')
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return falha()
  const total = buf.readUInt16LE(eocd + 10)
  const tamCd = buf.readUInt32LE(eocd + 12)
  const iniCd = buf.readUInt32LE(eocd + 16)
  if (total === 0xffff || iniCd === 0xffffffff || iniCd + tamCd > buf.length || total > ZIP_MAX_ENTRADAS) return falha()
  let pos = iniCd
  let gasto = 0
  for (let k = 0; k < total; k++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) return falha()
    const flags = buf.readUInt16LE(pos + 8)
    const metodo = buf.readUInt16LE(pos + 10)
    const tamC = buf.readUInt32LE(pos + 20)
    const tamU = buf.readUInt32LE(pos + 24)
    const nl = buf.readUInt16LE(pos + 28)
    const el = buf.readUInt16LE(pos + 30)
    const cl = buf.readUInt16LE(pos + 32)
    const lho = buf.readUInt32LE(pos + 42)
    const nome = buf.toString('utf8', pos + 46, pos + 46 + nl)
    pos += 46 + nl + el + cl
    if (nome.endsWith('/')) continue
    const sub = `${arquivo}!${nome}`
    regrasCaminho(sub, col)
    if (flags & 1 || tamU > ZIP_MAX_ENTRADA || gasto + tamU > ZIP_MAX_TOTAL) {
      falha(sub)
      continue
    }
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) {
      falha(sub)
      continue
    }
    const ini = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28)
    const bruto = buf.subarray(ini, ini + tamC)
    let dados = null
    try {
      if (metodo === 0) dados = bruto
      else if (metodo === 8) dados = inflateRawSync(bruto, { maxOutputLength: ZIP_MAX_ENTRADA })
    } catch {
      dados = null
    }
    if (!dados) {
      falha(sub)
      continue
    }
    gasto += dados.length
    analisarConteudo(sub, dados, col, prof + 1, true)
  }
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex')

/**
 * Varre UM arquivo (caminho com "/" e conteúdo em Buffer/string). Puro: não lê disco nem git.
 * Devolve { achados: [{ arquivo, linha, regra, quantidade }], liberadas }.
 */
export function verificarArquivoDetalhado(caminho, conteudo, { excecoes = [], tamanho } = {}) {
  const p = caminho.replace(/\\/g, '/')
  const col = novoColetor()
  regrasCaminho(p, col)
  const buf = conteudo == null ? null : Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(String(conteudo))
  const bytes = buf ? buf.length : (tamanho ?? 0)
  if (bytes > MAX_BYTES) {
    col.add(p, 0, 'arquivo-grande')
    return { achados: col.lista(), liberadas: 0 }
  }
  if (buf && buf.length) analisarConteudo(p, buf, col, 0, false)
  let achados = col.lista()
  if (achados.some((a) => REGRAS_BINARIO.has(a.regra))) {
    const hash = sha256(buf)
    if (excecoes.some((e) => e.caminho === p && e.sha256 === hash)) achados = achados.filter((a) => !REGRAS_BINARIO.has(a.regra))
  }
  return { achados, liberadas: col.liberadas }
}

export const verificarArquivo = (caminho, conteudo, opcoes) => verificarArquivoDetalhado(caminho, conteudo, opcoes).achados

export function verificar(lista, opcoes = {}) {
  let liberadas = 0
  const achados = []
  for (const a of lista) {
    const r = verificarArquivoDetalhado(a.caminho, a.conteudo, { ...opcoes, tamanho: a.tamanho })
    achados.push(...r.achados)
    liberadas += r.liberadas
  }
  return { achados, liberadas }
}

export function lerExcecoes(texto) {
  if (!texto) return []
  const dados = JSON.parse(String(texto))
  const lista = Array.isArray(dados?.binarios) ? dados.binarios : []
  return lista.filter((e) => typeof e?.caminho === 'string' && /^[0-9a-f]{64}$/.test(e?.sha256 ?? ''))
}

// ---------- leitura (git / disco) ----------
function git(cwd, args, input) {
  return execFileSync('git', args, { cwd, input, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
}
const raizGit = () => git(process.cwd(), ['rev-parse', '--show-toplevel']).toString('utf8').trim()

/**
 * Conteúdo do ÍNDICE (o que entra no commit), não do disco. Primeiro só tamanhos (batch-check);
 * arquivos grandes nem são lidos; o resto é lido em lotes de ~16 MB (um processo git por lote).
 */
export function lerDoIndice(raiz, nomes) {
  const out = []
  const comQuebra = nomes.filter((n) => /[\r\n]/.test(n))
  const normais = nomes.filter((n) => !/[\r\n]/.test(n))
  for (const n of comQuebra) out.push({ caminho: n, conteudo: git(raiz, ['show', `:${n}`]) })
  if (!normais.length) return out
  const info = git(raiz, ['cat-file', '--batch-check'], normais.map((n) => `:${n}`).join('\n') + '\n')
    .toString('utf8')
    .split('\n')
  const aLer = []
  normais.forEach((n, i) => {
    const [sha, tipo, tam] = (info[i] ?? '').split(' ')
    if (tipo !== 'blob') return // submódulo (commit) ou ausente
    const tamanho = Number(tam)
    if (tamanho > MAX_BYTES) out.push({ caminho: n, conteudo: null, tamanho })
    else aLer.push({ caminho: n, sha, tamanho })
  })
  for (let i = 0; i < aLer.length; ) {
    const lote = []
    let soma = 0
    while (i < aLer.length && (lote.length === 0 || soma + aLer[i].tamanho <= LOTE_BYTES)) {
      soma += aLer[i].tamanho
      lote.push(aLer[i++])
    }
    const bruto = git(raiz, ['cat-file', '--batch'], lote.map((a) => a.sha).join('\n') + '\n')
    let pos = 0
    for (const a of lote) {
      const fimCab = bruto.indexOf(10, pos)
      const tamanho = Number(bruto.toString('utf8', pos, fimCab).split(' ')[2])
      out.push({ caminho: a.caminho, conteudo: bruto.subarray(fimCab + 1, fimCab + 1 + tamanho) })
      pos = fimCab + 1 + tamanho + 1
    }
  }
  return out
}

function excecoesDoIndice(raiz) {
  try {
    return lerExcecoes(git(raiz, ['show', `:${ARQUIVO_EXCECOES}`]))
  } catch (e) {
    if (e?.status !== undefined && !/does not exist|exists on disk, but not in|não existe/i.test(String(e.stderr))) throw e
    return []
  }
}

function main(argv) {
  let lista
  let excecoes = []
  if (argv[0] === '--staged' || argv[0] === '--all') {
    const raiz = raizGit()
    const args = argv[0] === '--staged' ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRT'] : ['ls-files', '-z']
    const nomes = git(raiz, args).toString('utf8').split('\0').filter(Boolean)
    lista = lerDoIndice(raiz, nomes)
    excecoes = excecoesDoIndice(raiz)
  } else if (argv.length) {
    lista = argv.map((c) => {
      const tamanho = statSync(c).size
      return { caminho: c, conteudo: tamanho > MAX_BYTES ? null : readFileSync(c), tamanho }
    })
    try {
      excecoes = lerExcecoes(readFileSync(ARQUIVO_EXCECOES))
    } catch (e) {
      if (e?.code !== 'ENOENT') throw e
    }
  } else {
    console.error('uso: verificar.mjs --staged | --all | <arquivos…>')
    return 2
  }
  const { achados, liberadas } = verificar(lista, { excecoes })
  const nota = liberadas ? ` · ${liberadas} linha(s) liberada(s) por "${PERMITIR_LINHA}"` : ''
  if (!achados.length) {
    console.log(`privacidade: OK (${lista.length} arquivo(s) verificados${nota}). Lembrete: a verificação é por padrões e não garante ausência total de dados sensíveis.`)
    return 0
  }
  const total = achados.reduce((s, a) => s + a.quantidade, 0)
  const arquivos = new Set(achados.map((a) => a.arquivo.split('!')[0])).size
  console.error(`privacidade: BLOQUEADO · ${total} ocorrência(s) em ${arquivos} arquivo(s)${nota}`)
  for (const a of achados) {
    const desc = REGRAS_CAMINHO.find((r) => r.regra === a.regra && a.linha === 0)?.msg ?? DESCRICOES[a.regra]
    console.error(`  ${a.arquivo}${a.linha ? `:${a.linha}` : ''}  [${a.regra}]  ×${a.quantidade}${desc ? `  (${desc})` : ''}`)
  }
  console.error(`Remova o dado. Falso positivo revisado: acrescente "${PERMITIR_LINHA}" na linha (texto) ou registre o SHA-256 em ${ARQUIVO_EXCECOES} (binário).`)
  return 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (e) {
    // erro de leitura/git: bloqueia (falha fechada), sem imprimir conteúdo de arquivo
    console.error(`privacidade: ERRO na verificação (${e?.code ?? e?.status ?? 'desconhecido'}): ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}`)
    process.exitCode = 2
  }
}
