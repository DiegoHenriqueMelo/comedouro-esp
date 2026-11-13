import { api } from "./api";

// Notificações push: pedir permissão, inscrever este aparelho e avisar o servidor.

export type PushState =
  | "sem_suporte" // o navegador não tem push (ou a página não está em HTTPS)
  | "servidor_desligado" // o servidor está sem as chaves VAPID
  | "bloqueado" // a pessoa negou a permissão
  | "desativado"
  | "ativado";

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "sem_suporte";
  const { chave } = await api.pushPublicKey();
  if (!chave) return "servidor_desligado";
  if (Notification.permission === "denied") return "bloqueado";
  return (await currentSubscription()) ? "ativado" : "desativado";
}

export async function enablePush(): Promise<PushState> {
  const { chave } = await api.pushPublicKey();
  if (!chave) return "servidor_desligado";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied" ? "bloqueado" : "desativado";
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: chave,
  });
  await api.pushSubscribe(subscription.toJSON());
  return "ativado";
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await api.pushUnsubscribe(subscription.endpoint);
    await subscription.unsubscribe();
  }
  return "desativado";
}
