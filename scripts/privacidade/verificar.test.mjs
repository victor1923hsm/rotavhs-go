// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\scripts\privacidade\verificar.test.mjs (2026-11-19).
// Adaptação: caminho das planilhas sintéticas permitidas = test-fixtures/planilhas/ (o Go não tem a pasta frontend/).
/**
 * Testes do verificador de privacidade (node --test, sem dependências).
 * Os valores "sensíveis" são MONTADOS em tempo de execução (concatenação com j()), para que este
 * arquivo não contenha os padrões e não seja bloqueado pelo próprio verificador.
 * Todos os "dados reais" aqui são SIMULADOS (inventados), só com formato realista.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cnpjValido, cpfValido, decodificar, telefoneFicticio, verificarArquivo, verificarArquivoDetalhado } from './verificar.mjs'

const SCRIPT = fileURLToPath(new URL('./verificar.mjs', import.meta.url))
const regras = (caminho, conteudo = '', opcoes) => verificarArquivo(caminho, conteudo, opcoes).map((a) => a.regra)
const j = (...p) => p.join('')
const deveBloquear = (conteudo, regra, caminho = 'a.txt') => assert.deepEqual(regras(caminho, conteudo), [regra], `deveria bloquear como ${regra}: caso ${JSON.stringify(conteudo.length)}`)
const devePassar = (conteudo, caminho = 'a.txt') => assert.deepEqual(regras(caminho, conteudo), [], 'deveria passar')

/** Gera um CPF com dígitos verificadores válidos a partir de 9 dígitos. */
function gerarCpf(base9) {
  const d = base9.split('').map(Number)
  for (const n of [9, 10]) {
    let s = 0
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i)
    const r = (s * 10) % 11
    d.push(r === 10 ? 0 : r)
  }
  const x = d.join('')
  return { raw: x, fmt: `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6, 9)}-${x.slice(9)}`, esp: `${x.slice(0, 3)} ${x.slice(3, 6)} ${x.slice(6, 9)} ${x.slice(9)}` }
}

