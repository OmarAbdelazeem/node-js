import type { PaymentStorage, SavedCardsStorage, WebhookEventsStorage } from "./types.js";
export type { PaymentStorage, CreatePaymentData, SavedCardsStorage, WebhookEventsStorage } from "./types.js";
export declare function getStorage(): PaymentStorage & {
    savedCards: SavedCardsStorage;
    webhookEvents: WebhookEventsStorage;
};
