# RotaVHS Go — instruções do projeto para o Claude Code

PWA mobile-first para **um** entregador Shopee SPX: importar a planilha, conferir, calcular a melhor sequência **estimada**, rodar a rota com o mapa, marcar entregas e finalizar. Base única para Android (Chrome), iOS (Safari, Tela de Início) e Windows. Projeto **independente** do RotaVHS original (`D:\Projetos Claude\RotaVHS`, pausado), que **nunca** é modificado a partir daqui.

## Planilha da SPX (formato real, conferido em 2026-11-19)
Colunas: `AT ID`, `Sequence`, `Stop`, `SPX TN`, `Destination Address`, `Bairro`, `City`, `Zipcode/Postal code`, `Latitude`, `Longitude` (uma linha por pacote). Stop e Sequence vazios vêm como `-` → parada "?". Vários endereços escritos diferentes no mesmo Stop → Stop dividido. Sem nome, telefone ou observação.

## Documentos (ler antes de agir)
- `docs/CONTINUAR-PROJETO.md`: estado atual e retomada (**índice único**: não criar outros arquivos de progresso).
- `docs/PLANO-GERAL.md`: etapas 1–9, critérios de aceite, riscos e consumo.
- `docs/ARQUITETURA.md`: pilha, camadas, dados, GPS, offline, roteamento e reaproveitamento do RotaVHS.
- `docs/DECISOES.md`: decisões (aprovadas e pendentes). Uma decisão pendente não pode ser implementada.
- `docs/DESIGN.md`: **o Figma é a fonte oficial e obrigatória do design**; linguagem visual registrada, adaptações aprovadas, temas e pendências visuais.

## Forma de trabalho (obrigatória)
1. Trabalhar **por etapas**. Não implementar nada fora da etapa aprovada nem avançar sem aprovação explícita.
2. Pedir aprovação antes de mudanças importantes (arquitetura, dependências, dados, visual).
3. Explicar em **português do Brasil**.
4. Ao fim de cada etapa, informar o que foi feito, como testar, os resultados **reais** e o próximo passo.
5. Nunca inventar resultados de teste nem apresentar simulação como pronta. Protótipo é rotulado "PROTÓTIPO DE TESTE".
6. Documentar problemas e limitações.

## Ambiente e limites
- Windows 11, PowerShell, 16 GB de RAM: **baixo consumo** (sem Docker, sem OSRM/Valhalla local, sem emulador).
- Dependências **só dentro do projeto**. Nada global e sem mexer no PATH.
- Não alterar arquivos fora de `D:\Projetos Claude\RotaVHS-Go` sem autorização. **O RotaVHS original só pode ser lido.**
- Git **local**, sem serviço pago. **Única exceção (P1, autorizada pelo usuário em 2026-11-19):** o **protótipo visual** é publicado no GitHub Pages pelo repositório público `victor1923hsm/rotavhs-go`, só com dados fictícios e o selo "PROTÓTIPO DE TESTE" (`docs/DECISOES.md`, P1). **Importação real (I1, autorizada em 2026-11-20, implementada localmente; publicar só com nova autorização):** o protótipo aceita a planilha do aparelho (.xlsx/.csv), lida e guardada **só no aparelho**; o que vai para o GitHub continua sendo só código e planilhas fictícias. Nenhum outro remoto ou deploy sem nova autorização. A P1 não aprova nenhuma outra decisão. **Só publicar código idêntico ao testado:** `npm run manifesto` (só grava se `npm test` passar) e `npm run conferir-publicacao` antes de qualquer envio; o workflow repete a conferência.
- **P2 (autorizada em 2026-11-19):** no protótipo, "Minha localização" mostra a posição real no mapa (ponto azul, precisão, direção), **só na memória**: sem histórico, sem gravar, sem enviar, sem log, e **sem mudar a ordem das paradas**. Não aprova a Etapa 4 nem outras decisões (`docs/DECISOES.md`, P2).
- **P3 (autorizada em 2026-11-19):** no protótipo, GPS contínuo com filtros e estados (**funcional**); otimização a partir da posição, reavaliação por entrega/desvio, entrega parcial e alerta de proximidade como **DEMONSTRAÇÃO** rotulada na tela. A ordem continua só mudando com o toque; nada marcado por proximidade. Não aprova G1–G15 nem as Etapas 4–7 (`docs/DECISOES.md`, P3).
- Servidor de desenvolvimento só quando necessário, e desligado ao terminar. Preferir `build` + `preview`.
- Não rodar suítes completas repetidamente (RAM).

