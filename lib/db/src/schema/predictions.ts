import { pgTable, serial, integer, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { racesTable } from "./races";
import { horsesTable } from "./horses";

export const predictionsTable = pgTable("predictions", {
  id: serial("id").primaryKey(),
  raceId: integer("race_id").notNull().references(() => racesTable.id),
  predictedWinnerId: integer("predicted_winner_id").notNull().references(() => horsesTable.id),
  confidenceScore: real("confidence_score").notNull(),
  reasoning: text("reasoning").notNull(),
  topPicksJson: text("top_picks_json").notNull().default("[]"),
  wasCorrect: boolean("was_correct"),
  actualWinnerId: integer("actual_winner_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPredictionSchema = createInsertSchema(predictionsTable).omit({ id: true, createdAt: true });
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type Prediction = typeof predictionsTable.$inferSelect;
