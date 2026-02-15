import { Router } from "express";
import { productsController } from "../controllers/products.controller";

const router = Router();

// GET /api/products?page=1&limit=100|200|500&search=&brand=&status=&sortBy=&sortOrder=
router.get("/", productsController.list);

// GET /api/products/:asin
router.get("/:asin", productsController.getOne);

// DELETE /api/products (body: { asins: string[] })
router.delete("/", productsController.deleteMany);

export default router;
