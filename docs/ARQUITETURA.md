# RotaVHS Go — Arquitetura proposta

Situação: **proposta, aguardando aprovação** (decisões em `DECISOES.md`). Criada em 2026-11-18 · **Revisão 1** (2026-11-18): adaptadores de GPS e de distâncias, caminho nativo com segundo plano, aviso do mapa offline, orçamento de desempenho, dados temporários.

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
