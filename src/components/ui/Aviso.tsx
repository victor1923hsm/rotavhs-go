import { useEffect } from 'react'
import { useEstado } from '@/app/estado'

/** Aviso flutuante. Com "Desfazer", fica 6 s na tela (revisão 9); sem, 2 s. */
export function Aviso() {
  const aviso = useEstado((e) => e.aviso)
  const fechar = useEstado((e) => e.fecharAviso)
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(fechar, aviso.desfazer ? 6000 : 2000)
    return () => clearTimeout(t)
  }, [aviso, fechar])
  return (
    <div className={`aviso-flutuante ${aviso ? 'visivel' : ''}`} role="status" aria-live="polite">
      <span>{aviso?.texto}</span>
      {aviso?.desfazer && (
        <button
          onClick={() => {
            aviso.desfazer?.()
            fechar()
          }}
        >
          Desfazer
        </button>
      )}
    </div>
  )
}
