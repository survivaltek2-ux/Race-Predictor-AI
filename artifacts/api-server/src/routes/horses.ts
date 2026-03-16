import { Router, type IRouter } from "express";
import { db, horsesTable, raceEntriesTable, racesTable, tracksTable } from "@workspace/db";
import { eq, ilike, or } from "drizzle-orm";

const router: IRouter = Router();

router.get("/horses", async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    let query = db.select().from(horsesTable);

    if (search) {
      const horses = await db
        .select()
        .from(horsesTable)
        .where(ilike(horsesTable.name, `%${search}%`));
      return res.json(horses.map(formatHorse));
    }

    const horses = await query.orderBy(horsesTable.name);
    return res.json(horses.map(formatHorse));
  } catch (err) {
    console.error("Error listing horses:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/horses", async (req, res) => {
  try {
    const { name, age, sex, color, sire, dam, trainer, owner } = req.body;
    if (!name || !age || !sex) {
      return res.status(400).json({ error: "name, age, and sex are required" });
    }
    const [horse] = await db
      .insert(horsesTable)
      .values({ name, age, sex, color: color || "bay", sire: sire || "Unknown", dam: dam || "Unknown", trainer: trainer || "Unknown", owner: owner || "Unknown" })
      .returning();
    return res.status(201).json(formatHorse(horse));
  } catch (err) {
    console.error("Error creating horse:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/horses/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [horse] = await db.select().from(horsesTable).where(eq(horsesTable.id, id));
    if (!horse) return res.status(404).json({ error: "Horse not found" });

    const entries = await db
      .select({
        raceId: raceEntriesTable.raceId,
        finishPosition: raceEntriesTable.finishPosition,
        jockey: raceEntriesTable.jockey,
        weight: raceEntriesTable.weight,
        odds: raceEntriesTable.morningLineOdds,
        raceName: racesTable.raceName,
        raceDate: racesTable.raceDate,
        distance: racesTable.distance,
        surface: racesTable.surface,
        conditions: racesTable.conditions,
        trackName: tracksTable.name,
      })
      .from(raceEntriesTable)
      .innerJoin(racesTable, eq(raceEntriesTable.raceId, racesTable.id))
      .innerJoin(tracksTable, eq(racesTable.trackId, tracksTable.id))
      .where(eq(raceEntriesTable.horseId, id))
      .orderBy(racesTable.raceDate);

    const recentRaces = entries.map((e) => ({
      raceId: e.raceId,
      raceName: e.raceName,
      trackName: e.trackName,
      raceDate: e.raceDate,
      distance: e.distance,
      surface: e.surface,
      finishPosition: e.finishPosition ?? 0,
      jockey: e.jockey,
      weight: e.weight,
      odds: e.odds,
      conditions: e.conditions,
    }));

    return res.json({ ...formatHorse(horse), recentRaces });
  } catch (err) {
    console.error("Error fetching horse:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatHorse(h: any) {
  return {
    id: h.id,
    name: h.name,
    age: h.age,
    sex: h.sex,
    color: h.color,
    sire: h.sire,
    dam: h.dam,
    trainer: h.trainer,
    owner: h.owner,
    totalRaces: h.totalRaces,
    totalWins: h.totalWins,
    totalPlaces: h.totalPlaces,
    totalShows: h.totalShows,
    earnings: h.earnings,
    createdAt: h.createdAt instanceof Date ? h.createdAt.toISOString() : h.createdAt,
  };
}

export default router;
