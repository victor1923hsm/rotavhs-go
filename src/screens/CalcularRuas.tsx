// Central de otimização (RB-1): modo de otimização, disponibilidade do provedor e a chave da API no cofre seguro.
// O cálculo pelas ruas AINDA NÃO funciona (RB-2/RB-3): a tela diz isso claramente e não mostra resultado simulado.
// A chave nunca aparece na tela depois de guardada; o campo é de senha e é limpo ao guardar ou cancelar.
import { useEffect, useState } from 'react'
import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { LinkFluido } from '@/app/navegacao'
import { useEstado } from '@/app/estado'
import { disponibilidade, PROVEDOR_PREVISTO, useRuas } from '@/app/ruas'
import { validarChave } from '@/platform/cofre'
import { SeletorModo } from '@/components/domain/ModoOtimizacao'

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => {
      removeEventListener('online', on)
      removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function CalcularRuas() {
  const r = useRuas()
  const avisar = useEstado((e) => e.avisar)
  const online = useOnline()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarApagar, setConfirmarApagar] = useState(false)
  useEffect(() => {
    void r.verificarCofre()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const d = disponibilidade(r.cofre, online)
  const temChave = r.cofre === 'cadastrada'
  const podeCadastrar = r.cofre !== 'pwa' && r.cofre !== 'verificando'
  const cancelarEdicao = () => {
    setTexto('')
    setMostrar(false)
    setErro(null)
    setEditando(false)
  }
  const guardar = async () => {
    const v = validarChave(texto)
    if (!v) return setErro('A chave parece incompleta: cole o texto inteiro, sem espaços (de 16 a 4096 caracteres).')
    setErro(null)
    const falha = await r.guardarChave(v)
    setTexto('')
    setMostrar(false)
    if (falha) return setErro(falha)
    setEditando(false)
    avisar(temChave ? 'Chave substituída no cofre seguro' : 'Chave guardada no cofre seguro')
  }
  const apagar = async () => {
    const falha = await r.apagarChave()
    setConfirmarApagar(false)
    if (falha) return setErro(falha)
    avisar('Chave excluída do aparelho')
  }

  return (
    <div className="rolagem">
      <div className="linha">
        <LinkFluido to="/estatisticas/preferencias" className="icone-botao" aria-label="Voltar"><ArrowLeft size={22} /></LinkFluido>
        <h1 className="titulo cresce">Calcular pelas ruas</h1>
        <span className="selo-estado aviso">EM DESENVOLVIMENTO</span>
      </div>

      <div className="cartao ruas-aviso" role="note">
        <strong>Integração pelas ruas em desenvolvimento</strong>
        <p className="rotulo" style={{ margin: '4px 0 0', color: 'inherit' }}>
          Nesta versão nenhuma rota pelas ruas é calculada e <b>nenhuma coordenada é enviada</b>. A otimização que funciona é a <b>rápida</b> (distâncias aproximadas, sem ruas).
        </p>
      </div>

      <div className="secao">
        <div className="t">Modo de otimização</div>
        <SeletorModo />
      </div>

      <div className="secao">
        <div className="t">Provedor de rotas</div>
        <div className={`cartao ruas-estado ${d.tom}`} role="status" aria-live="polite">
          <div className="linha" style={{ gap: 8 }}>
            {r.cofre === 'verificando' && <Loader2 size={18} className="girando" aria-hidden="true" />}
            <strong>{d.titulo}</strong>
          </div>
          <p className="rotulo" style={{ margin: '4px 0 0', color: 'inherit' }}>{d.detalhe}</p>
          <p className="rotulo" style={{ margin: '6px 0 0', color: 'inherit' }}>
            Previsto: {PROVEDOR_PREVISTO.nome} ({PROVEDOR_PREVISTO.uso}) · {PROVEDOR_PREVISTO.consulta}. O app não depende dele: um servidor próprio (Valhalla ou OSRM) poderá substituí-lo.
            {!online && ' · Sem conexão agora.'}
          </p>
        </div>
      </div>

      <div className="secao">
        <div className="t">Chave da API</div>
        {r.cofre === 'pwa' ? (
          <p className="rotulo">No navegador não há cofre seguro: a chave não é pedida nem guardada aqui. Use o app Android para cadastrar.</p>
        ) : (
          <div className="cartao">
            <div className="linha" style={{ gap: 8 }}>
              {temChave ? <ShieldCheck size={20} aria-hidden="true" /> : <KeyRound size={20} aria-hidden="true" />}
              <strong className="cresce">{temChave ? 'Chave cadastrada' : r.cofre === 'verificando' ? 'Verificando…' : 'Nenhuma chave cadastrada'}</strong>
            </div>
            <p className="rotulo" style={{ margin: '4px 0 0', color: 'inherit' }}>
              Guardada cifrada no cofre do Android (Keystore, AES-256-GCM). Não aparece na tela, não vai para backups nem para relatórios. Reinstalar o app apaga a chave.
            </p>

            {editando ? (
              <div style={{ marginTop: 10 }}>
                <label className="rotulo" htmlFor="chave-api" style={{ color: 'inherit' }}>{temChave ? 'Nova chave (substitui a atual)' : 'Cole a chave da API'}</label>
                <div className="entrada">
                  <input
                    id="chave-api"
                    type={mostrar ? 'text' : 'password'}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    inputMode="text"
                    value={texto}
                    onChange={(ev) => setTexto(ev.target.value)}
                    disabled={!!r.ocupado}
                  />
                  <button className="gps-acao" type="button" onClick={() => setMostrar((m) => !m)} aria-pressed={mostrar}>{mostrar ? 'Ocultar' : 'Mostrar'}</button>
                </div>
                <div className="linha" style={{ marginTop: 10, gap: 8 }}>
                  <button className="botao" onClick={() => void guardar()} disabled={!!r.ocupado || !texto.trim()}>
                    {r.ocupado === 'guardar' ? <><Loader2 size={18} className="girando" aria-hidden="true" /> Guardando…</> : temChave ? 'Substituir chave' : 'Guardar chave'}
                  </button>
                  <button className="botao contorno" onClick={cancelarEdicao} disabled={!!r.ocupado}>Cancelar</button>
                </div>
              </div>
            ) : confirmarApagar ? (
              <div className="confirmar" role="alertdialog" aria-label="Excluir a chave" style={{ marginTop: 10 }}>
                <p style={{ margin: '0 0 8px' }}>A chave será <b>apagada do aparelho</b>. Para usar o cálculo pelas ruas depois, será preciso cadastrar de novo.</p>
                <div className="linha">
                  <button className="botao" onClick={() => void apagar()} disabled={!!r.ocupado}>{r.ocupado === 'apagar' ? 'Excluindo…' : 'Excluir chave'}</button>
                  <button className="botao contorno" onClick={() => setConfirmarApagar(false)} disabled={!!r.ocupado}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="linha" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <button className="botao" onClick={() => { setErro(null); setEditando(true) }} disabled={!podeCadastrar}>{temChave ? 'Substituir chave…' : 'Cadastrar chave…'}</button>
                {temChave && <button className="botao contorno" onClick={() => setConfirmarApagar(true)}>Excluir chave…</button>}
                {r.cofre === 'erro' && <button className="botao contorno" onClick={() => void r.verificarCofre()}>Tentar de novo</button>}
              </div>
            )}
            {erro && <p className="ruas-erro" role="alert">{erro}</p>}
          </div>
        )}
      </div>

      <div className="secao">
        <div className="t">Privacidade</div>
        <p className="rotulo">
          Quando a integração existir, só sairão do aparelho <b>coordenadas</b> (a sua posição e as das paradas) e parâmetros técnicos: nunca nomes, telefones, endereços em texto, códigos SPX ou números de etiqueta.
          Coordenadas de entrega também podem ser <b>dados pessoais</b>: o envio vai depender da sua autorização, e a política de retenção será confirmada com você antes da integração real. Ao finalizar a rota, a matriz e o traçado guardados são apagados junto com a rota.
        </p>
      </div>
    </div>
  )
}
