import type { PaymentStorage, SavedCardsStorage } from "./types.js";
export type { PaymentStorage, CreatePaymentData, SavedCardsStorage } from "./types.js";
export declare function getStorage(): PaymentStorage & {
    savedCards: SavedCardsStorage;
};
