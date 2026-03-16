import type { PaymentStorage, SavedCardsStorage } from "./types";
export declare function createSqliteStorage(dbPath: string): PaymentStorage & {
    savedCards: SavedCardsStorage;
};
