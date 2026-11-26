## 2.0.0-teste.10 — RB-2 (cliente do provedor de rotas)
**Funciona:** tudo do teste.9; janela "Calcular pelas ruas" com autorização (nomeia o provedor) e estimativa de consumo; etapas e cancelamento.
**Bloqueado:** o envio ao provedor REAL (`ENVIO_REAL_LIBERADO = false`). No celular, "Pelas ruas reais" mostra "Envio real ainda não liberado" e oferece a otimização rápida. Nenhuma coordenada é enviada.
**Testado só com respostas controladas** (servidor de teste local, dados fictícios): cliente, limites, 429, cache, 500 paradas. **Nada foi validado com o OpenRouteService real** (formato das respostas, Snap, CORS, latência, consumo de dados).
**Não validado no aparelho físico:** esta versão (validação no S23 FE pendente).
