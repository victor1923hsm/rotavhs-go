// Transporte HTTP do modo experimental. No APK: CapacitorHttp (pilha de rede nativa do Android, sem depender do CORS
// da WebView; a configuração de rede do APK continua valendo: só HTTPS no APK entregue). No navegador: fetch.
// Nada é registrado em log (a ponte do Capacitor está com loggingBehavior 'none').
type Resposta = { status: number; headers: { get(n: string): string | null }; text(): Promise<string> }
type Init = { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
}

export async function transporte(): Promise<(url: string, init: Init) => Promise<Resposta>> {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
  if (!cap?.isNativePlatform?.()) return (u, i) => fetch(u, { ...i, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
  const { CapacitorHttp } = await import('@capacitor/core')
  return (url, init) =>
    new Promise<Resposta>((ok, falha) => {
      if (init.signal.aborted) return falha(new DOMException('cancelado', 'AbortError'))
      const aoCancelar = () => falha(new DOMException('cancelado', 'AbortError'))
      init.signal.addEventListener('abort', aoCancelar, { once: true })
      CapacitorHttp.request({
        url,
        method: init.method,
        headers: init.headers,
        data: JSON.parse(init.body),
        responseType: 'text',
        connectTimeout: 15_000,
        readTimeout: 30_000,
      })
        .then((r) => {
          init.signal.removeEventListener('abort', aoCancelar)
          const h = Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]))
          const corpo = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
          ok({ status: r.status, headers: { get: (n) => h[n.toLowerCase()] ?? null }, text: async () => corpo })
        })
        .catch(() => {
          init.signal.removeEventListener('abort', aoCancelar)
          falha(new TypeError('falha de rede'))
        })
    })
}
