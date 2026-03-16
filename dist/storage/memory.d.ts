import type { PaymentStorage, SavedCardsStorage } from "./types";
export declare const memoryStorage: PaymentStorage & {
    savedCards: SavedCardsStorage;
};
