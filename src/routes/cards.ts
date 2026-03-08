import { Router, Request, Response } from "express";
import { getStorage } from "../storage/index";
import { validateSaveCardBodySafe } from "../utils/validate";

const router = Router();
const storage = getStorage();

export interface RequestWithUserId extends Request {
  userId: string;
}

function requireUserId(req: Request, res: Response, next: () => void): void {
  const raw = req.headers["x-user-id"];
  const userId = typeof raw === "string" ? raw.trim() : "";
  if (!userId) {
    res.status(401).json({ error: "Missing or invalid X-User-Id header" });
    return;
  }
  (req as RequestWithUserId).userId = userId;
  next();
}

router.use(requireUserId);

/**
 * POST / - Save a card (after successful payment when user chose "Save card").
 * Body: paymob_token, masked_pan (required); card_brand, last_four (optional).
 * Response: 201 with id, masked_pan, card_brand?, last_four?, created_at (no token).
 */
router.post("/", async (req: Request, res: Response) => {
  const parsed = validateSaveCardBodySafe(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.flatten(),
    });
  }
  const userId = (req as RequestWithUserId).userId;
  try {
    const card = await storage.savedCards.createCard(userId, parsed.data);
    return res.status(201).json({
      id: card.id,
      masked_pan: card.masked_pan,
      ...(card.card_brand != null && { card_brand: card.card_brand }),
      ...(card.last_four != null && { last_four: card.last_four }),
      created_at: card.created_at.toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET / - List saved cards (no token).
 */
router.get("/", async (req: Request, res: Response) => {
  const userId = (req as RequestWithUserId).userId;
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
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /:cardId - Get card details for payment (includes paymob_token).
 */
router.get("/:cardId", async (req: Request, res: Response) => {
  const userId = (req as RequestWithUserId).userId;
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
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /:cardId - Remove a saved card.
 */
router.delete("/:cardId", async (req: Request, res: Response) => {
  const userId = (req as RequestWithUserId).userId;
  const { cardId } = req.params;
  try {
    const deleted = await storage.savedCards.deleteCardByIdAndUserId(cardId, userId);
    if (!deleted) {
      return res.status(404).json({ error: "Card not found" });
    }
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
export { router as cardsRoutes };
