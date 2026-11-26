# RotaVHS Go — Arquitetura proposta

Situação: **proposta, aguardando aprovação** (decisões em `DECISOES.md`). Criada em 2026-11-18 · **Revisão 1** (2026-11-18): adaptadores de GPS e de distâncias, caminho nativo com segundo plano, aviso do mapa offline, orçamento de desempenho, dados temporários.

**2026-11-24:** §13 traz a proposta da Evolução v2 (10 provedores, motor de otimização, pipeline de GPS, custos dos provedores, caminho para o Android), aguardando aprovação.

## 1. Plataforma
**Um único PWA** (React + TypeScript), instalável:
- no **Android**: Chrome, "Instalar app";
- no **iOS**: Safari, "Adicionar à Tela de Início";
- no **Windows**: Edge ou Chrome, "Instalar".

Funciona **offline** nas funções essenciais.

A arquitetura **não fica presa ao uso com a tela ligada** (G1). Tudo o que depende do aparelho (GPS, armazenamento, tela acesa) passa por **adaptadores**. Uma **versão nativa (Capacitor) com rastreamento em segundo plano** (etapa opcional N1) troca só o adaptador de GPS, sem reescrever o núcleo nem as telas. A base PWA continua sendo a principal.

## 2. Pilha (versões já testadas juntas no RotaVHS, em 2026-11)
| Peça | Versão | Por quê |
|---|---|---|
| React + react-dom | 19.3.1 | telas |
| TypeScript | 7.0.2 | tipos fortes nas regras (Stop, locais, status) |
| Vite | 8.3.8 | build leve; `build` + `preview` em vez do `dev` (~430 MB) |
| vite-plugin-pwa (Workbox) | 2.0.0 | service worker e manifest. Lição do RotaVHS: com `injectRegister: false`, é preciso ligar `skipWaiting` e `clientsClaim`, senão a versão nova fica "esperando" |
| Tailwind CSS | 4.3.5 | tokens semânticos, temas Sol/Noite |
| lucide-react | 1.73.0 | ícones |
| maplibre-gl | 6.18.0 | mapa vetorial; tiles do OpenFreeMap (gratuito, sem chave) |
| Dexie | 4.4.7 | IndexedDB |
| read-excel-file | 9.3.14 | leitura de `.xlsx` leve (sem a biblioteca SheetJS, mais pesada) |
| zustand | 5.1.0 | estado leve |
| react-router | 8.5.1 | navegação |
| Vitest + fake-indexeddb | 5.1.0 · 6.2.8 | testes |

Nada é instalado antes da aprovação da Etapa 1. As versões serão conferidas de novo no `npm install`, com versões exatas e sem `^`.

## 3. Camadas
```
src/
  core/        TS puro, sem React, sem navegador: Stop, importação SPX, unidades de visita, custo, solver,
               política de recálculo, distâncias. 100 % testável em Node.
  data/        Dexie (schema v1 próprio, independente do RotaVHS), repositórios.
  platform/    adaptadores do aparelho, todos atrás de interfaces:
                 location/  LocationProvider { start, stop, onFix, onStatus, capabilities: { background } }
                            web.ts (PWA, agora) · native.ts (Capacitor, N1, futuro)
                 wakelock, storage persistente, leitura de planilha.
  core/distance/  DistanceMatrixProvider { matrix(pontos) → { dist, tempo, tipo: 'estimada' | 'ruas', origem } }
                  estimated.ts (local, offline, padrão e garantia) · road.ts (pelas ruas, N2, só online + autorizado)
  features/    casos de uso: rota ativa, recálculo, marcação, Worker de otimização.
  components/  ui/ (botões, cartões, folha inferior) e domain/ (StopBadge, StopRow, MapPins).
  screens/     Início, Conferência, Rota Ativa, Detalhes da Parada, Resumo.
  mock/        (Etapa 1) dados FICTÍCIOS do modelo de teste; removido do caminho real a partir da Etapa 2.
```
- **Web Worker:** otimização e leitura da planilha fora da thread da tela, criado só quando precisa e encerrado ao terminar.
- **Service worker:** app inteiro em precache (inclusive o Worker); tiles do mapa em cache de execução com limite de tamanho.

## 3b. Localização e demonstração dinâmica (P2/P3, protótipo)
- `src/platform/localizacao/`: `LocationProvider` (`web.ts` = Geolocation API; `simulado.ts` = laboratório). A versão nativa (N1) troca só a implementação.
- `src/app/localizacao.ts`: estado só na memória, filtros (salto, precisão), estados, `origemConfiavel()`, política de bateria.
- `src/app/dinamica.ts` (DEMONSTRAÇÃO): origem pela posição perto da rota, desvio, alerta de proximidade. `estado.ts` não conhece o GPS: recebe só uma função de origem.
- `src/core/ordem.ts`: `Distancia = (de, para) => km`, pronta para matriz **assimétrica** pelas ruas (G15/N2).
- Eventos por pacote (`EventoParada.pacote`) para a entrega parcial; o evento da visita inteira limpa a marcação por pacote.

## 4. Dados (Dexie, schema **v2**, Etapa 3 concluída)
Banco `rotavhsgo` (IndexedDB), durabilidade `strict`. Interface única `src/platform/armazenamento/tipos.ts` (implementações: `dexie.ts` e `memoria.ts`).

| Tabela | Conteúdo | Ao finalizar |
|---|---|---|
| `routes` | status (`ativa` / `finalizando`), fonte, ordem da SPX, **sessão** (fase, ordem atual, parada atual, iniciada em, **plano ativo**, origem da otimização, **estado dos alertas** sem posição) | **apagada** |
| `stops` | parada com Stop original (ou null = "?"), partes de Stop dividido, endereço, coordenada, códigos SPX | **apagada** |
| `packages` | código SPX por visita | **apagada** |
| `stopEvents` | histórico só de inclusão **por pacote** (`pacote`, `pacoteIdx`; marcar, desfazer, correção). v1 sem pacote = visita inteira | **apagada** |
| `plans` (v2) | SPX + 5 planos recentes (ordem, km estimado, tipo de origem — sem coordenadas) | **apagada** |
| `distanceCache` | matriz da rota (futuro) | **apagada** |
| `importDrafts` (v2) | conferência em andamento (`id = atual`) | apagada ao confirmar/descartar a importação |
| `routeSummaries` | resumo: contagens de visitas e pacotes (entregues, sem sucesso, **pendentes = não entregues**), duração, km, litros, custo (centavos), `limpeza` pendente/concluída. **Sem** endereços, códigos, coordenadas, ids de parada ou nome de arquivo | **fica** até você apagar |
| `settings` | veículo (combustível, preço em centavos, consumo), preferências (alertas ligados), pedido de `storage.persist()` | fica |

**Os ids de parada contêm o endereço normalizado** (vêm da importação): por isso ordens, planos, eventos e o estado dos alertas também são apagados ao finalizar. A situação da visita é derivada dos pacotes (pendente enquanto houver pacote pendente).

**Gravação:** fila única, na ordem; marcação + sessão numa só transação; falha → a fila para, avisa e tenta de novo (nada descartado). **Finalização:** validar → gravar resumo (limpeza pendente) + rota "finalizando" → conferir → apagar → conferir → "concluída"; interrupção retomada na abertura seguinte. **Migração v1→v2:** `migrarV1paraV2` (sem apagar o banco).

Sessão recuperável: a rota ativa, a situação de cada pacote, a ordem, o plano ativo, a parada atual, os alertas e a conferência voltam ao reabrir o app (também sem internet). Não há recuperação se os dados do navegador forem apagados.

Implementação (Etapa 3): banco `rotavhsgo`; interface `src/platform/armazenamento/tipos.ts` (a versão nativa troca só a implementação); `stopEvents` indexado por `rotaId`; `settings` guarda o veículo e o pedido de persistência; o **tema** fica no `localStorage` (lido antes de desenhar). Sem IndexedDB, o app usa a memória e avisa que a rota vale só enquanto estiver aberto. Rota trocada sem marcações é apagada; com marcações vira resumo "substituída".

## 5. GPS: o que um PWA consegue (Android × iOS)
| Situação | Android (Chrome / PWA instalado) | iOS (Safari / Tela de Início) |
|---|---|---|
| App aberto e visível | ✔ `watchPosition`, alta precisão | ✔ `watchPosition` |
| Tela apagando sozinha | evitável com **Screen Wake Lock** (pedido de novo ao voltar) | Wake Lock suportado a partir do iOS 16.4 em apps da Tela de Início (**testar no aparelho**) |
| App em segundo plano / tela bloqueada | **não confiável**: atualizações param ou ficam raras | **não suportado** de forma confiável: o WebKit não mantém a página rodando com a tela apagada |
| Sincronização em segundo plano | parcial | não suportada |
| Permissão negada uma vez | pode ser reativada nas configurações do site | relatos de bloqueio que exige reinstalar o app (testar) |

**Projeto:**
- O modo principal é o **app aberto e visível**: botão "Iniciar GPS / Pausar GPS" e Wake Lock opcional durante a rota.
- Leituras com precisão pior que ~50 m não disparam decisões, e um deslocamento só conta acima de ~20 m (anti-tremor).
- Ao perder o sinal, o app mostra "sem sinal desde hh:mm" e usa a última posição boa, sem inventar posição.
- Para poupar bateria, o GPS para quando o app sai da tela e volta quando ela volta (`visibilitychange`). Sem rota ativa, o GPS fica desligado.
- **No PWA, nada promete GPS em segundo plano.**

**Caminho para o segundo plano: versão nativa (N1, opcional, futura)**
- **Mesmo código:** o app web roda dentro de uma casca Capacitor e só o `LocationProvider` muda (`native.ts`).
- **Android:** serviço em primeiro plano com notificação fixa ("RotaVHS Go está usando sua localização"), permissão de localização em segundo plano (Android 10+), e você precisa liberar o app na otimização de bateria da Samsung. Instalação direta pelo APK, sem loja.
- **iOS:** permissão "Sempre" + modo de segundo plano de localização. **Instalar no iPhone exige um Mac com Xcode**, e sem conta paga de desenvolvedor a instalação expira em 7 dias. Isso entra em conflito com "sem serviço pago" e exigirá decisão sua.
- **Plugin:** de código aberto (ex.: `@capacitor-community/background-geolocation`, MIT). Plugins comerciais exigem licença paga e ficam fora.
- **Bateria:** segundo plano custa mais; o filtro de movimento e a precisão equilibrada continuam valendo.
- Tudo isso deve ser **confirmado na hora de planejar a N1**: versões e regras de lojas mudam.