/** ZIP mínimo (sem CRC: o verificador não confere CRC). entradas: [{ nome, dados, deflate?, flags?, tamU? }] */
function montarZip(entradas) {
  const locais = []
  const centrais = []
  let off = 0
  for (const e of entradas) {
    const nome = Buffer.from(e.nome)
    const cru = Buffer.from(e.dados)
    const dados = e.deflate ? deflateRawSync(cru) : cru
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(e.flags ?? 0, 6)
    lh.writeUInt16LE(e.deflate ? 8 : 0, 8)
    lh.writeUInt32LE(dados.length, 18)
    lh.writeUInt32LE(e.tamU ?? cru.length, 22)
    lh.writeUInt16LE(nome.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(e.flags ?? 0, 8)
    ch.writeUInt16LE(e.deflate ? 8 : 0, 10)
    ch.writeUInt32LE(dados.length, 20)
    ch.writeUInt32LE(e.tamU ?? cru.length, 24)
    ch.writeUInt16LE(nome.length, 28)
    ch.writeUInt32LE(off, 42)
    locais.push(lh, nome, dados)
    centrais.push(ch, nome)
    off += 30 + nome.length + dados.length
  }
  const cd = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(entradas.length, 8)
  fim.writeUInt16LE(entradas.length, 10)
  fim.writeUInt32LE(cd.length, 12)
  fim.writeUInt32LE(off, 16)
  return Buffer.concat([...locais, cd, fim])
}

// ------------------------------------------------------------------ caminhos
describe('regras de caminho', () => {
  it('bloqueia dados reais, .env, chaves e planilhas fora das fixtures', () => {
    assert.deepEqual(regras('samples/real/rota.xlsx'), ['dados-reais', 'planilha'])
    assert.deepEqual(regras('backend/.env'), ['arquivo-env'])
    assert.deepEqual(regras('frontend/.env.local'), ['arquivo-env'])
    assert.deepEqual(regras('certs/servidor.pem'), ['arquivo-secreto'])
    assert.deepEqual(regras('.ssh/id_rsa'), ['arquivo-secreto'])
    assert.deepEqual(regras('config/service-account-prod.json'), ['arquivo-secreto'])
    assert.deepEqual(regras('rota-do-dia.xlsx'), ['planilha'])
    assert.deepEqual(regras('docs/exportacao.csv'), ['planilha'])
  })
  it('permite .env.example e as planilhas sintéticas versionadas', () => {
    assert.deepEqual(regras('backend/.env.example'), [])
    assert.deepEqual(regras('test-fixtures/planilhas/10-padrao.csv'), [])
  })
})

// ------------------------------------------------------------------ telefones
describe('telefones com DDD', () => {
  const casos = {
    'parênteses e espaço': j('(62) 9', '8123-4567'),
    'parênteses sem espaço': j('(62)9', '8123-4567'),
    'espaço': j('62 9', '8123-4567'),
    'pontos': j('62.9', '8123.4567'),
    'hífens': j('62-9', '8123-4567'),
    'sem pontuação (11 dígitos)': j('629', '81234567'),
    'espaço no lugar do hífen': j('62 9', '8123 4567'),
    'DDD com zero': j('062 9', '8123-4567'),
    'DDD com zero e parênteses': j('(062) 9', '8123-4567'),
    'DDD 0xx': j('0xx62 9', '8123-4567'),
    'nono dígito separado': j('(62) 9 ', '8123-4567'),
    'nono dígito separado sem parênteses': j('62 9 ', '8123 4567'),
    '+55 separado': j('+55 62 9', '8123-4567'),
    '+55 e parênteses': j('+55 (62) 9', '8123-4567'),
    '+55 colado': j('+55629', '81234567'),
    '55 colado (13 dígitos)': j('55629', '81234567'),
    '+55 colado com parênteses': j('+55(62)9', '8123-4567'),
    '(+55)': j('(+55) 62 9', '8123-4567'),
    'tel: URI': j('tel:+55629', '81234567'),
    'fixo formatado': j('(62) 3', '456-7890'),
    'fixo com espaço': j('62 3', '456 7890'),
    'fixo +55 colado': j('+55623', '4567890'),
    'real terminado em 0000': j('(62) 98123-', '0000'),
    'real com 9999 e final 0000 (antes era aceito)': j('62 99999-', '0000'),
    'DDD 11 (SP)': j('(11) 9', '7654-3210'),
    'DDD 55 (RS) sem pontuação': j('559', '81234567'),
  }
  for (const [nome, tel] of Object.entries(casos)) it(`bloqueia: ${nome}`, () => deveBloquear(`entrega ${tel} ok`, 'telefone'))

  it('fixo totalmente sem pontuação só com contexto (evita timestamps/IDs)', () => {
    deveBloquear(j('telefone 623', '4567890'), 'telefone')
    deveBloquear(j('fone: 55623', '4567890'), 'telefone')
    devePassar(j('id 623', '4567890'))
    devePassar('const t = 1731801600 // segundos')
  })
  it('conta várias ocorrências na mesma linha', () => {
    const [a] = verificarArquivo('a.txt', j('(62) 9', '8123-4567 e (62) 9', '7654-3210'))
    assert.equal(a.quantidade, 2)
  })
})

describe('telefones sem DDD (contexto)', () => {
  it('com palavra de contexto na linha: celular e fixo, com e sem pontuação', () => {
    deveBloquear(j('celular 9', '8123-4567'), 'telefone')
    deveBloquear(j('whats: 98', '1234567'), 'telefone')
    deveBloquear(j('Fone 9 ', '8123 4567'), 'telefone')
    deveBloquear(j('tel. 3', '456-7890'), 'telefone')
    deveBloquear(j('contato 3', '4567890'), 'telefone')
    deveBloquear(j('ligar no 9', '8123.4567'), 'telefone')
  })
  it('sem contexto: só o celular no formato clássico 9XXXX-XXXX é bloqueado', () => {
    deveBloquear(j('anotado 9', '8123-4567'), 'telefone')
    devePassar(j('anotado 98', '1234567'))
    devePassar(j('anotado 3', '456-7890'))
    devePassar(j('anotado 9', '8123 4567'))
  })
})

describe('telefones fictícios e números que NÃO são telefone', () => {
  it('fictícios dos testes passam (assinante 0000… ou dígito repetido)', () => {
    for (const tel of ['(62) 90000-0001', '(62) 90000-0099', '(62) 99999-9999', '62 3333-3333', '+55 62 90000-0010']) devePassar(`t = '${tel}'`)
    devePassar(j('telefone 0000-', '1234'))
    assert.ok(telefoneFicticio('900000001'))
    assert.ok(!telefoneFicticio(j('98123', '0000')))
  })
  it('códigos de pacote SPX', () => {
    for (const c of [j('BR25', '6298', '1234567'), j('BR259', '876543210A'), j('SPXBR0', '6298', '1234567'), j('BR', '6298', '123456789')]) devePassar(`pacote ${c} contato`)
  })
  it('IDs, hashes, números de série, timestamps, coordenadas e outros números', () => {
    const casos = [
      '550e8400-e29b-41d4-a716-446655440000',
      'sha256 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      'commit 62981234a',
      j('SN-9', '8123-4567'),
      j('SN 9', '8123-4567X'),
      j('lote 2501', '17629812345678'),
      'const T0 = 1_700_000_000_000; const t = 1731801600000',
      j('-16.62', '981234567,-49.26', '48123456'),
      'CEP 74000-000',
      'R$ 1.234,56 · 2026-11-17 · 192.168.62.98 · v1.2.3 · porta 5173',
      'faixa 90000-90010',
    ]
    for (const c of casos) devePassar(c)
  })
  it('telefone e CPF ficam fora de palavras e URLs de commit', () => {
    devePassar(j('https://exemplo.dev/build/629', '81234567x'))
  })
})

// ------------------------------------------------------------------ CPF / CNPJ
describe('CPF e CNPJ', () => {
  const cpf = gerarCpf('529982247')
  const cpf2 = gerarCpf('123456789')
  it('bloqueia CPF válido: formatado, só dígitos, com espaços, misto, em JSON', () => {
    assert.ok(cpfValido(cpf.fmt))
    deveBloquear(`CPF ${cpf.fmt}`, 'cpf')
    deveBloquear(`doc ${cpf2.raw}`, 'cpf')
    deveBloquear(`doc ${cpf.esp}`, 'cpf')
    deveBloquear(`doc ${cpf.raw.slice(0, 3)}.${cpf.raw.slice(3, 6)}.${cpf.raw.slice(6, 9)} ${cpf.raw.slice(9)}`, 'cpf')
    deveBloquear(`{"cpf":"${cpf.raw}"}`, 'cpf')
  })
  it('CPF válido com cara de celular conta UMA vez (como cpf)', () => {
    const c = gerarCpf('629812345')
    assert.deepEqual(verificarArquivo('a.txt', `doc ${c.raw}`).map((a) => [a.regra, a.quantidade]), [['cpf', 1]])
  })
  it('ignora dígito verificador inválido, dígitos repetidos e números mais longos', () => {
    const errado = cpf.fmt.slice(0, -1) + ((Number(cpf.fmt.at(-1)) + 1) % 10)
    assert.ok(!cpfValido(errado))
    devePassar(errado)
    devePassar('111.111.111-11')
    devePassar(`id ${cpf.raw}0`)
    devePassar(`BR${cpf.raw}`)
  })
  it('bloqueia CNPJ válido', () => {
    const cnpj = j('11.222.333', '/0001-81')
    assert.ok(cnpjValido(cnpj))
    deveBloquear(cnpj, 'cnpj')
  })
})

// ------------------------------------------------------------------ e-mails
describe('e-mails', () => {
  it('bloqueia e-mail pessoal; permite os de exemplo/sistema', () => {
    deveBloquear(j('fale com maria.souza', '@', 'gmail.com'), 'email')
    deveBloquear(j('Maria.Souza', '@', 'Gmail.COM'), 'email')
    devePassar('Co-Authored-By: Claude <noreply@anthropic.com>')
    devePassar('usuario@example.com')
    devePassar(j('"contato ', 'x', '@', 'mantenedor.me"'), 'frontend/package-lock.json')
  })
})

// ------------------------------------------------------------------ credenciais
describe('credenciais', () => {
  it('tokens conhecidos e chave privada', () => {
    deveBloquear(j('-----BEGIN RSA ', 'PRIVATE KEY-----'), 'chave-privada')
    deveBloquear(j('AK', 'IA', 'ABCDEFGHIJKLMNOP'), 'token-aws')
    deveBloquear(j('gh', 'p_', 'A'.repeat(36)), 'token-github')
    deveBloquear(j('AI', 'za', 'B'.repeat(35)), 'token-google')
    deveBloquear(j('sk', '-ant-', 'c'.repeat(30)), 'token-api')
    deveBloquear(j('ey', 'JhbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'abcdefghijklmnop'), 'token-jwt')
  })
  it('sem aspas: .env, YAML, cabeçalho HTTP', () => {
    deveBloquear(j('ORS_API_KEY=', '5b3ce3597851110001', 'cf6248'), 'credencial', 'config.txt')
    deveBloquear(j('API_KEY=', 'k9Fz2', 'Lq8Rw4'), 'credencial', 'config.ini')
    deveBloquear(j('API_ACCESS_TOKEN=', 'Xq3vT9', 'pLm2Za7Rk'), 'credencial', 'deploy.sh')
    deveBloquear(j('Authorization: Bearer ', 'abcdef123456', 'ghijkl7890'), 'credencial')
    deveBloquear(j('password: ', 'Q8v!zP2#', 'mW9rTx'), 'credencial', 'app.yml')
    deveBloquear(j('secret: ', 'h7Gk2m', 'Pq9xZ4'), 'credencial', 'app.yml')
    deveBloquear(j('senha=', 'Aurora', '2024!'), 'credencial')
    deveBloquear(j('X-Api-Key: ', 'a1b2c3d4', 'e5f6g7h8'), 'credencial')
    deveBloquear(j('--password=', 'Tr0ub4', 'dor33'), 'credencial', 'run.sh')
  })
  it('com aspas e em URL', () => {
    deveBloquear(j('ORS_API_KEY = "', '5b3ce35978511100', '01cf6248"'), 'credencial', 'cfg.py')
    deveBloquear(j('password: "', 'Q8v!zP2#mW9rTx', '"'), 'credencial', 'cfg.ts')
    deveBloquear(j('postgres://user:', 'S3nhaForte123', '@db.host:5432/x'), 'credencial')
  })
  it('arquivos de configuração do projeto e código comum passam', () => {
    for (const c of [
      'API_ACCESS_TOKEN=troque-por-um-token-longo-e-aleatorio',
      'ORS_API_KEY=',
      'ORS_API_KEY = "<sua-chave-aqui>"',
      '"API_ACCESS_TOKEN": "token-sintetico-so-para-medicao-123"',
      'token: string',
      'password?: string',
      'apiKey: config.orsApiKey',
      'secret: process.env.ORS_API_KEY',
      'const token = await getToken()',
      'password: ${DB_PASS}',
      'headers: { Authorization: `Bearer ${token}` }',
      'maxTokens: 1000',
      "senha: 'Digite sua senha'",
      'if (token === novoToken) return',
      'tokens => tokens.length',
      'postgres://user:${DB_PASS}@db:5432/x',
      'secret: sha256Hex',
      'token: base64UrlEncode',
      'apiKey: orsApiKeyV2',
      'password: utf8Decoder1',
    ])
      devePassar(c, 'cfg.ts')
  })
})

// ------------------------------------------------------------------ nomes
describe('nomes de destinatário', () => {
  const nome = j('Maria Apa', 'recida Souza')
  it('todas as chaves, com e sem aspas', () => {
    for (const chave of ['destinatario', 'destinatário', 'Destinatário', 'recipientName', 'recipient_name', 'recipient name', 'nomeDestinatario', 'nome_destinatario', 'nome do destinatário', 'cliente', 'receiver', 'buyer', 'comprador', 'customer_name', 'recebedor']) {
      deveBloquear(`{"${chave}": "${nome}"}`, 'nome-destinatario', 'a.json')
      deveBloquear(`${chave}: ${nome}`, 'nome-destinatario', 'a.md')
    }
  })
  it('valor sem aspas com contexto explícito (markdown, YAML, maiúsculas da SPX)', () => {
    deveBloquear(j('**Destinatário:** Joao ', 'Pedro Lima'), 'nome-destinatario', 'a.md')
    deveBloquear(j('destinatario = JOAO ', 'PEDRO DA SILVA'), 'nome-destinatario', 'a.ini')
    deveBloquear(j("recipientName: '", "Ana'"), 'nome-destinatario', 'a.ts')
  })
  it('fictícios, rótulos, tipos e código passam', () => {
    for (const c of [
      "destinatario: 'Cliente Fictício Ana'",
      "destinatario: 'Cliente 3'",
      "destinatario: 'Maria Teste'",
      "recipientName: 'Nome Exemplo'",
      'recipientName: string',
      'recipientName?: string | null',
      "destinatario: ['destinatario', 'nome', 'cliente']",
      "{ id: 'destinatario', label: 'Destinatário (nome)', hint: 'temporário' }",
      'destinatario: row[col]',
      'Destinatário: temporário, apagado ao finalizar a rota',
      'cliente: Mais tarde',
      "destinatario: 'destinatario'",
      'recipientName: s.recipientName ?? null',
    ])
      devePassar(c, 'a.ts')
  })
})

// ------------------------------------------------------------------ saída e exceções
describe('saída nunca expõe o dado', () => {
  it('o achado não tem nenhum campo com o valor (só arquivo, linha, regra, quantidade)', () => {
    const [a] = verificarArquivo('a.ts', j('x (62) 9', '8123-4567'))
    assert.deepEqual(Object.keys(a).sort(), ['arquivo', 'linha', 'quantidade', 'regra'])
    assert.deepEqual(a, { arquivo: 'a.ts', linha: 1, regra: 'telefone', quantidade: 1 })
  })
  it('"privacidade:permitir" libera a linha e é contado', () => {
    const r = verificarArquivoDetalhado('a.ts', j('x = "(62) 9', '8123-4567" // privacidade:permitir'))
    assert.deepEqual(r, { achados: [], liberadas: 1 })
  })
  it('CLI: sai com 1 e não imprime nenhum pedaço de telefone, CPF, e-mail, nome ou credencial', () => {
    const dir = mkdtempSync(join(tmpdir(), 'priv-'))
    const segredos = {
      tel: j('(62) 9', '8123-4567'),
      cpf: gerarCpf('529982247').fmt,
      email: j('maria.souza', '@', 'gmail.com'),
      nome: j('Joao Pe', 'dro Lima'),
      cred: j('Xq3vT9', 'pLm2Za7Rk'),
    }
    try {
      const f = join(dir, 'nota.txt')
      writeFileSync(f, [`ligar ${segredos.tel}`, `CPF ${segredos.cpf}`, segredos.email, `destinatario: ${segredos.nome}`, `API_KEY=${segredos.cred}`].join('\n'))
      let saida = ''
      let codigo = 0
      try {
        execFileSync(process.execPath, [SCRIPT, f], { encoding: 'utf8', stdio: 'pipe' })
      } catch (e) {
        codigo = e.status
        saida = String(e.stdout) + String(e.stderr)
      }
      assert.equal(codigo, 1)
      for (const r of ['telefone', 'cpf', 'email', 'nome-destinatario', 'credencial']) assert.ok(saida.includes(`[${r}]`), r)
      const semCaminho = saida.split(dir).join('').split(dir.replace(/\\/g, '/')).join('')
      for (const [tipo, v] of Object.entries(segredos)) {
        // nenhuma sequência de 3+ caracteres alfanuméricos do valor (ignorando palavras do próprio relatório)
        for (const pedaco of v.match(/[A-Za-z0-9]{3,}/g) ?? []) {
          for (let i = 0; i + 3 <= pedaco.length; i++) {
            const s = pedaco.slice(i, i + 3)
            if (/^(com|gma|ail)$/i.test(s)) continue // aparecem em "ocorrência", "arquivo"… não identificam a pessoa
            assert.ok(!semCaminho.includes(s) || /^[a-z]+$/.test(s), `${tipo}: trecho exposto`)
          }
        }
        assert.ok(!semCaminho.includes(v), `${tipo}: valor exposto`)
      }
      assert.ok(!/\d{3}/.test(semCaminho.replace(/×\d+/g, '').replace(/nota\.txt:\d+/g, '').replace('SHA-256', '')), 'nenhuma sequência de dígitos do dado')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ------------------------------------------------------------------ codificações e binários
describe('codificações e binários', () => {
  const tel = j('(62) 9', '8123-4567')
  it('UTF-16 LE/BE, com e sem BOM, e UTF-8 com BOM são lidos como texto', () => {
    const le = Buffer.from(`ligar ${tel}`, 'utf16le')
    const be = Buffer.from(le).swap16()
    deveBloquear(Buffer.concat([Buffer.from([0xff, 0xfe]), le]), 'telefone')
    deveBloquear(Buffer.concat([Buffer.from([0xfe, 0xff]), be]), 'telefone')
    deveBloquear(le, 'telefone')
    deveBloquear(be, 'telefone')
    deveBloquear(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`ligar ${tel}`)]), 'telefone')
    assert.equal(decodificar(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('olá', 'utf16le')])), 'olá')
  })
  it('Latin-1 (Windows-1252) continua detectando os dígitos', () => deveBloquear(Buffer.from(`Destino: São Paulo ${tel}`, 'latin1'), 'telefone'))
  it('binário desconhecido NÃO é considerado seguro', () => {
    assert.deepEqual(regras('dados.bin', Buffer.from([0x13, 0x37, 0, 0, 0xde, 0xad, 0xbe, 0xef, 0, 1, 2, 3, 0])), ['binario-nao-reconhecido'])
    assert.deepEqual(regras('relatorio.pdf', Buffer.from('%PDF-1.7\n...')), ['binario-nao-verificavel'])
  })
  it('exceção só com caminho + SHA-256 exatos', () => {
    const bin = Buffer.from([0x13, 0x37, 0, 0, 0xde, 0xad, 0xbe, 0xef, 0])
    const sha256 = createHash('sha256').update(bin).digest('hex')
    assert.deepEqual(regras('dados.bin', bin, { excecoes: [{ caminho: 'dados.bin', sha256 }] }), [])
    assert.deepEqual(regras('outro.bin', bin, { excecoes: [{ caminho: 'dados.bin', sha256 }] }), ['binario-nao-reconhecido'])
    const alterado = Buffer.concat([bin, Buffer.from([1])])
    assert.deepEqual(regras('dados.bin', alterado, { excecoes: [{ caminho: 'dados.bin', sha256 }] }), ['binario-nao-reconhecido'])
  })
  it('imagens pela assinatura: PNG passa; foto com EXIF (pode ter GPS) bloqueia', () => {
    const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR')])
    assert.deepEqual(regras('docs/tela.png', png), [])
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 16]), Buffer.from('Exif\x00\x00', 'latin1'), Buffer.alloc(8)])
    assert.deepEqual(regras('foto.jpg', jpeg), ['imagem-com-exif'])
    assert.deepEqual(regras('foto.png', Buffer.concat([png, Buffer.from('eXIf')])), ['imagem-com-exif'])
  })
  it('extensão não engana: "imagem" .png sem assinatura de PNG é analisada pelo conteúdo', () => {
    assert.deepEqual(regras('falsa.png', Buffer.from(`ligar ${tel}`)), ['telefone'])
  })
  it('ZIP/XLSX: abre e varre o XML (armazenado ou comprimido), inclusive texto quebrado em trechos', () => {
    const xml = `<sst><si><r><t>(62) 9</t></r><r><t>${j('8123-', '4567')}</t></r></si></sst>`
    const zip = montarZip([{ nome: 'xl/sharedStrings.xml', dados: xml, deflate: true }])
    assert.deepEqual(verificarArquivo('test-fixtures/planilhas/x.xlsx', zip), [
      { arquivo: 'test-fixtures/planilhas/x.xlsx!xl/sharedStrings.xml', linha: 0, regra: 'telefone', quantidade: 1 },
    ])
    const ficticio = montarZip([{ nome: 'xl/sharedStrings.xml', dados: '<sst><si><t>(62) 90000-0001</t></si><si><t>Cliente Fictício 1</t></si></sst>' }])
    assert.deepEqual(regras('test-fixtures/planilhas/y.xlsx', ficticio), [])
  })
  it('ZIP: planilha dentro do zip, criptografado, acima do limite ou corrompido → bloqueia', () => {
    assert.deepEqual(regras('pacote.zip', montarZip([{ nome: 'rota.csv', dados: 'a;b' }])), ['planilha'])
    assert.deepEqual(regras('pacote.zip', montarZip([{ nome: 'a.txt', dados: 'x', flags: 1 }])), ['compactado-nao-verificavel'])
    assert.deepEqual(regras('pacote.zip', montarZip([{ nome: 'a.txt', dados: 'x', tamU: 30 * 1024 * 1024 }])), ['compactado-nao-verificavel'])
    assert.deepEqual(regras('pacote.zip', Buffer.from('PK\x03\x04quebrado', 'latin1')), ['compactado-nao-verificavel'])
    assert.deepEqual(regras('pacote.zip', montarZip([{ nome: 'x.bin', dados: Buffer.from([0x13, 0, 0x37, 0, 0, 0xde]) }])), ['binario-nao-reconhecido'])
  })
  it('arquivo acima de 5 MB bloqueia sem ser lido', () => {
    assert.deepEqual(regras('dump.json', Buffer.alloc(5 * 1024 * 1024 + 1, 0x61)), ['arquivo-grande'])
  })
})

