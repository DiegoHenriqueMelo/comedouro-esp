# Guia de UI/UX

> Toda tela e toda funcionalidade nova do app do comedouro segue este guia. Ele vale para quem escreve o código e para qualquer sessão do Claude neste repositório.
> Decidido em 13/11/2026, numa entrevista de decisões com o dono do projeto. O registro está na seção 9.

**Situação em 16/11/2026:** as quatro telas de `web/` foram refeitas seguindo este guia e aguardam validação do dono do projeto. As peças da seção 5 estão em `web/src/ui.tsx`, e as cores e espaços da seção 3, em `web/src/styles.css`. Uma tela nova usa essas peças, em vez de criar estilo próprio.

---

## 1. A identidade em uma frase

**Limpo, claro e cuidadoso:** fundo quase branco, pêssego como cor da casa, texto direto que chama o gato pelo nome. Carinho no tom, seriedade na forma.

O que o app nunca deve parecer: um painel de tecnologia, um template pronto, ou uma tela escura com brilho.

## 2. As 12 proibições

Estas doze coisas **não entram no app, sem exceção**. São as marcas mais comuns de interface genérica, e a identidade antiga foi descartada por parecer genérica.

| # | Proibido | O que fazer no lugar |
|---|---|---|
| 1 | Gradiente roxo e azul. Vale para qualquer gradiente decorativo | Cor chapada. O fundo é uma cor só |
| 2 | Neon em cima de preto | Tema sempre claro (seção 3). Não existe modo escuro |
| 3 | Efeito de vidro nos cartões (fundo translúcido com desfoque) | Cartão branco opaco, com borda fina (seção 5.2) |
| 4 | Sombra desproporcional: grande, colorida ou com brilho | Uma sombra só, pequena e neutra (seção 3.4) |
| 5 | Eyebrow: a linha pequena em maiúsculas acima do título | O título sozinho, em frase normal (seção 4) |
| 6 | Tag de "ao vivo", com ou sem ponto piscando | Nada. Se o dado estiver velho, diga: "Atualizado às 12:31" |
| 7 | Chips coloridos (a etiqueta em forma de pílula com fundo de cor) | Linha de estado: um ponto pequeno e texto (seção 5.4) |
| 8 | Ícone colorido nos indicadores | Ícone de linha na cor do texto, ou nenhum (seção 5.8) |
| 9 | Pílula verde com setinha, para mostrar que um número subiu | A comparação escrita: "2 porções a mais que ontem" |
| 10 | Emoji nos títulos. Vale para qualquer texto do app | Só palavras |
| 11 | Ícone de brilho (as estrelinhas) | Nenhum. Nada no app é "mágico": ele serve ração |
| 12 | Faixa colorida na borda do cartão ou do aviso | O bloco de aviso tem fundo suave inteiro (seção 5.5) |

Se uma ideia nova só funciona quebrando uma destas regras, a ideia muda, não a regra.

## 3. Cores

O tema é **sempre claro**, mesmo com o celular no modo escuro.

### 3.1 Base

| Nome | Valor | Onde usar |
|---|---|---|
| Página | `#FAF7F4` | O fundo de todas as telas |
| Cartão | `#FFFFFF` | O fundo dos cartões e da barra de abas |
| Linha | `#E9E2DB` | Borda dos cartões e divisórias |
| Borda de campo | `#8C8179` | Contorno de campos e de botões secundários |
| Tinta | `#2B2623` | Texto principal e ícones |
| Tinta suave | `#6B625B` | Texto secundário e legendas |

### 3.2 Marca

| Nome | Valor | Onde usar |
|---|---|---|
| Pêssego | `#FCE6D8` | Fundo do bloco principal da tela, e só dele |
| Terracota | `#A94F2D` | Botão principal, links e a aba ativa |
| Terracota escuro | `#8E4024` | O botão principal enquanto é pressionado |

O pêssego é fundo, nunca texto: é claro demais para ler. A cor de ação é a terracota, da mesma família.

### 3.3 Estado

São três estados, cada um com três tons. O estado aparece sempre como **texto com um ponto**, nunca como chip.

| Estado | Texto | Ponto | Fundo suave | Quando |
|---|---|---|---|---|
| Tudo bem (sálvia) | `#456650` | `#5F8A6C` | `#E8F0EA` | Online, refeição servida, tigela vazia |
| Aviso (âmbar) | `#855600` | `#A86F05` | `#FBF0D9` | Ração acabando, refeição adiada, pedido recusado |
| Problema (tijolo) | `#9F3526` | `#C2513F` | `#F9E4E0` | Offline, porção que não saiu, sensor sem leitura, erro |

