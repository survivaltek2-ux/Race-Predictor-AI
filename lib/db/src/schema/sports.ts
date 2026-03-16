import { pgTable, serial, text, real, boolean, timestamp } from "drizzle-orm/pg-core";

export const sportsEventsTable = pgTable("sports_events", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  sportKey: text("sport_key").notNull(),
  sportTitle: text("sport_title").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  commenceTime: timestamp("commence_time").notNull(),
  oddsJson: text("odds_json").notNull().default("{}"),
  openingOddsJson: text("opening_odds_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sportsPredictionsTable = pgTable("sports_predictions", {
  id: serial("id").primaryKey(),
  externalEventId: text("external_event_id").notNull(),
  sportKey: text("sport_key").notNull(),
  sportTitle: text("sport_title").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  commenceTime: timestamp("commence_time").notNull(),
  predictedWinner: text("predicted_winner").notNull(),
  confidenceScore: real("confidence_score").notNull(),
  reasoning: text("reasoning").notNull(),
  analysisJson: text("analysis_json").notNull().default("{}"),
  wasCorrect: boolean("was_correct"),
  actualWinner: text("actual_winner"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SportsEvent = typeof sportsEventsTable.$inferSelect;
export type SportsPrediction = typeof sportsPredictionsTable.$inferSelect;
