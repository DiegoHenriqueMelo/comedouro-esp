import { buildApp } from "./app.js";

const app = buildApp({ logger: true });
await app.listen({ port: 3000 });
