"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardsRoutes = void 0;
const express_1 = require("express");
const index_1 = require("../storage/index");
const validate_1 = require("../utils/validate");
const router = (0, express_1.Router)();
exports.cardsRoutes = router;
const storage = (0, index_1.getStorage)();
function requireUserId(req, res, next) {
    const raw = req.headers["x-user-id"];
    const userId = typeof raw === "string" ? raw.trim() : "";
    if (!userId) {
        res.status(401).json({ error: "Missing or invalid X-User-Id header" });
        return;
    }
    req.userId = userId;
    next();
}
router.use(requireUserId);
/**
 * POST / - Save a card (after successful payment when user chose "Save card").
 * Body: paymob_token, masked_pan (required); card_brand, last_four (optional).
 * Response: 201 with id, masked_pan, card_brand?, last_four?, created_at (no token).
 */
router.post("/", async (req, res) => {
    const parsed = (0, validate_1.validateSaveCardBodySafe)(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: "Validation failed",
            details: parsed.error.flatten(),
        });
    }
    const userId = req.userId;
    try {
        const card = await storage.savedCards.createCard(userId, parsed.data);
        return res.status(201).json({
            id: card.id,
            masked_pan: card.masked_pan,
            ...(card.card_brand != null && { card_brand: card.card_brand }),
            ...(card.last_four != null && { last_four: card.last_four }),
            created_at: card.created_at.toISOString(),
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET / - List saved cards (no token).
 */
router.get("/", async (req, res) => {
    const userId = req.userId;
    try {
        const cards = await storage.savedCards.listCardsByUserId(userId);
        return res.status(200).json({
            cards: cards.map((c) => ({
                id: c.id,
                masked_pan: c.masked_pan,
                ...(c.card_brand != null && { card_brand: c.card_brand }),
                ...(c.last_four != null && { last_four: c.last_four }),
                created_at: c.created_at.toISOString(),
            })),
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET /:cardId - Get card details for payment (includes paymob_token).
 */
router.get("/:cardId", async (req, res) => {
    const userId = req.userId;
    const { cardId } = req.params;
    try {
        const card = await storage.savedCards.getCardByIdAndUserId(cardId, userId);
        if (!card) {
            return res.status(404).json({ error: "Card not found" });
        }
        return res.status(200).json({
            id: card.id,
            paymob_token: card.paymob_token,
            masked_pan: card.masked_pan,
            ...(card.card_brand != null && { card_brand: card.card_brand }),
            ...(card.last_four != null && { last_four: card.last_four }),
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * DELETE /:cardId - Remove a saved card.
 */
router.delete("/:cardId", async (req, res) => {
    const userId = req.userId;
    const { cardId } = req.params;
    try {
        const deleted = await storage.savedCards.deleteCardByIdAndUserId(cardId, userId);
        if (!deleted) {
            return res.status(404).json({ error: "Card not found" });
        }
        return res.status(204).send();
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
    }
});
exports.default = router;
//# sourceMappingURL=cards.js.map