**A cor nunca vai sozinha.** Todo estado tem a palavra escrita ao lado do ponto. Quem não distingue as cores lê a palavra.

### 3.4 Sombra, canto e espaço

| O quê | Valor |
|---|---|
| Sombra (a única do app) | `0 1px 2px rgba(43, 38, 35, 0.06)` |
| Canto do cartão | 12 px |
| Canto de botão e de campo | 10 px |
| Escala de espaço | 4, 8, 12, 16, 24, 32 px. Nenhum outro valor |
| Margem lateral da tela | 16 px |
| Largura máxima do conteúdo | 520 px, centralizado |

### 3.5 Contraste conferido

As combinações abaixo foram calculadas. Texto normal precisa de pelo menos 4,5:1; pontos e bordas, de 3:1.

| Combinação | Contraste |
|---|---|
| Tinta sobre cartão | 14,9:1 |
| Tinta sobre pêssego | 12,4:1 |
| Tinta suave sobre cartão | 6,0:1 |
| Tinta suave sobre página | 5,6:1 |
| Branco sobre terracota (botão principal) | 5,5:1 |
| Terracota sobre pêssego (link no bloco principal) | 4,5:1 |
| Texto de estado sobre cartão | de 6,3:1 a 7,0:1 |
| Texto de estado sobre o próprio fundo suave | de 5,5:1 a 5,7:1 |
| Pontos de estado | de 3,4:1 a 4,6:1 |
| Borda de campo sobre cartão | 3,8:1 |

Uma cor nova só entra neste guia depois de passar nessa conta.

## 4. Tipografia

Uma família só: **Figtree**, embutida no app para funcionar sem internet. Nada de carregar fonte de um site externo.

| Papel | Tamanho | Peso | Onde |
|---|---|---|---|
| Frase de situação | 24 px | 600 | O topo da tela inicial (seção 6) |
| Título da tela | 22 px | 700 | "Agenda", "Histórico", "Ajustes" |
| Número de destaque | 28 px | 700 | O valor de um indicador |
| Título de cartão | 16 px | 600 | "Hoje", "Garrafa", "Tigela" |
| Texto | 16 px | 400 | Corpo, campos e botões (peso 600 nos botões) |
| Legenda | 14 px | 400 | Texto secundário, em tinta suave |

Regras:

- **Títulos em frase normal:** "Próxima refeição", não "PRÓXIMA REFEIÇÃO" nem "Próxima Refeição".
- **Nada acima do título** (proibição 5) e **nenhum emoji** (proibição 10).
- Maiúsculas só em siglas e no início de frase. Nunca como estilo.
- Números com algarismos de largura fixa (`font-variant-numeric: tabular-nums`), para não "pularem" quando mudam.
- O menor texto do app tem 14 px.
- Altura de linha: 1,45 no texto e 1,2 em títulos e números.

## 5. Componentes

### 5.1 Cabeçalho da tela

O título da tela, à esquerda. À direita, no máximo uma linha de estado (seção 5.4). Sem logotipo, sem subtítulo.

### 5.2 Cartão

- Fundo cartão, borda de 1 px na cor linha, canto de 12 px, a sombra única, 16 px de respiro interno.
- O título do cartão é texto normal em peso 600, na cor tinta.
- **Um cartão, um assunto.** Não coloque cartão dentro de cartão.
- O cartão não muda de cor conforme o estado. Quem mostra o estado é a linha de estado, dentro dele.

### 5.3 Bloco principal

Cada tela tem **no máximo um** bloco com fundo pêssego: o da ação mais importante. Na tela inicial, é o de servir. Ele não tem borda nem sombra, e tem canto de 12 px.

### 5.4 Linha de estado

Um ponto de 8 px na cor do estado e, ao lado, o texto na cor de texto do mesmo estado.

```
●  Online
●  A ração está acabando
●  Offline há 40 minutos
```

- Sem fundo, sem contorno, sem formato de pílula (proibição 7).
- O ponto **não pisca** (proibição 6).
- O texto diz o estado com palavras. Só o ponto, sem texto, não vale.

### 5.5 Aviso

Para o que pede atenção agora: um alerta aberto, ou a recusa de um pedido.

