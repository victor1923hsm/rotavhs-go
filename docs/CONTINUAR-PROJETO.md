# RotaVHS Go — Continuar o projeto

**Índice único de continuidade.** Aponta para as fontes; não as copia.

## 1. Estado atual (2026-11-19, conferido para retomada com contexto limpo)
| Item | Situação |
|---|---|
| Repositório | Git **local** (`main`, sem remoto). G13 aprovada: o 1º commit (planejamento + Etapa 1) pode ser feito |
| Planejamento | ✅ **aprovado** (revisão 7, 2026-11-19): `PLANO-GERAL.md`, `ARQUITETURA.md`, `DECISOES.md` (G1–G15 aprovadas) |
| Evolução v2 | **APROVADA em 2026-11-25 (A1).** Branch `v2-dev`. F0 concluída; F1 (visual: 4 abas e barra do Figma, temas Claro/Alta visibilidade/Escuro, aba Financeiro) implementada; APK Android de testes com Capacitor (`docs/ANDROID.md`). Próximas: F2 motor de roteirização, F3 GPS inteligente, F4 funcionalidades complementares |
| Código | Etapas 1, 2 e 3 (2026-11-19): PWA Vite + React + TS + Tailwind; importação da planilha da SPX no aparelho (Worker), Conferência; **rota guardada no aparelho** (IndexedDB/Dexie, schema v2: situação por pacote, planos, conferência, alertas) e **exclusão verificada dos detalhes ao finalizar**. Dependências da G2 com versões exatas (só as usadas até aqui; + read-excel-file 9.3.14, dexie 4.4.7, fake-indexeddb 6.2.8 só nos testes) |
| Implementação | Etapas 1 e 2 aprovadas (+ revisões 11 e 12). **Etapa 3: tecnicamente aceita para validação** (22:21); **aprovação final depende do teste no Android** (`docs/ROTEIRO-TESTE-ANDROID.md`). Etapas 4–7 **não autorizadas** |
| Git | arquivos **não rastreados** (sem commit, por decisão): `.gitignore`, `.gitattributes`, `CLAUDE.md`, `docs/` (5 arquivos). Nada foi commitado |
| Publicação | **No ar:** https://victor1923hsm.github.io/rotavhs-go/ — commit `33d2322e5c961e01295ac11cd95e9dbead0b9f42` (2026-11-20, importação real I1 + correção de Estatísticas/menu), workflow execução 44712373866 (build ✓, publicar ✓). Os 27 arquivos publicados conferem byte a byte (SHA-256) com o build local do mesmo commit. Anterior: `3cff69a` |
| Próximo passo | (1) cadastrar os segredos da assinatura (credenciais-android/LEIA-ME.txt) e baixar o 1º APK de testes; (2) testar no S23 FE (roteiro em `ROTEIRO-TESTE-ANDROID.md`); (3) no PC, rodar `ferramentas\f0-recuperar-git.ps1` uma vez; (4) F2: motor de otimização próprio (malha viária com OpenRouteService + estimado offline) |
| Figma | página nova **"RotaVHS Go · App"** no arquivo do Figma (as telas originais intocadas): variáveis Sol/Noite, componentes e as telas 01–05 e 07 editáveis. **Faltam** 06 Estatísticas, as versões Noite e o título: o limite de uso do Figma pela integração (assento Collab) foi atingido |

**Projeto de origem:** `D:\Projetos Claude\RotaVHS`, pausado em 2026-11-18. Só leitura a partir daqui. Retomada dele: `D:\Projetos Claude\RotaVHS\docs\PAUSA-E-RETOMADA.md`.

