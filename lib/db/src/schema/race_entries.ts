import { pgTable, serial, integer, text, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { racesTable } from "./races";
import { horsesTable } from "./horses";

export const raceEntriesTable = pgTable("race_entries", {
  id: serial("id").primaryKey(),
  raceId: integer("race_id").notNull().references(() => racesTable.id),
  horseId: integer("horse_id").notNull().references(() => horsesTable.id),
  postPosition: integer("post_position").notNull(),
  jockey: text("jockey").notNull().default("Unknown"),
  trainer: text("trainer").notNull().default("Unknown"),
  morningLineOdds: text("morning_line_odds").notNull().default("5-1"),
  weight: integer("weight").notNull().default(126),
  finishPosition: integer("finish_position"),
  lastRaceDate: text("last_race_date"),
  lastRaceFinish: integer("last_race_finish"),
});

export const insertRaceEntrySchema = createInsertSchema(raceEntriesTable).omit({ id: true });
export type InsertRaceEntry = z.infer<typeof insertRaceEntrySchema>;
export type RaceEntry = typeof raceEntriesTable.$inferSelect;