// ------------------------------------------------------------------ git: conteúdo preparado
describe('git --staged / --all: usa o conteúdo PREPARADO (índice), não o disco', () => {
  const tel = j('(62) 9', '8123-4567')
  function repo() {
    const dir = mkdtempSync(join(tmpdir(), 'priv-git-'))
    const g = (...a) => execFileSync('git', ['-c', 'core.autocrlf=false', ...a], { cwd: dir, stdio: 'pipe' })
    g('init', '-q')
    g('config', 'user.email', 'teste@example.com')
    g('config', 'user.name', 'teste')
    const roda = (modo = '--staged', cwd = dir) => {
      try {
        const out = execFileSync(process.execPath, [SCRIPT, modo], { cwd, encoding: 'utf8', stdio: 'pipe' })
        return { codigo: 0, saida: out }
      } catch (e) {
        return { codigo: e.status, saida: String(e.stdout) + String(e.stderr) }
      }
    }
    return { dir, g, roda, fim: () => rmSync(dir, { recursive: true, force: true }) }
  }

  it('índice com dado e disco limpo → bloqueia; índice limpo e disco com dado → passa', () => {
    const r = repo()
    try {
      const f = join(r.dir, 'a.txt')
      writeFileSync(f, `ligar ${tel}\n`)
      r.g('add', 'a.txt')
      writeFileSync(f, 'ok\n')
      assert.equal(r.roda().codigo, 1, 'primeiro commit (sem HEAD), índice com dado')
      r.g('add', 'a.txt')
      writeFileSync(f, `ligar ${tel}\n`)
      assert.equal(r.roda().codigo, 0, 'índice limpo, disco com dado não preparado')
    } finally {
      r.fim()
    }
  })
  it('arquivo não rastreado é ignorado; renomeado é verificado pelo novo nome', () => {
    const r = repo()
    try {
      writeFileSync(join(r.dir, 'a.txt'), 'ok\n')
      r.g('add', 'a.txt')
      r.g('commit', '-qm', 'x')
      writeFileSync(join(r.dir, 'solto.txt'), `ligar ${tel}\n`)
      assert.equal(r.roda().codigo, 0)
      r.g('mv', 'a.txt', 'b.txt')
      writeFileSync(join(r.dir, 'b.txt'), `ligar ${tel}\n`)
      r.g('add', 'b.txt')
      const res = r.roda()
      assert.equal(res.codigo, 1)
      assert.ok(res.saida.includes('b.txt:1  [telefone]'))
    } finally {
      r.fim()
    }
  })
  it('nomes acentuados e com espaço; execução de uma subpasta', () => {
    const r = repo()
    try {
      mkdirSync(join(r.dir, 'Anotações'))
      writeFileSync(join(r.dir, 'Anotações', 'entrega ção.txt'), `ligar ${tel}\n`)
      r.g('add', '.')
      const res = r.roda('--staged', join(r.dir, 'Anotações'))
      assert.equal(res.codigo, 1)
      assert.ok(res.saida.includes('Anotações/entrega ção.txt:1  [telefone]'), 'caminho acentuado legível')
    } finally {
      r.fim()
    }
  })
  it('binário desconhecido preparado bloqueia; exceção vale só se estiver PREPARADA no índice', () => {
    const r = repo()
    try {
      const bin = Buffer.from([0x13, 0x37, 0, 0, 0xde, 0xad, 0xbe, 0xef, 0])
      writeFileSync(join(r.dir, 'dados.bin'), bin)
      r.g('add', 'dados.bin')
      assert.equal(r.roda().codigo, 1)
      const sha256 = createHash('sha256').update(bin).digest('hex')
      mkdirSync(join(r.dir, 'scripts', 'privacidade'), { recursive: true })
      writeFileSync(join(r.dir, 'scripts/privacidade/excecoes.json'), JSON.stringify({ binarios: [{ caminho: 'dados.bin', sha256, motivo: 'teste' }] }))
      assert.equal(r.roda().codigo, 1, 'exceção só no disco não vale')
      r.g('add', 'scripts/privacidade/excecoes.json')
      assert.equal(r.roda().codigo, 0, 'exceção preparada vale')
    } finally {
      r.fim()
    }
  })
  it('--all lê o índice: arquivo versionado alterado só no disco não muda o resultado', () => {
    const r = repo()
    try {
      writeFileSync(join(r.dir, 'a.txt'), 'ok\n')
      r.g('add', 'a.txt')
      r.g('commit', '-qm', 'x')
      writeFileSync(join(r.dir, 'a.txt'), `ligar ${tel}\n`)
      assert.equal(r.roda('--all').codigo, 0)
    } finally {
      r.fim()
    }
  })
})
