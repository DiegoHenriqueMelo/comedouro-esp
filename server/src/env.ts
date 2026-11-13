// Carrega o `.env` da raiz do repo (ou da pasta atual). Variáveis já definidas no ambiente têm prioridade.
export function loadEnvFiles(): void {
  for (const path of [".env", "../.env"]) {
    try {
      process.loadEnvFile(path);
    } catch {
      // o arquivo não existe: segue só com as variáveis do ambiente
    }
  }
}