## 6. Offline
| Função | Offline? | Como |
|---|---|---|
| Abrir o app, rota importada, paradas, busca pelo Stop | ✔ | precache + IndexedDB |
| Importar planilha | ✔ | leitura local (Worker) |
| Registrar entregas e desfazer | ✔ | IndexedDB, só inclusão |
| Otimização aproximada | ✔ | solver local no Worker |
| Recuperar a sessão depois de reiniciar | ✔ | estado da rota no IndexedDB; `navigator.storage.persist()` pedido na 1ª rota |
| **Mapa** | **parcial, sem garantia de cobertura** | tiles já vistos ficam em cache, até **60 MB** (descarta os mais antigos). **Isso NÃO garante a sua região de entregas**: só existe o que já apareceu na tela, nos zooms usados; área nova, zoom diferente ou tile descartado ficam **cinza, com o aviso "mapa sem conexão" e o botão "Ver lista"**. A operação inteira continua pela **lista**. Futuro: "baixar mapa da área da rota", com o tamanho estimado mostrado antes, de preferência no Wi-Fi, também sem garantia total |
| Distância pelas ruas / ETA real | ✘ | exige provedor pelas ruas (N2, só online e autorizado); offline, sempre a estimada, com o rótulo certo |

## 7. Distâncias: quatro tipos, sempre rotulados
| Tipo | Como é obtido | Como aparece |
|---|---|---|
| **Linha reta** | haversine | "≈ 350 m em linha reta" (só para proximidade) |
| **Estimada pelo modelo** | linha reta × fator urbano (1,35, calibrável) | "≈ 12 km estimados" |
| **Pelas ruas** | serviço de rotas (só com G4 autorizada) | "12,4 km pelas ruas" |
| **ETA** | tempo pelas ruas, ou estimado por velocidade média | "≈ 35 min (estimado)" |

**No mapa:** sem serviço de rotas, **não há linha de trajeto**. Aparecem os pinos numerados pelo **Stop** e a próxima parada em destaque. Uma ligação tracejada e discreta de "ordem de visita" só existe com a legenda "ordem, não é o caminho" (G5).

## 8. Roteamento: comparativo das alternativas gratuitas e de código aberto
| Opção | Qualidade | Internet | Privacidade | Limite gratuito | Memória | Offline | Licença |
|---|---|---|---|---|---|---|---|
| **Cálculo local** (heurística do RotaVHS: 2-opt/Or-opt, matriz estimada) | boa **no modelo**; ignora mão única e travessias | não | ✔ nada sai do aparelho | ilimitado | ~1–5 MB | ✔ | nosso código |
| **OpenRouteService** (API) | ruas reais, mão única, matriz | sim | ✘ envia coordenadas a terceiros (Heidelberg) | quotas diárias por chave (antes ~2.000 rotas e ~500 matrizes/dia; o plano atual fala em "8.000+ requisições/dia" somadas). **Conferir na hora** | baixa no app | ✘ | serviço gratuito; motor GPL |
| **OSRM público** (FOSSGIS) | ruas reais | sim | ✘ envia coordenadas | servidor de demonstração: **proibido uso pesado**, sem garantias | baixa | ✘ | BSD-2 |
| **GraphHopper** (API) | ruas reais | sim | ✘ envia coordenadas | 500 créditos/dia, **não comercial**, até 5 pontos por rota | baixa | ✘ | motor Apache-2.0 |
| **OSRM / Valhalla / GraphHopper hospedados por nós** | ruas reais | rede local ou servidor | ✔ (servidor próprio) | ilimitado | preparo de vários GB; servidor 1–4 GB | só com servidor | BSD-2 / MIT / Apache-2.0 |
| **Valhalla no aparelho** (tiles de rota offline) | ruas reais | não | ✔ | ilimitado | pesado para o celular; integração complexa | ✔ | MIT |

**Recomendação (G4):**
- **cálculo local** como padrão e como garantia;
- **nenhum serviço externo** sem a sua autorização explícita;
- no futuro, se autorizado, **OpenRouteService** com chave própria, como opção por rota, consentida e rotulada ("enviar as coordenadas desta rota ao ORS?"), só para a matriz e o desenho do trajeto.

Servidor próprio (OSRM/Valhalla) contraria a regra de RAM e a de "sem deploy".

**Preparado desde já para distâncias pelas ruas (N2):**
- O solver recebe **uma matriz de arcos**, de onde quer que ela venha. O núcleo reaproveitado do RotaVHS (5.3) **já aceita matriz assimétrica** (mão única: ida ≠ volta), porque a inversão de trechos é calculada pelos dois sentidos.
- **`DistanceMatrixProvider`:**
  - `estimated` (local) **sempre** disponível;
  - `road` só quando: há conexão **e** você autorizou o serviço **e** consentiu para esta rota.
- **Volta automática ao estimado** sem rede, com cota esgotada, erro ou demora, e o rótulo da distância muda junto. Matriz mista (parte pelas ruas, parte estimada) é rotulada "estimada".
- **Poupar dados móveis:**
  - uma matriz por rota, só entre as unidades de visita, guardada no aparelho durante a rota;
  - o recálculo reaproveita a matriz;
  - matrizes grandes são divididas conforme os limites do provedor (conferir na hora);
  - o cache é apagado ao finalizar (G12).
- A comparação com a ordem SPX usa **sempre a mesma matriz** para as duas ordens.

**Exigência G15: otimização futura pelas ruas reais**
- **Mão única:** matriz **assimétrica** (custo A→B ≠ B→A). O solver precisa aceitá-la desde o início, e o núcleo da 5.3 já aceita.
- **Retornos** (conversões em U, lado da rua): uma matriz simples entre paradas não sabe por qual lado você chegou. A extensão prevista é **dois nós por parada** (um por sentido ou lado da via), com custo de retorno entre eles. É o mesmo solver, com o dobro de nós e a restrição de visitar um dos dois.
- **Restrições de circulação** (conversões proibidas, ruas restritas ao veículo, condomínios, acessos): ficam no **motor de rotas** que gera a matriz (OSRM, Valhalla, GraphHopper e ORS respeitam mão única e restrições de conversão do OpenStreetMap), com perfil do veículo e ruas a evitar como parâmetros.
- **Dados:** a qualidade depende do OpenStreetMap da sua região (mão única e conversões cadastradas). Erros no mapa viram erros na rota: validar com as suas rotas reais (Etapa 9).
- **Implementação:** etapa opcional **N2**, só com autorização (G4), porque exige um serviço externo ou servidor próprio. Até lá, o cálculo é local e estimado, com o rótulo certo.

## 9. Reaproveitamento do RotaVHS (auditado sem modificar)
Origem: tag `pausa-2026-11-18-aprovado` (`4305da3`), exceto onde indicado. **Cópia isolada** com os testes, registrando origem e commit no cabeçalho. Nada é importado diretamente da pasta do RotaVHS.

| Módulo do RotaVHS | Linhas (código) | Testes | Uso no Go | Etapa |
|---|---|---|---|---|
| `core/import` (cabeçalho, mapeamento SPX, Stop/Sequence D1/D2, duplicidades) | ~600 | 3 arquivos | importador SPX | 2 |
| `core/address` (normalização, quadra/lote, porta) | ~310 | 1 | conferência e mesma porta | 2 |
| `core/route/labels.ts`, `conference-list.ts` | ~260 | 1 | "?" × "casa sem nº", partes "endereço i de n" | 2 |
| `platform/spreadsheet.ts` (read-excel-file, CSV, SHA-256) | parte de ~435 | 1 | leitura local | 2 |
| `scripts/privacidade/verificar.mjs` + pre-commit | ~1 arquivo | 65 testes | proteger o Git desde o 1º commit | 1 |
| `core/optimize/units.ts`, `spx-order.ts`, `cost.ts` | ~600 | 3 | unidades de visita, ordem original, custo | 5 |
| `core/optimize/solver.ts`, `plan.ts`, `exact.ts`, `synthetic.ts` + Worker | ~800 | 3 | solver | 5. **Origem `pausa-2026-11-18-completo`: a 5.3 NÃO foi aprovada no RotaVHS**; entra no Go como experimental, com aprovação própria |
| `data/stop-events.ts` (só inclusão, desfazer, correção) | parte de ~480 | 1 | marcação | 7 |
| `core/geo` (haversine, projeção local) | ~170 | 3 | distâncias | 4 |
| Motor de alertas (`core/proximity`, `driving`, `alerts`) | ~700 | 5 | **fora do escopo inicial**; avaliar depois | — |

## 10. Desempenho como prioridade (G14)
| Meta | Como |
|---|---|
| **Abertura rápida**: reabrir em cache ≤ 1,5 s até a tela utilizável (S23 FE, a medir) | app shell em precache; JS inicial ≤ 150 KB gzip; **MapLibre carregado só ao entrar na Rota Ativa**; fonte do sistema (0 KB); sem imagens pesadas |
| **RAM baixa**: ~30–60 MB sem mapa, ≤ 150 MB com mapa (a medir) | um mapa só; listas virtualizadas acima de ~100 itens; Worker só quando calcula; sem bibliotecas de animação |
| **Bateria** | GPS em alta precisão só com a rota ativa e o app visível; filtro de movimento; pausa fora da tela; recálculo automático no máximo 1 por minuto; Wake Lock só se você ligar |
| **Dados móveis** | **0 requisições** além dos tiles do mapa (e da N2, se autorizada); tiles em cache; atualização do app só ao abrir (o service worker baixa só o que mudou); "baixar mapa da área" de preferência no Wi-Fi |

