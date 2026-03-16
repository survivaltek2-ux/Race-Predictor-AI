import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tracksTable } from "./tracks";

export const racesTable = pgTable("races", {
  id: serial("id").primaryKey(),
  trackId: integer("track_id").notNull().references(() => tracksTable.id),
  raceNumber: integer("race_number").notNull(),
  raceName: text("race_name").notNull(),
  raceDate: text("race_date").notNull(),
  postTime: text("post_time").notNull().default("12:00"),
  distance: text("distance").notNull(),
  surface: text("surface").notNull().default("dirt"),
  purse: integer("purse").notNull().default(0),
  conditions: text("conditions").notNull().default(""),
  status: text("status").notNull().default("upcoming"),
  winnerHorseId: integer("winner_horse_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRaceSchema = createInsertSchema(racesTable).omit({ id: true, createdAt: true });
export type InsertRace = z.infer<typeof insertRaceSchema>;
export type Race = typeof racesTable.$inferSelect;
