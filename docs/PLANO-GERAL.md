# RotaVHS Go — Plano geral

Situação: **proposta, aguardando aprovação.** Nada foi implementado. Criado em 2026-11-18 · **Revisão 1** (2026-11-18): GPS com caminho nativo, distâncias pelas ruas preparadas, recálculo manual + sugestões, aviso do mapa offline, desempenho como prioridade, dados temporários.
**2026-11-24:** proposta de **Evolução v2** (plataforma, provedores, motor de otimização, GPS, 17 telas, fases F0–F10) no fim deste arquivo — aguardando aprovação.
Base: `CLAUDE.md`, `ARQUITETURA.md`, `DECISOES.md` (G1–G15, todas pendentes).

## Objetivo
Um app de rua para o entregador Shopee SPX, **simples, rápido e leve**:
1. abrir;
2. importar a planilha;
3. conferir;
4. ativar o GPS;
5. calcular a melhor sequência **estimada**;
6. iniciar a rota;
7. acompanhar o deslocamento;
8. recalcular as pendentes quando necessário;
9. marcar **Entregue** ou **Sem sucesso**;
10. finalizar.

Sem módulos administrativos.

## Telas (seguem o Figma, G9 revisão 4)
| # | Tela do app | Tela no Figma | Conteúdo |
|---|---|---|---|
| 1 | **Pedidos** | Conectado — Pedidos | parada atual com o **Stop enorme**, os códigos dos pacotes (SPX TN), endereço(s), bairro e CEP; Entregue / Sem sucesso; coluna dos pacotes com o selo ENTREGUE; importar rotas |
| 2 | **Importar rotas** | Conectado — Prévia da importação | planilha XLSX/CSV, prévia (endereço, Stop, pedido), Stop dividido, "?", possíveis duplicidades → revisar rota |
| 3 | **Rotas** | Rotas · Revisão / Otimizada / Em andamento | mapa, sequência de paradas pelo Stop, distância e tempo **estimados**, Otimizar rota, Iniciar entregas, próxima parada, **Entregue** e **Sem sucesso**, **Recalcular** e busca pelo Stop |
| 4 | **Estatísticas** | Conectado — Estatísticas + Estatísticas · Custo das entregas | entregas do dia, tempo, km estimados e o cartão **Custo de combustível hoje (estimado)**; finalizar rota. O botão **Editar** abre **Custo das entregas**: **só o custo estimado da rota:** combustível, preço do litro, consumo médio, km estimados das rotas → litros, custo, custo por km e por entrega |

Barra inferior com 3 abas: **Pedidos · Rotas · Estatísticas** (sem Financeiro, revisão 6). As telas Início e Detalhes da parada do plano anterior ficam cobertas por Pedidos e Importar rotas. A aba e a tela Financeiro do Figma (saldo, pendente, gorjetas) e a linha de lucro **não entram** (G12).

## Etapas
Cada etapa termina com testes reais, relatório e **pedido de aprovação** antes da próxima.

### Etapa 1: Estrutura PWA + **Modelo visual navegável de teste**
- **Objetivo:** o 1º passo de código, **assim que aprovado**. Um protótipo PWA com **dados fictícios realistas** e as telas, para você testar no celular a interface, a legibilidade sob sol forte e a ergonomia dos botões, **antes** de integrar o motor SPX e o GPS real.
- **Inclui:**
  - estrutura Vite + React + TS + Tailwind + PWA (manifest, service worker, ícones provisórios);
  - temas **Sol** e **Noite**;
  - mapa MapLibre (OpenFreeMap) com pinos pelo Stop e posição **simulada** (rotulada "posição de teste");
  - folha inferior com 3 alturas (recolhida, meia, cheia);
  - busca pelo Stop (teclado numérico);
  - Entregue / Sem sucesso **só na memória do modelo** (nada gravado), com Desfazer;
  - **Recalcular** a qualquer momento e um cartão de **sugestão automática** ("Nova ordem sugerida · −8 % estimado · Usar nova ordem / Manter atual"), com números fictícios, para testar a experiência da G8. A ordem nunca muda sem o toque;
  - aviso "mapa sem conexão" com o botão "Ver lista" (simulável);
  - trilho vertical de paradas;
  - selo fixo "MODELO DE TESTE · dados fictícios".
