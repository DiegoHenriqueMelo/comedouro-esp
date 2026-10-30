# Glossário

> Documentação criada para definir palavras chaves do projeto

**Tipos:** value object (valor que só nasce válido e se troca inteiro) · entidade (tem identidade e muda com o tempo) · agregado (raiz que protege regras entre vários objetos) · evento (fato que já aconteceu) · externo (outro sistema decide; o servidor só fica sabendo).

## Termos

### O que você configura

| Termo | Definição | Tipo | Observação |
|---|---|---|---|
| Alimentador | O comedouro como o servidor o enxerga: a configuração e a agenda de um aparelho, e as regras que valem entre as duas | Agregado (raiz) | Não confundir com Dispositivo: o Alimentador é o que você configura; o Dispositivo é o ESP32 que executa. Por enquanto existe um só |
| Configuração | Os valores que dizem como o alimentador trabalha e que valem até alguém mudar: gramas por porção, limite diário, intervalo mínimo, limite da tigela, fuso, altura da garrafa e ângulos do servo | Value object, dentro do Alimentador | Não confundir com Comando: a configuração fica, o comando acontece uma vez. Mudar a configuração é trocá-la inteira por uma nova |
| Versão da configuração | Número que sobe 1 a cada mudança aceita na configuração ou na agenda | Value object, dentro do Alimentador | O ESP32 devolve a versão que aplicou (sincronizado ou pendente), e o banco usa o número para perceber duas edições ao mesmo tempo |
| Agenda | A lista de refeições agendadas, que se repete todos os dias. No máximo 8 | Value object, dentro do Alimentador | Não confundir com Horário: a agenda é a lista, e cada item é uma Refeição agendada. Vai junto com a configuração para o ESP32 |
| Refeição agendada | Item da agenda: horário, quantidade de porções e se está ativa. Ex.: 07:30, 2 porções, ativa | Value object | Não confundir com Refeição servida: esta é o plano, aquela é o fato |
| Horário | Hora do dia, sem data, no formato HH:MM. Ex.: 07:30 | Value object | Não é data e hora: 07:30 vale para todos os dias |
| Porção | A quantidade de ração que a comporta solta num ciclo: o volume do bolso, ≈ 6 g | Value object (a quantidade de porções, de 1 a 10 por refeição) | Não confundir com Refeição. O peso real de uma porção vem da calibração (gramas por porção) |
| Limite diário | Máximo de porções por dia, somando todas as origens | Value object, campo da Configuração | Quem aplica a cada pedido é o ESP32 |
| Intervalo mínimo | Tempo mínimo, em minutos, entre duas refeições | Value object, campo da Configuração | Quem aplica a cada pedido é o ESP32 |

### O que o ESP32 faz e informa

| Termo | Definição | Tipo | Observação |
|---|---|---|---|
| Dispositivo | O ESP32 visto pelo servidor: o sistema que executa a agenda, decide cada porção e informa o que aconteceu | Externo | Não confundir com Alimentador. O servidor fala com ele por uma porta, e um adaptador traduz (simulado na E7, MQTT na E9) |
| Comando | Ordem para o dispositivo fazer algo uma vez: servir agora, tara, calibrar a balança, calibrar a dose, testar o servo, reconhecer o alerta | Value object (mensagem enviada ao Dispositivo) | Não confundir com Configuração. Pode ser recusado, ou nem chegar (dispositivo ocupado ou offline) |
| Estado do dispositivo | A última "foto" que o ESP32 manda de si: online ou offline, peso na tigela, nível da garrafa, sensores e versão da configuração aplicada | Value object (vem do Dispositivo) | O servidor guarda só o último. É dele que saem a Tigela e a Garrafa |
| Tigela | Onde a ração é servida. Para o servidor, é o peso informado pela balança, e se a leitura está parada | Value object (leitura dentro do Estado do dispositivo) | Não confundir com Garrafa. O limite da tigela é campo da Configuração |
| Garrafa | Onde fica o estoque de ração. Para o servidor, é o nível informado: percentual e dias restantes | Value object (leitura dentro do Estado do dispositivo) | Não confundir com Tigela. A altura da garrafa é campo da Configuração |

