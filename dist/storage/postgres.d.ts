import type { PaymentStorage, SavedCardsStorage, WebhookEventsStorage } from "./types";
export declare function createPostgresStorage(connectionString: string): PaymentStorage & {
    savedCards: SavedCardsStorage;
    webhookEvents: WebhookEventsStorage;
};