- **Arquivos:** `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/app/*` (rotas, tema), `src/styles/tokens.css`, `src/components/ui/*` (Button, Card, BottomSheet, Segmented, Badge), `src/components/domain/*` (StopBadge, StopRow, MapPins), `src/screens/*` (5 telas), `src/mock/rota-ficticia.ts`, `public/` (ícones), `scripts/privacidade/` (copiado do RotaVHS), `.githooks/pre-commit`, `scripts/capturar-telas.mjs` (E2E).
- **Dependências:** as da G2. Nada além disso.
- **Testes:**
  - `typecheck`;
  - Vitest dos dados fictícios (Stops, Stop dividido, "?");
  - verificador de contraste dos tokens (≥ 7:1 no texto principal, tema Sol);
  - E2E no Edge headless em 390 × 844 e 360 × 780 (navegar pelas telas **clicando**), com capturas nos 2 temas;
  - o app abre **offline** depois da 1ª visita;
  - **desempenho (G14):** tamanho do JS inicial (sem o mapa) e do bloco do mapa, tempo de abertura em cache no PC e RAM da página com e sem mapa;
  - **dados:** 0 requisições além dos tiles.
- **Critérios de aceite:**
  - as telas navegáveis;
  - Stop ≥ 64 px nas telas de parada;
  - botões nos tamanhos do Figma (52 px), alvos ≥ 48 px (revisão 7);
  - contraste ≥ 7:1 no tema Sol;
  - sem tile, a tela mostra "mapa sem conexão" e a lista funciona;
  - **nenhuma linha reta como trajeto**: só o tracejado "ordem, não é o caminho" (G5);
  - nenhum dado real;
  - JS inicial ≤ 150 KB gzip, com o MapLibre carregado só na Rota Ativa;
  - você consegue abrir no celular pela rede local (G10).
- **Riscos:**
  - o MapLibre pesa no celular: medir e, se preciso, mapa só na Rota Ativa;
  - instalar o PWA no celular exige HTTPS (G10): na Etapa 1 o teste é no navegador.
- **Consumo estimado:**
  - `npm install` ~250–350 MB em disco;
  - `build` ~1 min;
  - página com mapa ~80–150 MB no celular;
  - JS ~400–500 KB gzip com o MapLibre.

### Etapa 2: Importação SPX
- **Objetivo:** ler a planilha da Shopee no aparelho e conferir.
- **Inclui:** copiar `core/import`, `core/address`, `labels`, `conference-list` e `platform/spreadsheet` do RotaVHS (G3), com os testes; tela de Conferência real; leitura do formato real da SPX (colunas em `CLAUDE.md`); nome, telefone e observação não existem na planilha (G12).
- **Testes:**
  - os testes copiados;
  - planilhas **fictícias** (geradas);
  - contabilidade "linhas = pacotes + ignoradas";
  - Stop dividido, "?" e duplicidades;
- **Aceite:** mesmos resultados do RotaVHS nas planilhas fictícias de referência; o Stop nunca é renumerado.
- **Riscos:** formatos novos de planilha da SPX (o mapeamento é tolerante, com confirmação).
- **Consumo:** leitura de 200 pacotes em < 0,5 s no PC, num Worker.

### Etapa 3: Banco local (Dexie) e recuperação
- **Situação (2026-11-19 22:21):** implementada e testada; **tecnicamente aceita para validação**. **Aprovação final depende do teste no celular real** (`ROTEIRO-TESTE-ANDROID.md`). Ajustes propostos (Q1 inatividade em 3 níveis, Q2 prazo de 7 dias da conferência, Q3 limpar mapas, Q6 mais telas sob demanda) aguardam autorização. Relatório técnico em `CONTINUAR-PROJETO.md` §4, "Relatório final da Etapa 3"; decisões E3-1 a E3-9 e questões Q1–Q6 em `DECISOES.md`.
- **Objetivo:** guardar a rota no aparelho e retomar depois de fechar ou reiniciar, sem perder nenhuma marcação; base de dados pronta para as Etapas 4–7.
- **Já feito:** schema v1 (`ARQUITETURA.md` §4) com rotas, paradas, pacotes, eventos só de inclusão (inclusive por pacote), resumos, matriz de distâncias, configurações; adaptador `Armazenamento` (Dexie + memória); retomada da fase, ordem, marcações e parada atual; finalizar com resumo; rota substituída vira resumo; veículo guardado; `navigator.storage.persist()`; aviso quando não dá para guardar.
- **Falta (proposta 3b):**
  1. **Pacote pendente na visita parcial (R1/A10):** situação por pacote incluindo "pendente"; a visita só conclui quando todos os pacotes tiverem situação final; reconstrução a partir dos eventos; migração do schema para v2 sem perder dados.
  2. **Estado dos alertas por rota (A6) e preferência de silenciar (A7):** guardar só "parada X já avisada em hh:mm" e "silenciado nesta rota" — **nunca a posição**.
  3. **Retenção (privacidade):** ao finalizar, hoje a rota finalizada continua com endereços, códigos e coordenadas no aparelho. Proposta: apagar paradas, pacotes e eventos da rota finalizada (ficando só o resumo), imediatamente ou após N dias — **decisão sua (D-Ret)**.
  4. **Planos da otimização** (5 recentes + o original da SPX) e "voltar para um plano anterior" — base para as Etapas 5 e 6.
  5. **Conferência em andamento** (status `conferencia`): não perder as decisões se o app fechar no meio da Conferência.
  6. **Robustez:** cota cheia/erro de gravação, banco corrompido (volta à memória com aviso), versão do schema e migração testada, limite de resumos guardados.
