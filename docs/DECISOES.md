# RotaVHS Go — Decisões

Situação em 2026-11-19: ✅ **G1–G15 aprovadas pelo usuário** ("vamos aprovar tudo", 2026-11-19 13:44), com as definições das revisões 4–7.
**Revisão 1 (2026-11-18):** seus seis ajustes incorporados em G1, G4, G6, G7, G8, G9, G12, mais a nova **G14** (desempenho).
**Revisão 2 (2026-11-18):** nova exigência **G15** (otimização futura pelas ruas reais).
**Revisão 3 (2026-11-19):** G9 passa a seguir o **protótipo do Figma** indicado pelo usuário; G12 propõe guardar, depois de finalizar, **só um resumo operacional e financeiro**, sem dados pessoais. Nenhuma decisão foi aprovada: G1–G15 continuam **pendentes**.
**Revisão 4 (2026-11-19), definida pelo usuário:** (1) o **Figma é a referência** e o projeto se adapta a ele (G9); (2) **sem as restrições de privacidade** de nome e telefone (G12); (3) o **Stop continua sendo o elemento mais importante**; (4) o **Financeiro só informa o custo estimado da rota** (G12). As demais decisões continuam **pendentes**.
**Revisão 5 (2026-11-19), definida pelo usuário:** a planilha da SPX não traz nome, telefone nem observação; esses dados **saem do app** (G12) e da tela Pedidos (G9).
**Revisão 6 (2026-11-19), definida pelo usuário:** **sem aba Financeiro**; o custo estimado da rota fica em **Estatísticas** (G9, G12).
**Revisão 7 (2026-11-19): aprovação geral.** Todas as decisões aprovadas como estão. Pontos da A5 resolvidos: **G5** = linha **tracejada** da ordem de visita com a legenda "ordem, não é o caminho" (o Figma desenha linha; com distância estimada só o tracejado é permitido); **tamanhos** = os do Figma (botões de 52 px), contraste ≥ 7:1 mantido; **lucro** fica fora (G12). **Etapa 1 autorizada.**
**Revisão 8 (2026-11-19), definida pelo usuário:** no mapa, **cada parada tem a mesma cor da sua caixa na tela Pedidos** (cor fixa por Stop, pela ordem da SPX, para não mudar ao otimizar) (G9).
**Revisão 9 (2026-11-19), definida pelo usuário:** ao marcar Entregue ou Sem sucesso na tela Pedidos, o app **pula para a próxima parada pendente** (na ordem da rota), com **Desfazer** por 6 s (G8 continua: a ordem da rota não muda; só a parada selecionada avança).
**Revisão 10 (2026-11-19), definida pelo usuário:** na interface, **"Parada" no lugar de "Stop"** (o número continua sendo o Stop da etiqueta; nos documentos e no código o termo técnico Stop continua).
**Revisão 11 (2026-11-19), definida pelo usuário:** na tela Rotas, tocar numa parada a **seleciona e destaca no mapa** (sem sair da tela) e mostra **Navegar**: abre o **Google Maps** ou o **Waze** já com o destino (G4: só a coordenada daquela parada vai para o app escolhido, e só com o seu toque; o RotaVHS não envia nada). Tocar no mapa abre o **mapa em tela cheia**. A rota desenhada pelas ruas DENTRO do app continua sendo a etapa N2 (não autorizada).
**Revisão 12 (2026-11-19), definida pelo usuário:** **transições fluidas entre telas, estilo iOS** (tela interna entra pela direita e volta pela esquerda; entre abas, desliza para o lado da aba; o destaque da aba escorrega com mola), feitas com a View Transitions API do navegador, **sem biblioteca** e **desligadas com "reduzir movimento"**; **menu inferior flutuante**, retângulo de cantos arredondados com fundo de vidro escuro, o conteúdo passa por trás.
Formato: decisão · recomendação · alternativas · por quê.