- Um bloco com o fundo suave do estado **inteiro**, canto de 12 px, sem borda e sem faixa lateral (proibição 12).
- Dentro: um título curto em peso 600 e uma frase, os dois na cor de texto do estado.
- Se houver ação ("Entendi", "Servir mesmo assim"), é um botão secundário dentro do bloco.
- Os avisos ficam logo abaixo da frase de situação, do mais grave para o menos grave.

### 5.6 Botões

| Tipo | Aparência | Uso |
|---|---|---|
| Principal | Fundo terracota, texto branco em peso 600 | **Um por tela.** A ação mais importante |
| Secundário | Fundo cartão, borda de campo, texto tinta | As outras ações |
| Discreto | Sem fundo e sem borda, texto tinta suave | Ações menores ou destrutivas pequenas ("Remover") |

- Altura mínima de 44 px. O botão principal da tela inicial tem 56 px.
- O texto do botão é um verbo: "Servir agora", "Salvar agenda", "Tarar a balança".
- Enquanto a ação roda, o botão fica desabilitado e o texto muda para o gerúndio: "Salvando…".
- Sem ícone de brilho, sem gradiente e sem sombra colorida.

### 5.7 Campos

- Rótulo acima do campo, em peso 600. Embaixo, se precisar, uma legenda em tinta suave.
- Fundo cartão, borda de campo, canto de 10 px, altura mínima de 44 px.
- O erro aparece **embaixo do campo que causou**, na cor de texto de problema, dizendo o que fazer.
- O teclado certo para cada campo: numérico para números, relógio para horário.

### 5.8 Ícones

- Ícones são permitidos onde ajudam a reconhecer algo: na barra de abas, em botões e ao lado de títulos.
- Sempre de **linha**, com traço de 1,5 px, numa cor só: a do texto ao redor. A aba ativa usa terracota.
- Nunca ícone colorido num indicador (proibição 8), nunca o ícone de brilho (proibição 11), nunca emoji no lugar de ícone (proibição 10).
- Todo ícone que é a única pista de uma ação tem um texto alternativo.

### 5.9 Indicador

Um cartão que mostra um número: hoje, garrafa, tigela.

- O título do cartão, o número de destaque e uma legenda que explica o número.
- Barra de progresso, quando faz sentido: 6 px de altura, trilho na cor linha e preenchimento em tinta. Ela **não muda de cor**. Se o valor pedir atenção, quem avisa é uma linha de estado embaixo.
- Comparações são escritas por extenso (proibição 9).

### 5.10 Lista

Itens separados por uma linha fina, sem cartão em volta de cada item. À esquerda, o ponto do estado; no meio, o que aconteceu, com o detalhe em legenda; à direita, a hora.

### 5.11 Barra de abas

Fixa embaixo, com fundo cartão e uma linha fina em cima. Quatro abas, com ícone e nome. A aba ativa fica em terracota e peso 600; as outras, em tinta suave.

### 5.12 Tela vazia, carregando e erro

Toda tela que busca dados tem os três estados desenhados:

- **Vazia:** uma frase em tinta suave e, se houver, a ação que resolve. "Nenhuma refeição agendada." com o botão "Adicionar refeição".
- **Carregando:** o texto "Carregando…" em tinta suave. Sem esqueleto animado e sem girador.
- **Erro:** um aviso de problema, com o botão "Tentar de novo".

## 6. Hierarquia

**Toda tela responde primeiro "está tudo bem?", depois oferece a ação, e só então mostra os números.**

A tela inicial, de cima para baixo:

1. **Frase de situação.** Uma ou duas frases que resumem tudo: "Cozinha serviu às 12:30. Próxima refeição às 18:00." Quando existe um problema, a frase vira o problema: "O comedouro está offline há 40 minutos."
2. **Avisos**, se houver.
3. **Bloco principal:** servir agora.
4. **Indicadores:** hoje, garrafa e tigela.
5. **Rodapé:** se a configuração está sincronizada.

Para qualquer tela nova, pergunte nesta ordem:

1. O que a pessoa precisa **saber** ao abrir? Isso vai no topo, em frase.
2. O que ela mais vai **fazer** aqui? Isso é o único botão principal.
3. O resto é detalhe, e vem depois.

Se dois elementos disputam o topo, um deles está na tela errada.

## 7. Texto

### 7.1 O apelido do comedouro

Desde 16/11/2026 (decisão D6 do [roteiro do produto](ROTEIRO-PRODUTO.md)), as frases usam o **apelido do comedouro**, e não o nome do gato: uma conta pode ter vários comedouros, e o comedouro não sabe qual bicho comeu. O pet ganha um cadastro próprio na etapa P3. Sem apelido, use "o comedouro".