- **Testes:** fake-indexeddb (contrato do adaptador nas duas implementações); reabrir no meio da rota, depois de entrega parcial com pacote pendente, depois de desfazer e de correção; migração v1→v2 com dados fictícios; finalizar (resumo correto com pacotes pendentes = não entregues; retenção conforme D-Ret); E2E fechando e reabrindo a aba; tamanho por rota; tempo de abertura com 10 resumos e 1 rota de 200 paradas.
- **Aceite:** fechar e reabrir mantém rota, marcações (por visita e por pacote) e posição na lista; finalizar gera o resumo; nenhuma coordenada do GPS é gravada; migração sem perda.
- **Riscos:** o iOS pode apagar dados de sites (o app na Tela de Início é mais protegido; testar na Etapa 8); dados de endereço legíveis por quem tiver acesso ao aparelho desbloqueado; crescimento do banco sem retenção.
- **Consumo:** < 1 MB por rota (medido: ~230 KB com a rota de 60 paradas); gravações pequenas a cada toque, em fila.
- **Fora da Etapa 3:** GPS (4), otimização (5/6), telas de marcação e alertas (7) — a Etapa 3 só prepara os dados.

### Etapa 4: Mapa e GPS reais
- **Objetivo:** posição real e acompanhamento.
- **Inclui:** **`LocationProvider`** com a implementação web (`watchPosition`, filtros G7); iniciar/pausar; Wake Lock; tratamento de perda de sinal e de permissão negada; **HTTPS local para o teste no celular** (G10). A interface já prevê `capabilities.background` para a versão nativa (N1).
- **Testes:** posições simuladas (sequências gravadas, sem dados reais); E2E com geolocalização emulada; teste no celular (Android; iOS se houver aparelho).
- **Aceite:** sem oscilação visível parado; "sem sinal" exibido; GPS pausa com o app fora da tela.
- **Riscos:** limites reais do PWA (`ARQUITETURA.md` §5); a bateria.
- **Consumo:** GPS em alta precisão só durante a rota ativa.

### Etapa 5: Otimização inicial
- **Objetivo:** a melhor sequência **estimada** a partir da posição atual.
- **Inclui:** copiar `units`, `spx-order`, `cost`, `solver`, `plan` e o Worker (G3; solver experimental); **`DistanceMatrixProvider`** com o provedor estimado (o das ruas fica pronto na interface, N2); comparar com a ordem original SPX (a mesma matriz e a mesma função, "nunca pior pelo modelo"); "Usar ordem da SPX" a um toque.
- **Testes:** os testes copiados + benchmark sintético (30/100/150/200); auditoria (Stop, pacotes, agrupamentos, concluídas).
- **Aceite:** Stop e pacotes intactos; nunca pior que a SPX pelo modelo; ≤ 1 s com 150 paradas no celular; tela sem travar.
- **Riscos:** o ganho real é desconhecido (distância estimada).
- **Consumo:** Worker ~1–4 MB, encerrado ao terminar.

