## 2.0.0-teste.11 — RB-3 (otimização pelas ruas: resultado, comparação e revisão de paradas)
**Funciona (como no teste.10):** importação SPX, agrupamento, GPS contínuo, otimização rápida aproximada a partir da sua posição (inclusive sem internet), reotimização das pendentes, cancelar, rota guardada ao fechar e reabrir, três opções de término, cofre da chave.
**Novo:**
- Resultado pelas ruas só é aplicado com o seu toque ("Aplicar nova ordem" / "Manter a ordem atual"), comparado com a ordem anterior pela mesma matriz; nunca aplica uma ordem pior.
- Tela "Revisar paradas": escolher no mapa ou na lista, ajustar a localização usada no cálculo (mapa, botões de 10 m, sua posição), ver original e corrigida, confirmar, restaurar, autorizar busca de rua mais longe (350/500/1000 m), mover na sequência e recalcular só os trechos afetados.
- Central com origem, destino final, distância, tempo de deslocamento, paradas, comparação, consumo do dia e estimativa.
**Bloqueado:** o envio ao provedor REAL (`ENVIO_REAL_LIBERADO = false`). No celular, "Pelas ruas reais" mostra "Envio real ainda não liberado" e oferece a rápida; por isso a revisão de paradas só terá conteúdo depois de um cálculo pelas ruas (hoje, só no teste automático).
**Testado só com respostas controladas** (servidor de teste local, dados fictícios). **A otimização real pelas ruas NÃO está validada:** nada foi enviado ao OpenRouteService.
**Não validado no aparelho físico:** esta versão (validação no S23 FE pendente, como teste.9 e teste.10).