| # | Decisão | Recomendação | Alternativas | Por quê |
|---|---|---|---|---|
| **G1** | Plataforma | **PWA único agora** (Android, iOS, Windows). A arquitetura **não fica presa à tela ligada**: o GPS e o armazenamento passam por adaptadores (`ARQUITETURA.md` §3), para uma **versão nativa futura (Capacitor) com rastreamento em segundo plano** sem reescrever o núcleo nem as telas (etapa opcional N1) | nativo já; dois apps separados | uma base de código, sem loja e offline agora; a porta para o segundo plano fica aberta |
| **G2** | Pilha e versões | as **mesmas versões já testadas juntas no RotaVHS** (`ARQUITETURA.md` §2), fixas, sem `^` | versões mais novas | menos risco; lição do PWA (`skipWaiting` + `clientsClaim`) já aprendida |
| **G3** | Reaproveitamento do RotaVHS | **copiar** módulos testados com os testes, registrando origem e commit; o original **só é lido**. O solver da 5.3 (não aprovado lá) entra como **experimental**, com aprovação própria na Etapa 5 | importar direto da pasta; reescrever do zero | regras de Stop, Sequence e privacidade já validadas com planilhas SPX |
| **G4** | Distâncias e roteirização | **cálculo local e offline como padrão e como garantia**. A arquitetura fica **pronta para distâncias reais pelas ruas quando houver conexão**: um provedor de matriz substituível (estimado × ruas) com volta automática ao estimado sem rede, cota ou resposta. **Qualquer serviço externo** (ex.: OpenRouteService) só com a sua autorização, e com consentimento **por rota**, porque envia coordenadas a terceiros (etapa opcional N2) | só local, para sempre; serviço externo como padrão | privacidade e offline sempre; ganho real quando você quiser e houver rede |
| **G5** | O que o mapa desenha | **pinos numerados pelo Stop** + próxima em destaque, **sem linha de trajeto** enquanto as distâncias forem estimadas. Com distâncias pelas ruas (N2), o trajeto real pode ser desenhado, rotulado "pelas ruas". ✅ **Escolhido (revisão 7):** tracejado da ordem de visita com a legenda "ordem, não é o caminho" | linha reta contínua (proibida) | não fingir navegação |
| **G6** | Mapa base e offline | **OpenFreeMap** (gratuito, sem chave). **Cache dos tiles já vistos com limite de 60 MB**, descartando os mais antigos. **Esse cache NÃO garante cobertura da sua região de entregas**: só guarda o que já apareceu na tela, nos zooms usados; área nova ou zoom diferente sem internet fica em branco. Sem tile: área cinza + "mapa sem conexão" + a operação continua **pela lista**. Opção futura: **"baixar mapa da área da rota"** (estimativa de MB mostrada antes, de preferência no Wi-Fi), também sem garantia total | pacote offline da cidade (PMTiles, dezenas a centenas de MB); mapas pagos | já usado no RotaVHS; o servidor de tiles vê **a área** consultada, não as entregas |
| **G7** | GPS | **PWA:** funciona com o app aberto e visível; botão iniciar/pausar; alta precisão só com a rota ativa; Wake Lock opcional; ignora leituras com precisão pior que ~50 m e movimentos abaixo de ~20 m; pausa fora da tela (bateria). **Nativo (N1, futuro):** rastreamento em segundo plano (Android: serviço em primeiro plano com notificação; iOS: permissão "Sempre"), pelo mesmo adaptador | GPS sempre ligado no PWA | limites reais do PWA documentados; caminho para o segundo plano previsto |
| **G8** | Recalcular rota | **Manual a qualquer momento:** o botão **Recalcular** sempre disponível, sem espera mínima; o resultado aparece para você aceitar ou recusar. **Sugestões automáticas**, nunca aplicadas sozinhas: gatilhos = entrega marcada, "sem sucesso" ou desvio relevante (> 300 m da próxima por > 2 min, já filtrado); intervalo mínimo de 60 s entre cálculos automáticos; só sugere com ganho do modelo ≥ 5 % **e** ≥ 300 m; nunca sugere trocar a próxima parada quando você está a menos de 200 m dela. **A sequência nunca muda em silêncio**: aplicar = um toque em "Usar nova ordem"; "Manter atual" descarta | recalcular a cada leitura (proibido); aplicação automática (removida a seu pedido) | a rota não "pula"; o Stop e as concluídas nunca mudam; você sempre decide |
| **G9** | Direção visual | ✅ **Definida pelo usuário (revisão 4, 2026-11-19):** o app segue o **Figma** ([arquivo](https://www.figma.com/design/pR1JlzgthpKOSAzGm6f3sZ/Untitled)), com as telas Pedidos, Importar rotas (prévia), Rotas (revisão, otimizada, em andamento), Estatísticas e Custo das entregas, e a barra inferior **Pedidos · Rotas · Estatísticas** (sem Financeiro, revisão 6; a tela Custo das entregas abre pelo cartão de custo em Estatísticas). **O projeto se adapta ao Figma; o Figma não é alterado para seguir o projeto.** Adaptações: o **número do Stop em destaque enorme** em toda tela de parada, junto do código do pedido; **sem** Destinatário, Observação e botões de ligar/mensagem na tela Pedidos (revisão 5). Ilustrações recriadas, sem copiar imagens | adaptar o Figma às regras do projeto (recusado pelo usuário) | é o visual que o usuário escolheu e mantém |
| **G10** | Testar o modelo no celular | Etapa 1 servida pela **rede local** (`vite preview --host`, HTTP), só para visual e ergonomia. **Instalar o PWA e usar o GPS exigem HTTPS**: decidir na Etapa 4 entre certificado local ou túnel (serviço externo; só com autorização) | publicar (proibido) | teste já na 1ª etapa, sem deploy |
| **G11** | Dados do modelo de teste | **fictícios e realistas**: ~60 paradas, Stops com vários pacotes, um Stop dividido, uma parada "?", uma "casa sem nº", endereços inventados, em coordenadas de uma área urbana genérica | dados reais (proibido) | testar a interface sem dado pessoal |
| **G12** | Dados do destinatário e financeiro | ✅ **Definida pelo usuário (revisões 4 e 5, 2026-11-19):** **nome, telefone e observação** do destinatário **não fazem parte do app** (a planilha da SPX não os traz); ~~sem regra de apagamento obrigatório ao finalizar~~ **substituído pela regra definitiva de exclusão ao finalizar (Etapa 3, E3-6)**. **Custo = só o custo estimado da rota, dentro de Estatísticas (sem aba Financeiro, revisão 6):** tipo de combustível, **preço do litro** e **consumo médio (km/L)** informados pelo usuário; o app usa os **km estimados** das rotas importadas: litros = km ÷ consumo; custo = litros × preço; também custo por km e por entrega. Sem saldo, pendente ou gorjetas. ~~Sem receita ou lucro~~ → **mudado por Q4 (2026-11-19 22:21): módulo financeiro opcional (receita, abastecimento, despesas, km, lucro estimado), ainda não implementado**. Dinheiro em centavos inteiros; o custo é sempre rotulado **estimado** | restrições de privacidade da revisão 3 (recusadas pelo usuário); financeiro completo (recusado) | a planilha real não tem esses dados; o usuário só precisa saber quanto a rota custa |
| **G13** | Repositório | Git **local**, sem remoto; **1º commit** (planejamento) só depois da sua aprovação | commitar já | mesma regra do RotaVHS |
| **G14** | Desempenho, RAM, bateria e dados móveis (prioridade) | **metas** (medidas a partir da Etapa 1; celular na 8/9): JS inicial ≤ 150 KB gzip **sem o mapa**; o **MapLibre só carrega na Rota Ativa**; reabrir com o app em cache ≤ 1,5 s até a tela utilizável no S23 FE; RAM ~30–60 MB sem mapa e ≤ 150 MB com mapa; **0 requisições de rede** além dos tiles (e da N2, se autorizada); tiles em cache; GPS em alta precisão só na rota ativa; Worker só quando calcula. Sem bibliotecas de animação, imagens pesadas ou fontes baixadas | carregar tudo na abertura | abrir rápido na rua, poupar bateria e franquia |
| **G15** | **Exigência:** a arquitetura deve permitir, no futuro, **otimização baseada nas ruas reais**, considerando **mão única**, **retornos** (conversões em U, lado da rua de chegada) e **restrições de circulação** (ruas proibidas ou restritas ao veículo, condomínios, acessos) | (1) o solver aceita **matriz assimétrica** (ida ≠ volta), o que já vale no núcleo da 5.3; (2) o modelo pode passar a ter **dois nós por parada** (chegada por um lado ou pelo outro da via), para penalizar retornos e escolher o lado de chegada; (3) a matriz pelas ruas vem de um motor que já respeita mão única e restrições de conversão (OSRM, Valhalla, GraphHopper ou ORS); (4) perfil do veículo e ruas a evitar como parâmetros do provedor. Implementação na etapa opcional **N2**, com autorização (G4) | só distância estimada para sempre | evitar trajetos ineficientes nas entregas da Shopee |

## P1 · Publicação do protótipo visual (autorização específica do usuário, 2026-11-19 18:16)
Pedido do usuário: *"configure o RotaVHS Go para publicação do protótipo visual no GitHub Pages"*.

| Item | Definição |
|---|---|
| O que é publicado | só o **protótipo visual** (arquivos estáticos do app), sempre com o selo **"PROTÓTIPO DE TESTE · dados fictícios"** |
| Onde | repositório **público** `victor1923hsm/rotavhs-go` (GitHub, gratuito) → https://victor1923hsm.github.io/rotavhs-go/ |
| Como | GitHub Actions (`.github/workflows/publicar.yml`): `npm ci` → `npm test` → build com `BASE_PATH=/rotavhs-go/` e `VITE_PROTOTIPO=1` → `npm run tamanho` → GitHub Pages. Falhou um teste, não publica |
| Dados | **só fictícios**: a rota de exemplo (G11) e a planilha fictícia `test-fixtures/planilhas/11-formato-spx.xlsx`. No build publicado, **a escolha de planilha do aparelho fica desligada** (o botão lê a planilha fictícia). A importação de planilha real continua só na versão do PC (`npm run preview`) |
| Fora da publicação | planilhas reais, `.env`, `dist/`, `node_modules/`, as imagens de `docs/referencia-visual/`; varredura antes do envio: 332 trechos da planilha real (códigos, endereços, coordenadas, CEPs) procurados no projeto, **0** encontrados |
| Regras que mudam só para isto | G13 / `CLAUDE.md`: o projeto passa a ter **um** remoto (este repositório) e **um** deploy (este GitHub Pages). Nenhum outro remoto, deploy ou serviço pago |
| Regras que não mudam | G4 (nada de coordenadas para serviços externos sem autorização), planilha real nunca no Git, RotaVHS original só leitura, trabalho por etapas |

**Esta autorização vale só para a publicação do protótipo.** Ela **não** aprova automaticamente, não amplia e não altera nenhuma das decisões G1–G15 nem as etapas: a Etapa 3 continua aguardando a sua aprovação e a Etapa 4 continua não autorizada. Mudanças futuras nas decisões continuam precisando de aprovação explícita.

## P2 · Minha localização real no mapa do protótipo (autorização específica do usuário, 2026-11-19 19:13)
Pedido do usuário: *"visualizar minha localização real no mapa do aplicativo"*, no protótipo público.

| Item | Definição |
|---|---|
| O que faz | ponto azul + círculo de precisão no MapLibre; botão flutuante **"Minha localização"** (tela cheia do mapa) para centralizar; acompanha o movimento com o app aberto; **seta de direção** só com rumo confiável (velocidade ≥ ~5 km/h e precisão ≤ 50 m) |
| Centralização | automática depois de ativar; **arrastar o mapa ou tocar numa parada desliga só a centralização**, o ponto continua sendo atualizado; tocar de novo no botão volta a centralizar |
| Permissão | pedida só quando você toca no botão: primeiro uma explicação do app ("Permitir localização" / "Agora não"), depois o pedido do navegador. Já concedida: liga direto |
| Avisos | permissão negada (com o caminho para liberar), GPS desligado/indisponível, sem sinal há 30 s (mostra a última posição em cinza), leitura imprecisa (> 50 m), navegador sem suporte/sem HTTPS |
| Bateria | GPS só com a função ligada, o app visível **e** um mapa na tela; alta precisão só com o mapa em **tela cheia**; no mapa pequeno, modo econômico; app em segundo plano, fora do mapa ou "Desligar" = `clearWatch` |
| Privacidade | só a **última** leitura, **na memória**; sem histórico; nada no IndexedDB/localStorage; nada enviado a serviços (o app não usa roteirização externa); nada no console. O mapa baixa as **imagens do mapa** (tiles do OpenFreeMap) da área que aparece na tela, como em qualquer mapa: isso não envia as coordenadas, mas revela a região vista |
| Independência | a posição real **não** altera a sequência das paradas, o status, a sugestão de recálculo nem o ponto de partida; a rota fictícia continua usando a "posição de teste" |
| Código | `src/platform/localizacao/` (interface `LocationProvider` + `web.ts`), `src/app/localizacao.ts` (estado só na memória), `src/components/domain/MinhaLocalizacao.tsx` (no bloco do mapa, carregado só em Rotas) |

**Esta autorização vale só para esta função no protótipo.** Ela **não** aprova automaticamente as decisões G1–G15, a Etapa 3 (aguardando aprovação) nem a Etapa 4 (GPS real da operação: filtros completos, Wake Lock, HTTPS local, recálculo por desvio), que continua **não autorizada**. A posição continua sem uso para recálculo automático (G8).

## P3 · GPS como referência dinâmica, otimização dinâmica, agrupamento e execução — no protótipo (autorização específica do usuário, 2026-11-19 19:46)
Pedido do usuário: *"consolidar agrupamento automático, otimização inteligente e localização em tempo real… implemente no protótipo a visualização real do GPS quando autorizada e simule os comportamentos de otimização ainda não aprovados. Identifique claramente o que está funcional e o que é apenas demonstração."*

| Item | Situação no protótipo | Observação |
|---|---|---|
| GPS contínuo com o app aberto e autorizado; ponto azul + círculo; centralizar e recentralizar | ✅ **funcional** (amplia a P2) | econômico em qualquer tela; alta precisão só com o mapa em tela cheia ou com a rota EM ANDAMENTO; para ao desligar ou com o app em segundo plano |
| Estado do GPS: Ativo, Buscando sinal, Impreciso, Indisponível, Desativado | ✅ **funcional** | em Pedidos e Rotas ("GPS: …" + Ligar/Desligar) |
| Filtros: salto (> ~200 km/h e > 3× a precisão, descartado até se confirmar no mesmo lugar) e baixa precisão (> 100 m não substitui uma posição boa recente; mostra "Impreciso") | ✅ **funcional** | contagem das descartadas visível no laboratório |
| Origem dos cálculos = a leitura mais recente **confiável** (≤ 50 m, ≤ 30 s, perto da rota: ≤ 30 km de alguma parada) | 🟡 **demonstração** | Etapa 5 não autorizada |
| **OTIMIZAR MINHA ROTA** a partir da sua posição (botão em destaque após importar) | 🟡 **demonstração** (o botão funciona; partir do GPS é demonstração) | sem GPS confiável: posição de teste (exemplo) ou 1ª parada da SPX |
| Reavaliar depois de cada entrega/tentativa; desvio (> 300 m do trecho por > 2 min); recálculo manual a qualquer momento | 🟡 **demonstração** (Etapa 6 não autorizada) | regras G8 mantidas: intervalo mínimo de 60 s, ganho ≥ 5 % e ≥ 300 m, próxima protegida a < 200 m; **a ordem nunca muda sem o toque**; a sugestão mostra a economia estimada com "Usar nova ordem" / "Manter atual" |
| Agrupamento automático por endereço (mesmo Stop + mesma porta + mesma coordenada) e validações (parada dividida, "mesma porta" com números diferentes só por decisão sua) | ✅ **funcional** (Etapa 2, já aprovada) | Stops e códigos originais preservados; a otimização só reordena visitas |
| Visitas × pacotes mostrados separadamente | ✅ **funcional** | Pedidos e Rotas |
| **Entrega parcial** (pacote a pacote na mesma visita) | 🟡 **demonstração** (funciona e é guardada como eventos por pacote; regra definitiva depende da Etapa 7) | visita com parte entregue e parte sem sucesso = "PARCIAL"; Desfazer limpa |
| **Alerta de proximidade** (número da parada + pacotes; ≤ 80 m com precisão ≤ 50 m; uma vez por parada) | 🟡 **demonstração** (estava "fora do escopo inicial" no plano) | só avisa; **nunca marca entrega** |
| Laboratório de **GPS simulado** | 🟡 **ferramenta de demonstração** | esperas 12× mais rápidas só no simulador (desvio 10 s, intervalo 5 s) |
| Preparação para ruas reais (G15/N2) | ✅ arquitetura | o otimizador recebe uma função de distância (de, para) que pode ser **assimétrica** (mão única, retornos, restrições); o 2-opt compara o percurso inteiro nesse caso |

**Privacidade (mantida):** a posição fica só na memória (última leitura); nada de histórico; nada gravado (IndexedDB/localStorage), enviado ou registrado em log; nenhum serviço de roteirização. O ponto de origem usado numa otimização fica só na memória e some ao trocar de rota.

**Esta autorização vale só para o protótipo.** Ela **não** aprova as decisões G1–G15 nem as Etapas 3–7: a Etapa 3 continua aguardando a sua aprovação; as Etapas 4 (GPS da operação), 5 (otimização inicial), 6 (otimização dinâmica) e 7 (marcação) continuam **não autorizadas**. Propostas que precisam de decisão sua antes de virarem regra definitiva: **entrega parcial** (nova; a definir na Etapa 7) e **alertas de proximidade** (saem de "fora do escopo" para avaliação).

## R1–R5 · Requisitos funcionais do app final (aprovados pelo usuário, 2026-11-19 20:25)
**Aprovação de requisitos, não de implementação:** não autoriza as Etapas 3 a 7. Cada requisito entra no código só na etapa indicada, quando ela for autorizada.

| # | Requisito aprovado | Regra definitiva (proposta para o planejamento) | Etapa |
|---|---|---|---|
| R1 | **Entrega parcial**: cada pacote da visita controlado individualmente | Situação **por pacote**: pendente, entregue ou sem sucesso, sempre identificado pelo código SPX (TN). A visita fica **pendente enquanto houver pacote pendente** (ex.: "2 de 3 entregues · 1 pendente") e continua na rota e na otimização; só sai da lista quando todos tiverem situação final. Visita com entregue + sem sucesso = "parcial". Desfazer volta pacote a pacote. Ao finalizar, pacote pendente conta como **não entregue**. Nada some, duplica ou muda de visita | dados: 3 · tela: 7 |
| R2 | **Alertas de proximidade** com Stop, endereço e pacotes | Ver A6 (anti-repetição) e A7 (silenciar). Nunca marcam entrega | 4 (GPS) + 6/7 |
| R3 | **Agrupamento automático** de encomendas no mesmo endereço | O que já vale (Etapa 2): junta só mesmo Stop + mesma porta + mesma coordenada; Stops diferentes no mesmo endereço e partes de Stop dividido só por decisão sua; o número Stop nunca muda | 2 (feito) |
| R4 | **GPS em tempo real** enquanto a plataforma permitir | App aberto e visível (PWA); segundo plano só na versão nativa (N1). Filtros de salto e precisão; estados Ativo / Buscando sinal / Impreciso / Indisponível / Desativado | 4 |
| R5 | **Otimização dinâmica** pela localização atual | Origem = leitura recente e confiável (≤ 50 m, ≤ 30 s). Reavalia após entrega/tentativa e por desvio; recálculo manual sempre; **toda mudança de sequência exige confirmação** (A9) | 5 e 6 |

### Ajustes pedidos (incorporados ao planejamento)
| # | Ajuste | Definição planejada |
|---|---|---|
| A6 | **Proteção contra alertas repetitivos** | (1) **uma vez por aproximação**: depois de avisar (ou de você fechar), a parada só volta a avisar se você se afastar > 200 m **e** passarem ≥ 10 min (histerese); (2) **intervalo mínimo de 30 s** entre alertas de paradas diferentes; (3) só **um** alerta na tela; se várias estiverem perto, vale a próxima da rota, senão a mais perto; (4) sem alerta acima de ~40 km/h (passando de carro) nem com precisão > 50 m; (5) parada já concluída, ou com todos os pacotes com situação final, não avisa; (6) o controle de "já avisada" é guardado com a rota, para não repetir depois de reabrir o app (sem guardar posição) |
| A7 | **Silenciar alertas** | Botão no alerta: "Silenciar nesta rota" e, nas configurações, "Alertas de proximidade: ligados / desligados". Preferência guardada no aparelho (`settings`). Silenciar não desliga o GPS nem as sugestões |
| A8 | **Regra dos 30 km** | Fica **só no protótipo**, por causa da rota fictícia. No produto: a posição confiável é **sempre** a origem; se você estiver longe da rota (ex.: > 30 km da parada mais perto), o app **avisa** ("você está a 45 km da primeira parada") e pergunta se otimiza a partir de você ou da 1ª parada da SPX, sem bloquear |
| A9 | **Confirmação de qualquer alteração na sequência** | Mantido (G8): nenhuma reordenação sem toque em "Usar nova ordem"/"Otimizar"; nenhuma automática aplicada sozinha; concluídas e a próxima protegida (< 200 m) nunca mudam por sugestão |
| A10 | **Visita parcial com pacotes pendentes** | Ver R1. **Lacuna do protótipo atual:** a demonstração da P3 exige escolher entregue/sem sucesso para **todos** os pacotes (não aceita "pendente"). A regra R1 entra no modelo de dados na Etapa 3 e na tela na Etapa 7 |

## Etapa 3 · Conclusão (autorização do usuário, 2026-11-19 20:50)
Escopo autorizado: os 6 itens pendentes da revisão + **recuperação segura** após o navegador fechar, a aba ser encerrada, o celular reiniciar, ficar sem bateria ou o app ser encerrado pelo sistema. Não autoriza as Etapas 4–7, publicação nem commit.

| # | Decisão | Definição implementada |
|---|---|---|
| E3-1 | **Situação por pacote (R1)** | Fonte da verdade = situação de cada pacote (pendente, entregue, sem sucesso), por posição na visita e com o código SPX. A visita é **derivada**: pendente enquanto houver pacote pendente; "parcial" quando concluída com entregue + sem sucesso. Correção a qualquer momento (inclusive voltar a "pendente"), sempre como evento novo |
| E3-2 | **Gravação imediata e transacional** | cada toque grava, numa **só transação**, os eventos novos e a sessão (fase, ordem, parada atual, plano ativo, alertas); durabilidade `strict` do IndexedDB (o navegador só confirma depois de gravar no disco). Falha de gravação: nada é descartado nem reordenado; o app avisa e tenta de novo (sozinho a cada 15 s ou pelo botão) |
| E3-3 | **Ao reabrir** | a rota ativa volta como estava e o app oferece **Continuar de onde parei / Encerrar esta rota / Excluir sem resumo** |
| E3-4 | **Planos (R5, base para 5/6)** | ordem original da SPX + **5 planos mais recentes** + plano ativo; voltar a um plano só com confirmação e sem mexer nas marcações. Nenhum algoritmo novo |
| E3-5 | **Alertas (A6/A7)** | política implementada e testada (1 por aproximação; rearme > 200 m **e** ≥ 10 min; 30 s entre alertas; 1 visível; sem alerta com precisão > 50 m ou acima de ~40 km/h). Guardado com a rota: "parada X avisada às hh:mm", "já se afastou (sim/não)", "silenciado nesta rota" — **nunca a posição**. Preferência global "alertas ligados/desligados" (não desliga o GPS). A **detecção** continua demonstração até a Etapa 7 |
| E3-6 | **D-Ret · exclusão ao finalizar (regra definitiva do usuário)** | (1) gera o resumo; (2) valida totais e campos (lista fechada; recusa endereço, código, coordenada e nome de arquivo); (3) grava o resumo com limpeza "pendente" e a rota "finalizando", na mesma transação; (4) confere a gravação; (5) apaga paradas, pacotes, eventos, planos, matriz, a própria rota; (6) confere que nada restou e marca a limpeza "concluída". Interrompida: o resumo fica, nada é dado como limpo, e a limpeza termina na próxima abertura (ou em "Alertas e dados → Tentar de novo") |
| E3-7 | **Rota substituída / abandonada** | importar outra planilha (ou voltar ao exemplo) com a rota em uso **pede confirmação**: com marcações → encerra (resumo "substituída" + exclusão dos detalhes); sem marcações → exclui. Rota guardada não concluída ou com limpeza pendente aparece em **Estatísticas → Alertas e dados**, com "Excluir definitivamente". **Limpeza automática por prazo: não implementada** (opção mais conservadora quanto à perda de trabalho) até a sua decisão (ver Q1) |
| E3-8 | **Conferência em andamento** | guardada a cada escolha; volta ao reabrir; apagada ao confirmar ou descartar |
| E3-9 | **Migração v1 → v2** | sem apagar o banco: eventos antigos continuam válidos (v1 = visita inteira; demonstração P3 = código do pacote, que ganha a posição); rotas ativas ganham o plano da SPX e o estado de alertas; **rotas finalizadas da v1** (que guardavam endereços) entram na limpeza pela regra nova; o nome de arquivo some dos resumos antigos |

### Questões que ainda dependem de você
| # | Questão | Proposta | Enquanto não decidir |
|---|---|---|---|
| Q1 | Prazo para limpar **rotas abandonadas** (não finalizadas) | perguntar ao abrir quando a rota estiver parada há > 24 h (já feito) e, **após 7 dias sem uso**, encerrar automaticamente com resumo "abandonada" e excluir os detalhes | nada é apagado sozinho; o diálogo ao abrir avisa "aberta há mais de um dia" |
| Q2 | Prazo para **conferências não terminadas** | descartar após 7 dias | ficam até você descartar |
| Q3 | **Cache de imagens do mapa** (até 60 MB, G6): mostra regiões vistas, sem endereços nem códigos | manter (é o mapa offline) | mantido; não é apagado ao finalizar |
| Q4 | **Receita, despesas, lucro** no resumo (o pedido de 20:50 os lista como permitidos) | entram só se você revogar a parte da G12/revisão 6 que excluiu receita e lucro, numa decisão própria (com a tela para informá-los) | o resumo tem custo estimado de combustível, km e litros; sem receita/lucro |
| Q5 | Teste **real** de falta de bateria / reinício no celular | Etapa 8 (instalação) | só simulado (ver relatório) |
| Q6 | **Folga do JS inicial** (143 KB de 150 KB) | dividir o código por tela nas Etapas 4–7 | — |

## Decisões Q1–Q6 (usuário, 2026-11-19 22:21)
A Etapa 3 está **tecnicamente aceita para validação**; a **aprovação final depende do teste no celular real** (`docs/ROTEIRO-TESTE-ANDROID.md`). Estas decisões não autorizam as Etapas 4–7, commit ou publicação.

| # | Decisão do usuário | Proposta de implementação (aguarda autorização) |
|---|---|---|
| Q1 | **Rotas abandonadas:** nunca excluir automaticamente uma rota ativa (nem após 7 dias). Mostrar aviso de inatividade com **continuar** ou **excluir**. Propor limpeza de rotas definitivamente abandonadas sem perda silenciosa | **Já existe:** ao abrir, "Rota em andamento encontrada" com Continuar / Encerrar / Excluir, e o aviso "aberta há mais de um dia". **Proposta:** (1) aviso de inatividade em 3 níveis — > 24 h (informativo), > 7 dias (destaque "parada há N dias"), > 30 dias (marcada como **abandonada** em Alertas e dados); (2) **encerramento assistido**: um toque em "Encerrar com resumo" (o resumo fica e os detalhes são apagados), sempre com confirmação; (3) **nenhuma exclusão automática**; uma opção futura, só se você ligar, para "encerrar sozinho com resumo rotas paradas há mais de 30 dias, avisando na abertura seguinte" — desligada por padrão. Rotas que não abrem mais (corrompidas) também aparecem lá para exclusão manual |
| Q2 | **Conferências incompletas:** prazo de **7 dias sem atividade**, com aviso quando possível e **proteção** durante uma conferência ativa | Conta a partir da última escolha (`atualizadaEm`); aviso ao abrir quando faltar 1 dia ("será descartada amanhã"); o descarte só roda **na abertura do app** e **nunca com a tela Importar aberta**; cada escolha reinicia o prazo; o descarte apaga só a conferência (nunca a rota em uso) |
| Q3 | **Cache do mapa:** manter **60 MB** e oferecer **limpar os mapas armazenados**; deixar claro que o cache não garante cobertura offline | Botão **"Limpar mapas guardados"** em Alertas e dados (apaga só as imagens do mapa, com o tamanho mostrado antes), com o texto "o mapa guardado cobre só o que já apareceu na tela; não garante a sua região sem internet". Não é apagado ao finalizar |
| Q4 | **Financeiro opcional:** registrar **receita da rota, abastecimento, despesas, quilometragem e lucro estimado**, sem atrapalhar as entregas | **Muda a decisão anterior** (G12/revisão 6 excluía receita e lucro): passa a ser um **módulo opcional** (desligado por padrão, fora do fluxo de entrega, só em Estatísticas), valores em centavos, lucro sempre "estimado", e o resumo da rota poderá guardar esses totais **sem dados identificáveis**. **Nada implementado agora:** precisa de planejamento próprio (etapa a definir) e autorização |
| Q5 | **Teste de recuperação no Android** | Roteiro pronto: `docs/ROTEIRO-TESTE-ANDROID.md` (12 cenários; o "sem internet" só em HTTPS) |
| Q6 | **Desempenho:** carregar telas e módulos secundários **sob demanda** | **Já feito:** mapa, leitor de planilha, "Alertas e dados" e "Rotas finalizadas". **Proposta:** também Custo, Conferência (Importar), Laboratório e planos; meta mantida (JS inicial ≤ 150 KB; hoje 143,2 KB) e passa a ser regra para as Etapas 4–7 |

**Publicação (pedido de 22:21):** só publicar código **idêntico ao testado**. Verificação criada: `scripts/verificar-publicacao.mjs` + `publicacao.manifesto.json` (gerado por `npm run manifesto`, que só grava depois de `npm test` passar) + passo de conferência no workflow do GitHub (a publicação para se algum arquivo diferir). A versão antiga preparada para o GitHub Pages estava desatualizada (sem a Etapa 3) e foi descartada.

## Q1, Q2, Q3 e Q6 implementados (autorização do usuário, 2026-11-19 22:45)
| # | O que ficou | Onde |
|---|---|---|
| Q1 | Rota sem atividade: aviso em 3 níveis — **> 24 h** ("sem atividade há mais de um dia"), **≥ 7 dias** ("sem atividade há N dias"), **≥ 30 dias** ("**potencialmente abandonada**", em destaque). Sempre com **Continuar / Encerrar com resumo / Excluir**, cada exclusão ou encerramento com confirmação. **Nenhuma exclusão automática.** Marcar um pacote agora também conta como atividade (última alteração) | `src/core/retencao.ts` (`inatividade`), diálogo ao abrir (`Retomada.tsx`), **Alertas e dados** |
| Q2 | Conferência não terminada: **7 dias desde a última interação**. Aviso antecipado a partir de 6 dias; aos 7 dias novo aviso e **mais 24 h de carência**; só depois disso é descartada, ao abrir/voltar ao app, **nunca com a tela Importar aberta**, e sempre com aviso na tela (nunca em silêncio). Abrir ou mexer na conferência recomeça o prazo. Aviso com Continuar / Descartar (com confirmação) / Depois | `decidirConferencia` em `src/core/retencao.ts`, `verificarConferencia` em `src/app/persistencia.ts`, `AvisoConferencia` |
| Q3 | Limite de ~60 MB mantido. **"Limpar mapas guardados"** em Alertas e dados: mostra quantas partes e quantos MB, explica que sem internet o mapa só mostra áreas já abertas, **pede confirmação** e apaga **só** o cache `mapa-tiles` (rotas, entregas e resumos ficam) | `src/platform/mapaCache.ts`, `Preferencias.tsx` |
| Q6 | Sob demanda também: **Importar, Custo, Laboratório** (além de mapa, leitor de planilha, Alertas e dados, Rotas finalizadas). Pré-carregamento com o aparelho ocioso para a 1ª abertura não piscar. **JS inicial: 144,1 → 137,2 KB gzip** (meta ≤ 150). Nenhuma dependência nova | `src/app/sobDemanda.ts` |

## Correção do repositório (usuário, 2026-11-19 22:56)
O proprietário correto é **victor1923hsm** (não victor1923moreira): repositório `victor1923hsm/rotavhs-go`, endereço https://victor1923hsm.github.io/rotavhs-go/. O workflow só publica nesse repositório (`if: github.repository == 'victor1923hsm/rotavhs-go'`) e com o caminho fixo `/rotavhs-go/`.

## I1 — Importação real de planilhas SPX no protótipo publicado (autorizada pelo usuário em 2026-11-20 06:10)
**Escopo:** só a importação funcional e a integração com o que já existe. Não aprova as Etapas 4–7, a otimização funcional nem os alertas. **Implementada e validada localmente; publicar exige nova autorização específica.**

| Item | O que ficou |
|---|---|
| Arquivos | **.xlsx** e **.csv** (vírgula ou ponto e vírgula, UTF-8 ou Windows-1252). **.xls (Excel antigo) recusado** com orientação: o leitor atual não lê .xls e incluir um leitor exigiria dependência nova (a versão do SheetJS no npm está desatualizada e tem falhas conhecidas). Arquivo que não é planilha, vazio, > 15 MB → mensagem clara |
| Erros | Diz **qual coluna faltou** (ex.: "Destination Address"); cabeçalho não encontrado; planilha sem pacotes. Contabilidade: linhas = pacotes + ignoradas; paradas sem coordenada (e quantas com valor inválido); **coordenada longe demais do resto da rota (> 60 km da mediana: localização não confirmada, fora do mapa, sem mover a posição)**; linhas sem endereço; pacotes sem código |
| Duplicidades | Pacote repetido **impede confirmar** até você escolher qual linha remover (nunca remove a última). Mesmo endereço com números diferentes e parada dividida continuam como antes (decisão sua, desfazível) |
| Agrupamento | Mesmo Stop + mesmo endereço (porta, inclusive apto/bloco/quadra/lote) + mesma coordenada = uma visita. Endereços diferentes com a mesma coordenada **não** são unidos. Apto 101 × Apto 102 = visitas separadas e sinalizadas ("são o mesmo local" se você quiser). Stop original preservado; sem Stop → "?" |
| Conferência | Busca por **número da parada** ou **parte do código do pacote** (SPX TN). Visitas sem localização sinalizadas na prévia, em Pedidos e no cartão da parada |
| Rota | Salva no aparelho (Dexie), retomada após fechar, entrega parcial por pacote, finalização com resumo e exclusão (política da Etapa 3). Depois de confirmar: **OTIMIZAR MINHA ROTA em destaque**. A otimização aparece como **cálculo de teste (DEMONSTRAÇÃO, linha reta)** e só muda a ordem com o toque |
| Busca na rota | Pedidos/Rotas: "Buscar pelo código do pacote" além do número da parada |
| Selo | "PROTÓTIPO DE TESTE · sua planilha, só neste aparelho" com rota real; "· dados fictícios" com a de exemplo ou a fictícia; só "PROTÓTIPO DE TESTE" na tela Importar |
| Privacidade | Leitura no aparelho (Worker). Nenhum envio: o teste registra **só GET** para o próprio app e para as imagens do mapa, sem código, endereço ou coordenada nas URLs. **Service worker não guarda planilhas** (`globIgnores` xlsx/xls/csv; nenhuma regra de cache para elas; a do aparelho nem passa pela rede). Cartão "Seus dados ficam só neste aparelho" explica armazenamento e exclusão |


## V1–V14 · Evolução v2 (propostas de 2026-11-24, **todas PENDENTES**)
Pedido do usuário de 2026-11-24 20:05: só planejamento. Nenhuma destas decisões autoriza código, dependência, commit ou publicação. Detalhes: `PLANO-GERAL.md` (Evolução v2) e `ARQUITETURA.md` §13.

| # | Assunto | Proposta | Por que precisa de decisão |
|---|---|---|---|
| V1 | Plataforma | PWA até a validação de campo (F9); Capacitor/Android só na F10 | definido pelo usuário; registrar como aprovado ao aprovar o plano |
| V2 | Tela Início e barra inferior | Início como **tela de abertura** (rota em andamento, importar, últimas rotas), **sem** 4ª aba; barra continua Pedidos · Rotas · Estatísticas | a revisão 6 fixou 3 abas |
| V3 | Financeiro (tela 14) | módulo opcional Q4, **desligado por padrão**, aberto por Estatísticas; sem aba Financeiro | a revisão 6 tirou a aba; Q4 prevê o módulo |
| V4 | Ruas reais (F5) | OpenRouteService com **chave sua**, consentimento por rota, volta ao estimado; GraphHopper gratuito descartado (não comercial) | exige serviço externo (G4) e conta/chave |
| V5 | Critérios de otimização | tempo (padrão), distância, combustível, inteligente; sem ruas, a tela avisa que tempo, combustível e inteligente são estimados | o "inteligente" usa pesos a calibrar |
| V6 | Agrupamento automático de ordem | visitas a ≤ ~40 m viram bloco movido junto, sem unir Stops; pode ser desligado | muda a ordem proposta |
| V7 | Temas | **Revisado em 2026-11-24:** Claro = cores do Figma original; Alta visibilidade = o mesmo desenho com texto preto, cinzas ≥ 7:1 e contorno nos cartões; Escuro = tokens Noite. Layout idêntico nos três (`DESIGN.md` §4) | qual é o padrão |
| V8 | Scanner | `BarcodeDetector` nativo do navegador (Chrome Android); biblioteca local de leitura só se aprovada (dependência nova, necessária no iOS) | dependência nova |
| V9 | Memória geográfica | guardar no aparelho **só as correções de posição que você fizer**, chaveadas por um resumo do endereço; apagar junto com a rota (padrão) **ou** manter até você limpar | conflita com a regra definitiva de exclusão ao finalizar |
| V10 | Geocodificação | nenhuma por padrão; opcional, por ação sua, um endereço por vez (Nominatim, ≤ 1/s, sem dados pessoais além do endereço) | envia endereço a terceiro |
| V11 | Wake Lock | opcional, ligado só no Modo motorista, com aviso de bateria | bateria |
| V12 | Ordem manual | arrastar, inverter, fixar primeira/última; a ordem manual vira um plano ("manual") e a otimização a respeita | muda a sequência (com toque) |
| V13 | Organização do código (F0) | pasta `providers/`, regras extraídas de `app/estado.ts` para `core/`, verificação automática de importações | refatoração ampla, sem mudar comportamento |
| V14 | Git da pasta D: | a pasta do PC não tem commits; trazer o histórico do GitHub (`33d2322`) para o Git local antes da F0, sem enviar nada | mexe no `.git` local |
| V15 | Barra inferior | **APROVADA em 2026-11-25:** barra do Figma encostada no fim, 4 abas (Pedidos · Rotas · Estatísticas · Financeiro), aba ativa menta; no tema Escuro, fundo mais claro, linha menta no topo e brilho na aba ativa (`DESIGN.md` §3.6) | substitui a revisão 6 (3 abas) e a 12 (menu flutuante de vidro); as transições entre telas da revisão 12 continuam |

## A1 · Aprovação oficial da Evolução v2 (2026-11-25)
- **Aprovados:** os 17 wireframes revisados no padrão do Figma; **V15**; o início da implementação local (F0 → F1 → F2 → F3 → F4, incremental, testes a cada fase).
- **Plataforma:**
  - PWA mantido;
  - **APK Android de testes com Capacitor** (um só sistema, código compartilhado);
  - instalação manual no S23 FE;
  - **sem Play Store**.
- **Compilação do APK:** GitHub Actions (branch `v2-dev`, workflow `android.yml`), com assinatura de testes persistente em segredos do GitHub.
- **Pré-lançamento:** é criado um pré-lançamento só com o APK, para baixar no celular.
- **Proibido sem nova aprovação:**
  - mexer no `main`;
  - publicar no GitHub Pages;
  - publicar na Play Store.
- **Motor viário:** OpenRouteService é o candidato principal da F2. A chave **nunca** vai no código, nos arquivos versionados nem no build do Pages.
- **Antes de ligar o roteamento externo:** documentar quais coordenadas saem, para quê e com que privacidade.
- **Q4 (financeiro):** passa a ter a aba Financeiro (V15). Nesta versão a aba mostra só o custo **estimado** de combustível e as entregas; receitas, abastecimentos e despesas vêm na F4.

## R1–R6 · Traçado real pelas ruas — **APROVADAS em 2026-11-25 19:43, com ajustes**
| # | Decisão aprovada |
|---|---|
| R1 | OpenRouteService público como provedor inicial; arquitetura pronta para migrar para OSRM ou Valhalla em servidor próprio |
| R2 | Envio **exclusivamente** das coordenadas necessárias à roteirização, com as duas autorizações (Configurações + por rota). Nunca nome, endereço textual, telefone, código SPX ou identificador de encomenda |
| R3 | Veículo principal: **carro**. Arquitetura preparada para escolher moto no futuro (perfil no adaptador) |
| R4 | Remoção **completa** das linhas retas: o mapa mostra só o traçado real pelas ruas |
| R5 | Otimização aproximada offline permitida, claramente identificada; **prioridade para a última rota real guardada no aparelho** |
| R6 | Chave do ORS configurada no app; orientação para criar a conta e a chave será dada depois |

Requisitos adicionais do usuário (mesma data): auditoria do motor e comparação de algoritmos (§15 de `ARQUITETURA.md`), reformulação visual estilo Spoke (proposta V16, ainda **pendente**), desempenho e limites, validação com rotas reais, preservação do teste.7. **Nenhum código antes da aprovação da auditoria, do plano e das propostas visuais.**

### Proposta original (registro)
Detalhes, custos e limitações: `ARQUITETURA.md` §14. Nada implementado antes da aprovação.

| # | Assunto | Proposta | Precisa de decisão porque |
|---|---|---|---|
| R1 | Provedor | **Começar pelo OpenRouteService público** (R$ 0, matriz + rota, mão única pelo OSM), atrás das interfaces; **servidor próprio** (Valhalla ou OSRM num VPS de ~€ 4,5–7/mês) como 2º passo se a cota, a qualidade ou a privacidade pedirem | envolve terceiro (A) ou custo mensal (B) |
| R2 | Autorização de envio (G4) | só coordenadas (visitas pendentes + posição atual se pedida), com autorização nas Configurações + consentimento por rota | coordenadas das entregas saem do aparelho |
| R3 | Veículo | carro ou moto? (moto pede Valhalla, com custo de moto) | muda o motor e o tempo estimado |
| R4 | Linha reta no mapa | **remover** o tracejado "ordem, não é o caminho"; sem geometria, só pinos + aviso | muda o visual atual da tela Rotas |
| R5 | Ordem sem serviço | permitir a ordem **aproximada** local (rotulada "sem ruas"), sem desenhar linhas | é uma estimativa, não o percurso real |
| R6 | Chave do ORS | você cria a conta e a chave e digita no app (fica só no aparelho) | credencial sua |

## V16 · Rota ativa estilo Spoke (proposta de 2026-11-25; **variante B APROVADA em 2026-11-25 20:53**, implementação na fase R-C)
Canvas: "RotaVHS-Go — Proposta visual estilo Spoke (traçado real)" (8 telas). Mapa em tela cheia, traçado real (concluído / pendente / até a próxima), pinos numerados com a cor fixa da parada, cartão retrátil da próxima parada, botões flutuantes (minha localização, ver rota inteira, recalcular), alternância Mapa/Lista no topo, toque no pino abre a parada, 3 temas.
- **Variante A (recomendada):** barra inferior do Figma encostada (V15) mantida; o cartão da próxima parada é o painel flutuante.
- **Variante B:** barra inferior flutuante (pedida como "menu de seleção inferior flutuante"). **Reabre a V15** e a revisão 12 (menu flutuante de vidro foi substituído pela V15).

## R-A · Aprovação da auditoria e do plano R-A a R-D (2026-11-25 20:53)
**Interface (V16, variante B APROVADA; substitui a V15):**
- O mapa é o elemento principal (experiência do Spoke).
- A barra inferior fica flutuante: margens laterais, cantos arredondados, sobreposta ao mapa, sem ocupar uma faixa inteira.
- O cartão da próxima entrega é flutuante, retrátil e expansível.
- Mantêm-se a identidade do RotaVHS-Go e os 3 temas.
- Os elementos flutuantes não se sobrepõem, respeitam a área segura do Android e não escondem informação importante do mapa.
- **A R-C apresenta as telas finais para aprovação antes de alterar a interface.**

**Motor (aprovado: várias soluções iniciais + 2-opt + Or-opt + 3-opt + ILS):**
- Origem **sempre** na posição atual do motorista; **nunca** começa automaticamente pela 1ª parada da SPX. A ordem da SPX fica só como referência.
- Matriz assimétrica e custo real das inversões de trecho.
- Término livre por padrão; destino final opcional.
- Reotimiza só as pendentes.
- Nunca aplica automaticamente uma ordem pior que a atual, nas mesmas condições.
- Roda em segundo plano e pode ser cancelado sem perder a rota anterior.
- Preserva a integridade dos pacotes e das visitas.
- Objetivo: **menor tempo**, mostrando também a distância.

**Traçado:**
- Nada de linhas retas.
- A geometria acompanha as ruas e corresponde **exatamente** à sequência escolhida.
- A rota completa aparece, com destaque até a próxima entrega.
- Sem serviço: usa a geometria guardada **só se** corresponder à ordem atual; senão, só pinos e aviso.

**OpenRouteService:** integração aprovada. Avaliar:
- respostas HTTP 429 e limites por minuto;
- pontos fora da malha e pares sem percurso;
- cancelamento e retomada do download da matriz;
- bateria e dados móveis;
- tempo do toque até a rota pronta.

Distância indisponível **nunca** é trocada em silêncio por linha reta.

**Segurança:**
- Plugin de armazenamento seguro (Android Keystore) aprovado.
- Antes de instalar: verificar manutenção, licença, compatibilidade com o Capacitor, permissões e dependências.
- A chave nunca aparece em logs, relatórios, Git ou arquivos exportados.

**Testes:**
- 50, 100, 250 e 500 paradas.
- Matrizes assimétricas, mão única, vias sem acesso, queda de conexão, cancelamento e reotimização.
- Tempos separados: matriz, algoritmo e traçado.
- Comparação com o Spoke com a mesma origem, as mesmas paradas e o mesmo término.

**Execução:**
- R-A autorizada, com o APK teste.8 para validação física.
- R-B só depois da validação da R-A.
- Preservar as correções do teste.7.
- Não publicar no main nem alterar o PWA publicado.

## RB1–RB5 · Fase R-B (plano de 2026-11-26, `ARQUITETURA.md` §16) — proposta original; **aprovadas com alterações em 2026-11-26 08:58 (ver abaixo)**
| # | Assunto | Proposta | Por que precisa de você |
|---|---|---|---|
| RB1 | Uso comercial do ORS | O plano gratuito diz "Commercial use not allowed". Proposta: **A** (perguntar à HeiGIT) **+ B** (usar só em testes de validação até a resposta). Se a resposta for não, ir para **C** (Valhalla próprio, ≈ € 6/mês) | envolve os termos de um terceiro e um possível custo mensal |
| RB2 | Plugin de cofre (Android Keystore) | `capacitor-secure-storage-plugin` 0.14.2 (MIT, sem dependências extras), depois da leitura do código | dependência nova |
| RB3 | Chave no PWA | **Ruas só no APK** (o navegador não tem cofre). O PWA continua com o cálculo aproximado | limita o PWA |
| RB4 | Otimizar sem conexão com matriz guardada | o 1º trecho (da sua posição) fica *estimado* e rotulado; o resto pelas ruas | mistura uma estimativa num cálculo pelas ruas |
| RB5 | Ponto fora da malha | a parada fica fora da otimização pelas ruas (no fim, sinalizada), com nova tentativa única de raio de até 1 km | a parada não é otimizada |

## RB1–RB5 · APROVADAS com alterações (2026-11-26 08:58)
| # | Decisão aprovada |
|---|---|
| RB1 | **ORS só para desenvolvimento e testes**, respeitando os termos. Preparar a consulta formal à HeiGIT sobre o uso individual em entregas remuneradas. Criar a interface **`RoutingProvider`**, independente de provedor (ORS, Valhalla, OSRM), **sem mudar o motor**. **Não contratar servidor agora** |
| RB2 | Plugin de armazenamento seguro **autorizado depois da auditoria** (segurança, licença, manutenção, compatibilidade). **Nunca** embutir a chave no código-fonte nem no APK |
| RB3 | **Temporária:** prioridade ao APK Android. O PWA atual continua funcionando, e fica aberta a integração futura por um **backend seguro** |
| RB4 | Otimização **offline com a matriz guardada**; trechos estimados **claramente identificados** e nunca apresentados como percurso real. **Reaproveitar a matriz** ao reotimizar pendentes (sem pedidos desnecessários) |
| RB5 | **Não** mandar paradas problemáticas automaticamente para o fim. Preservar a **coordenada original** e usar uma **coordenada auxiliar de acesso viário**. Encaixe progressivo em **25, 50, 100 e 200 m**; distâncias maiores **só com a sua confirmação**. Sem percurso válido: parada **pendente de revisão**, com **posicionamento manual** na sequência |

**Requisitos obrigatórios da R-B (2026-11-26):**
1. Validação da R-A corrigida (fechar e reabrir sem perder a rota; desempenho com rotas grandes).
2. Preservar tudo o que foi aprovado no teste.8.
3. Origem sempre na posição atual.
4. Agrupamento automático do mesmo endereço preservado.
5. Cancelar nunca muda a rota ativa.
6. Testar matrizes assimétricas, mão única, conversões proibidas e vias sem acesso.
7. Benchmarks com 50, 100, 150, 200, 300 e 500 paradas.
8. Registrar consumo de API, tempo de processamento, memória, distância, duração estimada e pontos problemáticos.
9. Comparar com o Spoke em condições equivalentes.
10. Nunca trocar percurso real por linha reta em silêncio.
11. Reconferir limites, endereços e termos oficiais.
12. Preservar as regras de privacidade.
13. Não enviar nomes, telefones, identificadores de encomendas nem endereços em texto ao provedor.
14. Não alterar o main, o PWA publicado nem o RotaVHS original.
15. Trabalhar só na branch v2-dev.

**Execução:** RB-0 (preparação da arquitetura, auditoria das dependências e testes) autorizada. **A RB-1 só com nova autorização**, depois da apresentação dos resultados da RB-0.

**RB-0 concluída em 2026-11-26** (ARQUITETURA §17) e **aprovada em 2026-11-26 10:22**; cofre escolhido: **opção C**.

## RB-1 · Autorizada em 2026-11-26 10:22 (cofre opção C + central de otimização)
| Item | Decisão do usuário |
|---|---|
| Cofre | **Opção C:** plugin nativo próprio e mínimo, **Android Keystore + AES-256-GCM**, sem criptografia própria; só guardar, ler, verificar existência e excluir; a chave nunca em logs, relatórios, diagnósticos ou mensagens de erro; nunca em localStorage, IndexedDB ou arquivos desprotegidos; **backup não exporta**; tratar invalidação da chave e reinstalação; substituir e excluir; o PWA continua funcionando sem cofre |
| Central | Tela "Calcular pelas ruas": otimização rápida (motor atual) e pelas ruas reais, disponibilidade do provedor, chave em campo protegido com substituição, modo selecionado claro, estados de carregamento, erro, indisponibilidade e cancelamento, **aviso de que a integração real está em desenvolvimento**. Nada simulado como rota real |
| Preservação | Importação SPX, agrupamento por endereço, GPS contínuo, origem na posição atual, reotimização só das pendentes, cancelar sem mudar a rota, persistência da rota ativa, as três opções de término e todas as correções até o teste.8 |
| Uso comercial | Arquitetura independente do ORS; **não assumir** que o plano gratuito permite uso nas entregas; **consulta à HeiGIT: PENDENTE** até resposta formal; caminho aberto para servidor próprio (Valhalla/OSRM) sem API comercial obrigatória |
| Limites | Só v2-dev; main, PWA publicado e RotaVHS original intocados; **nenhuma chamada a provedor real**; não substituir o motor atual; **não iniciar a RB-2 sem aprovação** |
| Entrega | Todos os testes, emulador, teste do cofre (inclusive excluir e substituir), capturas, documentos, APK **teste.9** assinado se tudo passar |

**Consulta à HeiGIT (uso comercial individual): PENDENTE.** Rascunho em ARQUITETURA §17.8; você envia. Até a resposta formal, o ORS é só para desenvolvimento e testes.

## P-COORD · Coordenadas dos destinatários como dado pessoal — **APROVADA com condições em 2026-11-26 12:39 (ver abaixo)**
Coordenadas de entrega podem identificar uma pessoa mesmo sem nome e endereço (LGPD: dado pessoal quando permitem identificar). Proposta de tratamento:
1. **Envio:** só com a sua autorização expressa no app (G4), revogável; só coordenadas (6 casas) e parâmetros técnicos, conferidos pela guarda de carga (`privacidade.ts`). A sua posição também é coordenada pessoal (sua).
2. **Minimização:** o provedor recebe as coordenadas de acesso viário (o ponto na rua), não ids, ordem da SPX nem número da parada; os pedidos de matriz não dizem qual ponto é "entrega".
3. **Retenção no aparelho:** matriz, encaixes e traçado ficam só enquanto a rota existir e são apagados ao finalizar, encerrar ou substituir a rota (mesma regra da Etapa 3); validade máxima do cache de 7 dias.
4. **Retenção no provedor:** fora do nosso controle; registrar a política do ORS (ou do servidor próprio) antes de ligar; servidor próprio permite "sem registro de pedidos".
5. **Logs:** nenhum log com coordenadas, chave ou respostas; relatórios só com contagens e tempos.

## RB-1 · Aprovada tecnicamente (2026-11-26 12:39)
Validação física do **APK teste.9 no S23 FE: pendente**.

## P-COORD · APROVADA com condições (2026-11-26 12:39)
1. Enviar **só** as coordenadas necessárias ao cálculo (origem e destino quando necessários).
2. **Autorização explícita** antes do primeiro envio, **informando o provedor** que recebe os dados.
3. Nunca enviar nomes, telefones, endereços em texto, identificadores de encomendas ou planilhas.
4. **Não** enviar continuamente a localização do motorista ao provedor.
5. **Não** enviar coordenadas para telemetria ou serviços de análise.
6. **Excluir** os dados associados à rota quando ela for encerrada ou excluída.
7. **Verificar a compatibilidade com a LGPD e os termos do provedor antes de habilitar o envio real.**

## RB-2 · Autorizada em 2026-11-26 12:39
| Requisito | Resumo |
|---|---|
| Integração | Cliente do provedor pela `RoutingProvider`, testado com respostas controladas |
| Segurança | `CofreChave`; chave e coordenadas fora de logs, erros, relatórios e telemetria |
| Consumo | Limite de pedidos, concorrência, tempo limite, cancelamento, 429, estimativa antes de otimizar; **nada de tentativas ilimitadas** |
| Rotas grandes | 50/100/150/200/300/500; divisão da matriz pelos limites oficiais; **nenhuma parada eliminada** |
| Cache | Local, **≤ 7 dias**, por provedor, veículo, versão dos dados e finalidade (a rota) |
| Motor atual | Modo rápido funcionando, inclusive sem internet; falha do provedor → oferecer rápida ou cancelar; **nunca trocar o modo em silêncio** |
| Experiência | Progresso real das etapas, cancelamento, rota anterior preservada até aplicar o novo resultado |
| Desempenho | JS inicial < 150 KB; RB-2 sob demanda |
| Validação | Mão única, assimetria, inacessíveis, sem saída, sem conexão, chave inválida, limite, cancelamento, reotimização |
| Restrições | Só v2-dev; main, PWA publicado e RotaVHS original intocados; **não iniciar a R-C**; sem coordenadas reais nos testes; **nenhuma chamada ao provedor real** até a confirmação dos termos e sua autorização específica |
| Entrega | Resultados, benchmarks, consumo estimado, riscos, limitações, arquivos; **APK teste.10** só depois dos testes automatizados e do emulador, dizendo o que não foi validado com o provedor real |

**Envio real:** bloqueado no código (`ENVIO_REAL_LIBERADO = false` em `src/app/ruas.ts`). Liberar exige: resposta da HeiGIT, conferência LGPD/termos e sua autorização específica.


## RB-2 · Aprovada tecnicamente (2026-11-26 14:52)
Validação física dos **APKs teste.9 e teste.10 no S23 FE: pendente**.

## RB-3 · Autorizada em 2026-11-26 14:52
| Requisito | Resumo |
|---|---|
| Segurança e privacidade | `ENVIO_REAL_LIBERADO = false` mantido; **nenhuma requisição ao provedor real** sem autorização específica; consulta à HeiGIT em **português e inglês**; verificar termos, retenção de coordenadas, tratamento, transferência internacional e LGPD; coordenadas de residências podem ser dado pessoal; preservar `CofreChave` e as regras de privacidade |
| Motor | Matriz assimétrica pela malha; manter múltiplas soluções iniciais, 2-opt, Or-opt, 3-opt e ILS; origem = posição atual (nunca a 1ª da SPX); só pendentes; opções de destino final; **comparar com a ordem anterior pela mesma matriz e condições; nunca aplicar automaticamente uma solução pior**; cancelar em qualquer etapa |
| Paradas problemáticas | Interface de revisão: selecionar no mapa, ajustar a localização, ver original e corrigida, restaurar, **confirmar antes de usar**, recalcular os trechos afetados. Nenhuma encomenda excluída, duplicada ou marcada como entregue automaticamente |
| Central | Modo rápido aproximado, modo pelas ruas, origem, destino final, distância, tempo de deslocamento, paradas, consumo estimado, andamento, comparação anterior × nova; resultados simulados ou aproximados **rotulados**, nunca apresentados como roteirização real |
| Auditoria da RB-2 | 11 pedidos × 41 rotas/dia (200 paradas); limites efetivos por minuto e por dia; consumo de Directions da RB-4; disponibilidade real do Snap; respostas incompletas; invalidação do cache ao reposicionar; isolamento das permissões de rede dos APKs de teste; notas dos releases |
| Preparar (sem iniciar) | RB-4 (traçado real, sem linhas retas, geometria guardada) e R-C (mapa em tela cheia, menu flutuante B, cartão retrátil, marcadores numerados, mapa/lista, temas claro/escuro/alta visibilidade) |
| Entrega | Regressão completa, emulador, **APK 2.0.0-teste.11**, resultados/limitações/pendências, documentação; **aguardar aprovação antes da RB-4** |
| Limites | main, PWA publicado e RotaVHS original intactos; **a otimização real não é considerada validada** sem testes autorizados com o provedor real |

**Pendências que continuam bloqueando o envio real:** resposta formal da HeiGIT (consulta em ARQUITETURA §20.6, você envia), conferência LGPD/termos (análise preliminar em §20.5, **não é parecer jurídico**) e a sua autorização específica.
