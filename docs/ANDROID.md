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

## Cofre da chave da API (RB-1, 2026-11-26)
- Plugin nativo próprio `CofreChave` (`android/app/src/main/java/.../cofre/CofreChavePlugin.java`), registrado em `MainActivity`: Android Keystore + AES-256-GCM; só guardar, ler, existe e apagar; sem logs. Detalhes em ARQUITETURA §18.
- `capacitor.config.ts`: `loggingBehavior: 'none'` — a ponte do Capacitor não grava parâmetros nem resultados de plugins no logcat (senão a chave apareceria).
- `MainActivity`: preenchimento automático do Android desligado na WebView (nenhum gerenciador de senhas oferece guardar a chave).
- Backup continua desligado (`allowBackup=false` + `sem_backup.xml`).
- Teste no emulador: `e2e/ruas.mjs android` (no workflow `teste-android.yml`, com reinstalação do APK e capturas no artefato `telas-rb1` e no log).
- **Emulador do teste sem Google Play Services (2026-11-26):** com a imagem Google APIs, o GMS morria e o Android encerrava o app junto (dependência do provedor de fontes do GMS na WebView) — era a causa do "page closed" intermitente. A imagem `default` não tem o GMS; o app não depende dele.

## Rede (RB-2, 2026-11-26)
- `res/xml/rede.xml`: só HTTPS. O teste automático compila com `-PrvTesteLocal`, que troca esse arquivo por um que aceita HTTP **só para 127.0.0.1** (servidor de respostas controladas via `adb reverse`). O APK entregue não usa essa troca.
- Envio ao provedor de rotas real **bloqueado** no código (`ENVIO_REAL_LIBERADO = false`).
- **Isolamento de rede (RB-3):** o workflow do APK confere no APK ENTREGUE (aapt2) que `rede.xml` só permite HTTPS (sem `domain-config`, sem `127.0.0.1`); senão, não há APK. O HTTP para 127.0.0.1 existe só no APK do teste automático (`-PrvTesteLocal`), que não é entregue.
- **Notas do release:** o workflow anexa `docs/notas-apk/teste-N.md` (o que funciona, o que é simulado, o que não foi validado).

## Limitações conhecidas desta versão de testes
- **Sem service worker no APK.** Os arquivos do app já estão no APK e abrem offline. Porém o cache de mapas ("Limpar mapas guardados") ainda não funciona no APK: sem conexão, a rota continua pela lista.
- **GPS do navegador (WebView), só com o app aberto.** O GPS nativo com segundo plano é a fase F3, com adaptador separado.
- **Botão voltar do Android:** volta pelo histórico do WebView. Comportamento fino (fechar folhas abertas) ainda não tratado.
- **Otimização:** continua a **DEMONSTRAÇÃO** em linha reta. O motor próprio pela malha viária é a F2.
- **Financeiro:**
  - real: custo **estimado** de combustível e entregas;
  - em desenvolvimento: receitas, abastecimentos e despesas (F4).


## Teste de otimização no emulador (R-A, 2026-11-25)
**O que faz:** `teste-android.yml` roda `e2e/importacao.mjs` e depois `e2e/otimizacao.mjs`, com 50, 100, 250 e 500 paradas, cancelar e reotimizar.

**Posição:**
- vem do GPS do emulador (`adb emu geo fix` a cada 2 s, com a localização ligada por `cmd location set-location-enabled true`);
- os toques são nativos pelo adb;
- sem uiautomator, os toques passam a ser feitos pela entrada de toque da WebView.

**Ajustes do emulador:**
- 4 GB de RAM e heap de 512 MB. Com 2,5 GB, o Android matava os serviços do Google por falta de memória e a página do app fechava.
- O app em si usa ~10 MB de heap JS com 500 paradas (medido no Chrome).

**Entradas:** `filtro` (importação) e `filtro_otimizacao`. Use `filtro=NADA` para rodar só a otimização.

**Limitação conhecida:** a conexão com a página às vezes cai depois de ~9 importações seguidas ("page closed"). A partir disso, os casos seguintes daquela execução falham. Repetir o job.