- "Cozinha serviu às 12:30."
- "Próxima refeição às 18:00."
- Na notificação: "Cozinha: Ração acabando".

O apelido é o título da tela inicial do comedouro, e aparece nas frases de situação e nos avisos, não em todo rótulo. "Tigela" continua "Tigela".

### 7.2 Tom: direto e gentil

| Faça | Não faça |
|---|---|
| "Cozinha serviu às 12:30." | "A Cozinha já mandou o almoço!" |
| "A tigela ainda tem 12 g." | "Opa, ainda tem ração na tigela." |
| "A ração está acabando: dá para 3 dias." | "ALERTA: nível crítico de ração (11%)." |
| "Sem contato com o comedouro há 40 minutos." | "Erro 503: dispositivo indisponível." |
| "Limite de hoje atingido." | "Não foi possível completar a sua solicitação." |

Regras:

- Frases curtas, na voz ativa, com o sujeito na frente.
- **Sem ponto de exclamação** e sem emoji.
- Um problema diz **o que aconteceu** e, quando dá, **o que fazer**.
- Números com unidade: "12 g", "3 dias", "18:00". Sempre um espaço entre o número e a unidade.
- Nada de código de erro nem termo técnico na tela. "Offline", "sincronizado" e "configuração" são o limite.
- O app fala com "você".

## 8. Acessibilidade e movimento

- **Área de toque:** no mínimo 44 × 44 px.
- **Foco visível:** contorno de 2 px em terracota, a 2 px do elemento, em tudo que recebe foco.
- **Contraste:** só as combinações da seção 3.5.
- **Leitor de tela:** avisos de problema são anunciados na hora; mensagens de confirmação, sem interromper.
- **Zoom:** a tela funciona com o texto do celular aumentado em 200%, sem rolagem lateral.
- **Movimento:** só transições curtas de estado, de até 150 ms: o botão pressionado, a barra de progresso. Nada pisca, pulsa ou desliza para chamar atenção. Com a opção "reduzir movimento" do celular ligada, não há transição nenhuma.

## 9. Decisões e pendências

### 9.1 O que foi decidido

| Assunto | Decisão |
|---|---|
| Identidade antiga | Descartada inteira: era genérica e esverdeada sobre preto |
| As 12 regras | São proibições, sem exceção |
| Direção | Limpo, puxado para o branco, com tons pastel de carinho e cuidado, e cara profissional |
| Cor da marca | Pêssego, com terracota nas ações |
| Tema | Sempre claro. Sem modo escuro |
| Superfícies | Cartões brancos discretos, com borda fina e sombra pequena |
| Tipografia | Uma sans humanista para tudo. Proposta: Figtree |
| Estado | Três cores (sálvia, âmbar e tijolo), sempre como texto com ponto |
| Ícones | Permitidos, de linha e de uma cor só. Emoji, nunca |
| Assinatura | O apelido do comedouro nas frases (era o nome do gato até a P2) |
| Hierarquia | Primeiro "está tudo bem?", depois a ação, depois os números |
| Tom | Direto e gentil |

### 9.2 O que ainda falta

- **Validar as telas refeitas** em 16/11/2026, num celular de verdade. As cores foram conferidas por cálculo de contraste e em capturas de 390 px, mas ainda não num aparelho.
- **A Figtree** foi a proposta para "uma sans humanista" e já está embutida no app. Se preferir outra do mesmo estilo, troque aqui e em `web/src/main.tsx`.

Já feito em 16/11/2026: as quatro telas, a frase de situação no topo da tela inicial, a fonte embutida, a tela de login e a lista de comedouros. O campo "nome do gato" saiu na P2, trocado pelo apelido do comedouro.

## 10. Antes de entregar uma tela

- [ ] Nenhuma das 12 proibições aparece (seção 2).
- [ ] O topo da tela responde "está tudo bem?" ou diz para que a tela serve.
- [ ] Existe um botão principal, e só um.
- [ ] No máximo um bloco com fundo pêssego.
- [ ] Todas as cores vêm da seção 3, e todos os espaços, da escala de espaço.
- [ ] Todo estado tem a palavra escrita, não só a cor.
- [ ] Os estados vazio, carregando e erro estão desenhados.
- [ ] Os textos seguem a seção 7: sem exclamação, sem emoji, com unidade nos números.
- [ ] Tudo que é tocável tem pelo menos 44 px e foco visível.
- [ ] A tela foi conferida num celular de verdade, ou em 390 px de largura.