Os números entram no relatório de cada etapa, a partir da Etapa 1 no PC e na 8/9 no celular.

## 11. Dados do destinatário e custo (G12, revisões 4 e 5)
- **Nome, telefone e observação** do destinatário **não fazem parte do app** (revisão 5): a planilha da SPX não os traz. Não há tabela para eles.
- Planilhas reais continuam fora do Git, e os testes usam só dados fictícios.
- **Custo estimado da rota:** `litros = km estimados ÷ consumo (km/L)`; `custo = litros × preço do litro`; custo por km e por entrega. Cálculo em centavos inteiros, no `core/` (TS puro, testável), sempre rotulado **estimado**. Os km vêm da matriz da rota (estimada ou pelas ruas, com o tipo).

## 12. Orçamento de recursos (estimativas, a medir)
| Item | Estimativa |
|---|---|
| Pacote JS inicial do app (sem o mapa) | **meta ≤ 150 KB gzip** (G14); estimativa ~120–200 KB, a medir na Etapa 1 |
| MapLibre GL | ~220–250 KB gzip |
| Página com o mapa aberto, celular | ~80–150 MB de RAM (WebGL + tiles), **a medir no S23 FE** |
| Worker de otimização (200 paradas) | ~1–4 MB, encerrado ao terminar (medido no RotaVHS: 1,2 MB) |
| Cache de tiles | limite proposto de 60 MB, com descarte dos mais antigos |
| IndexedDB por rota | < 1 MB |
| GPS | o maior consumo de bateria: alta precisão só com a rota ativa e o app visível |
| Tela acesa (Wake Lock, brilho alto no sol) | o outro grande consumo; por isso o Wake Lock é opcional |
| Dados móveis por rota | tiles da área na 1ª vez: estimativa de alguns MB a dezenas de MB, conforme área e zoom (**a medir**); depois, do cache |


## 13. Evolução v2 — provedores, motores e caminho para o Android (**proposta de 2026-11-24, aguardando aprovação**)

### 13.1 Atual × proposta
| Aspecto | Hoje (`33d2322`) | Proposta v2 |
|---|---|---|
| Acesso ao aparelho | `platform/localizacao` (interface `LocationProvider`), `platform/armazenamento` (interface `Armazenamento`); o resto chamado direto (`navigator.storage`, `fetch` do mapa, links de navegação em `core/navegar.ts`, cache em `platform/mapaCache.ts`) | **10 provedores** em `src/providers/<nome>/` com `tipos.ts` (interface) + `pwa/` (agora) + `android/` (F10); telas e `core/` só conhecem as interfaces |
| Otimização | `core/ordem.ts`: vizinho mais próximo + 2-opt, função `Distancia` (pronta para assimetria); chamada na thread da tela; DEMONSTRAÇÃO | `OptimizationEngine` em Worker, com critérios, restrições (prefixo, fixadas, grupos) e matriz de tempo **e** distância |
| Distâncias | `core/geo.ts` (haversine × 1,35) | `DistanceMatrixProvider`: `estimada` (sempre) e `ruas` (F5, autorizado) |
| GPS | filtros de salto e precisão, estados, origem confiável (`app/localizacao.ts`) | pipeline em etapas (§13.5) + Diagnóstico |
| Estado | zustand (`app/estado.ts`, ~24 KB, mistura regras e estado) | regras puras extraídas para `core/` (sessão, sequência, planos); a loja só orquestra |
| Navegação | deep links Google Maps/Waze | `NavigationProvider` (mesmo comportamento; Android: intents) |

### 13.2 Camadas (alvo)
```
src/core/          regras puras (TS, sem navegador): parada, pacotes, importação, sequência, motor de otimização,
                   pipeline de GPS (funções puras sobre leituras), alertas, custo, resumo, retenção
src/providers/     interfaces + adaptadores (pwa/ agora, android/ depois)
src/app/           orquestração (zustand), casos de uso, composição dos provedores (um único ponto: app/provedores.ts)
src/screens/, src/components/   UI; só falam com app/ e com tipos do core
src/workers/       otimização e leitura da planilha
```
Regra verificável (F0): `screens/`, `components/` e `core/` não importam `providers/*/pwa` nem usam `navigator`, `window.indexedDB`, `fetch`.

### 13.3 As 10 interfaces (esboço; nomes finais na F0)
| Interface | Responsabilidade | Adaptador PWA (agora) | Adaptador Android (F10) |
|---|---|---|---|
| `LocationProvider` | `observar(perfil, aoLer, aoErro)`, `permissao()`, `capabilities { background, heading }` | Geolocation API (`watchPosition`) — já existe | Capacitor + serviço em primeiro plano (segundo plano real) |
| `RoutingProvider` | `rota(pontos, perfil) → { geometria, km, min, tipo:'ruas', erro? }` | nenhum (estimado) até F5; ORS se V4 | o mesmo HTTP (ou nativo, se houver) |
| `DistanceMatrixProvider` | `matriz(pontos, perfil) → { km[][], min[][], tipo:'estimada'|'ruas', parcial }` assimétrica | estimada local; ruas por blocos (F5) | igual |
| `OptimizationEngine` | `otimizar(pedido) → { ordem, custo, criterio, avisos }` em Worker, cancelável | motor próprio em Worker | o mesmo JS no WebView |
| `NavigationProvider` | `abrir(destino, app)`, `disponiveis()` | links Google Maps / Waze (revisão 11) | intents Android |
| `GeocodingProvider` | `buscar(texto)`, `reverso(ponto)` — **só por ação sua, um endereço por vez** | nenhum por padrão; opcional com consentimento (V10) | igual |
| `MapMatchingProvider` | `encaixar(leitura, geometria) → { ponto, desvioM, progresso, trechoIdx }` | **local**, sobre a geometria pelas ruas (F5); sem geometria = distância ao trecho reto | igual |
| `ProximityEngine` | `avaliar(leitura, pendentes, estado) → alerta?` (A6/A7) | local (já existe em `core/alertas.ts`) | + notificação nativa |
| `StorageProvider` | rotas, paradas, eventos, planos, resumos, configurações, exclusão verificada | Dexie (já existe) | o mesmo no WebView, ou SQLite se medir melhor |
| `NotificationProvider` | aviso na tela, vibração, som; notificação do sistema quando permitido | `Vibration` + aviso na tela (sem push, sem servidor) | notificações locais nativas |

Todas têm uma implementação **em memória/simulada** para testes (como `memoria.ts` e `simulado.ts` hoje), sempre rotulada quando aparece na tela.

### 13.4 Motor de otimização (implementação própria)
**Entrada.**
- Visitas pendentes (unidades de visita, nunca Stops unidos), origem e critério.
- Restrições de posição: concluídas fora do problema, próxima protegida, primeira/última, ordem manual travada.
- Matriz de **distância** e de **tempo** (assimétricas).
- Perfil do veículo: consumo e velocidade média.

**Critérios (custo de um arco i→j):**

| Critério | Custo | Observação |
|---|---|---|
| Menor tempo | `min[i][j] + serviço` | serviço por parada configurável (padrão 2 min) |
| Menor distância | `km[i][j]` | — |
| Economia de combustível | `km[i][j] / consumo` (litros); com ruas, penalidade leve por retorno | tende ao de distância; só difere com ruas e retornos (dito na tela) |
| Inteligente | `α·tempo + β·km + penalidades` (retorno em U, voltar a uma região já atendida) | pesos calibrados na F9; sem motor viário, equivale a tempo estimado |

**Algoritmo.**
1. Construção por inserção mais barata a partir da origem.
2. Melhoria local: 2-opt com custo de trecho invertido calculado nos dois sentidos (já preparado em `core/ordem.ts`), Or-opt (mover 1–3 visitas) e troca, com limite de tempo (ex.: 600 ms) e de voltas.
3. Escolhe a melhor de N partidas determinísticas (semente fixa: o mesmo pedido gera o mesmo resultado).
4. **Garantia:** se não for melhor que a ordem atual pelo mesmo custo, devolve a atual ("ordem já é boa").

**Agrupamento automático.**
- Visitas a ≤ ~40 m umas das outras (calibrável) viram um **bloco de ordem** que o motor move junto.
- Não une Stops nem pacotes.
- Na tela: "3 paradas próximas".

**Sem motor viário.**
- Distância: linha reta × fator urbano.
- Tempo: km ÷ velocidade média configurada.
- Tudo rotulado "estimado".

**Expansão G15.** Dois nós por parada (lado da rua) e retornos entram como nós e arcos a mais, sem mudar a interface.

**Livres e abertos avaliados como dependência (não adotados agora):**
- **VROOM:** BSD-2, C++; resolve TSP/VRP com matriz própria. Exigiria servidor ou WASM, o que contraria "sem servidor/baixo consumo". Fica como referência de modelo.
- **jsprit:** Java, servidor.
- **OR-Tools:** C++/Python, servidor.

Para 1 veículo e ≤ 250 paradas, um motor próprio em TS no Worker é suficiente e testável. Medir na F2.

### 13.5 Pipeline de GPS (PWA)
| Etapa | Regra proposta (valores próprios, calibrados em campo) |
|---|---|
| Aquisição adaptativa | alta precisão só com rota ativa **e** app visível; `maximumAge` 0–5 s; parado (< 1 m/s por 60 s): interface atualiza menos; pausa em `visibilitychange` |
| Validação | descarta lat/lon não finitos, precisão > 100 m (já: `DESCARTE_M`), e leitura com data no futuro |
| Idade | > 30 s = **velha** (não vira origem, não dispara alerta); > 30 s sem leitura = "sem sinal desde hh:mm" |
| Anti-salto | velocidade implícita > 55 m/s descartada (já: `SALTO_MS`) |
| Suavização | média ponderada pela precisão (ou Kalman 1-D por eixo) **só para desenhar o ponto**; decisões usam a leitura validada |
| Encaixe (map matching) | só com geometria pelas ruas (F5): projeção no segmento mais próximo numa janela à frente do último trecho, índice que só avança; sem geometria: distância ao trecho reto até a próxima parada |
| Desvio | sem ruas: > 300 m por > 2 min (G8); com ruas: limiar curto (ex.: 40 m por 10 s) para **redesenhar o trajeto**, nunca para mudar a ordem sozinho |
| Aproximação | A6 (raio, histerese de 200 m e 10 min, 30 s entre alertas, sem alerta > ~40 km/h ou precisão > 50 m) |
| Chegada | ≤ ~50 m da parada **só destaca** a parada; **nunca marca entrega** |
| Diagnóstico | mostra precisão, idade, intervalo médio, descartes por motivo, estado da permissão e do Wake Lock — só na memória |

