/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

// O service worker guarda só o "casco" do app (HTML, JS, CSS, ícones).
// A API (/v1) passa sempre pela rede: um "servir" nunca pode sair do cache.

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/v1\//, /^\/health/],
  }),
);

self.addEventListener("push", (event) => {
  const data = (event.data?.json() ?? {}) as { title?: string; body?: string };
  const title = data.title ?? "Comedouro";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      tag: title, // o mesmo aviso substitui o anterior em vez de empilhar
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const open = windows[0];
        return open ? open.focus() : self.clients.openWindow("/");
      }),
  );
});
