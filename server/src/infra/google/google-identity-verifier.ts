import { OAuth2Client } from "google-auth-library";
import type { IdentityVerifier } from "../../application/ports.js";
import type { Identity } from "../../domain/user/user.js";

// Confere o "ID token" que o botão do Google entrega ao app: assinatura, validade e se foi emitido para ESTE app.
export class GoogleIdentityVerifier implements IdentityVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly clientId: string) {}

  async verify(credential: string): Promise<Identity | null> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      // E-mail não confirmado pelo Google não entra: ninguém cria conta com o e-mail de outra pessoa.
      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        return null;
      }
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name ?? "",
        picture: payload.picture ?? null,
      };
    } catch {
      return null;
    }
  }
}