### 13.6 Provedores externos: viabilidade e custos (conferido em 2026-11-24; reconferir antes da F5)
| Serviço | Custo / limites | Privacidade | Uso no Go |
|---|---|---|---|
| **OpenRouteService** (API pública) | plano Standard gratuito: Directions 2.000/dia, Matrix 500/dia; matriz até 3.500 elementos por pedido (ex.: 50 × 50) | coordenadas vão a Heidelberg (HeiGIT) | **candidato da F5** (V4): rota de 150 paradas ≈ 9 pedidos de matriz 50 × 50 |
| **GraphHopper** (API) | gratuito: 500 créditos/dia, **só não comercial**, 5 pontos por rota; Matrix custa origens × destinos ÷ 2 créditos; pagos a partir de ~€69/mês | coordenadas à GraphHopper (Alemanha) | o gratuito não serve: uso de trabalho = comercial; a matriz de 150 × 150 custa ~11.250 créditos |
| **OSRM público** (FOSSGIS) | servidor de demonstração; proíbe uso pesado e é sem garantia | pedidos ficam em log do servidor | **não usar** em produção |
| OSRM / Valhalla / GraphHopper / VROOM hospedados por você | grátis (código aberto) | ✔ | contraria "sem servidor/sem Docker/16 GB"; fora |
| **Nominatim** (OSM) | máx. 1 pedido/s; em massa desencorajado; pede não enviar dados pessoais | — | **não** para a planilha (que já tem coordenadas); no máximo um endereço por ação sua (V10) |
| **OpenFreeMap** (tiles) | gratuito, sem chave e sem limites declarados, uso comercial permitido, sem garantia | só pedidos de imagens do mapa | mantido (já em uso) |
| **Google Route Optimization / Navigation SDK** | cobrado por envio; SDK de navegação só nativo | Google | fora ("sem serviço pago") |

**Regra de dados para qualquer provedor externo:**
- O que sai: só a lista de coordenadas da rota (ou de um par de pontos), sem códigos SPX, endereços, Stops nem nome de arquivo.
- Quando sai: depois do consentimento da rota.
- Nunca sai: planilhas e dados pessoais.
- A resposta fica em memória ou no cache da rota e é apagada ao finalizar.

### 13.7 Caminho para o Android (F10)
- **Casca:** Capacitor, com o mesmo build do PWA no WebView.
- **Trocas:** só os adaptadores, montados em `app/provedores.ts` conforme a plataforma:
  - `LocationProvider`: segundo plano com serviço em primeiro plano e notificação fixa;
  - `NotificationProvider`;
  - `NavigationProvider` (intents);
  - scanner com câmera nativa;
  - `StorageProvider`, se medido.
- **Kotlin** só em plugin próprio quando nenhum plugin aberto atender.
- **Não muda:** `core/`, telas e regras. Os testes do `core/` rodam iguais.

## 14. Traçado real pelas ruas (requisito obrigatório de 2026-11-25) — **decisões R1–R6 aprovadas em 2026-11-25 com ajustes (`DECISOES.md`); implementação aguardando aprovação do plano §15**

**Requisito do usuário:**
- Nada de linhas retas ligando as paradas no mapa.
- O traçado acompanha ruas, avenidas, curvas, cruzamentos e rotatórias, como no Spoke.
- Respeita mão única, acessos e restrições.
- Origem na posição atual; distância total e tempo estimados.
- Trechos concluídos e pendentes diferenciados; destaque até a próxima entrega.
- Recalcula os trechos pendentes ao reotimizar.
- Até 500 paradas.
- Geometria guardada no aparelho para consulta offline.
- Sem serviço disponível, **nunca** mostra linha reta como se fosse percurso.
- Sem enviar dados pessoais nem coordenadas sem autorização.
- **Não vale como concluído com dados simulados.**

### 14.1 Três responsabilidades separadas
| # | Responsabilidade | Interface | Onde roda | O que usa |
|---|---|---|---|---|
| 1 | **Matriz** de distância e tempo pela malha viária (assimétrica: mão única conta) | `DistanceMatrixProvider` | serviço de roteamento (§14.3) | coordenadas das visitas + posição atual |
| 2 | **Otimização** da sequência | `OptimizationEngine` (já existe: `core/otimizacao/motor.ts`) | no aparelho (Worker) | só a matriz e as regras (concluídas fixas, fixadas, grupos) |
| 3 | **Geometria** do percurso para o mapa | `RouteGeometryProvider` (novo) | serviço de roteamento; **cache no aparelho** | pares consecutivos da ordem escolhida |

- A otimização **não** depende da geometria.
- O traçado de cada trecho só é pedido **depois** que a ordem é aceita, com o toque do usuário.
- O mesmo serviço pode atender 1 e 3, mas os adaptadores são separados, para trocar de provedor sem mexer no motor.

### 14.2 Como funciona no app
- **Origem:** nó 0 = posição atual (leitura ≤ 30 s e precisão ≤ 50 m). Sem posição confiável: 1ª parada pendente.
- **Matriz:**
  - pedida em blocos (ex.: 50 × 70), montada no aparelho e guardada com a rota em uso;
  - ao reotimizar, só a **linha da posição atual** é pedida de novo (1 × N), não a matriz inteira.
- **Trechos (legs):** a geometria é guardada **por par** (origem → destino), com a chave = coordenadas arredondadas + perfil + versão dos dados do mapa.
  - Ao reordenar, só os pares novos são pedidos; os que não mudaram vêm do cache.
  - Concluídos: cor apagada, contínua.
  - Pendentes: cor da rota.
  - Até a próxima entrega: destaque, mais grosso e com borda.
- **Totais:** distância e tempo somados dos trechos pendentes, **pelas ruas**. ETA = tempo pelas ruas + parada por entrega, sempre rotulado "estimado".
- **Offline:** a geometria e a matriz da rota em uso ficam no IndexedDB e o mapa usa o que estiver guardado.
  - Trecho sem geometria guardada: **não** é desenhado.
  - Nesse caso, o mapa mostra só os pinos e o aviso "Trajeto pelas ruas indisponível para N trechos".
  - A lista continua funcionando.
  - **O tracejado reto atual ("ordem, não é o caminho") sai do mapa.**
- **Sem serviço:** a ordem pode ser calculada pela estimativa local (linha reta × fator urbano), sempre rotulada **"aproximada, sem ruas"**. Nenhuma linha reta é desenhada.
- **Privacidade:** a rota em uso guarda matriz e geometria, apagadas ao finalizar, como os endereços (regra definitiva da Etapa 3).

### 14.3 Motores avaliados (conferido em 2026-11-25)
| Motor | Matriz | Geometria | Restrições | Observações |
|---|---|---|---|---|
| **OSRM** (C++, código aberto) | `/table`, rapidíssimo | `/route` | mão única e restrições de conversão do OSM; lado da rua por `approaches` | **Prós:** o mais rápido. **Contras:** pré-processamento pesado em memória (planeta inteiro: ~130 GB só para carro); perfil por pré-processamento (trocar o perfil = reprocessar); limite de matriz configurável (padrão 100 × 100) |
| **Valhalla** (C++, código aberto) | `sources_to_targets` | `/route` | as do OSM; **custos dinâmicos** (carro, **moto**, caminhão) sem reprocessar; lado da rua | **Prós:** pouca memória (blocos em disco). **Contras:** matriz mais lenta que a do OSRM; limites de locais configuráveis (padrão baixo, ajustável) |
| **GraphHopper** (Java, código aberto) | **não** na versão aberta (a Matrix API é comercial) | `/route` | as do OSM | **Contras:** API paga para uso comercial (gratuita só não comercial). Para matriz própria, só com código extra |
| **OpenRouteService** (sobre GraphHopper, código aberto + serviço público gratuito) | `/matrix` | `/directions` | as do OSM | **Público:** matriz até 3.500 pares por pedido e 500 pedidos/dia; rota até 50 pontos por pedido e 2.000 pedidos/dia; sem garantia de serviço. **Hospedado por você:** sem esses limites |

Todos usam dados do **OpenStreetMap**. A qualidade de mão única, retornos e acessos depende de como a sua região está mapeada no OSM; isso precisa ser conferido com rotas reais.

### 14.4 Opções de hospedagem e custos
| Opção | Custo | Privacidade (o que sai) | Limites para 500 paradas | Trabalho de manutenção |
|---|---|---|---|---|
| **A. OpenRouteService público** (chave sua, digitada no app, nunca no código) | **R$ 0** | coordenadas das paradas e da posição vão para a HeiGIT (Alemanha); nada de endereço ou código | **Matriz:** 501 × 501 ≈ 251 mil pares ≈ 72 pedidos (cabe em 500/dia, cerca de 6 rotas cheias por dia; ~2 min por causa de 40/min). **Geometria:** ≈ 11 pedidos | nenhum |
| **B. Servidor próprio (VPS)** com OSRM ou Valhalla e o recorte OSM da sua região | **≈ € 4,5 a € 7/mês** (VPS de 4–8 GB na Hetzner, preços de 2026 a reconferir) | coordenadas vão **só para o seu servidor**; sem registros de acesso | sem cota: 500 × 500 em um pedido | atualizar o mapa OSM (ex.: semanal, automatizável no GitHub Actions), HTTPS, chave de acesso, reiniciar se cair |
| **C. GraphHopper / Google (pagos)** | GraphHopper a partir de ~€ 69/mês; Google por chamada | coordenadas ao provedor | — | — (fora: "sem serviço pago" e custo alto) |
| **D. Roteamento no próprio celular** (nativo, futuro) | R$ 0 por uso | nada sai do aparelho | depende do celular | grande: motor nativo e mapa da região baixado (centenas de MB). Só depois do PWA validado (F10) |

