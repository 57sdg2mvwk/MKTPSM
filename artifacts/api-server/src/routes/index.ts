import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import panelRouter from "./panel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(panelRouter);

export default router;
