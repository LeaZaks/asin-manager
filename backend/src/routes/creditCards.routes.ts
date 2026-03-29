// routes/creditCards.routes.ts
import { Router } from "express";
import { creditCardsController } from "../controllers/purchases.controller";

const router = Router();

router.get("/", creditCardsController.list);
router.post("/", creditCardsController.create);
router.patch("/:id", creditCardsController.update);
router.delete("/:id", creditCardsController.delete);

export default router;