**Notas:**
- **No seu PC, não.** Não é possível hospedar no PC (16 GB, sem Docker e sem servidor ligado o tempo todo, pelas regras do projeto). E o celular só alcançaria o PC na mesma rede.
- **Pré-processamento do recorte regional:** pode rodar no próprio GitHub Actions (máquinas de 16 GB) e só os dados prontos vão para o VPS.
- **Moto:** se a entrega é feita de moto, só o Valhalla tem custo de moto pronto. O OSRM e o ORS usam o perfil de carro, salvo perfil próprio.

### 14.5 Desempenho com 500 paradas (a medir no S23 FE)
| Item | Estimativa e ajuste necessário |
|---|---|
| Matriz | 501 × 501 × 2 números ≈ 2 MB em Float32 no aparelho; download de ~3–4 MB de JSON (dados móveis: só ao calcular) |
| Motor | a versão atual recalcula o custo inteiro a cada tentativa: até ~250 paradas ainda cabe no tempo; **para 500, falta trocar para cálculo incremental (delta)** e listas de vizinhos. Meta: ≤ 2 s no Worker |
| Geometria | ~500 trechos × ~40 pontos ≈ 20 mil pontos; guardar como polilinha compacta (~0,5 MB) |
| Mapa | pinos hoje são marcadores HTML: **para 500, trocar por camada de símbolos do MapLibre** (um único objeto), traçado como 3 camadas (concluído, pendente, próximo) |

### 14.6 Privacidade (antes de ligar qualquer serviço)
- **O que sai:**
  - só pares latitude/longitude das visitas pendentes e da posição atual, sem endereço, código SPX, nome, número da parada ou nome do arquivo;
  - os pontos vão numa ordem que **não** é a da etiqueta: os índices são internos ao pedido.
- **Quando:**
  - só com a autorização G4 dada uma vez nas Configurações;
  - **e** o consentimento por rota ("Calcular pelas ruas" na Central de otimização);
  - a posição atual só vai junto se o GPS estiver ligado e você pedir "partir de onde estou".
- **Para quem:** só o provedor escolhido (A ou B), mostrado na tela.
- **Guardado:** matriz e geometria só no aparelho, apagadas ao finalizar a rota.
- **Chave:** digitada no app e guardada no aparelho. Nunca no Git, no build do Pages nem no APK.

### 14.7 Critérios de aceite (sem dados simulados)
1. **Rota real:** importada da planilha e calculada pelo provedor real; o traçado segue as ruas no mapa do S23 FE (conferência visual por você em pelo menos 3 rotas reais).
2. **Mão única:** em pelo menos 2 casos reais conhecidos por você, a matriz não é simétrica (A → B ≠ B → A) e o traçado respeita o sentido.
3. **Origem:** a posição atual é usada como origem e o primeiro trecho sai dela.
4. **Visual dos trechos:** concluídos, pendentes e próximo visualmente diferentes; ao marcar uma entrega, o destaque passa ao trecho seguinte.
5. **Reotimização:** só os trechos novos são pedidos ao serviço (contagem de pedidos registrada).
6. **Offline:** com a rota calculada, em modo avião, o mapa mostra o mesmo traçado guardado.
7. **Sem rede nem cache:** nenhuma linha no mapa e o aviso visível; a lista funciona.
8. **500 paradas:**
   - matriz completa obtida;
   - motor ≤ 2 s no Worker;
   - mapa fluido (rolagem e zoom sem travar) no S23 FE;
   - tempo e consumo de dados medidos e registrados.
9. **Privacidade:** registro dos pedidos de rede só com coordenadas (sem endereço nem código); nada sai sem as duas autorizações.

## 15. Auditoria do motor de otimização e plano (2026-11-25) — **aguardando aprovação**

### 15.1 O que o teste.7 usa hoje (auditoria do código)
1. **Algoritmo de produção:**
   - `src/core/ordem.ts` (`ordemEstimada`), chamado por `src/app/estado.ts`;
   - o motor da F2 (`core/otimizacao/motor.ts`) **ainda não está ligado** à interface.
2. **Só vizinho mais próximo + 2-opt.** Não há Or-opt, 3-opt, várias soluções candidatas nem perturbação.
   - O 2-opt para no primeiro ótimo local.
   - O vizinho mais próximo deixa paradas "para trás", e as voltas para buscá-las são os retornos que você notou.
3. **Calcula em linha reta × 1,35.** Ignora mão única, rotatórias, rios e vias sem ligação.
   - A ordem "boa em linha reta" fica pior pelas ruas.
4. **Ponto de partida:** numa rota importada, sem GPS na demonstração, a partida fica **fixa na 1ª parada da ordem da SPX**, onde quer que ela esteja.
5. **"Nunca pior que a atual"** compara só com a ordem de entrada, na mesma linha reta. Não protege contra uma ordem ruim pelas ruas.
6. **Motor F2 (não ligado):**
   - é bom até 250 paradas;
   - com 500, o limite de 600 ms estoura no meio da inserção e as paradas restantes caem em qualquer lugar: resultado 60–120% pior;
   - recalcula o custo inteiro a cada tentativa (O(n) por movimento), o que é lento para rotas grandes.

### 15.2 Bancada comparativa (dados FICTÍCIOS, mesma matriz, mesma origem, término livre)
- **Malha viária sintética:**
  - grade de 7 × 7 km, quarteirões de 100 m;
  - avenidas a 40 km/h e ruas a 22 km/h;
  - ~35% das ruas locais em mão única e alguns quarteirões sem passagem;
  - paradas agrupadas em bairros, como numa rota SPX;
  - matriz pelo menor tempo (Dijkstra), **52–60% dos pares assimétricos**.
- **Amostra:** 3 instâncias por tamanho.
- **Medidas:**
  - diferença média para a melhor solução encontrada por qualquer método (minutos pelas ruas);
  - tempo de processamento (CPU de nuvem com 2 vCPU, **não é o S23 FE**);
  - "ret." = voltas a regiões de 500 m já deixadas.
- **Teste.7:** calcula em linha reta e é **avaliado** na matriz pelas ruas.

| Algoritmo | 50 | 100 | 250 | 500 |
|---|---|---|---|---|
| T7 teste.7 (reta, começa na 1ª da SPX) | +14.7% · 0.01 s · 5 ret. | +18.3% · 0.02 s · 13 ret. | +12.0% · 0.06 s · 35 ret. | +11.8% · 0.20 s · 86 ret. |
| T7 teste.7 (reta, com origem) | +9.3% · 0.01 s · 6 ret. | +16.0% · 0.01 s · 12 ret. | +12.3% · 0.08 s · 37 ret. | +9.5% · 0.30 s · 81 ret. |
| F2 motor atual (600 ms) | +4.4% · 0.06 s · 6 ret. | +5.1% · 0.43 s · 15 ret. | +8.2% · 0.61 s · 48 ret. | +63.7% · 0.63 s · 127 ret. |
| NN vizinho (ruas) | +19.3% · 0.00 s · 7 ret. | +19.3% · 0.00 s · 15 ret. | +17.8% · 0.00 s · 47 ret. | +14.6% · 0.00 s · 91 ret. |
| NN + 2-opt | +5.5% · 0.00 s · 6 ret. | +10.3% · 0.01 s · 15 ret. | +11.8% · 0.02 s · 43 ret. | +9.6% · 0.06 s · 92 ret. |
| CI inserção barata | +10.8% · 0.00 s · 6 ret. | +8.0% · 0.00 s · 14 ret. | +12.6% · 0.02 s · 47 ret. | +10.3% · 0.15 s · 114 ret. |
| CI + 2-opt + Or-opt | +8.0% · 0.00 s · 5 ret. | +5.8% · 0.01 s · 14 ret. | +10.0% · 0.07 s · 45 ret. | +7.1% · 0.34 s · 110 ret. |
| CI + 2-opt + Or-opt + 3-opt | +2.6% · 0.02 s · 4 ret. | +4.2% · 0.06 s · 14 ret. | +5.8% · 0.23 s · 41 ret. | +2.3% · 1.50 s · 98 ret. |
| Multi (NN/CI/FI + busca) melhor | +2.1% · 0.04 s · 5 ret. | +4.2% · 0.09 s · 14 ret. | +2.0% · 0.63 s · 38 ret. | +0.0% · 3.60 s · 90 ret. |
| **Proposto: Multi + ILS (2 s no total)** | **+0.1% · 2.00 s · 4 ret.** | **+0.1% · 2.00 s · 11 ret.** | **+0.2% · 2.00 s · 38 ret.** | **+2.0% · 2.01 s · 87 ret.** |
| ILS 1 s (proxy LK) | +0.1% · 1.00 s · 4 ret. | +0.2% · 1.00 s · 12 ret. | +3.3% · 1.02 s · 39 ret. | +3.5% · 1.23 s · 100 ret. |
| ILS 3 s (proxy LK) | +0.0% · 3.00 s · 4 ret. | +0.0% · 3.00 s · 12 ret. | +1.8% · 3.02 s · 40 ret. | +1.4% · 3.22 s · 98 ret. |
| OR-Tools GLS 10 s | +0.7% · 10.00 s | +3.3% · 10.00 s | +3.8% · 10.00 s | +2.1% · 10.00 s |
| OR-Tools GLS 30 s | +0.2% · 30.00 s | +1.9% · 30.00 s | +3.4% · 30.00 s | +1.8% · 30.00 s |

**Conclusões:**
- O teste.7 fica **9–18% acima** do melhor resultado nas mesmas condições.
  - Metade da perda vem de calcular em linha reta; a outra metade, do algoritmo fraco.
  - Isso é coerente com a sua observação de que o Spoke foi melhor.
- 2-opt sozinho, Or-opt sozinho ou só inserção **não bastam** (+6–12%).
- O ganho real vem de:
  - movimentos de 3-opt (trocar dois trechos de lugar);
  - **várias soluções iniciais** e melhoria iterada (ILS: perturba um trecho, melhora e só aceita o que melhorar).
