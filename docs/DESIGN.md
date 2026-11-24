# RotaVHS Go — Design

## 1. Fonte oficial e obrigatória
O **Figma é a fonte oficial e obrigatória do design** do RotaVHS Go. Ele tem prioridade sobre qualquer wireframe, captura ou proposta criada depois.

- **Arquivo:** RotaVHS-GO (`pR1JlzgthpKOSAzGm6f3sZ`). [Abrir o arquivo](https://www.figma.com/design/pR1JlzgthpKOSAzGm6f3sZ/Untitled) · [abrir o protótipo](https://www.figma.com/proto/pR1JlzgthpKOSAzGm6f3sZ?node-id=41-2).
- **Página "Page 1" (desenho original, nunca alterar):**
  - Conectado — Pedidos
  - Rotas · Revisão
  - Rotas · Otimizada
  - Rotas · Em andamento
  - Prévia da importação
  - Estatísticas
  - Estatísticas · Custo das entregas
  - Financeiro
- **Página "RotaVHS Go · App":** as adaptações definidas pelo usuário (ver §3), feitas sobre o original.
- **O projeto se adapta ao Figma, nunca o contrário.** Não alterar o Figma para seguir regras do projeto (G9).
- **Telas que já existem no Figma:** preservar rigorosamente o layout, a paleta, a tipografia e os tamanhos. Preservar também:
  - o formato de botões e cartões;
  - os ícones;
  - os arredondamentos e os espaçamentos;
  - a posição dos elementos e os marcadores das entregas;
  - a organização das informações;
  - a barra inferior;
  - as animações e transições.
- **Telas novas:** montadas só com os componentes e padrões já presentes no Figma (§2), como se fossem do mesmo designer. **Nenhuma identidade visual nova.**
- **Sem elementos desnecessários** nas telas existentes.
- **Ilustrações** (caixas da tela Pedidos, mapa desenhado) são recriadas, nunca copiadas como imagem.
- **Se o Figma não puder ser lido**, a limitação é informada **antes** de qualquer proposta nova. A integração direta do Figma tem limite de chamadas no assento Collab. A leitura alternativa é pelo aplicativo do Figma no PC, só olhando a tela.

## 2. Linguagem visual do Figma (registrada em 2026-11-24, a partir do aplicativo)

### Fonte
**Inter**, com peso **regular** nos títulos, que nunca são negrito pesado.
- Título da tela: ~28 px.
- Subtítulo: 14 px, cinza.
- Rótulos: 12 px, cinza.
- Valores: ~22 px.
- Seções ("Sequência de paradas"): 18 px regular.

### Cores
| Papel | Cor |
|---|---|
| Fundo | branco |
| Texto | `#171b19` |
| Menta (cartões de destaque, aba ativa, botão claro) | `#8edfb3` |
| Menta claro (caixas, células, chips) | `#edf7f0` |
| Botão principal | preto com texto menta |

Os tokens estão em `src/styles/tokens.css`.

### Cabeçalho e selo
- Título à esquerda.
- Selo de situação à direita, pequeno, em maiúsculas: `REVISÃO`, `OTIMIZADA` ou `EXEMPLO` sobre menta claro; `EM ANDAMENTO` sobre preto.
- Telas internas começam com a seta "←" antes do título, como em "Custo das entregas".

### Cartões
| Tipo | Uso | Raio | Detalhes |
|---|---|---|---|
| Menta | destaque: Saldo, Custo de hoje, números da rota otimizada | ~20 | linha divisória fina e linha de rodapé |
| Menta claro | números (Paradas · Distância · Tempo est.), "Ganhos de hoje" | ~20 | — |
| Nota | prévia, aviso | ~14 | título em maiúsculas de 10 px |

### Botões
| Tipo | Altura | Raio | Aparência |
|---|---|---|---|
| Principal | ~54 | ~16 | preto, texto menta, seta "→" no fim |
| Menta | ~52 | ~18 | ícone + texto escuro ("Importar rotas") |
| Contorno | — | — | fundo da tela com borda escura |

### Formulário (padrão de "Custo das entregas")
- Rótulo de 14 px.
- Chips de opção: o selecionado preto com texto menta; os demais em menta claro.
- Campo com borda clara, raio ~14 e unidade à direita em cinza.

### Listas
- Linhas de ~40 px: marcador numérico à esquerda, texto de 15 px e código à direita em cinza de 12 px.
- "Ganhos recentes" usa um ícone quadrado em menta claro à esquerda.

### Mapa
- Desenho de linhas (quadras em zigue-zague e uma via larga) dentro de um cartão com borda e raio ~18.
- Etiqueta "ROTA DE EXEMPLO".
- Pinos numerados.

### Barra inferior
- Encostada no fim da tela, preta, com os cantos de cima arredondados.
- Abas com ícone de linha acima do nome; a aba ativa é um retângulo menta arredondado com texto escuro.
- Indicador de início branco embaixo.
- Abas do Figma: **Pedidos · Rotas · Estatísticas · Financeiro**.

### Estatísticas
- Painel menta com o canto inferior direito arredondado sobre fundo preto.
- Faixa lateral "6 7 8 HOJE".
- Círculo com o mapa e a distância total.

### Aparelho
- Moldura do iPhone com a ilha e "9:41", 390 × 844.

## 3. Adaptações definidas pelo usuário (valem sobre o Figma)
1. **Número da parada** em destaque enorme em toda tela de parada, junto com o código do pedido.
2. **Tela Pedidos sem** Destinatário, Observação e botões de ligar e de mensagem.
3. **Cor fixa por parada:** amarelo, laranja, azul e roxo, em ciclo. É a mesma na caixa da tela Pedidos e no pino do mapa, com número preto.
   - Entregue: menta com ✓.
   - Sem sucesso: branco com contorno tracejado.
4. **Ao marcar** Entregue ou Sem sucesso, o app pula para a próxima parada pendente, com "Desfazer" por 6 s.
5. **Palavra na tela:** "Parada", não "Stop".
6. **Barra inferior:** a única mudança visual pedida em 2026-11-24.
   - Mais chamativa quando o fundo é preto (tema Escuro): fundo mais claro que a tela (`#26302a`), linha menta no topo e aba ativa com brilho menta.
   - Mantidos o formato, os nomes, a altura e as proporções do Figma.
   - Nenhum ícone novo; nenhum outro modelo de navegação.
   - Nos temas claros, a barra continua preta como no Figma.

## 4. Temas
| Tema | Base | Diferença |
|---|---|---|
| **Claro** | cores do Figma original | — |
| **Alta visibilidade (sol)** | o mesmo desenho | texto preto puro, cinzas mais escuros (≥ 7:1), contorno de 2 px nos cartões claros |
| **Escuro** | tokens "Noite" (`#111412`) | menta e cores das paradas iguais; texto sobre menta e sobre as cores das paradas sempre escuro |

Layout, tamanhos e componentes são **idênticos** nos três temas.

## 5. Pendências de decisão (ver `DECISOES.md`)
- **V15 — barra inferior:**
  - O Figma tem a barra encostada no fim e 4 abas, com Financeiro.
  - A revisão 6 tirou a aba Financeiro.
  - A revisão 12 fez o menu flutuante de vidro, que é o que o app usa hoje.
  - Os wireframes revisados seguem o Figma, como pedido em 2026-11-24, até sua confirmação.
- **V7 — temas:** a tabela acima substitui a proposta anterior, em que "Claro" era uma paleta nova.

## 6. Material de revisão
- **Wireframes revisados das 17 telas e mapa de navegação, em PNG nos 3 temas:** pacote `RotaVHS-Go-wireframes-revisados-figma-png.zip` (2026-11-24).
- **Sem aprovação visual, nada disto vai para o código.**
- O canvas "RotaVHS Go · Evolução v2 — wireframes" guarda a 1ª versão (anterior a esta revisão) e foi **substituído** por este pacote.