### O que fica registrado

| Termo | Definição | Tipo | Observação |
|---|---|---|---|
| Evento do dispositivo | Fato que o ESP32 informa depois que aconteceu: refeição servida, recusada, adiada ou pulada, garrafa vazia, sensor sem leitura, reiniciou | Evento | Tem um número de sequência (`seq`) crescente. O servidor registra, não discute. O mesmo evento recebido duas vezes vale uma vez |
| Refeição servida | Evento: as porções que saíram de fato, com hora, quantidade, gramas medidos e origem | Evento | Não confundir com Refeição agendada |
| Origem | De onde veio o pedido de porção: agenda, interface (PWA) ou Alexa | Value object (lista fechada) | Vai dentro dos eventos de refeição |
| Motivo de recusa | Por que o ESP32 não serviu: limite diário, intervalo ou tigela com ração | Value object (lista fechada) | Quem decide é o ESP32; o servidor só repassa (429). Não confundir com os erros de configuração (ex.: agenda cheia), que quem decide é o servidor. "Ocupado" e "offline" também não são motivos de recusa: são situações do dispositivo |
| Histórico | A lista dos eventos do dispositivo, do mais recente para o mais antigo | Nenhum: é uma consulta sobre os eventos | Nem toda palavra do glossário vira peça do modelo |
| Alerta | Situação que pede a sua atenção: garrafa abaixo de 20%, porção que não saiu (VAZIO), refeição pulada, sensor sem leitura, ESP32 reiniciado, alimentador offline há mais de 30 min | Entidade | Não confundir com Evento: o evento é o fato; o alerta é o que você precisa fazer a respeito. Nasce, é avisado uma vez e termina quando é reconhecido ou resolvido |

## Agregados

### Alimentador

- **Raiz:** Alimentador.
- **Dentro:** Configuração, Versão da configuração e Agenda. A Agenda tem as Refeições agendadas, e cada uma tem um Horário e uma quantidade de Porções.
- **Regras que protege:** R1 a R12 (seção seguinte).
- **Muda por:** trocar a agenda e trocar a configuração. Cada mudança aceita sobe a versão em 1 e registra o evento `ConfiguracaoAlterada`. Uma mudança recusada não altera nada.
- **Por que tudo junto:** as regras R5 e R6 olham a agenda e a configuração **ao mesmo tempo**. Se as duas ficassem separadas, daria para mudar uma sem conferir a outra.
- **Como nasce:** com a configuração padrão abaixo e a agenda vazia, na versão 1.

| Campo da Configuração | Padrão |
|---|---|
| Gramas por porção | 6 |
| Limite diário | 10 porções |
| Intervalo mínimo | 30 min |
| Limite da tigela | 10 g |
| Fuso | America/Sao_Paulo |
| Altura da garrafa | 230 mm |
| Ângulo de encher | 0° |
| Ângulo de servir | 60° |

### Alerta

- **Raiz:** Alerta (cada um é um agregado pequeno, sozinho).
- **Por que separado do Alimentador:** nenhuma regra olha o alerta e a agenda ao mesmo tempo. Mudar a agenda não depende de alerta, e reconhecer um alerta não depende da agenda.
- **Regras que protege:** R13 e R14.
- **Muda por:** abrir, marcar como avisado, encerrar (reconhecido por você ou resolvido sozinho).
- Detalhado na E12; até lá, só fica registrado aqui.

### Fora dos agregados

- **Eventos do dispositivo:** só se acrescentam, nunca se alteram. Cada um é salvo sozinho, e o `seq` impede duplicata.
- **Estado do dispositivo:** o servidor guarda só o último. Cada mensagem nova substitui a anterior inteira.

## Regras que o servidor protege

Se uma mudança quebra qualquer regra, o servidor recusa a mudança inteira e responde 422 com o código.

### Da agenda

