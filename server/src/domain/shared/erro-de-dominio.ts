// Os códigos das regras do glossário (docs/glossario.md).
// Cada regra nova entra aqui; a camada HTTP traduz o código em resposta (E5).
export type CodigoDeErro = "porcoes_invalidas" | "horario_invalido";

export class ErroDeDominio extends Error {
  readonly codigo: CodigoDeErro;

  constructor(codigo: CodigoDeErro, mensagem: string) {
    super(mensagem);
    this.name = "ErroDeDominio";
    this.codigo = codigo;
  }
}
