import { Check } from 'lucide-react'
import { corDaParada, parada, useEstado } from '@/app/estado'
import { rotuloStop } from '@/core/parada'

/** Número da parada (Stop original da etiqueta) com a cor fixa dela. Estado = cor + ícone + texto. */
export function ChipParada({ id }: { id: string }) {
  const st = useEstado((e) => e.status[id])
  const p = parada(id)
  const classe = st === 'entregue' ? 'entregue' : st === 'falha' ? 'falha' : ''
  return (
    <span className={`chip-stop cor-${corDaParada(id)} ${classe}`} aria-label={`Parada ${rotuloStop(p)}${st === 'entregue' ? ', entregue' : st === 'falha' ? ', sem sucesso' : ''}`}>
      {st === 'entregue' ? <Check size={18} strokeWidth={3} /> : rotuloStop(p)}
    </span>
  )
}
