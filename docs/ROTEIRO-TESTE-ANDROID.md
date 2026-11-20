# RotaVHS Go — Roteiro de teste de recuperação no Android (Etapa 3, Q5)

**Objetivo:** confirmar no aparelho real o que só foi simulado na nuvem: a rota volta igual depois de fechar o navegador, reiniciar o celular, ficar sem bateria e interromper a rota; e a finalização apaga os detalhes. **A aprovação final da Etapa 3 depende deste teste.**

**Use só dados fictícios** (rota de exemplo ou `test-fixtures/planilhas/11-formato-spx.xlsx`). Não use a planilha real neste teste.

## 0. Preparação (no PC, PowerShell, pasta `D:\Projetos Claude\RotaVHS-Go`)
1. `npm install` (se ainda não fez) → `npm test` (deve terminar sem falhas) → `npm run build` → `npm run preview`.
2. O terminal mostra o endereço **Network**, ex.: `http://192.168.0.10:4173`. Celular e PC no **mesmo Wi-Fi**.
3. No celular (Chrome): abra esse endereço. Anote: modelo do celular, versão do Android, versão do Chrome.
4. **Limite do teste pela rede local (HTTP):** o modo **sem internet** não funciona por HTTP (o navegador só ativa o modo offline em HTTPS). Os passos 1–6 funcionam; o passo 7 (sem internet) fica para depois da publicação no GitHub Pages (HTTPS) ou para a Etapa 4 (HTTPS local, G10/A3).
5. Não use aba anônima (ela apaga tudo ao fechar).

## Como registrar
Para cada passo: ✅ passou / ❌ falhou / ⚠️ diferente do esperado + uma foto da tela (sem dados reais). Se falhar, anote a hora e o que estava na tela.

| # | Cenário | Como fazer | Esperado |
|---|---|---|---|
| 1 | Marcação pacote a pacote | Rotas → **OTIMIZAR MINHA ROTA** → **Iniciar entregas**. Em Pedidos, busque a **parada 2** (3 pacotes) → **Marcar pacote a pacote** → marque 2 como **Entregue** | "2 de 3 entregues · 1 pendente"; a parada 2 continua selecionada |
| 2 | Fechar a aba | Feche **a aba** (não o Chrome). Abra o endereço de novo | Aparece **"Rota em andamento encontrada"** → **Continuar de onde parei** → parada 2 com "2 de 3 entregues · 1 pendente" |
| 3 | Fechar o Chrome à força | Marque 1 entrega inteira (outra parada). Na hora: botão de apps recentes → deslize o Chrome para fechar. Opcional: Configurações → Apps → Chrome → **Forçar parada** | Ao reabrir: a entrega marcada continua; mesma ordem e mesma parada atual |
| 4 | Interromper logo após marcar | Marque um pacote e, **imediatamente** (menos de 1 s), feche o Chrome à força | Normalmente a marcação continua. **Se perder só esse último toque, anote**: é a limitação conhecida (o navegador leva ~10 ms para confirmar a gravação) |
| 5 | Reiniciar o celular | Com a rota no meio, **reinicie** o aparelho. Abra o Chrome e o endereço (no protótipo publicado: https://victor1923hsm.github.io/rotavhs-go/; no PC: `npm run preview`) | "Continuar de onde parei" com tudo igual (pacotes, ordem, parada atual, planos guardados) |
| 6 | Sem bateria / desligamento brusco | Marque algo e **desligue segurando o botão** (ou deixe a bateria acabar, se quiser o teste completo). Ligue e abra | Igual ao passo 5. Anote se a última marcação antes do desligamento foi mantida |
| 7 | Sem internet *(só em HTTPS: depois da publicação)* | Abra o app uma vez com internet; ative o **modo avião**; feche e reabra o app | O app abre e oferece continuar a rota |
| 8 | Conferência interrompida | Importar → escolha a planilha fictícia → toque em **Juntar as partes** → feche o Chrome → reabra → Importar | "Conferência retomada" com a escolha mantida |
| 9 | Aviso antes de trocar | Com a rota marcada, em Importar → **Confirmar importação** | Aparece "Existe uma rota em uso" com Encerrar/Cancelar; **Cancelar** não muda nada |
| 10 | Finalizar e apagar | Rotas → **Finalizar rota** → Finalizar | Estatísticas → Rotas finalizadas: resumo com "Detalhes da rota: apagados do aparelho"; **Alertas e dados** sem rota antiga guardada |
| 11 | Alertas e silenciar | Estatísticas → **Alertas e dados** → **Desligados** → feche e reabra | Continua "Desligados" (o GPS não é desligado por isso) |
| 13 | Limpar mapas guardados (Q3) | Abra Rotas com internet e mova o mapa. Estatísticas → **Alertas e dados** → **Limpar mapas guardados** → Cancelar; depois de novo → **Limpar mapas** | Mostra o tamanho antes; Cancelar não apaga; depois de limpar, a rota e as entregas continuam em Pedidos |
| 14 | Conferência e aviso de prazo (Q2) | Deixe uma conferência sem terminar. *(O prazo real é de 7 dias: só anote se o aviso aparecer quando voltar ao app depois de 6 dias.)* | Aviso "Conferência não terminada perto do prazo" com Continuar / Descartar; abrir a conferência recomeça o prazo |
| 15 | Abertura das telas (Q6) | Com o app aberto há alguns segundos, ative o **modo avião** e abra Importar, Custo e Alertas e dados | Abrem na hora, sem "Carregando…" |
| 12 | Dados do site não apagados | Chrome → ⋮ → Configurações → Configurações do site → Todos os sites → endereço do PC | O site aparece com dados armazenados (algumas centenas de KB) |

## Depois do teste
- Envie o resultado (tabela + fotos) para registrar em `CONTINUAR-PROJETO.md` e decidir a **aprovação final da Etapa 3**.
- Para apagar os dados do teste: Chrome → Configurações do site → o endereço → **Limpar e redefinir**.
- Desligue o servidor no PC com **Ctrl + C**.
