# RotaVHS-Go — APK Android de testes (Capacitor)

Autorizado pelo usuário em 2026-11-25. **Experimental**, instalação manual no Galaxy S23 FE. **Não vai para a Play Store.**

## Um sistema só
- O APK é o **mesmo app** do PWA, sem um segundo sistema.
- Compartilhados entre as plataformas: `src/` (regras em `core/`, telas, componentes, armazenamento Dexie/IndexedDB, otimização) e o mesmo `dist/`.
- O Capacitor só empacota o app num WebView Android (`android/`).
- O que muda entre PWA e Android fica nos adaptadores de `platform/`. Exemplos: o GPS do navegador hoje e o GPS nativo quando existir (G1/N1, F3).

## Teste no Android antes de cada APK
- `teste-android.yml` sobe um emulador Android 14 com WebView real e instala o APK.
- Roda `e2e/importacao.mjs android`: importa planilhas SPX sintéticas e toca "Confirmar importação" com toque nativo (adb), na posição real da WebView. Confere se a tela Rotas abre com as paradas certas.
- O `android.yml` (manual: `gh workflow run android.yml --ref v2-dev`) só gera e entrega o APK se esse teste passar.

## Como é gerado
1. Envio para a branch `v2-dev`.
2. O workflow `.github/workflows/android.yml` (GitHub Actions) roda:
   - `npm ci`
   - `npm test`
   - `npm run build:nativo` (= `vite build --mode nativo`: sem service worker, planilha fictícia junto)
   - `npx cap sync android`
   - `gradle assembleDebug` (Gradle 8.14.3, JDK 21)
3. O APK sai assinado com a **chave de testes persistente**. O workflow confere a impressão digital antes de entregar.
4. O APK fica em:
   - um **pré-lançamento** do GitHub (link para baixar no celular);
   - um artefato do Actions (30 dias);
   - `builds/android/` no PC, com versão e data no nome.
- O `main` e o GitHub Pages não são tocados: o workflow de Pages só roda no `main`.

## Assinatura persistente (sem perder os dados ao atualizar)
- A chave (`credenciais-android/` no PC) **não vai para o Git** (`.gitignore`).
- No GitHub, ela fica só nos segredos `ANDROID_KEYSTORE_BASE64` e `ANDROID_KEYSTORE_SENHA`, que o usuário cadastra.
- Impressão digital SHA-256: `1E:70:01:4E:E3:FA:ED:8B:47:00:16:F6:9F:C2:FB:82:66:19:9D:5B:E4:6F:80:C7:09:17:DF:01:2F:CF:F8:C5`.
- Sem os segredos, o workflow **para**. Ele não gera APK com outra chave, porque isso obrigaria a desinstalar e apagaria a rota guardada.
- Mesmo `applicationId` (`io.github.victor1923hsm.rotavhsgo`) + mesma chave = o APK novo instala por cima e mantém o IndexedDB.

## Identidade
| Item | Valor |
|---|---|
| Nome | **RotaVHS-Go** |
| Ícone | glifo de rota do PWA, menta sobre o preto do Figma (adaptativo, redondo e legado) |
| Abertura | fundo `#171B19` com o ícone (API de splash do Android 12+) |

## Permissões (`AndroidManifest.xml`)
| Permissão | Para quê | Situação |
|---|---|---|
| `INTERNET` | mapa (tiles do OpenFreeMap) e abrir Google Maps/Waze | — |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | GPS **com o app aberto**: Minha localização, ponto de partida, alertas | o Android pergunta na primeira vez |
| Câmera | scanner | **ainda não pedida**: entra quando o scanner existir (F4) |
| Notificações | — | **ainda não pedida**: entra quando houver notificação (F3/F4) |
| Localização em segundo plano | — | **não pedida.** Esta versão **não** funciona com a tela bloqueada |

**Backup desligado** (`allowBackup=false` e `sem_backup.xml`): a rota (endereços, códigos SPX, coordenadas) não vai para o backup do Google nem para outro aparelho.

## Telas e áreas seguras
- No APK, a página ocupa a tela toda.
- O Capacitor (`SystemBars.insetsHandling = 'css'`) informa as margens do sistema em `--safe-area-inset-*`.
- O CSS usa essas margens quando `html[data-nativo]`, marcado no `index.html` só dentro do APK.

## Limitações conhecidas desta versão de testes
- **Sem service worker no APK.** Os arquivos do app já estão no APK e abrem offline. Porém o cache de mapas ("Limpar mapas guardados") ainda não funciona no APK: sem conexão, a rota continua pela lista.
- **GPS do navegador (WebView), só com o app aberto.** O GPS nativo com segundo plano é a fase F3, com adaptador separado.
- **Botão voltar do Android:** volta pelo histórico do WebView. Comportamento fino (fechar folhas abertas) ainda não tratado.
- **Otimização:** continua a **DEMONSTRAÇÃO** em linha reta. O motor próprio pela malha viária é a F2.
- **Financeiro:**
  - real: custo **estimado** de combustível e entregas;
  - em desenvolvimento: receitas, abastecimentos e despesas (F4).
