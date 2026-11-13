import { sendNotification } from "web-push";
import type {
  Notifier,
  PushSubscriptionRepository,
} from "../../application/ports.js";

type Log = { warn(obj: unknown, msg: string): void };

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  // Um contato para o serviço de push: "mailto:voce@exemplo.com" ou uma URL.
  subject: string;
};

// Manda a notificação para todos os aparelhos que ativaram o push no PWA.
export class WebPushNotifier implements Notifier {
  constructor(
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly vapid: VapidKeys,
    private readonly log: Log = { warn: () => {} },
  ) {}

  async notify(title: string, body: string): Promise<void> {
    const payload = JSON.stringify({ title, body });

    for (const subscription of await this.subscriptions.list()) {
      try {
        await sendNotification(subscription, payload, {
          vapidDetails: this.vapid,
          TTL: 60 * 60,
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // O aparelho desativou as notificações ou desinstalou o app.
          await this.subscriptions.remove(subscription.endpoint);
        } else {
          this.log.warn({ err }, "falha ao enviar notificação push");
        }
      }
    }
  }
}

// Usado quando o push não está configurado: a notificação vai só para o log.
export class LogNotifier implements Notifier {
  constructor(
    private readonly log: { info(obj: unknown, msg: string): void },
  ) {}

  async notify(title: string, body: string): Promise<void> {
    this.log.info({ title, body }, "aviso (push não configurado)");
  }
}
