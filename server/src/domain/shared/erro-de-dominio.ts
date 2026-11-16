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
  | "apelido_invalido"
  | "limite_de_comedouros"
  | "limite_de_simulados"
  | "aparelho_indisponivel"
  | "nome_do_pet_invalido"
  | "especie_invalida"
  | "nascimento_invalido"
  | "peso_invalido"
  | "limite_de_pets"
  | "foto_invalida"
  | "conflito_de_versao";

export class ErroDeDominio extends Error {
  readonly codigo: CodigoDeErro;

  constructor(codigo: CodigoDeErro, mensagem: string) {
    super(mensagem);
    this.name = "ErroDeDominio";
    this.codigo = codigo;
  }
}

// O recurso não existe, ou é de outra conta (D17: as duas respostas são iguais, 404).
export class NaoEncontrado extends Error {
  constructor(mensagem = "não encontrado") {
    super(mensagem);
    this.name = "NaoEncontrado";
  }
}
