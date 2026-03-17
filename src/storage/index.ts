import type { PaymentStorage, SavedCardsStorage, WebhookEventsStorage } from "./types.js";
import { memoryStorage } from "./memory";
import { createPostgresStorage } from "./postgres";
import { createSqliteStorage } from "./sqlite";

export type { PaymentStorage, CreatePaymentData, SavedCardsStorage, WebhookEventsStorage } from "./types.js";

export function getStorage(): PaymentStorage & { savedCards: SavedCardsStorage; webhookEvents: WebhookEventsStorage } {
  const useDb = process.env.USE_DB;
  const databaseUrl = process.env.DATABASE_URL;
  const databasePath = process.env.DATABASE_PATH;

  if (useDb === "sqlite" && databasePath) {
    return createSqliteStorage(databasePath);
  }
  if (useDb === "true" && databaseUrl) {
    return createPostgresStorage(databaseUrl);
  }
  return memoryStorage;
}
