// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\core\\import\\fields.ts (versão de 2026-11-19).
/**
 * Campos que o importador reconhece e os sinônimos de cabeçalho (pt/en, sem acento, minúsculas).
 * Calibrar com a planilha real (P5) antes da validação final.
 */
import { basic } from '../address/normalize'

export type FieldId =
  | 'parada'
  | 'sequencia'
  | 'pacote'
  | 'endereco'
  | 'rua'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'cep'
  | 'quadra'
  | 'lote'
  | 'lat'
  | 'lng'
  | 'quantidade'
  | 'observacao'
  | 'destinatario'

/** Ordem de exibição e rótulos na tela de mapeamento. */
export const FIELDS: readonly { id: FieldId; label: string; hint?: string }[] = [
  { id: 'parada', label: 'Número da parada', hint: 'o número da etiqueta (ex.: Stop na SPX); nunca é reescrito' },
  { id: 'sequencia', label: 'Sequência do pacote', hint: 'só preservada por pacote; não muda o número nem a ordem' },
  { id: 'pacote', label: 'Código do pacote' },
  { id: 'endereco', label: 'Endereço completo', hint: 'ou use Rua + Número' },
  { id: 'rua', label: 'Rua / logradouro' },
  { id: 'numero', label: 'Número' },
  { id: 'complemento', label: 'Complemento' },
  { id: 'bairro', label: 'Bairro' },
  { id: 'cidade', label: 'Cidade' },
  { id: 'uf', label: 'UF' },
  { id: 'cep', label: 'CEP' },
  { id: 'quadra', label: 'Quadra' },
  { id: 'lote', label: 'Lote' },
  { id: 'lat', label: 'Latitude' },
  { id: 'lng', label: 'Longitude' },
  { id: 'quantidade', label: 'Quantidade de volumes' },
  { id: 'observacao', label: 'Observação', hint: 'só para achar quadra/lote; o texto não é guardado' },
  { id: 'destinatario', label: 'Destinatário (nome)', hint: 'temporário: apagado ao finalizar a rota' },
]

export const SYNONYMS: Readonly<Record<FieldId, readonly string[]>> = {
  parada: ['parada', 'n parada', 'numero da parada', 'num parada', 'stop', 'stop number', 'stop no', 'ordem', 'posicao', 'parada n'],
  /** D1: sequência individual do pacote. Sem coluna de parada, ela assume o papel de parada (ver suggestMapping). */
  sequencia: ['sequencia', 'seq', 'sequence', 'sequencia de entrega', 'sequence no'],
  pacote: ['codigo', 'codigo do pacote', 'cod pacote', 'pacote', 'tracking', 'tracking number', 'tracking no', 'rastreio', 'codigo de rastreio', 'awb', 'spx tn', 'tn', 'pedido', 'order id', 'id do pacote', 'shipment id'],
  endereco: ['endereco', 'endereco completo', 'endereco de entrega', 'address', 'full address', 'delivery address', 'destination address', 'endereco de destino', 'destino'],
  rua: ['rua', 'logradouro', 'street', 'avenida rua', 'endereco rua'],
  numero: ['numero', 'n', 'no', 'nro', 'number', 'house number', 'num'],
  complemento: ['complemento', 'compl', 'complement', 'address line 2', 'apto', 'referencia'],
  bairro: ['bairro', 'district', 'neighborhood', 'neighbourhood', 'setor'],
  cidade: ['cidade', 'municipio', 'city'],
  uf: ['uf', 'estado', 'state'],
  cep: ['cep', 'zip', 'zipcode', 'zip code', 'postal code', 'zipcode postal code', 'codigo postal'],
  quadra: ['quadra', 'qd', 'qda', 'block'],
  lote: ['lote', 'lt', 'lot'],
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'lng', 'lon', 'long'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'volumes', 'qtd volumes', 'quantity', 'qty', 'pacotes'],
  observacao: ['observacao', 'observacoes', 'obs', 'instrucao', 'instrucoes', 'notes', 'note', 'remark'],
  destinatario: ['destinatario', 'nome', 'nome do destinatario', 'cliente', 'recipient', 'recipient name', 'receiver', 'buyer', 'comprador'],
}

/**
 * Cabeçalhos de TELEFONE: reconhecidos só para serem DESCARTADOS (decisão E1 = B).
 * Não existe campo de destino para eles.
 */
export const PHONE_SYNONYMS: readonly string[] = ['telefone', 'tel', 'fone', 'celular', 'cel', 'contato', 'phone', 'phone number', 'mobile', 'whatsapp', 'telefone do destinatario', 'recipient phone']

export const normHeader = (s: unknown): string => basic(String(s ?? ''))

export function isPhoneHeader(h: unknown): boolean {
  const n = normHeader(h)
  return n !== '' && PHONE_SYNONYMS.some((p) => n === p || n.startsWith(`${p} `) || n.endsWith(` ${p}`))
}
