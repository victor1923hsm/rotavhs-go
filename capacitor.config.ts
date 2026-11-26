// Capacitor: o MESMO app (src/, dist/) empacotado como APK Android de testes (aprovado em 2026-11-25).
// Não é publicado na Play Store. Nenhuma chave ou credencial fica aqui (a assinatura de testes vem de
// segredos do GitHub Actions; veja docs/ANDROID.md).
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.victor1923hsm.rotavhsgo',
  appName: 'RotaVHS-Go',
  webDir: 'dist',
  // RB-1 (cofre da chave): sem logs da ponte Capacitor, inclusive no APK debug. Com o log ligado, a ponte grava
  // no logcat os parâmetros e os resultados de cada chamada de plugin (a chave da API apareceria ali).
  loggingBehavior: 'none',
  android: {
    // Mantém o conteúdo web local (sem servidor remoto); depuração do WebView só no APK debug.
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // Injeta --safe-area-inset-* no WebView (o CSS usa essas margens no APK).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
