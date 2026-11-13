// Os códigos das regras do glossário (docs/glossario.md).
// Cada regra nova entra aqui; a camada HTTP traduz o código em resposta.
export type CodigoDeErro =
  | "porcoes_invalidas"
  | "horario_invalido"
  | "agenda_cheia"
  | "horario_repetido"
  | "agenda_acima_do_limite"
  | "horarios_muito_proximos"
  | "gramas_por_porcao_invalido"
  | "limite_diario_invalido"
  | "intervalo_minimo_invalido"
  | "limite_tigela_invalido"
  | "fuso_invalido"
  | "altura_garrafa_invalida"
  | "angulos_invalidos"
  | "conflito_de_versao";

export class ErroDeDominio extends Error {
  readonly codigo: CodigoDeErro;

  constructor(codigo: CodigoDeErro, mensagem: string) {
    super(mensagem);
    this.name = "ErroDeDominio";
    this.codigo = codigo;
  }
}
