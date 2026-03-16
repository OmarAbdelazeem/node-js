import type { PaymentStorage, SavedCardsStorage } from "./types";
export declare function createPostgresStorage(connectionString: string): PaymentStorage & {
    savedCards: SavedCardsStorage;
};