- **OR-Tools** (C++, rodado em Python) com 10–30 s **não superou** o método proposto com 2 s.
- **"ILS (proxy LK)"** é uma busca local iterada com 2-opt, Or-opt e 3-opt. **Não é** Lin-Kernighan completo.
- **Limites da bancada:**
  - a malha é sintética;
  - o tempo no S23 FE pode ser 2–4× maior (a medir);
  - a comparação com o Spoke exige uma rota real sua.

### 15.3 Avaliação por algoritmo
| Algoritmo | Papel no motor novo | Observação |
|---|---|---|
| Vizinho mais próximo | uma das soluções iniciais | sozinho: +15–19% e muitos retornos |
| Inserção mais barata | solução inicial principal | sozinha: +8–13% |
| Inserção do mais distante | solução inicial | diversifica |
| 2-opt | melhoria | com matriz assimétrica, o trecho invertido muda de sentido: custo exato por somas de prefixo nos dois sentidos, O(1) por tentativa |
| Or-opt (1–3 paradas, nos 2 sentidos) | melhoria | corrige paradas "deixadas para trás" |
| 3-opt (troca de trechos sem inverter) | melhoria | o maior ganho isolado; janela limitada (30) para caber no tempo |
| Lin-Kernighan / LKH | não agora | complexo; para matriz assimétrica exige transformação (2n nós). Só se a validação real mostrar folga |
| OR-Tools | **não no app** | sem versão JavaScript/WebAssembly oficial: não roda no PWA; no Android exigiria biblioteca nativa por arquitetura e um 2º motor (contra "um núcleo só"); não foi melhor na bancada. Fica como **referência de desenvolvimento** na bancada |

### 15.4 Motor proposto (v3)
1. **Várias soluções candidatas:**
   - inserção mais barata, inserção do mais distante e vizinho mais próximo;
   - a ordem atual;
   - a última rota real guardada, quando houver.
2. **Busca local exata para matriz assimétrica** em cada candidata: 2-opt, Or-opt e 3-opt.
   - Custo incremental O(1) por tentativa.
   - Para 250–500 paradas: listas de vizinhos (as 20–30 paradas mais próximas pela matriz) e marcadores "não olhar de novo".
3. **ILS** com o tempo restante:
   - perturbação local ("double-bridge" numa janela de 30–60 paradas);
   - busca local de novo;
   - só aceita o que melhora.
4. **Escolha da melhor** pelo critério (tempo, distância ou inteligente).
   - Tudo pela **mesma matriz pelas ruas**, ou aproximada só quando não houver matriz real nem guardada.
5. **Orçamento de tempo adaptativo, em Web Worker** (a tela não trava):
   - ≤ 50 paradas: 0,5 s;
   - ≤ 100: 1 s;
   - ≤ 250: 2 s;
   - 500: 3 s.
   - Com barra de progresso e botão de cancelar.
   - O tempo de corte **nunca** deixa a solução incompleta: a construção é sempre terminada.
6. **Regras mantidas:**
   - visitas do mesmo endereço confirmado andam juntas (blocos);
   - primeira e última fixas;
   - concluídas nunca mudam;
   - "nunca pior que a atual" **pela mesma matriz**;
   - determinístico (semente fixa);
   - a ordem só muda com o seu toque.
7. **Sem agrupamento geográfico imposto.** Os retornos diminuem porque a busca global encontra a ordem melhor (medido na coluna "ret."), não por regras de bairro.

### 15.5 Desempenho e limites (requisito 4)
| Item | Proposta |
|---|---|
| **Divisão da matriz** | Blocos de 7 origens × 500 destinos (3.500 pares, o limite do ORS público). 500 paradas + origem ≈ 72 pedidos, a no máximo 40 por minuto: cerca de 2 min na 1ª vez, com barra de progresso. 50 paradas: 1 pedido. 100: 3. 250: 18 |
| **Cache local** | IndexedDB, por par de coordenadas (arredondadas a ~1 m), perfil (carro) e data. Float32: 501² × 2 × 4 B ≈ 2 MB para 500 paradas |
| **Reaproveitamento** | Ao reotimizar, as distâncias entre paradas pendentes já estão guardadas: só a linha da posição atual (1 × N) é pedida. 1 pedido |
| **Só pendentes** | Concluídas ficam fora da matriz e da otimização |
| **Memória** | Matriz em Float32Array (≈ 2 MB para 500); geometria como polilinha compacta (≈ 0,5 MB); pinos e linhas como camadas do MapLibre (não um elemento HTML por pino) |
| **Cota diária do ORS** | Matriz: 500/dia (≈ 6 rotas cheias de 500 paradas, ou muitas de 100). Rotas: 2.000/dia (11 por rota de 500). Contador no app, com aviso antes de faltar. Ao acabar: última rota real guardada, ou aproximada rotulada |
| **Tempo de otimização** (bancada) | 50: 0,5 s · 100: 1 s · 250: 2 s · 500: 2–3 s. **A medir no S23 FE** |
| **Chave da API** | Digitada no app; nunca no Git, no build nem em registros; nunca enviada a outro lugar além do ORS. **No APK**, guardada cifrada pelo Keystore do Android, o que exige uma dependência nova a aprovar (plugin de armazenamento seguro do Capacitor). **No PWA**, não há cofre seguro no navegador: fica no armazenamento do app, sem exportação, com botão "Apagar chave". A chave é gratuita e pode ser revogada e trocada no site do ORS |

### 15.6 Plano de implementação (cada fase gera um APK de teste; sem publicar no main nem mexer no PWA)
| Fase | Entrega | Testes |
|---|---|---|
| **R-A · Motor v3** (independe da chave) | Motor da §15.4 em `core/otimizacao`, num Worker; substitui `ordemEstimada` e o motor F2; Central de otimização ligada | Regressão com as instâncias sintéticas da bancada (sementes fixas, limites de qualidade por tamanho) + todos os testes atuais (importação e pacotes do teste.7) |
| **R-B · Matriz e traçado pelo ORS** | Adaptadores `DistanceMatrixProvider` e `RouteGeometryProvider` (ORS, carro; perfil "moto" previsto), cota, cache, autorizações R2, chave (R6) | Testes de contrato com respostas gravadas **fictícias**; conferência de que só coordenadas saem; validação real com a sua chave |
| **R-C · Visual V16** (só após aprovar as telas) | Mapa em tela cheia, camadas do traçado, pinos, cartão retrátil, botões flutuantes, Mapa/Lista, 3 temas; tracejado reto removido | Testes de tela no emulador Android + conferência visual sua |
| **R-D · Validação** | Relatório: motor atual × novo na mesma matriz real; depois × Spoke numa rota real autorizada | Distância, tempo, tempo de processamento e sequência das visitas, lado a lado |

**Para comparar com o Spoke**, preciso da mesma rota otimizada no Spoke: a sequência das paradas, a distância e o tempo que ele mostra (capturas de tela bastam). Os dados reais ficam só no aparelho e na sessão, e nada vai para o Git.

### 15.7 R-A implementada (2026-11-25) — APK teste.8 em validação
**Arquivos:**
- `src/core/otimizacao/motor.ts` (motor v3);
- `tarefa.ts` e `otimizador.worker.ts` (cálculo em segundo plano);
- `src/app/otimizador.ts` (Worker; sem Worker, nos testes, roda no processo com o mesmo cancelamento);
- `src/app/estado.ts` (`otimizar`, `recalcular`, `cancelarOtimizacao`, `definirTermino`, `montarTarefa`);
- `src/app/dinamica.ts` (`obterOrigemAtual`);
- `src/components/domain/Otimizacao.tsx` (janela de andamento e de falha);
- `src/screens/Rotas.tsx` e `src/components/domain/MapaRota.tsx` (sem linha reta).

**Origem:**
- Sempre a posição atual: o GPS liga ao tocar em OTIMIZAR, com a explicação de sempre antes do pedido do sistema.
- Espera até 20 s por uma leitura confiável (≤ 50 m, ≤ 30 s de idade).
- Sem ela: mensagem com o motivo (permissão negada, localização desligada, sinal fraco) e "Tentar de novo". **Nunca** usa a 1ª parada da SPX.
- Única exceção: a rota de **exemplo** (fictícia) usa a posição de teste quando você está longe dela.

**Término:** livre (padrão), voltar ao ponto de partida ou numa parada escolhida.

**Segurança da execução:**
- Cancelar encerra o Worker e não muda nada.
- Se a rota mudar durante o cálculo (outra rota, entrega marcada), o resultado é descartado e o app explica.
- Sugestões automáticas (G8) só com a sua posição confiável. Um cálculo seu tem prioridade.

**Matriz na R-A:** aproximada local (linha reta × 1,35, 20 km/h, 1,5 min por parada), rotulada "aproximada, sem ruas". A R-B troca pela matriz real.

**Calibração** (bancada, CPU de nuvem; malha sintética com mão única):

| Paradas | Iterações | Tempo | Distância da referência |
|---|---|---|---|
| 50 | 400 | ~0,15 s | ótimo |
| 100 | 800 | ~0,3 s | ótimo |
| 250 | 1.000 | ~0,45 s | +0,3% |
| 500 | 1.200 | ~0,7 s | +0,8% |

- A referência é o próprio motor com 15.000 iterações e 3 sementes.
- Nas instâncias da §15.2, o v3 ficou **3–9% melhor** que a melhor solução anterior, incluindo OR-Tools com 30 s. Exemplo: 500 paradas, 324,1 min contra 354,4 min.
- O limite de tempo por tamanho é só de segurança: 1 / 2 / 4 / 6 s.

**Resultados reais (locais):**
- Vitest 251/251 (inclui a regressão 50/100/250/500, força bruta até 9 paradas, mão única, cancelamento, reotimização, origem e integridade) + scripts 68/68.
- Navegador (Chrome, GPS simulado), `e2e/otimizacao.mjs`, 6/6:

