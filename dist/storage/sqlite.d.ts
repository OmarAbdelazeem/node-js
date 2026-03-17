import type { PaymentStorage, SavedCardsStorage, WebhookEventsStorage } from "./types";
export declare function createSqliteStorage(dbPath: string): PaymentStorage & {
    savedCards: SavedCardsStorage;
    webhookEvents: WebhookEventsStorage;
};
