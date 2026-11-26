## 2.0.0-teste.12 — RB-4 (modo experimental "Testar roteirização real")
**Funciona (como no teste.11):** importação SPX, agrupamento, GPS contínuo, otimização rápida aproximada a partir da sua posição (inclusive sem internet), reotimização das pendentes, cancelar, rota guardada ao fechar e reabrir, três opções de término, cofre da chave, revisão de paradas.

**Novo:** Estatísticas → Calcular pelas ruas → **Testar roteirização real (experimental)**. Separado das entregas SPX:
- usa o **OpenRouteService real** com a **sua** chave (cofre do aparelho), **só** com pontos **fictícios** de Goiânia, depois do seu toque em "Autorizo";
- gerar 10, 25, 50 ou 100 paradas em vias de Goiânia, ou adicionar tocando no mapa;
- partida: um ponto público (Praça Cívica, Setor Bueno) ou escolhido no mapa. O GPS só centraliza o mapa: a sua posição **não** é enviada (os termos da HeiGIT proíbem enviar dados pessoais);
- matriz real de distâncias e tempos, melhor ordem (motor v3), **traçado pelas ruas** desenhado e guardado, distância e tempo totais;
- comparação: a ordem da otimização rápida medida pelas ruas × a ordem pelas ruas (mesma matriz);
- marcar paradas como visitadas e reotimizar as pendentes (reaproveita o que já foi baixado);
- "Reotimizar sem internet" com a matriz e o traçado salvos.
Nenhuma linha reta é desenhada: sem geometria real, só os marcadores.

**Continua bloqueado:** o envio de coordenadas das planilhas da SPX (`ENVIO_REAL_LIBERADO = false`). O modo experimental recusa coordenadas que não foram geradas por ele, fora de Goiânia ou próximas de uma parada da rota SPX.

**Validado:** testes automáticos e emulador com servidor de respostas controladas. **Com o provedor real:** só se o segredo `ORS_CHAVE_TESTE` existir no GitHub. A situação real está em `docs/CONTINUAR-PROJETO.md` (entrada de 2026-11-26, RB-4).

**Não validado no aparelho físico:** esta versão (S23 FE pendente).
