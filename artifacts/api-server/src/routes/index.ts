import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tracksRouter from "./tracks";
import horsesRouter from "./horses";
import racesRouter from "./races";
import predictionsRouter from "./predictions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tracksRouter);
router.use(horsesRouter);
router.use(racesRouter);
router.use(predictionsRouter);

export default router;