### Decisões (✅ todas aprovadas em 2026-11-19; detalhe em `docs/DECISOES.md`)
| # | Assunto | Proposta em uma linha |
|---|---|---|
| G1 | Plataforma | PWA único agora; GPS por adaptador, com versão nativa futura em segundo plano (N1) |
| G2 | Pilha | as versões já testadas no RotaVHS, fixas (`ARQUITETURA.md` §2) |
| G3 | Reaproveitamento | copiar módulos testados do RotaVHS (só leitura); solver da 5.3 como experimental |
| G4 | Distâncias | local e offline como padrão; pelas ruas só com conexão + autorização + consentimento por rota (N2) |
| G5 | Mapa | pinos pelo Stop + linha **tracejada** "ordem, não é o caminho" enquanto a distância for estimada |
| G6 | Mapa offline | OpenFreeMap; cache de 60 MB **sem garantia** de cobertura; lista como alternativa |
| G7 | GPS | PWA com o app visível, filtros de precisão e de movimento; segundo plano só na N1 |
| G8 | Recalcular | manual a qualquer momento + sugestões automáticas anti-oscilação; **nunca muda em silêncio** |
| G9 | Visual | ✅ **o Figma é a referência** ([arquivo](https://www.figma.com/design/pR1JlzgthpKOSAzGm6f3sZ/Untitled)); o projeto se adapta a ele; Stop em destaque enorme |
| G10 | Teste no celular | Etapa 1 pela rede local (HTTP); HTTPS decidido na Etapa 4 |
| G11 | Dados do modelo | fictícios e realistas (~60 paradas) |
| G12 | Destinatário + financeiro | ✅ sem nome, telefone e observação (a planilha não traz); sem aba Financeiro: o **custo estimado da rota** fica em Estatísticas |
| G13 | Repositório | Git local; 1º commit só após aprovação |
| G14 | Desempenho | JS inicial ≤ 150 KB, mapa só na Rota Ativa, RAM, bateria e dados baixos |
| G15 | Ruas reais (exigência) | arquitetura pronta para mão única, retornos e restrições de circulação (N2) |

## 2. Onde está cada coisa
| Assunto | Fonte |
|---|---|
| Regras do projeto | `CLAUDE.md` |
| Design (fonte oficial: Figma) | `docs/DESIGN.md` |
| Referência visual (Figma) | [arquivo do Figma](https://www.figma.com/design/pR1JlzgthpKOSAzGm6f3sZ/Untitled) (referência principal) · `docs/referencia-visual/` (2 quadros antigos) · [protótipo](https://www.figma.com/proto/pR1JlzgthpKOSAzGm6f3sZ/Untitled?node-id=4-2&page-id=0%3A1) |
| Etapas, critérios, riscos, consumo | `docs/PLANO-GERAL.md` |
| Pilha, camadas, dados, GPS, offline, roteamento, reaproveitamento | `docs/ARQUITETURA.md` |
| Decisões | `docs/DECISOES.md` |

## 3. Histórico
| Data | O quê |
|---|---|
| 2026-11-25 | **APK 2.0.0-teste.7 — "A contagem de pacotes não fecha (118 nas paradas, 115 na planilha)".** Causa: na Conferência, "Juntar as partes de cada parada dividida" + "São o mesmo local" com uma dessas partes criavam dois grupos com uma parte em comum; a parte entrava em duas visitas e seus pacotes contavam duas vezes (no teste.5 passava em silêncio; a conferência do teste.6 barrou). Reproduzido com a planilha real enviada pelo usuário (usada só na sessão, relatório só com contagens, fora do Git: 115 pacotes, 10 paradas divididas, 5 "mesmo local"; antes 118/115, depois 115/115 em 72 visitas) e com planilha sintética. Correção em `src/features/importar/converter.ts` (grupos que se cruzam viram um só; cada parte em uma visita só) + teste unitário + caso de ponta a ponta. Android (emulador) 11/11 duas vezes; navegador 11/11; Vitest 240/240. Certificado de testes conferido |
| 2026-11-26 | **APK 2.0.0-teste.8 — fase R-A (motor v3).** Motor novo em segundo plano (várias soluções + 2-opt/Or-opt/3-opt assimétricos + ILS), origem sempre na posição atual (nunca a 1ª parada da SPX), cancelar sem perder a rota, término livre/voltar/numa parada, só pendentes, nada de linha reta no mapa (só pinos até a R-B). Distâncias ainda **aproximadas, sem ruas**. Defeitos achados no emulador e corrigidos: chip "GPS: Buscando sinal" cobria a tela inteira (pré-existente desde o teste.5); janela "Otimizando" cobria "Permitir localização". Vitest 253/253, scripts 68/68; navegador: importação 11/11, otimização 6/6; Android (emulador, 4 GB): importação 11/11, otimização 6/6 (algoritmo 50 → 1,0 s · 100 → 1,5 s · 250 → 2,5 s · 500 → 3,9 s). Intermitente conhecido: "page closed" após 9 importações seguidas no emulador (2 de 5 execuções). Certificado conferido. Release `apk-teste-8`, SHA-256 a61d776a…71d7. Próximo: validação física no S23 FE; R-B só depois |
| 2026-11-26 | **Validação física PARCIAL do teste.8 (S23 FE, planilha real da SPX), feita pelo usuário.** Aprovados: importação da planilha real · abertura da rota depois da importação · agrupamento automático das encomendas do mesmo endereço · localização atual pelo GPS · otimização de uma rota real · interface responsiva durante a otimização. **Pendentes (não reprovados), registro corrigido em 2026-11-26:** cancelar durante a otimização sem mudar a rota ativa · reotimizar só as pendentes · **fechar e reabrir o app sem perder a rota** · **desempenho com rotas grandes** (mantido). Também na conferência: onde a rota termina. Próximo: concluir a validação; plano técnico da R-B apresentado (ARQUITETURA §16), **sem implementar** até a aprovação |
| 2026-11-26 | **R-B aprovada com alterações (RB1–RB5, 15 requisitos) e RB-0 concluída na v2-dev.** Documentos atualizados (DECISOES, ARQUITETURA §17). Criada a interface `RoutingProvider` e os módulos puros em `src/core/ruas/` (blocos, montagem com "sem percurso" ≠ "não recebido" ≠ "estimado", encaixe progressivo 25/50/100/200 m com confirmação e revisão, guarda de privacidade, limitador, cache, relatório, provedor estimado sem traçado), malha **fictícia** com mão única, conversões proibidas e vias sem acesso, e provedor sintético. **Nada ligado ao app; nenhum pedido a provedor real.** Testes novos 26/26; bancada 50–500 registrada (§17.7). Auditoria do cofre: recomendação opção C (plugin próprio mínimo). Rascunho da consulta à HeiGIT pronto (§17.8). Próximo: sua aprovação da RB-0 e decisão do cofre; RB-1 só com autorização |
| 2026-11-26 | **RB-0 aprovada; RB-1 feita na v2-dev (cofre opção C + central "Calcular pelas ruas").** Plugin nativo próprio `CofreChave` (Android Keystore + AES-256-GCM; guardar, ler, existe, apagar; sem logs; invalidação/adulteração apagam e pedem novo cadastro; backup desligado; reinstalar apaga). **Achado:** a ponte Capacitor gravava parâmetros de plugins no logcat → `loggingBehavior: 'none'`. Autofill desligado na WebView. Central: modo rápido × pelas ruas (em desenvolvimento: abre aviso, nada simulado), provedor, chave em campo protegido com substituir/excluir; PWA sem cofre (modo rápido). Auditoria da RB-0: parada sem saída como última no término livre, nada some, navegar ao acesso (opção futura), validade do cache, coordenadas como dado pessoal (P-COORD, a confirmar). Testes: vitest 294/294; emulador importação 11/11, otimização 7/7 (novo: fechar e reabrir), RB-1 13/13; chave ausente do logcat. Causa do "page closed" achada (GMS do emulador) e teste movido para imagem sem GMS. Consulta à HeiGIT **pendente**. APK **2.0.0-teste.9** gerado depois do teste no emulador (importação 11/11, otimização 7/7, RB-1 13/13), certificado conferido, release `apk-teste-9`, SHA-256 2bbc8c40…7ec7. Próximo: sua validação no S23 FE; RB-2 só com aprovação |
| 2026-11-26 | **RB-1 aprovada tecnicamente (S23 FE pendente); P-COORD aprovada com condições; RB-2 feita na v2-dev.** Cliente ORS pela `RoutingProvider` (snap, matriz em blocos, directions), tempo limite, cancelamento, 429/403/5xx/sem conexão, tentativas limitadas (4), concorrência 2, limite de 36/min; cache da matriz por rota (7 dias, provedor/perfil/versão, apagado com a rota); janela "Calcular pelas ruas" sob demanda (chave → liberação → autorização nomeando o provedor → estimativa de consumo); etapas reais e cancelamento; falha oferece a rápida (nunca troca sozinha); pendentes de revisão mantidas na posição anterior. **Envio ao provedor real bloqueado** (`ENVIO_REAL_LIBERADO = false`): testado só com respostas controladas. Vitest 318/318; emulador importação 11/11, otimização 13/13 (500 paradas pelas ruas 69,8 s, limite/min respeitado; reotimização = 1 pedido), RB-1 13/13; JS inicial 147,9 KB. Rede do APK só HTTPS (HTTP só para 127.0.0.1 no APK do teste automático). APK **2.0.0-teste.10** gerado depois do emulador (importação 11/11, otimização 13/13, RB-1 13/13), certificado conferido, release `apk-teste-10` (notas dizem o que não foi validado com o provedor real), SHA-256 352d891a…28a9. Pendências: validação física do teste.9/teste.10; HeiGIT, LGPD/termos e autorização para envio real; tela de posicionamento manual; traçado (RB-4); RB-3 só com aprovação |
| 2026-11-25 | **Correção do APK 2.0.0-teste.6 — "Confirmar importação" sem resposta.** Causa (reproduzida no emulador Android 14, WebView 113, toque nativo pelo adb, e no navegador): com uma rota já em uso, o toque abria a pergunta "Existe uma rota em uso" no topo da página, **fora da tela** (o botão fica no fim da prévia); com pacote repetido pendente, o botão ficava desabilitado e mudo. Correção (`src/screens/Importar.tsx`, `src/features/importar/abrir.ts`, `src/styles/app.css`): pergunta e andamento numa janela por cima de tudo; 5 etapas visíveis (Validando dados, Organizando encomendas, Criando paradas, Salvando rota, Abrindo rota); falha diz a etapa e o motivo, sem dados pessoais, com "Tentar de novo"; botão nunca desabilitado. Teste de ponta a ponta `e2e/importacao.mjs` (10/50/100/200 pacotes, endereços repetidos, coordenadas ausentes e inválidas, pacote repetido, 2 XLSX): navegador 10/10; Android com o código do teste.5 9/10 (pergunta fora da tela a partir da 2ª importação; repetido sem resposta), Android com a correção 10/10. `android.yml` agora é manual e só entrega o APK depois do teste no emulador (`teste-android.yml`). APK `2.0.0-teste.6` gerado depois de 10/10 no emulador (certificado de testes conferido, SHA-256 `7a97365e…549d`). **Limitação em observação:** numa execução completa (9 importações seguidas num emulador de 2,5 GB) a página do WebView fechou no caso de 250 paradas; isolado, o mesmo caso passou 4/4 e as outras 3 execuções completas passaram 10/10 — acompanhar memória com rotas grandes no S23 FE |
| 2026-11-25 | **F0 + F1 + Android (v2-dev).** F0: backup verificado da pasta do PC (`backups/RotaVHS-Go-backup-2026-11-25-antes-F0.zip`, 141 arquivos, SHA-256 conferido); pasta do PC igual ao commit `30ee53e` (só fim de linha em 2 CSV); faltavam `.github` e `.npmrc`; a ferramenta remota não pode gravar em `.git`/`.github`/`.npmrc`, então `ferramentas\f0-recuperar-git.ps1` traz o histórico do GitHub sem apagar nada (sem reset --hard/clean). Testes F0 em `30ee53e`: 220/220, 68/68, contraste 8/8, privacidade OK. F1: barra do Figma encostada com 4 abas (V15), temas Claro/Alta visibilidade/Escuro (V7) com conversão dos nomes antigos, aba Financeiro (custo estimado + entregas; lançamentos em desenvolvimento), Configurações com escolha de tema. Android: Capacitor 8.6.2, `android/`, ícone e abertura próprios, permissões de localização, backup desligado, assinatura persistente por segredos, workflow `android.yml` (pré-lançamento com o APK). Main e Pages intocados |
| 2026-11-24 | **Direção visual corrigida pelo usuário:** o Figma é a fonte oficial e obrigatória (`docs/DESIGN.md`, criado). A integração direta do Figma recusou a leitura (limite do assento Collab); as 8 telas originais e as adaptações aprovadas foram lidas pelo aplicativo do Figma no PC, só olhando. Os 17 wireframes foram refeitos com os componentes do Figma e exportados em PNG nos 3 temas, mais o mapa de navegação, para aprovação visual. Decisões V7 (temas) revista e V15 (barra inferior) nova. Sem código, sem commit, sem publicação |
| 2026-11-24 | **Planejamento da Evolução v2 (só documentos, sem código):** leitura do código e dos documentos; Git: GitHub em `33d2322`, pasta do PC com os mesmos 87 arquivos de `src/` mas **`.git` sem commits** e sem `.github/` e `.npmrc`; testes do `33d2322`: Vitest 220/220, scripts 68/68, contraste 8/8 (E2E não repetidos). Análise dos relatórios Spoke/Optiroute (`D:\Projetos Claude\Analise-APK\reports`, só referência funcional). Pesquisa de provedores (ORS, GraphHopper, OSRM, Nominatim, OpenFreeMap, VROOM, Google). Atualizados `PLANO-GERAL.md` (Evolução v2), `ARQUITETURA.md` §13, `DECISOES.md` V1–V14; wireframes e mapa de navegação das 17 telas em artefato. Sem commit, sem publicação |
| 2026-11-20 | **Importação real publicada** (autorização do usuário às 06:37): commit `33d2322` (26 arquivos: os da I1 + correção de Estatísticas/menu), manifesto e privacidade conferidos antes do envio e no workflow (execução 44712373866: build ✓ com 220 + 68 testes, publicar ✓). Site conferido: 27/27 arquivos idênticos ao build local (a CDN do GitHub serviu o index.html antigo por alguns minutos); em 412×682: Importar com escolha de arquivo e aviso de privacidade, conferência e busca por código, confirmar → OTIMIZAR em destaque + DEMONSTRAÇÃO, Estatísticas sem sobreposição, menu a 12 px do fim |
| 2026-11-20 | **Importação real (I1) implementada localmente, sem publicar:** planilha do aparelho no protótipo (.xlsx/.csv; .xls recusado com orientação), erros específicos, coordenada suspeita (> 60 km da mediana) fora do mapa, pacote repetido bloqueia a confirmação até decisão, busca por parada e por código (conferência e rota), cartão de privacidade, OTIMIZAR em destaque, otimização rotulada como DEMONSTRAÇÃO, `globIgnores` de planilhas no service worker. Planilhas fictícias novas: 12-spx-problemas, 13-spx-250-paradas, 14-formato-spx.csv, 15-spx-sem-endereco. Testes: Vitest 220/220; scripts 68/68; contraste 8/8; E2E 146/146; Etapa 3 36/36; Q 37/37 + 37/37; Pages 48/48 (atualizado para a nova regra); localização 26/26; P3 36/36; **importação real 43/43** (2 rodadas); varredura da planilha real: 0 de 438 trechos; JS inicial 137,9 KB. Manifesto 124 arquivos |
| 2026-11-20 | **Validação do usuário no Android (Chrome, protótipo publicado):** OK em abrir sem erros + selo, 5 telas e botões, mapa e pinos, ponto azul perto da posição real, "Minha localização" centraliza, entrega parcial (demais pacotes pendentes), fechar e reabrir mantém rota e marcações, finalizar mantém só o resumo, funcionamento sem internet. **Problemas relatados:** (1) Estatísticas desorganizada (círculo por cima do texto e do cartão); (2) menu flutuante alto demais. Causas: (1) o círculo era preso ao fundo da tela e, em telas baixas (≈ 682 px úteis com a barra do Chrome), subia sobre o conteúdo; (2) o Chrome do aparelho informa margem inferior do sistema (safe-area) mesmo numa aba comum. **Correção local (não publicada):** Estatísticas em coluna que rola em telas baixas (telas altas iguais a antes); margem do sistema só no app instalado. Testes: Vitest 213/213, scripts 68/68, contraste 8/8, E2E 146/146, Etapa 3 36/36, Q 37/37 + 37/37, Pages 48/48, localização 26/26, P3 36/36; JS inicial 137,3 KB. Publicação da correção aguarda autorização (novo commit) |
| 2026-11-19 | **Protótipo publicado** (P1): commit `3cff69a` enviado à main de `victor1923hsm/rotavhs-go`; 1ª execução falhou na publicação (Pages desativado, 404); depois de o usuário ligar Pages = GitHub Actions, só o trabalho que falhou foi refeito: sucesso. Conferido no navegador (375×812): Pedidos, Rotas (mapa e 61 pinos), Estatísticas, Importar (planilha fictícia) e Custo abrem; selo "PROTÓTIPO DE TESTE · dados fictícios"; service worker ativo; endereços diretos funcionam (404.html). Sem commit novo |
| 2026-11-19 | **Q1, Q2, Q3 e Q6 implementados**; proprietário do GitHub corrigido para victor1923hsm. Testes: Vitest 213/213; scripts 68/68; contraste 8/8; E2E principal 146/146; Etapa 3 36/36; Q 37/37 (normal) + 37/37 (/rotavhs-go/); Pages 48/48; localização 26/26; P3 36/36; JS inicial 137,2 KB. Publicação bloqueada só pela permissão de escrita no repositório |
| 2026-11-19 | **Decisões Q1–Q6** registradas (`DECISOES.md`); Etapa 3 tecnicamente aceita, aprovação final após o teste no Android (roteiro criado). Verificação de publicação criada; comparação mostrou: código do app no PC = testado; **ícones do PC (novos) ≠ pasta de teste** → sincronizados e tudo retestado (Vitest 199/199; scripts 68/68; E2E 146/146; Etapa 3 36/36; Pages 48/48; localização 26/26). Pacote antigo de publicação descartado. Sem commit, sem deploy |
| 2026-11-19 | **Etapa 3 concluída** (autorização das 20:50): situação por pacote (R1), gravação transacional e durável, retomada com "Continuar de onde parei", planos (SPX + 5), estado persistente dos alertas (A6/A7) e "silenciar", conferência guardada, **exclusão verificada dos detalhes ao finalizar** (regra definitiva), aviso antes de trocar a rota, tela "Alertas e dados", migração v1→v2. Testes: Vitest 199/199; E2E 146/146; Etapa 3 no navegador 36/36; Pages 48/48; localização 26/26; P3 36/36. **Sem commit** |
| 2026-11-19 | **Requisitos R1–R5 aprovados** (entrega parcial, alertas de proximidade, agrupamento, GPS em tempo real, otimização dinâmica) e ajustes A6–A10 no planejamento. **Não** autoriza as Etapas 3–7. Revisão da Etapa 3 apresentada (§4) para decisão. Publicação mantida pronta, **sem publicar** até confirmar o acesso ao repositório |
| 2026-11-19 | **P3 (autorização do usuário):** GPS contínuo com filtros e estados (funcional); OTIMIZAR MINHA ROTA a partir da posição, reavaliação após entrega e por desvio, entrega parcial e alerta de proximidade (demonstração); laboratório de GPS simulado. Testes: Vitest 183/183; E2E 145/145; Pages 48/48; localização 26/26; P3 36/36 |
| 2026-11-19 | **P2 (autorização do usuário): "Minha localização" no mapa do protótipo** (ponto azul, círculo de precisão, direção, centralizar, avisos, GPS econômico). Testes: Vitest 168/168; E2E 145/145; protótipo no formato do Pages 48/48; localização 26/26 |
| 2026-11-19 | **P1 (autorização do usuário): publicação do protótipo** no GitHub Pages (`victor1923hsm/rotavhs-go`), só dados fictícios, selo PROTÓTIPO DE TESTE. Envio pendente: o repositório ainda não está acessível ao Claude |
| 2026-11-19 | **Etapa 3 implementada e testada** (relatório no §4): rota, marcações (eventos só de inclusão), fase, ordem e posição na lista guardadas no aparelho; retomada ao abrir; **Finalizar rota** gera o resumo (tela **Rotas finalizadas**, em Estatísticas); veículo guardado. Vitest 158/158; E2E 145/145 |
| 2026-11-19 | Figma: telas do app recriadas como camadas editáveis na página "RotaVHS Go · App" (parcial: limite do assento Collab) |
| 2026-11-19 | **Revisão 12 (definida pelo usuário):** transições fluidas estilo iOS (View Transitions, sem biblioteca, desligadas com "reduzir movimento") e menu inferior flutuante de vidro. Testes: Vitest 142/142; E2E 126/126; JS inicial 96,6 KB |
| 2026-11-19 | **Revisão 11 (definida pelo usuário):** em Rotas, tocar na parada destaca no mapa e mostra Navegar (Google Maps / Waze); tocar no mapa abre a tela cheia (zoom, pinos tocáveis, cartão com Navegar e Abrir pedido). Navegar também na tela Pedidos. Testes: Vitest 139/139; E2E 126/126 (duas rodadas) |
| 2026-11-19 | **Etapa 2 implementada e testada** (relatório no §4): importação da planilha da SPX no aparelho, Conferência com decisões e desfazer; módulos copiados do RotaVHS com os testes. Aguardando o teste e a aprovação do usuário |
| 2026-11-19 | **Etapa 1 implementada e testada** (relatório no §4): PWA, 4 telas do Figma + Custo, temas Sol/Noite, mapa só na tela Rotas, busca pela parada, Recalcular + sugestão, mapa sem conexão → lista. Aguardando o teste e a aprovação do usuário |
| 2026-11-19 | **Revisão 10 (definida pelo usuário):** na interface, "Parada" no lugar de "Stop" |
| 2026-11-19 | **Revisão 9 (definida pelo usuário):** ao marcar Entregue / Sem sucesso, pula para a próxima parada pendente, com Desfazer por 6 s |
| 2026-11-19 | **Revisão 8 (definida pelo usuário):** pinos do mapa com a mesma cor da caixa do Stop na tela Pedidos (cor fixa por Stop) |
| 2026-11-19 | **Revisão 7: aprovação geral** de G1–G15; A5 resolvida (G5 tracejado "ordem, não é o caminho"; tamanhos do Figma; sem lucro); **Etapa 1 autorizada** |
| 2026-11-19 | **Revisão 6 (definida pelo usuário):** aba Financeiro removida; o custo estimado fica em Estatísticas (cartão + tela Custo das entregas). Barra com 3 abas |
| 2026-11-19 | **Revisão 5 (definida pelo usuário):** formato real da planilha SPX conferido (colunas em `CLAUDE.md`; sem nome, telefone e observação). Esses dados saem do app e da tela Pedidos. Prévia navegável publicada (modelo de teste, importa a planilha só no aparelho) |
| 2026-11-19 | **Revisão 4 (definida pelo usuário):** o Figma é a referência e o projeto se adapta a ele (G9); sem as restrições de privacidade de nome e telefone (G12); o Stop continua sendo o mais importante; Financeiro = só o custo estimado da rota (combustível, preço do litro, consumo × km estimados). No Figma: telas traduzidas para pt-BR e criada a tela "Custo das entregas" |
| 2026-11-19 | Revisão 3: G9 = cara do **protótipo do Figma** (capturas em `docs/referencia-visual/`); G12 = depois de finalizar, só **resumo operacional e financeiro** sem dados pessoais. Revisão detalhada de G1–G15 apresentada; **nada aprovado** |
| 2026-11-19 | Conferência final de consistência (decisões × arquitetura × plano × `CLAUDE.md`): corrigidos 3 detalhes (referência antiga à quantidade de decisões no plano, ordem G14/G15, estimativa de JS × meta G14). RotaVHS original conferido intacto |
| 2026-11-18 | Revisão 2: exigência **G15** (otimização futura pelas ruas reais: mão única, retornos, restrições de circulação). Nenhuma decisão aprovada |
| 2026-11-18 | Revisão 1 do planejamento: GPS com caminho nativo (N1), distâncias pelas ruas preparadas (N2), recálculo manual + sugestões sem mudança silenciosa, aviso do mapa offline, desempenho (G14), dados temporários apagados ao finalizar |
| 2026-11-18 | Projeto criado (repositório local + planejamento). RotaVHS original pausado e preservado (tags `pausa-2026-11-18-*`, backup em `D:\Projetos Claude\RotaVHS-backup\2026-11-18-pausa\`) |

## 4. Relatório da Etapa 1 (resultados reais, 2026-11-19)
Testes rodados no ambiente de nuvem do Claude (Linux, Node 22, Chromium headless do Playwright). **Não** foram rodados no seu Windows nem no Edge.

| Teste | Resultado |
|---|---|
| `typecheck` (TS 7.0.2, strict) | ✅ sem erros |
| Vitest (núcleo, dados fictícios, estado) | ✅ 21/21 |
| Verificador de privacidade (copiado do RotaVHS) | ✅ 65/65 testes; 42 arquivos do projeto: OK |
| Contraste, tema Sol (`npm run contraste`) | ✅ 8/8 pares ≥ 7:1 (texto 17,4:1; menta 11,1:1; cores das paradas 7,3–11,4:1) |
| E2E clicando por todas as telas, 390×844 e 360×780, temas Sol e Noite | ✅ 95/95 verificações |
| Offline depois da 1ª visita | ✅ abre Estatísticas e Rotas sem rede |
| JS inicial (sem o mapa) | ✅ 93,4 KB gzip (meta ≤ 150 KB) |
| Bloco do mapa (só na tela Rotas) | 293 KB gzip (estimativa do plano: 220–250 KB) |
| Abertura em cache no PC (nuvem) | mediana 103 ms até a tela utilizável |
| Heap JS | 2,8 MB em Pedidos; 5,4 MB em Rotas com o MapLibre carregado **sem tiles** |
| Requisições de rede | só `tiles.openfreemap.org` |

**Limitações desta rodada:**
- Os tiles do OpenFreeMap são bloqueados no ambiente de nuvem: lá só foi testado o caminho "Mapa sem conexão" → "Ver lista". **O mapa com as ruas precisa ser conferido por você** no PC e no celular.
- RAM com o mapa desenhado, bateria e abertura no S23 FE: não medidos (Etapas 8 e 9).
- Corrigido durante os testes: o MapLibre 6 não achava o próprio worker depois do build (`setWorkerUrl` com o arquivo do worker).
- Adaptações ao Figma (G9): no lugar da folha inferior e do trilho vertical do plano antigo, a parada atual fica na tela **Pedidos** (Stop enorme, Entregue/Sem sucesso) e o trilho é o de datas em Estatísticas.
- Cores das paradas: azul, roxo e laranja do Figma foram clareadas (#7FA9F0, #B39CF0, #F49A4C) para o número preto passar de 7:1.
- A importação de planilha nesta etapa é só o **arquivo de exemplo**; a leitura da planilha real da SPX é a Etapa 2.

### Relatório da Etapa 2 (resultados reais, 2026-11-19)
Copiados do RotaVHS (só leitura, G3), com a origem no cabeçalho de cada arquivo: `core/address/*`, `core/import/{build,csv,fields,mapping,review}`, `core/route/{labels,conference-list}`, `platform/spreadsheet.ts`, `scripts/gerar-planilhas.mjs` e as 10 planilhas **sintéticas** de `test-fixtures/planilhas/`. Novo no Go: `11-formato-spx.xlsx` (colunas exatas da SPX, dados fictícios), `features/importar/*` (Worker de leitura, conversão para as paradas do app) e a tela de Conferência.

| Teste | Resultado |
|---|---|
| Testes copiados do RotaVHS (importação, endereço, conferência, Stop/Sequence) | ✅ passaram sem mudança |
| Formato da SPX (colunas reconhecidas sozinhas, Stop "-" → "?", Stop dividido, contabilidade, 200 pacotes < 0,5 s) | ✅ 8/8 |
| Conversão para o app (nada some/duplica, "são o mesmo local", remover linha repetida, sem coordenada) | ✅ 8/8 |
| Total Vitest | ✅ 135/135 · verificador de privacidade 65/65 · 78 arquivos OK |
| E2E (Etapa 1 + importação, Chromium na nuvem) | ✅ 113/113 |
| JS inicial | ✅ 98,8 KB gzip; leitor de planilha sob demanda (Worker 23 KB) |

**Sua planilha real** (lida só no ambiente do Claude, nunca gravada no projeto; só contagens): 120 linhas = 120 pacotes + 0 ignoradas; 9 colunas reconhecidas sozinhas; 2 pacotes sem número de parada ("?"); **101 paradas** pela regra do RotaVHS (16 números de Stop em 41 partes, endereços escritos de jeitos diferentes) → **76 paradas** com "Juntar as partes de cada parada dividida"; 10 casos de "mesmo endereço com números diferentes" para você decidir; leitura em 55 ms (Node) e 175 ms até a Conferência (navegador).

**Limitações:** a rota importada ficava **só na memória** (resolvido na Etapa 3). O início da otimização com planilha real é a 1ª parada da SPX (sem GPS até a Etapa 4). O mapa com tiles continua não verificado no ambiente de nuvem.

### Relatório da Etapa 3 (resultados reais, 2026-11-19)
Novo: `platform/armazenamento/` (interface `Armazenamento` + implementação **Dexie** + implementação **na memória** para navegador sem IndexedDB), `core/resumo.ts`, `app/persistencia.ts` (observa o estado e grava só o que mudou, numa fila), tela `RotasFinalizadas.tsx`. Schema v1 de `ARQUITETURA.md` §4 (banco `rotavhsgo`).

| Teste | Resultado |
|---|---|
| Armazenamento (Dexie com fake-indexeddb e memória, o mesmo contrato): guardar/retomar, eventos só de inclusão, finalizar, apagar rota e resumo, veículo | ✅ 13/13 |
| Sessão recuperável com o estado do app (fechar e reabrir mantém fase, ordem, marcações, posição; finalizar; rota substituída) | ✅ 3/3 |
| Total Vitest | ✅ 158/158 · verificador de privacidade 65/65 · typecheck ok |
| E2E (Chromium na nuvem): recarregar a página e fechar/abrir a aba mantêm a rota, as marcações e a parada atual; planilha importada (fictícia e a sua) continua depois de reabrir; Finalizar → resumo; resumo continua ao reabrir; apagar com Desfazer | ✅ 145/145 (19 novas) |
| Tamanho guardado | rota de 60 paradas < 1 MB (teste); IndexedDB do navegador com tudo: 232 KB |
| JS inicial | ✅ 130,3 KB gzip (era 96,6; o Dexie soma ~33 KB) — meta ≤ 150 KB |

**Como funciona:** cada toque em Entregue / Sem sucesso / Desfazer vira um **evento** (só inclusão: marcar, desfazer, correção); ao abrir, o status é refeito a partir deles. Fase, ordem, parada selecionada e hora de "Iniciar entregas" são gravadas a cada mudança. **Finalizar rota** (Rotas, em andamento, com confirmação que mostra as pendentes) guarda o resumo (contagens, pacotes, duração real, km estimados, litros, custo em centavos, sem endereços nem códigos), apaga a matriz de distâncias da rota e volta para a rota de exemplo. Importar outra planilha com a rota marcada pela metade guarda a anterior como **"Substituída"** (nada se perde); sem marcações, ela é descartada. O pedido de armazenamento persistente (`navigator.storage.persist()`) é feito na 1ª marcação ou planilha importada.

**Adaptações fora do Figma** (mínimas, no estilo das telas existentes): botão **Finalizar rota** com confirmação em Rotas; atalho **"Rotas finalizadas · N"** abaixo do cartão de custo em Estatísticas (só aparece com resumo guardado); tela **Rotas finalizadas** no formato da tela Custo. O botão "Salvar custos" agora avisa "Custos guardados neste aparelho" (o veículo já é guardado a cada mudança).

**Correção feita pelos testes:** o índice dos eventos usava o nome de campo errado e as marcações não voltavam ao reabrir; corrigido antes da entrega.

**Limitações:** o pedido de armazenamento persistente é recusado no Chromium da nuvem (sem interação de usuário real); no celular, o navegador decide (no Android costuma aceitar para app instalado; iOS só testável na Etapa 8). O tema continua no `localStorage` (precisa ser lido antes de desenhar a tela). Não testado no seu Windows/Edge nem no celular.

### Relatório P1 + P2 (protótipo publicado e "Minha localização", 2026-11-19)
| Teste | Resultado |
|---|---|
| typecheck + Vitest | ✅ 168/168 (10 novos: GPS simulado, bateria, permissão, sem sinal, rota intacta, privacidade do código) |
| Verificador de privacidade · contraste | ✅ 65/65 · 8/8 ≥ 7:1 |
| Varredura de dados reais (332 trechos da planilha real) no projeto e nas planilhas de teste | ✅ 0 encontrados |
| E2E completo (versão do PC) | ✅ 145/145 |
| Protótipo no formato do GitHub Pages (`/rotavhs-go/`, 404.html), 5 telas em Galaxy S23 FE (360×780), iPhone 13 e Pixel 7 emulados | ✅ 48/48 |
| Localização com GPS emulado: ponto, centralizar, acompanhar, arrastar, imprecisa, direção, negada, indisponível, desligar, nada gravado/enviado/no console | ✅ 26/26 |
| JS inicial | ✅ 130,6 KB gzip; a localização fica no bloco do mapa (288,6 KB, só em Rotas) |

**Limitações:** testes em Chromium na nuvem com GPS **emulado**; o GPS de verdade, a bateria e o iPhone só no aparelho. O `.github/workflows/publicar.yml` não pôde ser gravado na pasta do PC (arquivo protegido para gravação remota): ele vai direto para o GitHub.

### Relatório P3 (GPS dinâmico, otimização dinâmica em demonstração, entrega parcial, 2026-11-19)
Funcional × demonstração: tabela em `docs/DECISOES.md`, P3.

| Teste | Resultado |
|---|---|
| typecheck + Vitest | ✅ 183/183 (15 novos: filtros de salto e precisão, estados, origem confiável, otimizar pela posição/longe da rota, agrupamentos intactos, ordem nunca muda sozinha, tremor de 10 min sem sugestão, desvio só após 2 min, intervalo de 60 s, próxima protegida, proximidade, entrega parcial guardada e desfeita) |
| Verificador de privacidade · contraste · varredura de dados reais | ✅ 65/65 · 8/8 · 0 de 332 trechos |
| E2E completo (versão do PC) | ✅ 145/145 |
| 5 telas + selo no formato do GitHub Pages (3 celulares emulados) | ✅ 48/48 |
| Localização (GPS do navegador emulado; nada gravado/enviado/no console) | ✅ 26/26 |
| P3 no navegador: GPS simulado, salto, impreciso, proximidade, desvio, sem sinal (30 s), GPS desligado, entrega parcial (e reabrir), visitas × pacotes, GPS perto/longe da rota | ✅ 36/36 |
| JS inicial | ✅ 136,7 KB gzip (meta ≤ 150 KB) |

**Limitações:** tudo testado com GPS **emulado/simulado** no Chromium da nuvem; GPS real, bateria e iPhone só no aparelho. Os limites (300 m, 2 min, 5 %, 80 m) são os do plano e devem ser ajustados com o seu uso real (Etapa 6). A sugestão por desvio só aparece quando a nova ordem é melhor pelo modelo; senão o laboratório mostra "a ordem atual continua a melhor".

### Revisão da Etapa 3 (para decisão, 2026-11-19 20:25)
**Objetivo:** guardar a rota no aparelho e retomá-la; preparar os dados para R1–R5. Plano completo em `PLANO-GERAL.md`, Etapa 3.

| O quê | Situação |
|---|---|
| Rota, paradas, pacotes, eventos só de inclusão, resumos, veículo; retomada; finalizar; rota substituída; `storage.persist()` | ✅ feito e testado (Vitest + E2E 145/145) |
| Pacote **pendente** dentro da visita parcial (R1/A10) | ❌ falta (hoje: todos os pacotes precisam de entregue/sem sucesso) |
| Estado dos alertas por rota e "silenciar" (A6/A7), sem posição | ❌ falta (hoje: "já avisada" só na memória; reabrir o app repete o alerta) |
| Retenção depois de finalizar | ⚠️ decisão sua (D-Ret): hoje paradas, endereços, códigos e coordenadas da rota finalizada **ficam** no aparelho |
| Planos (5 recentes + SPX), Conferência em andamento, migração de schema, cota/erros | ❌ falta |

**Dependências:** Etapa 4 (GPS) não grava posição — só usa as preferências de `settings`; Etapas 5/6 usam os planos e a matriz `distanceCache` (apagada ao finalizar); Etapa 7 usa os eventos por pacote (R1) e o estado dos alertas (A6/A7); Etapa 8 testa o risco de o iOS apagar os dados.

**Riscos de privacidade:** (1) endereços, códigos SPX e coordenadas das entregas ficam no IndexedDB sem criptografia: quem usar o aparelho desbloqueado e o mesmo navegador consegue vê-los; (2) sem retenção, rotas finalizadas acumulam; (3) o resumo não tem endereços nem códigos (já é assim); (4) nenhuma posição do GPS é gravada (já é assim, testado). **Desempenho:** ~230 KB por rota; sem retenção, ~100 rotas ≈ 20 MB; abertura espera o banco até 2,5 s antes de desenhar (não medido no celular); +33 KB de JS (Dexie) já dentro da meta.

**Decisões suas para autorizar a Etapa 3 (versão 3b):** (a) aprovar o que já está feito; (b) autorizar a parte que falta (itens 1–6 do plano); (c) D-Ret: apagar os dados da rota ao finalizar / após N dias / manter.

### Relatório final da Etapa 3 (resultados reais, 2026-11-19 · conclusão)
**Ambiente:** Linux na nuvem, Node 22, Chromium headless do Playwright com IndexedDB real; Vitest com fake-indexeddb. **Não** testado no seu Windows/Edge nem no celular.

**Arquivos novos:** `src/core/pacotes.ts`, `src/core/alertas.ts`, `src/mock/rota-grande.ts`, `src/components/domain/Retomada.tsx`, `src/components/domain/Planos.tsx`, `src/screens/Preferencias.tsx`, `src/app/etapa3.test.ts`. **Alterados:** `src/core/resumo.ts`, `src/platform/armazenamento/{tipos,dexie,memoria}.ts` + teste, `src/app/{estado,persistencia,dinamica,App}.ts(x)` + `persistencia.test.ts`/`dinamica.test.ts`, `src/app/navegacao.tsx`, `src/app/simulador.ts`, `src/platform/localizacao/{tipos,web}.ts`, `src/components/domain/Gps.tsx`, `src/screens/{Pedidos,Rotas,Importar,Estatisticas,RotasFinalizadas}.tsx`, `src/styles/app.css`. Nenhuma dependência nova.

| Teste | Resultado |
|---|---|
| typecheck + Vitest | ✅ 199/199 (novos: contrato v2 nas duas implementações, histórico por pacote, transação tudo-ou-nada, limpeza interrompida e retomada, rota corrompida, armazenamento cheio, migração v1→v2, resumo validado; app: parcial por pacote, retomada, interrupção logo após marcar, correção, reinício na finalização, falha + nova tentativa, dados inconsistentes, conferência, alertas, planos, 200 paradas) |
| Verificador de privacidade · contraste · varredura de dados reais | ✅ 65/65 · 8/8 ≥ 7:1 · 0 de 332 trechos da planilha real em 133 arquivos |
| E2E Etapa 3 no Chromium (IndexedDB real) | ✅ 36/36: "2 de 3 entregues · 1 pendente"; reabrir com "Continuar de onde parei"; correção com histórico; navegador **derrubado** (CDP `Page.crash`) logo após a gravação confirmada; conferência interrompida volta; aviso antes de trocar a rota; 200 paradas; planos; finalizar → banco sem endereços nem códigos; alerta → silenciar (GPS continua); **retomar sem internet** |
| E2E completo (PC) · Pages (3 celulares emulados) · localização · P3 | ✅ 146/146 · 48/48 · 26/26 · 36/36 |

**Medições (rota fictícia de 200 paradas, 499–505 pacotes):**
| Medida | Chromium (nuvem, PC) | Node + fake-indexeddb |
|---|---|---|
| Abrir e recuperar a rota (até a tela) | mediana 192 ms | 49 ms (só o banco) |
| Salvar uma entrega (toque → confirmado no banco) | 72 ms | 41 ms |
| Atualizar uma visita parcial (1 pacote) | 45 ms | 1 ms |
| Gravar a troca de rota (encerrar a anterior + 200 paradas) | 235 ms | 59 ms (salvar rota) |
| Finalizar e limpar | 202 ms | 23 ms |
| Tamanho | IndexedDB 652 KB (estimativa do navegador) | 148 KB de dados |
| Memória (heap JS em Pedidos) | 5,1 MB | — |
| JS inicial | 143,0 KB gzip (meta ≤ 150 KB) | — |

**Limitações:** (1) falta de bateria/reinício **real** não testada: simulados por transação abortada, conexão fechada, nova abertura e renderer derrubado; um corte **antes** da confirmação do navegador (≈ 7–8 ms medidos) pode perder o último toque; (2) se os dados do navegador forem apagados, ou o iOS os remover, a rota não volta; (3) a exclusão remove os registros do app, sem garantia de eliminação física no disco; (4) "Marcar uma entrega" inclui o cálculo da sugestão automática da demonstração P3 (2-opt), que no celular pode levar mais; (5) folga de 7 KB no JS inicial; (6) o cache de imagens do mapa não é apagado ao finalizar; há o botão "Limpar mapas guardados" em Alertas e dados (Q3).

## 4b. Validação no celular (pendente)
Roteiro: `docs/ROTEIRO-TESTE-ANDROID.md` (12 cenários). O cenário "sem internet" só funciona em HTTPS (depois da publicação ou com HTTPS local na Etapa 4).

## 5. Pendências
| # | Pendência | Quando |
|---|---|---|
| A4 | Versão nativa para iOS exige Mac + conta de desenvolvedor (paga) para instalação duradoura: decidir antes de planejar a N1 | antes da N1 |
| A2 | Ter um iPhone disponível para testar o iOS (sem ele, o iOS fica "não verificado") | antes da Etapa 8 |
| A3 | HTTPS local para instalar o PWA e usar o GPS no celular (G10) | Etapa 4 |

## 6. Como executar
**Para retomar numa sessão nova** (primeira mensagem sugerida):
> "Leia `D:\Projetos Claude\RotaVHS-Go\CLAUDE.md`, `docs/CONTINUAR-PROJETO.md` e `docs/DECISOES.md`. A Etapa 3 está pronta; vamos revisar o meu teste e decidir a Etapa 4."

Regras desta retomada: G1–G15 aprovadas; a Etapa 4 só começa com a sua autorização; o RotaVHS original continua só para leitura.

Na pasta `D:\Projetos Claude\RotaVHS-Go`, no PowerShell:
1. `npm install` (só dentro do projeto; ~270 MB em `node_modules`).
2. `npm test` (typecheck + Vitest + verificador de privacidade) e `npm run contraste`.
3. `npm run build` e depois `npm run tamanho`.
4. `npm run preview` → abra `http://localhost:4173` no PC. No celular (mesmo Wi-Fi): `http://<IP do PC>:4173` (o terminal mostra o endereço "Network"). Simular mapa sem conexão: acrescente `?mapa=off` ao endereço.
5. Desligue o servidor com **Ctrl + C** ao terminar.
6. Testar a importação: **Pedidos → Importar rotas → Escolher planilha da SPX** (a planilha não vai para o Git: `.gitignore` bloqueia `*.xlsx` fora de `test-fixtures/`).
   Testar a Etapa 3: em Pedidos, abra uma parada com 2+ pacotes → **Marcar pacote a pacote** (ex.: "2 de 3 entregues · 1 pendente"); **feche o navegador** (ou desligue o celular) e abra de novo → **Continuar de onde parei**; corrija um pacote; em Rotas, **Planos guardados**; **Finalizar rota** → Estatísticas → Rotas finalizadas ("detalhes apagados do aparelho"); **Estatísticas → Alertas e dados** (alertas, rotas guardadas, conferência). Os dados ficam no navegador usado (Edge do PC e Chrome do celular são separados).
7. 1º commit (G13): `npm run ativar-gancho`, depois `git add -A` e `git commit -m "Planejamento + Etapa 1"`.

## 7. Publicar a versão correta no GitHub Pages (só com autorização)
**Situação (2026-11-19 23h):** repositório `victor1923hsm/rotavhs-go` existe (público, vazio), mas o app do Claude **não tem permissão de escrita** nele. Commit inicial preparado com a versão testada (Etapa 3 + Q1/Q2/Q3/Q6). Nada foi enviado.

**Para liberar o envio pelo Claude:** github.com → Settings → Applications → *Installed GitHub Apps* → **Claude** → Configure → *Repository access* → incluir `rotavhs-go` (permissão de conteúdo de leitura e escrita) → Save. No repositório: Settings → Pages → Source = **GitHub Actions**.

**Pré-condições:** (a) repositório `victor1923hsm/rotavhs-go` criado (público, vazio), Pages com Source = GitHub Actions, e liberado para o app do Claude; (b) sua autorização explícita para o commit e a publicação.

**Procedimento:**
1. Na versão testada: `npm run manifesto` → roda **todos** os testes e só então grava `publicacao.manifesto.json` (impressão SHA-256 de cada arquivo que entra no build: `src`, `public`, `scripts`, `test-fixtures`, workflow e configurações).
2. Montar a pasta de publicação a partir dessa versão (sem `node_modules`, `dist`, planilhas reais, `.env`, `docs/referencia-visual`) e conferir: `npm run conferir-publicacao` → precisa dizer **"idêntico"**. Também `node scripts/verificar-publicacao.mjs comparar <pasta-testada> <pasta-de-publicação>`.
3. Varredura de privacidade: verificador do projeto + busca de trechos da planilha real (0 esperado).
4. Commit + push (**só com autorização**). No GitHub, o workflow: confere o manifesto (para se algo diferir) → `npm ci` → `npm test` → build do protótipo (`/rotavhs-go/`, dados fictícios) → tamanho → publica.
5. Depois: abrir https://victor1923hsm.github.io/rotavhs-go/ e repetir o teste das 5 telas no celular; registrar aqui.

**Observação:** o arquivo `.github/workflows/publicar.yml` não pôde ser gravado na sua pasta pelo Claude (pasta protegida para gravação remota); ele está na versão testada e entra no manifesto. Se preferir publicar a partir do seu PC, crie esse arquivo manualmente com o conteúdo da versão testada.