### Etapa 6: Otimização dinâmica
- **Objetivo:** recalcular as pendentes durante a rota sem a ordem "pular".
- **Inclui:** **Recalcular manual a qualquer momento** + **sugestões automáticas** com a política **anti-oscilação** (G8); só as pendentes; a próxima parada protegida perto de você; a **sequência nunca muda em silêncio** (aplicar = um toque).
- **Testes:** trajetos simulados com tremor de GPS (nenhuma sugestão por tremor); intervalo mínimo e ganho mínimo só nas automáticas; recálculo manual sempre atende; concluídas intocadas; nenhuma mudança de ordem sem confirmação.
- **Aceite:** 0 sugestões por oscilação nos cenários simulados; 0 mudanças de ordem sem toque; nenhuma sugestão de trocar a próxima quando você está perto dela.
- **Riscos:** ajustar os limites (300 m, 2 min, 5 %) com o seu uso real.
- **Consumo:** ≤ 1 cálculo por minuto, no máximo.
- **Requisitos aprovados (R5, A8, A9):** origem = posição confiável sem limite de distância (aviso quando longe da rota); toda mudança de sequência confirmada.

### Etapa 7: Marcação de entregas
- **Objetivo:** Entregue / Sem sucesso, desfazer, finalizar e custo estimado.
- **Inclui:** eventos só por inclusão; desfazer por 6 s; correção como novo evento; "tentar de novo" para as "sem sucesso"; finalizar rota (guarda o resumo e mostra Estatísticas); tela **Custo das entregas** (em Estatísticas) com tipo de combustível, preço do litro e consumo médio, e o **custo estimado** calculado pelos km estimados da rota (G12; dinheiro em centavos).
- **Testes:** histórico intacto; desfazer; nada marcado por proximidade.
- **Requisitos aprovados (R1, R2, A6, A7, A10):** entrega parcial pacote a pacote com pendentes; alertas de proximidade com anti-repetição e silenciar.
- **Aceite:** nenhuma entrega marcada sem toque; Resumo correto.
- **Riscos:** toque acidental (botões grandes e separados, Desfazer).
- **Consumo:** desprezível.

### Etapa 8: Instalação Android / iOS
- **Objetivo:** instalar e usar como app.
- **Inclui:** manifest, ícones definitivos, metadados iOS, splash, modo standalone, atualização sem fechar o app.
- **Testes:**
  - instalar no Android (S23 FE) e, se possível, num iPhone;
  - offline real;
  - atualização com o service worker antigo (E2E como o do RotaVHS);
  - armazenamento persistente.
- **Aceite:** instala e abre offline nas duas plataformas testadas; os limites do GPS ficam confirmados e documentados por aparelho.
- **Riscos:** sem iPhone para testar, o iOS fica "não verificado".
- **Consumo:** —

### Etapa 9: Desempenho, bateria e uso real
- **Objetivo:** medir na rua.
- **Inclui:** RAM e CPU no celular; bateria por hora de rota; tempo de importação e de otimização; distância percorrida (GPS) × estimada, para **calibrar** o fator 1,35 e os pesos.
- **Testes:** rota real sua, só com contagens nos relatórios.
- **Aceite:** números reais publicados no relatório; parâmetros recalibrados com a sua aprovação.
- **Riscos:** variação de aparelho e de sinal.
- **Consumo:** —

## Etapas opcionais futuras (cada uma com plano e aprovação próprios)
| # | Etapa | Resumo |
|---|---|---|
| **N1** | Versão nativa com GPS em segundo plano | casca Capacitor + `LocationProvider` nativo (`ARQUITETURA.md` §5). Android pelo APK; o iOS exige Mac e, na prática, conta paga de desenvolvedor (decisão sua) |
| **N2** | Distâncias e **otimização pelas ruas reais** (G15) | provedor `road` com consentimento por rota (G4); **mão única** (matriz assimétrica), **retornos** (dois nós por parada, lado de chegada) e **restrições de circulação** (do motor de rotas, perfil do veículo); volta ao estimado sem rede; cache da matriz por rota; trajeto real no mapa rotulado "pelas ruas". Aceite: nenhuma ordem que exija contramão ou conversão proibida nos testes; retornos contados e mostrados |
| **N3** | Baixar mapa da área da rota | tiles da área e dos zooms da rota, com o tamanho mostrado antes, de preferência no Wi-Fi; continua sem garantia total (G6) |

