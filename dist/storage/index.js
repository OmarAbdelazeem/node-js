"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStorage = getStorage;
const memory_1 = require("./memory");
const postgres_1 = require("./postgres");
const sqlite_1 = require("./sqlite");
function getStorage() {
    const useDb = process.env.USE_DB;
    const databaseUrl = process.env.DATABASE_URL;
    const databasePath = process.env.DATABASE_PATH;
    if (useDb === "sqlite" && databasePath) {
        return (0, sqlite_1.createSqliteStorage)(databasePath);
    }
    if (useDb === "true" && databaseUrl) {
        return (0, postgres_1.createPostgresStorage)(databaseUrl);
    }
    return memory_1.memoryStorage;
}
//# sourceMappingURL=index.js.map