| Paradas | Toque → rota pronta | Algoritmo |
|---|---|---|
| 50 | 0,5 s | 0,2 s |
| 100 | 0,3 s | 0,3 s |
| 250 | 0,7 s | 0,5 s |
| 500 | 0,9 s | 0,7 s |

  - A 1ª parada foi a ao lado da sua posição (a última da SPX), não a 1ª da SPX.
  - Cancelar com 500 paradas: ordem e fase iguais.
  - Reotimizar as pendentes: resposta em 0,5 s.
- Importação do teste.7 no navegador: 11/11.

**Android (emulador API 34, WebView 113, 2 núcleos, GPU por software, 4 GB; `e2e/otimizacao.mjs` com o GPS do emulador):**
- Otimização 6/6 em duas execuções seguidas.
- Tempo do algoritmo:

| Paradas | 1ª execução | 2ª execução |
|---|---|---|
| 50 | 1,0 s | 1,1 s |
| 100 | 1,5 s | 1,5 s |
| 250 | 2,5 s | 3,9 s |
| 500 | 3,8 s | 5,6 s |

- Toque → rota pronta: 3,1 a 11,8 s, incluindo a espera pela posição do GPS.
- Cancelar com 500 paradas: ordem e fase iguais.
- Reotimizar as pendentes: 2,5–3,2 s.
- **O S23 FE deve ser mais rápido que este emulador. A medir no aparelho.** Se 500 paradas passarem de 6 s, a busca para no limite de segurança e devolve a melhor ordem encontrada até ali, sempre completa.
- A ordem da SPX não comanda mais o início: a 1ª parada é a mais próxima da sua posição.
  - No emulador, a posição "teletransporta" entre os casos. O filtro de saltos do GPS às vezes ainda usa a leitura anterior. Isso é do teste, não do motor.

**Defeitos achados pelo teste no emulador e corrigidos:**
1. **Pré-existente desde o teste.5.** O chip "GPS: Buscando sinal" usava a classe `busca`, a mesma da tela de busca (absolute, inset 0). Enquanto o GPS procurava sinal, o chip cobria a tela inteira e bloqueava os toques. Corrigido: classe `buscando` + teste que impede a colisão de nomes.
2. **Novo da R-A, antes do APK.** A janela "Otimizando" ficava por cima da explicação da localização, e o toque em "Permitir localização" caía em "Cancelar". Corrigido: com a explicação aberta, a janela some.
3. **Robustez.** A espera pela origem não depende mais da consulta de permissão da WebView, que pode não responder. Se não responder em 1,5 s, a explicação aparece. O GPS fica em alta precisão só enquanto espera a origem.

**Importação (teste.7) no emulador:** 11/11 numa execução e 9/11 na outra. As 2 falhas foram "a página fechou" depois da 9ª importação seguida, já registrado no teste.7 como limitação do emulador. Não há falha do app no log do Android. O código da importação não mudou na R-A.

**Na R-A não há matriz nem traçado pelas ruas:** os tempos de matriz e de traçado serão medidos na R-B.

**Validação física (S23 FE, planilha real, 2026-11-26, feita pelo usuário):**
- **Aprovados:** importação · abertura da rota · agrupamento do mesmo endereço · localização atual pelo GPS · otimização de uma rota real · interface responsiva durante a otimização.
- **Pendentes (não reprovados):** cancelar durante a otimização · reotimizar só as pendentes · onde a rota termina · tempo com rota grande.

## 16. Plano técnico da fase R-B (2026-11-26) — **aguardando aprovação; nada implementado**
Objetivo da fase:
- matriz de distância e tempo **pelas ruas**, com mão única e restrições;
- otimização até 500 paradas sobre essa matriz;
- **traçado real** no mapa, idêntico à sequência escolhida;
- cache para uso offline;
- chave protegida e privacidade preservada.

Sem linhas retas em nenhum caso (R4). O motor v3 da R-A **não muda**: ele já aceita matriz assimétrica.

### 16.1 Fatos verificados em 2026-11-26 (OpenRouteService)
| Item | Situação atual | Efeito no plano |
|---|---|---|
| **Endereço da API** | `api.openrouteservice.org` foi descontinuado. Desde 27/08/2026 tem só 10% da cota, e o desligamento estava previsto para 2–6/11/2026. O endereço novo é `api.heigit.org/openrouteservice/v2/...` | usar **só** `api.heigit.org`; não confiar em exemplos antigos |
| **Navegador (CORS)** | em maio/2026 o endereço novo bloqueava pedidos do navegador. A equipe corrigiu em 19/05/2026 (o cabeçalho `Authorization` passa) | o PWA pode chamar direto. No APK, usar o HTTP nativo do Capacitor (`CapacitorHttp`), que não depende de CORS. Testar os dois |
| **Cotas do plano gratuito (Standard)** | Directions 2.000/dia e 40/min · Matrix 500/dia e 40/min · Snap 2.000/dia e 100/min. Passar do limite por minuto → **429**; acabar a cota do dia → **403** | limitador no app + tratamento de 429/403 (§16.4) |
| **Limites por pedido** | Matrix até 3.500 pares (ex.: 50 × 50) · Directions até 50 pontos · Snap até 5.000 pontos · raio de encaixe padrão 350 m (erro 2010 quando não encaixa) | divisão em blocos (§16.3) |
| **Defeito conhecido** | issue #1785, aberta em 2024: **um** ponto sem rota pode deixar **todo** o bloco da matriz com `null` | encaixar os pontos na malha **antes** (Snap) e isolar os blocos com `null` (§16.4) |
| **Licença e uso** | resultados sob **CC-BY 4.0**, com a atribuição "© openrouteservice.org by HeiGIT \| Map data © OpenStreetMap contributors". O plano Standard diz **"Commercial use not allowed"** | atribuição no mapa. **Uso comercial: decisão RB1** (§16.8) |
| **Veículo** | há perfil `driving-car`; **não há perfil de moto** | carro agora (R3). Moto só com Valhalla |

### 16.2 Arquitetura (as três responsabilidades da §14, agora concretas)
```
                       ┌───────────────────────────────┐
 posição atual + ─────▶│ ProvedorRuas (adaptador)      │──▶ api.heigit.org (ORS)  [R1]
 paradas pendentes     │  · encaixar(pontos)   (Snap)  │──▶ Valhalla/OSRM próprio [futuro]
 (SÓ coordenadas)      │  · matriz(origens, destinos)  │
                       │  · trechos(sequência)         │
                       └──────────────┬────────────────┘
                                      │ (blocos, limitador, retomada, cancelar)
          cache por rota (IndexedDB) ◀┤
                                      ▼
  Worker: motor v3 (inalterado) ◀── Matriz {km, min, tipo:'ruas', semPercurso}
                                      │ ordem escolhida (toque do usuário)
                                      ▼
  Geometria por trecho (polyline) ──▶ mapa: 3 camadas (concluído · pendente · até a próxima)
```
- **Novos módulos:**
  - `src/platform/ruas/` (cliente ORS, limitador, erros);
  - `src/core/ruas/` (blocos, mesclagem da matriz, chaves de cache — puro e testável);
  - `src/app/ruas.ts` (fluxo, autorização, estado da tela).
- **Fluxo de OTIMIZAR com ruas:**
  1. posição atual (R-A);
  2. Snap das paradas sem encaixe no cache;
  3. blocos da matriz que faltam;
  4. motor;
  5. você aceita a ordem;
  6. trechos da ordem que faltam;
  7. mapa.

### 16.3 Matriz pelas ruas para até 500 paradas
**Divisão em blocos** (≤ 3.500 pares por pedido):
- linhas de 7 paradas × 500 destinos;
- a linha da origem vai num pedido à parte (1 × 500);
- a origem nunca é destino, salvo "voltar ao ponto de partida".

| Paradas | Pedidos de matriz | Pedidos de traçado (≤ 50 pontos) | Dados (aprox., JSON) | Tempo esperado só da matriz |
|---|---|---|---|---|
| 50 | 1 (51 × 50) | 2 | ~40 KB | ~1–2 s |
| 100 | 4 | 3 | ~0,2 MB | ~2–4 s |
| 250 | 37 | 6 | ~1,2 MB | ~20–40 s |
| 500 | 73 | 11 | ~4 MB (sem compressão) | **~1,5–2 min** (limite de 40/min) |

- **Cota diária:** 500 pedidos de matriz/dia equivalem a ~6 rotas completas de 500 paradas, ou ~120 de 100 paradas.
- **Mais rápido que a cota:** a reotimização reaproveita tudo (§16.5).
- **Limitador:**
  - janela deslizante de 60 s com no máximo 36 pedidos (folga abaixo de 40);
  - até 3 pedidos ao mesmo tempo;
  - barra de progresso: "Baixando distâncias pelas ruas: 41/73".
- **Tempos medidos separadamente:** encaixe, matriz, algoritmo e traçado, mostrados na tela e no relatório de teste.