## Fora do escopo inicial
Alertas por voz (existem no RotaVHS; avaliar depois). **Módulo financeiro opcional (Q4):** receita, abastecimento, despesas, km e lucro estimado — a planejar numa etapa própria. Os **alertas de proximidade** saíram desta lista: viraram o requisito R2 (2026-11-19), memória de locais, financeiro além do custo estimado (saldo, receita, lucro), backend, deploy e serviços pagos.


---

# Evolução v2 — planejamento (2026-11-24) · **PROPOSTA, aguardando aprovação**

Pedido do usuário em 2026-11-24 20:05. **Nada aqui está autorizado para implementação.** Esta seção não muda as regras anteriores (CLAUDE.md, G1–G15, R1–R5, A6–A10, P1–P3, Q1–Q6, I1). Decisões novas: V1–V14 em `DECISOES.md` (todas pendentes). Arquitetura: `ARQUITETURA.md` §13. Wireframes e mapa de navegação: [RotaVHS Go · Evolução v2 — wireframes](https://claude.ai/artifact/NZi7SAvswZRgkugyTKA2rz) (link em `CONTINUAR-PROJETO.md`).

## V2.1 Plataforma
- **Só o PWA** até ele estar funcional, otimizado e validado em campo (fases F0–F9).
- **Capacitor / Kotlin (Android)** só depois (fase F10). A arquitetura é preparada agora: regras de negócio em `core/` (TS puro) e telas sem acesso direto a APIs do navegador; tudo o que é do aparelho passa por **provedores** com adaptador PWA agora e Android depois.

## V2.2 Diagnóstico do que existe (conferido em 2026-11-24)
**Git e código.** O GitHub (`victor1923hsm/rotavhs-go`, main) está em `33d2322`. A pasta `D:\Projetos Claude\RotaVHS-Go` tem os mesmos 87 arquivos de `src/` (mesmos tamanhos), mas o `.git` dela **não tem nenhum commit** (HEAD aponta para `main` vazia, sem remoto) e faltam `.github/` e `.npmrc`. Arquivos soltos fora do Git: `rotavhs-go-publicacao.bundle` e `ferramentas/figma-telas-v2/`.

**Testes no commit `33d2322`.** Vitest 220/220, scripts 68/68 e contraste 8/8 (tema Sol). Os E2E do histórico (146/146 e demais) não foram repetidos nesta etapa, para poupar RAM.

| Situação | Funcionalidade | Observação |
|---|---|---|
| **Real** | Importação SPX (.xlsx/.csv) no aparelho, em Worker | erros específicos, coordenada suspeita (> 60 km), pacote repetido bloqueia (I1) |
| **Real** | Conferência | agrupamento R3, Stop dividido, "?", busca por parada ou código |
| **Real** | Banco local (Dexie v2), retomada, fila de gravação | situação por pacote (R1) |
| **Real** | Finalizar com resumo e exclusão verificada | Q1/Q2 (inatividade e conferência) |
| **Real** | Mapa MapLibre (OpenFreeMap) com pinos pela cor do Stop; cache de 60 MB + "Limpar mapas" (Q3) | sem trajeto (G5) |
| **Real** | Posição real e GPS contínuo com o app visível | filtros de salto e precisão, estados (P2/P3), só na memória |
| **Real** | Marcar Entregue / Sem sucesso por visita e por pacote, Desfazer 6 s, pular para a próxima | — |
| **Real** | Navegar: abre Google Maps / Waze com o destino | revisão 11 |
| **Real** | Custo estimado de combustível; temas Sol e Noite; offline do app | — |
| **Incompleto** | Etapa 3 | aguarda a validação final no celular |
| **Incompleto** | Wake Lock (tela acesa) | não implementado |
| **Incompleto** | Telas Início, Histórico, Diagnóstico de GPS, Configurações completas | parte disso está em "Alertas e dados" e "Rotas finalizadas" |
| **Incompleto** | Tema "claro" padrão | hoje: Sol (claro de alto contraste) e Noite |
| **Simulado / DEMONSTRAÇÃO** | Otimização | vizinho mais próximo + 2-opt em **linha reta × 1,35**, rotulada DEMONSTRAÇÃO |
| **Simulado / DEMONSTRAÇÃO** | Reotimização dinâmica por entrega e desvio, sugestão automática | P3 |
| **Simulado / DEMONSTRAÇÃO** | Alerta de proximidade | P3 |
| **Simulado / DEMONSTRAÇÃO** | Laboratório de GPS simulado; rota fictícia de exemplo | — |
| **Inexistente** | Distância e trajeto pelas ruas | N2 |
| **Inexistente** | Scanner, carregamento do veículo, memória geográfica, entregas próximas, financeiro (Q4), critérios de otimização | — |

## V2.3 O que vem dos relatórios Spoke e Optiroute (só referência funcional)
Fonte: `D:\Projetos Claude\Analise-APK\reports`. Nada de código, endpoint, chave ou algoritmo interno é copiado ou presumido: os dois apps otimizam **no servidor** e o algoritmo **não pôde ser determinado** (relatório técnico §3).

| Ideia observada | De onde | Como entra no RotaVHS Go (implementação própria) |
|---|---|---|
| Reotimizar **só as pendentes**, preservando as concluídas | Optiroute (`optimizeOnlyPending`, `preserveCompletedSequences`), Spoke (REMAINING_STOPS) | prefixo fixo no motor; concluídas nunca entram na otimização |
| "Reotimizar" × "Atualizar" (manter a ordem, só recalcular ETA) | Spoke | dois botões na Central de otimização |
| Fixar parada (primeira / última / ordem manual) e "pular reordenação" | Spoke (FLEXIBLE/ORDERED/SKIPPED, FIRST/LAST) | restrições de posição no motor; ordem manual arrastando |
| Origem = posição recente, com erro se a posição for velha | Spoke (StaleStartLocation) | origem só com leitura ≤ 30 s e ≤ 50 m (R5); senão pergunta |
| Encaixe na rota, desvio com histerese, recálculo com intervalo mínimo, chegada | Optiroute (RouteSnapper) | pipeline próprio de GPS (ARQUITETURA §13.5), com limites calibrados em campo |
| Optiroute **não filtra precisão** nem suaviza | relatório Optiroute | o Go filtra (precisão, idade, salto) e suaviza só a exibição |
| Grupos no mapa e agrupamento | Spoke | agrupamento automático **de ordem** (nunca une Stops) |
| Scanner de etiqueta; "carregar o veículo" | Spoke, Optiroute | fases F6 (código de barras local; ordem de carga = inversa da entrega) |
| Erros tipados (sem rede, tempo esgotado, sem estrada) | Spoke | erros do `RoutingProvider` com volta ao estimado |
| Spoke **não navega offline** e depende do SDK do Google | relatório Spoke | o Go navega pelo app externo e opera offline pela lista |

## V2.4 Telas (17) — evolução proposta
Barra inferior **mantida com 3 abas** (Pedidos · Rotas · Estatísticas, revisão 6) até a decisão V2. Wireframes no artefato.

| # | Tela | Hoje | Fase | Acesso proposto |
|---|---|---|---|---|
| 1 | Início | não existe (Pedidos faz esse papel) | F0 | abertura do app: rota em andamento, importar, últimas rotas (V2) |
| 2 | Rotas | existe (mapa + lista) | F2 | aba |
| 3 | Importação SPX | existe (I1) | F0 | Início / Pedidos |
| 4 | Conferência de endereços | existe (dentro de Importar) | F0 | depois da importação |
| 5 | Central de otimização | não existe (botão OTIMIZAR) | F2 | Rotas → Otimizar |
| 6 | Comparação antes e depois | parcial (planos SPX × otimizada) | F2 | Central → Comparar |
| 7 | Mapa | existe (dentro de Rotas) | F1/F5 | Rotas, tela cheia |
| 8 | Modo motorista | parcial (Pedidos) | F4 | Iniciar entregas |
| 9 | Scanner de encomendas | não existe | F6 | Modo motorista / Carregamento |
| 10 | Carregamento do veículo | não existe | F6 | Rotas, antes de iniciar |
| 11 | Entregas próximas | não existe (só alerta DEMONSTRAÇÃO) | F3 | Modo motorista |
| 12 | Memória geográfica | não existe | F6 | Configurações (V9) |
| 13 | Histórico | parcial (Rotas finalizadas) | F6 | Estatísticas |
| 14 | Financeiro | só custo estimado (Q4 planejado) | F7 | Estatísticas, **módulo opcional desligado** (V3) |
| 15 | Estatísticas | existe | F7 | aba |
| 16 | Diagnóstico de GPS | não existe (estados no mapa) | F1 | Configurações / toque no ícone de GPS |
| 17 | Configurações | parcial ("Alertas e dados", Preferências) | F0 | engrenagem |

Temas: **Claro**, **Escuro** e **Alta visibilidade (sol)** (V7). O "Sol" atual vira o de alta visibilidade (≥ 7:1, já verificado); Claro e Escuro com contraste ≥ 4,5:1 (WCAG AA) no texto e ≥ 7:1 no número da parada.

## V2.5 Fases, com critérios de aceite
Cada fase termina com testes reais, relatório e **pedido de aprovação**. Fases F1–F4 correspondem às antigas Etapas 4–7 (mesmos requisitos R1–R5, A6–A10, G7, G8), ampliadas.

### F0 · Fundação dos provedores (refatoração sem mudar comportamento)
- **Inclui:** as 10 interfaces (`ARQUITETURA.md` §13.3) e os adaptadores PWA **do que já existe** (localização web, Dexie, navegação externa, matriz estimada, otimizador local, notificação na tela); telas Início e Configurações como casca; temas Claro/Escuro/Alta visibilidade (V7); regra de lint: `screens/` e `components/` não importam APIs do navegador.
- **Aceite:**
  - os mesmos testes verdes (Vitest, scripts, E2E) **sem mudar comportamento**;
  - nenhuma tela acessa `navigator.*`, `indexedDB` ou `fetch` direto (verificação automática);
  - JS inicial ≤ 150 KB gzip;
  - contraste verificado nos 3 temas;
  - 0 requisições novas.

### F1 · GPS real (antiga Etapa 4) + Diagnóstico de GPS
- **Inclui:** pipeline completo (§13.5): aquisição adaptativa, validação, idade, anti-salto, suavização de exibição, estados; Wake Lock opcional; tela Diagnóstico (precisão, idade, frequência, descartes, permissão, Wake Lock) **só na memória**.
- **Aceite:**
  - parado, o ponto não "anda" mais que 10 m na tela (sequências gravadas fictícias);
  - leitura com idade > 30 s nunca vira origem;
  - salto > 55 m/s descartado;
  - "sem sinal desde hh:mm" exibido;
  - GPS pausa com o app fora da tela;
  - nada gravado ou enviado (teste de rede);
  - nenhuma promessa de segundo plano.

### F2 · Motor de otimização local real + Central + Comparação (antiga Etapa 5)
- **Inclui:** motor próprio (§13.4) com critérios **tempo, distância, combustível e inteligente**, agrupamento automático de ordem, origem na posição atual, prefixo de concluídas fixo, paradas fixadas (primeira/última), ordem manual (arrastar, inverter), "Atualizar" sem reordenar; Comparação antes × depois com a **mesma matriz**; tudo **estimado e rotulado** sem motor viário.
- **Aceite:**
  - Stop, pacotes e agrupamentos intactos em 100 % dos casos de teste;
  - nunca pior que a ordem atual pelo mesmo modelo;
  - concluídas e paradas fixadas nunca mudam de posição;
  - ≤ 1 s com 150 paradas no S23 FE, em Worker, sem travar a tela;
  - a ordem só muda com o toque;
  - matriz assimétrica aceita (teste com matriz sintética de mão única).

### F3 · Otimização dinâmica + Entregas próximas (antiga Etapa 6)
- **Inclui:** reotimizar pendentes; sugestão por entrega e por desvio com anti-oscilação (G8); próxima protegida (< 200 m); tela Entregas próximas (pendentes num raio, em linha reta rotulada).
- **Aceite:**
  - 0 sugestões por tremor nos trajetos simulados;
  - 0 mudanças sem toque;
  - intervalo mínimo e ganho mínimo respeitados;
  - recálculo manual sempre atende.

### F4 · Modo motorista e execução (antiga Etapa 7)
- **Inclui:** Modo motorista (parada atual com Stop enorme, botões ≥ 60 px, navegar, entregue/sem sucesso por pacote, próxima); alertas de proximidade reais (A6/A7); "tentar de novo"; finalização.
- **Aceite:**
  - nada marcado por proximidade;
  - histórico intacto com desfazer e correção;
  - alerta respeita A6 (uma vez por aproximação, 30 s entre alertas, sem alerta acima de ~40 km/h ou com precisão > 50 m).

### Fases R-A a R-D (traçado real e motor novo; aprovadas em 2026-11-25 20:53)
| Fase | Situação | Entrega |
|---|---|---|
| R-A · Motor v3 | **em validação: APK teste.8** | motor em Worker, origem na posição atual, cancelar, término livre/destino, só pendentes, linhas retas removidas do mapa |
| R-B · OpenRouteService | após validar a R-A | matriz e traçado pelas ruas, cache, cota, erros, chave no Keystore |
| R-C · Visual V16 (variante B) | após a R-B; telas finais aprovadas antes | mapa principal, barra e cartão flutuantes |
| R-D · Validação | contínua | atual × novo × Spoke, mesmas condições |

### F5 · Ruas reais (antiga N2), só com autorização G4 e consentimento por rota — **requisito OBRIGATÓRIO desde 2026-11-25** (traçado real, `ARQUITETURA.md` §14, decisões R1–R6; critérios de aceite em §14.7, sem dados simulados)
- **Inclui:** `RoutingProvider` e `DistanceMatrixProvider` pelas ruas (candidato: OpenRouteService com chave própria, V4); trajeto desenhado rotulado "pelas ruas"; encaixe do GPS na geometria (`MapMatchingProvider` local); desvio com limiar curto; volta automática ao estimado.
- **Aceite:**
  - só coordenadas saem (nunca códigos, endereços ou planilha), e só depois do consentimento da rota;
  - sem rede, cota ou erro → estimado em ≤ 10 s, com o rótulo trocado;
  - matriz guardada só durante a rota e apagada ao finalizar;
  - consumo medido (requisições e KB por rota).

### F6 · Operação: Scanner, Carregamento, Memória geográfica, Histórico
- **Inclui:**
  - **Scanner:** código de barras do SPX TN pela câmera, decodificação local (`BarcodeDetector` onde existir; biblioteca local só com V8). Acha o pacote e a parada; **não marca entrega sozinho**.
  - **Carregamento:** ordem de carga inversa à de entrega, com conferência por leitura ou toque.
  - **Memória geográfica:** correções de posição feitas por você, guardadas no aparelho (V9).
  - **Histórico:** resumos sem dados identificáveis.
- **Aceite:**
  - leitura 100 % local (teste de rede);
  - pacote lido de outra rota é avisado e nunca adicionado em silêncio;
  - a memória obedece à regra de exclusão decidida em V9.

### F7 · Estatísticas ampliadas + Financeiro opcional (Q4)
- **Inclui:** módulo **desligado por padrão**, fora do fluxo de entrega: receita, abastecimento, despesas, km e lucro **estimado**; centavos inteiros.
- **Aceite:**
  - desligado, nenhuma tela de entrega muda;
  - todos os valores rotulados estimado/informado;
  - sem nomes, endereços ou códigos no histórico financeiro.

### F8 · Instalação Android/iOS (antiga Etapa 8)
Igual à Etapa 8.

### F9 · Campo (antiga Etapa 9)
Igual à Etapa 9, mais:
- calibrar fator urbano, velocidade média, limiares de desvio e aproximação, critério inteligente;
- medir bateria por hora com cada perfil de GPS.

### F10 · Android nativo (Capacitor; Kotlin só onde precisar) — **depois do PWA validado**
- **Inclui:**
  - troca de adaptadores: localização em segundo plano com serviço em primeiro plano;
  - notificações locais;
  - armazenamento (o mesmo IndexedDB no WebView, ou SQLite se medido);
  - câmera nativa no scanner.
- **Aceite:**
  - 0 mudanças em `core/` e nas telas;
  - os mesmos testes do `core/`;
  - o GPS em segundo plano é testado no aparelho antes de qualquer afirmação.

**Dependências entre fases:** F0 → F1 → F2 → F3 → F4. F5 depende de F2 + V4. F6 e F7 podem vir depois de F4, em qualquer ordem. F8 e F9 vêm após F4. F10 vem após F9.

## V2.6 Riscos
- **Ruas reais dependem de terceiro:** cota, disponibilidade e termos podem mudar; a garantia continua sendo o modo estimado.
- **Qualidade do OSM na sua região:** mão única e conversões podem estar faltando no mapa.
- **Scanner:**
  - `BarcodeDetector` não existe no Safari;
  - o iOS exigiria uma biblioteca, que é uma dependência nova (V8).
- **Memória geográfica × regra de exclusão:** guardar correções conflita com "apagar tudo ao finalizar" (V9).
- **Escopo:** 17 telas é muito para um app de rua; a meta de desempenho (G14) e a simplicidade valem mais que completar telas.