## Regras de produto que não podem ser quebradas
- **Número Stop original** (o da etiqueta) nunca é renumerado, unido, excluído nem substituído pela posição na rota. Paradas sem Stop ficam com "?" (nunca 0 nem número inventado). Busca rápida pelo Stop sempre disponível.
- Pacotes nunca somem, duplicam ou mudam de parada sozinhos. "Stop dividido" (mesmo número em endereços diferentes) fica separado e sinalizado.
- Agrupamentos e decisões da Conferência são respeitados; "manter separadas" nunca é anulado automaticamente.
- Entregas concluídas e o histórico nunca são alterados pela otimização. Correção = novo evento.
- **Nunca** marcar entrega por proximidade do GPS: sempre ação do usuário.
- Distâncias: sempre dizer qual é (linha reta, estimada pelo modelo, pelas ruas ou ETA). **Linha reta nunca é desenhada nem falada como trajeto.** Nunca prometer economia real.
- Recalcular: **manual a qualquer momento** e **sugestões automáticas** com política anti-oscilação (G8). **A sequência nunca muda em silêncio**: só com o toque do usuário. Nunca recalcular a cada leitura do GPS.
- GPS: no PWA, funciona com o app **aberto e visível**. **Não afirmar** que funciona em segundo plano ou com a tela bloqueada (no iOS, só com teste real). A arquitetura prevê uma versão nativa com segundo plano (adaptador `LocationProvider`, G1/N1).
- **Navegar** (revisão 11): botões que abrem o Google Maps ou o Waze com o destino da parada, só quando você toca. O RotaVHS em si não envia coordenadas a lugar nenhum.
- Distâncias: cálculo **local e offline** é o padrão e a garantia; pelas ruas só com conexão **e** autorização (G4/N2), com volta automática ao estimado.
- **Exigência G15:** a arquitetura deve permitir, no futuro, otimização pelas ruas reais (mão única, retornos, restrições de circulação). Não fazer escolhas que impeçam isso: o solver aceita matriz assimétrica e a extensão para dois nós por parada.
- Mapa offline: o cache de tiles **não garante** cobertura da região de entregas; sem tile, a operação continua pela lista.
- **Desempenho é prioridade** (G14): abertura rápida, RAM, bateria e dados móveis baixos; o mapa só carrega na Rota Ativa.

## Dados do destinatário (revisão 5, definida pelo usuário em 2026-11-19)
- **Nome, telefone e observação do destinatário não fazem parte do app**: a planilha da SPX não os traz. A tela Pedidos não tem os campos Destinatário e Observação nem os botões de ligar e de mensagem do Figma (adaptação definida pelo usuário).
- **Regra definitiva de privacidade (2026-11-19, Etapa 3):** ao finalizar (ou encerrar/substituir) uma rota, **todos os detalhes identificáveis são excluídos do armazenamento local** (endereços, coordenadas, códigos SPX, identificadores de paradas — que contêm o endereço normalizado —, histórico de marcações, planos, matriz de distâncias, conferência temporária); fica **só o resumo** operacional e financeiro, sem nomes, endereços, coordenadas, códigos nem o nome do arquivo. A exclusão é feita em etapas verificadas e retomada se for interrompida. **Nenhuma rota em uso é apagada sem o toque do usuário.** Nunca prometer eliminação física irrecuperável nem recuperação absoluta.
- Continua valendo: tudo local (IndexedDB/Dexie, schema v2 com situação **por pacote**: a visita fica pendente enquanto houver pacote pendente, R1); coordenadas não vão para serviços externos sem autorização (G4); planilhas reais **nunca** no Git (`.gitignore`); testes só com dados **fictícios**; **não acessar `C:\SPX`** sem autorização específica.
- Dinheiro em centavos inteiros; o custo é sempre marcado como **estimado**.

## Interface (obrigatória)
- **O Figma é a referência do visual (G9, revisão 4):** [arquivo](https://www.figma.com/design/pR1JlzgthpKOSAzGm6f3sZ/Untitled). **O projeto se adapta ao Figma, nunca o contrário:** não alterar o Figma para seguir regras do projeto. Ilustrações recriadas, nunca copiadas como imagem.
- **Adaptações definidas pelo usuário:** (1) o **número do Stop é o elemento mais importante** e aparece em destaque enorme em toda tela de parada (Pedidos, Rotas, prévia da importação), junto do código do pedido; (2) **sem** Destinatário, Observação e botões de ligar/mensagem na tela Pedidos; (3) **cada Stop tem uma cor fixa** (amarelo, laranja, azul, roxo, em ciclo pela ordem da SPX), **a mesma** na caixa da tela Pedidos e no **pino do mapa**, com o número em preto; entregue = menta com ✓, sem sucesso = branco com contorno tracejado; (4) ao marcar **Entregue** ou **Sem sucesso** na tela Pedidos, o app **pula para a próxima parada pendente** da rota, com aviso **Desfazer** por 6 s; (5) **na interface, a palavra é "Parada", não "Stop"** ("PARADA 12", "Próxima parada: 12", "Parada dividida", "Buscar parada"). O número exibido continua sendo o **Stop original da etiqueta**; nos documentos e no código, "Stop" segue sendo o nome desse número.
- **Sem aba Financeiro (revisão 6):** a barra inferior tem 3 abas (Pedidos · Rotas · Estatísticas). O **custo estimado da rota** fica em Estatísticas (cartão + tela "Custo das entregas", aberta pelo botão Editar): tipo de combustível, preço do litro e consumo médio (informados pelo usuário) × km **estimados** das rotas importadas. Sem saldo, valores pendentes ou gorjetas. **Q4 (2026-11-19):** receita, abastecimento, despesas, quilometragem e lucro estimado entram como **módulo opcional** (desligado por padrão, fora do fluxo de entrega), só depois de planejado e autorizado; até lá, não implementar.
- Legibilidade sob sol forte (contraste ≥ 7:1, botões de ação ≥ 60 px, alvos ≥ 48 px, texto de ação ≥ 17 px) como meta; **quando contrariar o Figma, perguntar ao usuário** antes de mudar.
- Só tokens semânticos de cor (nada de hex solto em componentes). Respeitar `prefers-reduced-motion`. Micro-interações leves (CSS), sem bibliotecas de animação.
- **Revisão 12:** transições entre telas pela View Transitions API (estilo iOS; navegação por `useIr`/`LinkFluido` em `src/app/navegacao.tsx`) e menu inferior **flutuante** de vidro com cantos arredondados. Sem suporte ou com "reduzir movimento": troca sem animação.
