import { Router, type IRouter } from "express";
import { db, tracksTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/tracks", async (_req, res) => {
  try {
    const tracks = await db.select().from(tracksTable).orderBy(tracksTable.name);
    const result = tracks.map((t) => ({
      id: t.id,
      name: t.name,
      location: t.location,
      state: t.state,
      surface: t.surface,
      createdAt: t.createdAt.toISOString(),
    }));
    res.json(result);
  } catch (err) {
    console.error("Error listing tracks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