### 16.4 Erros e situações difíceis (nunca linha reta em silêncio)
| Situação | Tratamento |
|---|---|
| **429** (limite por minuto) | espera o `Retry-After`, ou 15 s, 30 s, 60 s; continua de onde parou |
| **403** (cota do dia acabou, ou chave inválida) | para; guarda os blocos já baixados; diz qual dos dois aconteceu. Oferece: tentar amanhã, usar a última rota real guardada ou a ordem **aproximada, rotulada** (R5) |
| **Ponto fora da malha** (Snap não encaixa a até 350 m) | a parada aparece numa lista: "Parada 37: sem acesso pelas ruas perto da coordenada". Fica **fora** da otimização pelas ruas, no fim, na ordem da SPX, e sem traçado. Você pode tentar com raio maior, uma vez, até 1 km |
| **Par sem percurso** (`null` na matriz) | o bloco é refeito em partes menores para isolar o par. Se continuar sem percurso, o par fica **proibido** para o motor (custo muito alto, nunca linha reta). Se a ordem final precisar dele, aviso explícito |
| **Bloco inteiro `null`** (defeito #1785) | refeito em metades até achar o ponto culpado. O ponto vai para a lista "sem acesso" |
| **Cancelar durante o download** | interrompe os pedidos em andamento. Os blocos já recebidos ficam guardados para a próxima tentativa. A rota não muda |
| **Queda de conexão / app fechado** | o progresso é gravado bloco a bloco. Na volta: "Continuar o download (41/73)?" |
| **Serviço fora do ar (5xx, tempo esgotado)** | até 3 tentativas com espera; depois, o mesmo caminho do 403 |
| **Matriz × traçado** | os números do traçado podem diferir um pouco dos da matriz. A tela mostra os do **traçado** como "pelas ruas" depois que ele chega |

**Mão única e restrições:**
- **Mão única:** respeitada pelo perfil de carro do ORS. A matriz é assimétrica, e o motor usa o custo real de cada sentido.
- **Proibições de conversão e acessos restritos:** dependem do mapeamento no OpenStreetMap e de como o ORS os aplica na matriz pública. **Isso será conferido em ruas reais que você conhece** (critério §16.9), não presumido.
- **Lado da rua da entrega:** o ORS não considera. Limitação registrada.

### 16.5 Cache, reaproveitamento e offline
- **O que é guardado (IndexedDB, só da rota em uso):**
  - a matriz em Float32 (500 paradas ≈ 2 MB);
  - os pontos encaixados;
  - a geometria por trecho (polyline compacta, ≈ 0,5–1 MB);
  - a data dos dados do mapa (`graph_date` do ORS).
- **Chave do cache:** coordenadas arredondadas (~1 m) + perfil + data dos dados.
- **Privacidade:** o cache é **apagado ao finalizar ou encerrar a rota**, junto com os endereços. Não há reaproveitamento entre dias: a regra definitiva da Etapa 3 proíbe guardar coordenadas depois da rota.
- **Reotimização (só as pendentes):**
  - as distâncias entre paradas já estão no cache;
  - **1 pedido** (a linha da sua posição atual) e o motor;
  - depois, só os trechos novos da ordem.
- **Offline:**
  - **Mapa:** mostra o traçado guardado **só se** corresponder exatamente à ordem atual. Senão, só os pinos e o aviso.
  - **Otimizar sem conexão:** entre paradas usa a matriz real guardada. A sua posição atual não pode ser calculada pelas ruas sem conexão. **Decisão RB4:** (a) o 1º trecho fica *estimado* e rotulado, ou (b) parte da última parada concluída, também rotulado.
  - **Sem matriz guardada:** ordem aproximada, rotulada (R5).

### 16.6 Traçado real no mapa
- **Pedido:** a ordem aceita vai em pedidos de até 50 pontos, um após o outro, com o último ponto repetido no pedido seguinte. A resposta é dividida por trecho (índices `way_points`) e guardada por par de paradas.
- **Correspondência exata:**
  - cada trecho guardado é conferido contra a ordem: origem e destino iguais;
  - se a ordem muda, o mapa só desenha os trechos que ainda valem;
  - os que faltam são pedidos; enquanto não chegam, **não aparecem**.
- **Camadas do MapLibre:** concluído (apagado) · pendente (cor da rota) · até a próxima (menta largo com borda). Todo o percurso fica visível. O visual completo estilo Spoke é da R-C; na R-B, só as camadas sobre o mapa atual.
- **Desempenho:** uma fonte GeoJSON por camada, sem um elemento por trecho. Os pinos viram camada de símbolos na R-C.

### 16.7 Chave da API e dados dos destinatários
**Plugin de cofre (verificado em 2026-11-26; instalar só depois da verificação final do código):**

| Plugin | Versão / licença | Capacitor 8 | Como guarda no Android | Observação |
|---|---|---|---|---|
| `capacitor-secure-storage-plugin` (martinkasa) | 0.14.2 · MIT · atualizado em 11/2026 | sim (`@capacitor/core >= 8`) | Android Keystore + SharedPreferences | **sem dependências extras**. **Recomendado** |
| `@aparajita/capacitor-secure-storage` | 8.0.1 · MIT · atualizado em 09/2026 | sim | AES-GCM com chave do Android Keystore | traz `@capacitor/app` e `@capacitor/keyboard` como dependências: mais código nativo |
| `@atroo/capacitor-secure-storage-plugin` | 8.0.0 · MIT | sim | EncryptedSharedPreferences | biblioteca de criptografia descontinuada pelo Google; exige Java 21 |

**Antes de instalar:** ler o código nativo, conferir permissões (nenhuma esperada), tamanho no APK e `allowBackup=false` (já ativo).

**Regras da chave:**
- **APK:** fica no cofre (Keystore).
- **PWA:** o navegador **não tem cofre seguro**. **Decisão RB3:** (a) roteamento pelas ruas só no APK, ou (b) também no PWA, com a chave no armazenamento do app e aviso.
- **Nunca** em logs, relatórios, exportações, Git ou build. Os erros mostram só código e tipo.
- Um teste automático procura a chave em logs e arquivos.
- Botões: "Testar chave" (1 pedido de Snap com 1 ponto fictício) e "Apagar chave".

**O que sai do aparelho:**
- **Sai:** só latitude e longitude (até 6 casas) das paradas **pendentes** e da sua posição, com o perfil `driving-car`.
- **Não sai:** nome, endereço em texto, telefone, código SPX, número da etiqueta, ids internos, nome do arquivo.
- **Quando:** com a autorização G4 nas Configurações **e** o consentimento por rota ("Calcular pelas ruas"). A posição atual só vai ao otimizar.
- **Conferência automática:** um teste intercepta todos os pedidos e falha se algo além de coordenadas e parâmetros técnicos aparecer.

### 16.8 Alternativas gratuitas e o uso comercial
**Uso comercial:** você usa o app no seu trabalho de entregador. O plano gratuito do ORS **proíbe uso comercial**, e não está claro se uma ferramenta pessoal usada no trabalho entra nisso. **Não sou advogado.**

**Opções (decisão RB1):**
- **A.** Escrever para `enquiry@openrouteservice.org` e perguntar se o uso pessoal de um entregador autônomo é permitido. Usar o ORS só depois da resposta.
- **B.** Seguir com o ORS **só para testes de validação** até a resposta.
- **C.** Ir direto para servidor próprio: sem cota e sem a restrição. Os dados do OpenStreetMap são ODbL e exigem só atribuição.

| Opção | Custo mensal | Cota | Mão única | Moto | Trabalho |
|---|---|---|---|---|---|
| **ORS público** | R$ 0 | ~6 rotas de 500 ou ~120 de 100 por dia | sim | **não** | nenhum |
| **Valhalla próprio** (VPS 2 vCPU / 4 GB) | ≈ € 5,5–6 + IPv4, sem IVA (Hetzner CX23 após o aumento de 15/06/2026; disponibilidade limitada) | ilimitada | sim; custos por veículo sem reprocessar | **sim** | atualizar o mapa (GitHub Actions), HTTPS, chave própria |
| **OSRM próprio** | igual | ilimitada | sim; matriz mais rápida | não (só com perfil próprio) | igual; trocar o perfil exige reprocessar |
| GraphHopper | a partir de ~€ 160/mês no plano comercial | — | — | — | fora: o plano gratuito não permite uso comercial |

**Notas:**
- **Recorte do mapa:** o do seu estado ou região, do Geofabrik. O processamento roda no GitHub Actions e o VPS só serve.
- **Memória do OSRM:** ~2 GB de RAM por GB de arquivo do mapa no processamento (o planeta inteiro precisa de ~123 GB).
- **Nada disso roda no seu PC** (regras do projeto).
- **Mesma interface:** a troca de provedor é só no adaptador `ProvedorRuas`.

### 16.9 Comparação objetiva com o Spoke
**Mesmas condições:**
- a **mesma planilha** importada no Spoke e no RotaVHS;
- a **mesma origem** (o mesmo lugar, no mesmo momento);
- término **livre** nos dois;
- carro.

**Coleta:**
- **Spoke:** a sequência (capturas de tela com os números), os km e o tempo que ele mostra, e o tempo de processamento cronometrado por você.
- **RotaVHS:** os mesmos dados, medidos pelo app (encaixe, matriz, algoritmo e traçado separados).

**Avaliação justa:**
- as duas sequências são recalculadas **na mesma matriz do ORS** e com o mesmo traçado do ORS;
- os números próprios do Spoke ficam numa coluna à parte (ele pode usar outro mapa e trânsito);
- a ferramenta de comparação roda na bancada, fora do app. Os dados reais ficam só na sessão, nunca no Git.

**Relatório:** distância total · tempo estimado · tempo de processamento · sequência das visitas · diferença em %.

### 16.10 Etapas da R-B (cada uma com APK de teste; sem publicar no main nem no PWA)
| Etapa | Entrega | Testes |
|---|---|---|
| **RB-0** · decisões e conta | RB1–RB5 aprovadas; você cria a conta em `account.heigit.org` (eu oriento) | — |
| **RB-1** · chave e autorizações | plugin de cofre, Configurações ("Calcular pelas ruas", G4, chave, testar e apagar) | a chave nunca aparece em logs nem exportações; autorização obrigatória |
| **RB-2** · cliente de rotas | Snap, blocos, limitador, 429/403/5xx, cancelar e retomar, cache | respostas **gravadas e fictícias** (servidor de teste local), queda de rede simulada, 50/100/250/500 com contagem de pedidos |
| **RB-3** · otimização pelas ruas | matriz real no motor; rótulos "pelas ruas"; reotimização com 1 pedido; offline | testes do motor com matrizes assimétricas reais gravadas (fictícias); conferência da privacidade |
| **RB-4** · traçado | trechos, correspondência exata com a ordem, 3 camadas no mapa, atribuição | o traçado bate com a ordem depois de reordenar; sem conexão, só o guardado |
| **RB-5** · validação real | APK no S23 FE com rotas reais suas | tempos separados (matriz, algoritmo, traçado) para 50/100/250/500; 2 mãos únicas conhecidas; modo avião; comparação com o Spoke |

**Riscos:**
- mudanças do ORS, como a troca de endereço deste ano;
- a cota pode não bastar em rotas grandes repetidas;
- turnos/restrições conforme o mapeamento do OSM;
- tempo de 1,5–2 min na 1ª matriz de 500 paradas.