| # | Regra | Exemplo que viola | Código |
|---|---|---|---|
| R1 | A agenda tem no máximo 8 refeições agendadas | a 9ª | `agenda_cheia` |
| R2 | Não pode haver duas refeições agendadas no mesmo horário, ativas ou não | duas às 07:30 | `horario_repetido` |
| R3 | O horário é HH:MM, de 00:00 a 23:59 | `"24:00"`, `"7:30"`, `"12:60"` | `horario_invalido` |
| R4 | Cada refeição agendada tem de 1 a 10 porções, número inteiro | 0, 11, 1,5 | `porcoes_invalidas` |

### Da agenda com a configuração

Estas duas podem ser quebradas de **dois jeitos**: mexendo na agenda ou mexendo na configuração. As duas mudanças precisam conferir a regra. Refeições agendadas desativadas não contam.

| # | Regra | Exemplo que viola | Código |
|---|---|---|---|
| R5 | A soma das porções das refeições agendadas ativas não passa do limite diário | limite 4; agenda 07:30 com 2 e 18:00 com 3 (soma 5). Às 18:00 o ESP32 recusaria **todo dia**. Também viola: agenda com soma 5 e alguém baixa o limite de 6 para 4 | `agenda_acima_do_limite` |
| R6 | Duas refeições agendadas ativas ficam separadas por pelo menos o intervalo mínimo, contando pela meia-noite | intervalo 60 min com 07:30 e 08:00. Ou 23:50 e 00:10, que estão a 20 min. Também viola: agenda com 07:30 e 08:00 e alguém sobe o intervalo de 30 para 60 | `horarios_muito_proximos` |

### Da configuração, campo a campo

| # | Regra | Exemplo que viola | Código |
|---|---|---|---|
| R7 | Gramas por porção: maior que 0 e até 30 g. Pode ter decimal, porque vem da calibração | 0, −2, 50 | `gramas_por_porcao_invalido` |
| R8 | Limite diário: de 1 a 30 porções, número inteiro | 0, 31 | `limite_diario_invalido` |
| R9 | Intervalo mínimo: de 15 a 720 min | 0, 5, 1000 | `intervalo_minimo_invalido` |
| R10 | Limite da tigela: de 0 a 100 g | −1, 500 | `limite_tigela_invalido` |
| R11 | Fuso: um dos quatro fusos do Brasil (America/Noronha, America/Sao_Paulo, America/Manaus, America/Rio_Branco) | "Europe/Lisbon", "abc" | `fuso_invalido` |
| R12 | Ângulos: encher e servir de 0° a 180°, e diferentes entre si. Iguais, a comporta não se mexe | servir 200°; encher 60° e servir 60° | `angulos_invalidos` |

### Do alerta

| # | Regra | Exemplo que viola |
|---|---|---|
| R13 | O mesmo alerta é avisado uma vez só, não a cada estado recebido | avisar "garrafa abaixo de 20%" a cada minuto |
| R14 | Só existe um alerta aberto de cada tipo | dois "garrafa abaixo de 20%" abertos ao mesmo tempo |

## Dúvidas

1. **A refeição agendada precisa de `id`?**
   Opções: (a) `id` próprio; (b) o horário já identifica, porque a R2 garante que não se repete.
   Tendência: (b). O `PUT /v1/schedules` troca a lista inteira, e o PWA pode usar o horário como chave. Se um dia for preciso "editar o horário" acompanhando o mesmo item, volta-se para (a).

2. **Como guardar o fuso?**
   O servidor precisa do nome (America/Sao_Paulo) para calcular o "hoje" (E8). O ESP32 precisa do formato POSIX (`<-03>3`).
   Tendência: guardar o nome e traduzir para POSIX no adaptador que fala com o ESP32 (E9). Com a lista fechada da R11, a tradução é uma tabela de 4 linhas.

3. **Uma versão só para a configuração e a agenda?**
   Tendência: sim. As duas vão juntas para o ESP32, e ele só precisa saber se está com a última.

4. **Refeição agendada desativada conta na R2?**
   Tendência: sim. Duas às 07:30, mesmo com uma desativada, confundem na tela. Na R5 e na R6 ela não conta, porque não vai ser servida.

5. **As faixas da R7 à R10 são chutes razoáveis.**
   Revisar depois da calibração do M4 e da primeira semana com o gato.
