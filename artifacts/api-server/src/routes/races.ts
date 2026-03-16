import { Router, type IRouter } from "express";
import { db, racesTable, tracksTable, horsesTable, raceEntriesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/races", async (req, res) => {
  try {
    const { trackId, date, status } = req.query as Record<string, string | undefined>;

    const rows = await db
      .select({
        id: racesTable.id,
        trackId: racesTable.trackId,
        raceNumber: racesTable.raceNumber,
        raceName: racesTable.raceName,
        raceDate: racesTable.raceDate,
        postTime: racesTable.postTime,
        distance: racesTable.distance,
        surface: racesTable.surface,
        purse: racesTable.purse,
        conditions: racesTable.conditions,
        status: racesTable.status,
        winnerHorseId: racesTable.winnerHorseId,
        createdAt: racesTable.createdAt,
        trackName: tracksTable.name,
      })
      .from(racesTable)
      .innerJoin(tracksTable, eq(racesTable.trackId, tracksTable.id))
      .orderBy(desc(racesTable.raceDate), racesTable.raceNumber);

    let filtered = rows;
    if (trackId) filtered = filtered.filter((r) => r.trackId === parseInt(trackId));
    if (date) filtered = filtered.filter((r) => r.raceDate === date);
    if (status && status !== "all") filtered = filtered.filter((r) => r.status === status);

    const result = await Promise.all(
      filtered.map(async (r) => {
        let winnerHorseName: string | null = null;
        if (r.winnerHorseId) {
          const [h] = await db.select().from(horsesTable).where(eq(horsesTable.id, r.winnerHorseId));
          winnerHorseName = h?.name ?? null;
        }
        return formatRace(r, winnerHorseName);
      })
    );

    res.json(result);
  } catch (err) {
    console.error("Error listing races:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/races", async (req, res) => {
  try {
    const { trackId, raceNumber, raceName, raceDate, postTime, distance, surface, purse, conditions } = req.body;
    if (!trackId || !raceNumber || !raceName || !raceDate || !distance || !surface) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const [race] = await db
      .insert(racesTable)
      .values({ trackId, raceNumber, raceName, raceDate, postTime: postTime || "12:00", distance, surface, purse: purse || 0, conditions: conditions || "" })
      .returning();
    const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, race.trackId));
    return res.status(201).json(formatRace({ ...race, trackName: track.name }, null));
  } catch (err) {
    console.error("Error creating race:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/races/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db
      .select({
        id: racesTable.id,
        trackId: racesTable.trackId,
        raceNumber: racesTable.raceNumber,
        raceName: racesTable.raceName,
        raceDate: racesTable.raceDate,
        postTime: racesTable.postTime,
        distance: racesTable.distance,
        surface: racesTable.surface,
        purse: racesTable.purse,
        conditions: racesTable.conditions,
        status: racesTable.status,
        winnerHorseId: racesTable.winnerHorseId,
        createdAt: racesTable.createdAt,
        trackName: tracksTable.name,
      })
      .from(racesTable)
      .innerJoin(tracksTable, eq(racesTable.trackId, tracksTable.id))
      .where(eq(racesTable.id, id));

    if (!row) return res.status(404).json({ error: "Race not found" });

    let winnerHorseName: string | null = null;
    if (row.winnerHorseId) {
      const [h] = await db.select().from(horsesTable).where(eq(horsesTable.id, row.winnerHorseId));
      winnerHorseName = h?.name ?? null;
    }

    return res.json(formatRace(row, winnerHorseName));
  } catch (err) {
    console.error("Error fetching race:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/races/:id/entries", async (req, res) => {
  try {
    const raceId = parseInt(req.params.id);
    const entries = await db
      .select({
        id: raceEntriesTable.id,
        raceId: raceEntriesTable.raceId,
        horseId: raceEntriesTable.horseId,
        postPosition: raceEntriesTable.postPosition,
        jockey: raceEntriesTable.jockey,
        trainer: raceEntriesTable.trainer,
        morningLineOdds: raceEntriesTable.morningLineOdds,
        weight: raceEntriesTable.weight,
        lastRaceDate: raceEntriesTable.lastRaceDate,
        lastRaceFinish: raceEntriesTable.lastRaceFinish,
        horseName: horsesTable.name,
        totalRaces: horsesTable.totalRaces,
        totalWins: horsesTable.totalWins,
        totalPlaces: horsesTable.totalPlaces,
      })
      .from(raceEntriesTable)
      .innerJoin(horsesTable, eq(raceEntriesTable.horseId, horsesTable.id))
      .where(eq(raceEntriesTable.raceId, raceId))
      .orderBy(raceEntriesTable.postPosition);

    const result = entries.map((e) => ({
      id: e.id,
      raceId: e.raceId,
      horseId: e.horseId,
      horseName: e.horseName,
      postPosition: e.postPosition,
      jockey: e.jockey,
      trainer: e.trainer,
      morningLineOdds: e.morningLineOdds,
      weight: e.weight,
      lastRaceDate: e.lastRaceDate ?? null,
      lastRaceFinish: e.lastRaceFinish ?? null,
      winPercentage: e.totalRaces > 0 ? Number(((e.totalWins / e.totalRaces) * 100).toFixed(1)) : null,
      placePercentage: e.totalRaces > 0 ? Number((((e.totalWins + e.totalPlaces) / e.totalRaces) * 100).toFixed(1)) : null,
      totalRaces: e.totalRaces,
      totalWins: e.totalWins,
    }));

    res.json(result);
  } catch (err) {
    console.error("Error fetching race entries:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/races/:id/results", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { winnerHorseId, finishOrder } = req.body;

    if (!winnerHorseId) return res.status(400).json({ error: "winnerHorseId required" });

    await db.update(racesTable).set({ winnerHorseId, status: "completed" }).where(eq(racesTable.id, id));

    if (finishOrder && Array.isArray(finishOrder)) {
      for (let i = 0; i < finishOrder.length; i++) {
        await db
          .update(raceEntriesTable)
          .set({ finishPosition: i + 1 })
          .where(and(eq(raceEntriesTable.raceId, id), eq(raceEntriesTable.horseId, finishOrder[i])));
      }
      const winner = await db.select().from(horsesTable).where(eq(horsesTable.id, winnerHorseId));
      if (winner[0]) {
        await db.update(horsesTable).set({ totalWins: winner[0].totalWins + 1 }).where(eq(horsesTable.id, winnerHorseId));
      }
    }

    const [row] = await db
      .select({ id: racesTable.id, trackId: racesTable.trackId, raceNumber: racesTable.raceNumber, raceName: racesTable.raceName, raceDate: racesTable.raceDate, postTime: racesTable.postTime, distance: racesTable.distance, surface: racesTable.surface, purse: racesTable.purse, conditions: racesTable.conditions, status: racesTable.status, winnerHorseId: racesTable.winnerHorseId, createdAt: racesTable.createdAt, trackName: tracksTable.name })
      .from(racesTable)
      .innerJoin(tracksTable, eq(racesTable.trackId, tracksTable.id))
      .where(eq(racesTable.id, id));

    if (!row) return res.status(404).json({ error: "Race not found" });

    const [winnerHorse] = await db.select().from(horsesTable).where(eq(horsesTable.id, winnerHorseId));

    return res.json(formatRace(row, winnerHorse?.name ?? null));
  } catch (err) {
    console.error("Error recording result:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatRace(r: any, winnerHorseName: string | null) {
  return {
    id: r.id,
    trackId: r.trackId,
    trackName: r.trackName ?? null,
    raceNumber: r.raceNumber,
    raceName: r.raceName,
    raceDate: r.raceDate,
    postTime: r.postTime,
    distance: r.distance,
    surface: r.surface,
    purse: r.purse,
    conditions: r.conditions,
    status: r.status,
    winnerHorseId: r.winnerHorseId ?? null,
    winnerHorseName,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

export default router;
