import type { PaymentStorage, SavedCardsStorage, WebhookEventsStorage } from "./types";
export declare const memoryStorage: PaymentStorage & {
    savedCards: SavedCardsStorage;
    webhookEvents: WebhookEventsStorage;
};
