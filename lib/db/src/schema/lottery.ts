import { pgTable, serial, varchar, integer, text, timestamp, jsonb, boolean, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lotteryGames = pgTable("lottery_games", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // e.g., "Powerball", "Mega Millions"
  gameKey: varchar("game_key", { length: 50 }).notNull().unique(), // e.g., "powerball", "mega_millions"
  numberOfPicks: integer("number_of_picks").notNull(), // 5 or 6
  maxNumber: integer("max_number").notNull(), // 69 or 70
  bonusNumberMax: integer("bonus_number_max").notNull(), // 26 for Powerball, 25 for Mega Millions
  drawDayOfWeek: varchar("draw_day_of_week", { length: 50 }).notNull(), // e.g., "Monday,Wednesday,Friday"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const lotteryResults = pgTable("lottery_results", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  drawDate: timestamp("draw_date", { withTimezone: true }).notNull(),
  winningNumbers: varchar("winning_numbers", { length: 100 }).notNull(), // e.g., "1,2,3,4,5"
  bonusNumber: integer("bonus_number").notNull(),
  jackpot: decimal("jackpot", { precision: 20, scale: 2 }),
  winners: integer("winners").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const lotteryPredictions = pgTable("lottery_predictions", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  predictedNumbers: varchar("predicted_numbers", { length: 100 }).notNull(), // e.g., "1,2,3,4,5"
  bonusNumber: integer("bonus_number").notNull(),
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }).notNull(), // 0.00 to 1.00
  reasoning: text("reasoning"),
  analysisJson: jsonb("analysis_json"), // Contains: keyPatterns, frequencyAnalysis, numberClusters, etc.
  wasCorrect: boolean("was_correct"),
  matchedNumbers: integer("matched_numbers").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertLotteryGameSchema = createInsertSchema(lotteryGames).omit({
  id: true,
  createdAt: true,
});

export const insertLotteryResultSchema = createInsertSchema(lotteryResults).omit({
  id: true,
  createdAt: true,
});

export const insertLotteryPredictionSchema = createInsertSchema(lotteryPredictions).omit({
  id: true,
  createdAt: true,
});

export type LotteryGame = typeof lotteryGames.$inferSelect;
export type InsertLotteryGame = z.infer<typeof insertLotteryGameSchema>;

export type LotteryResult = typeof lotteryResults.$inferSelect;
export type InsertLotteryResult = z.infer<typeof insertLotteryResultSchema>;

export type LotteryPrediction = typeof lotteryPredictions.$inferSelect;
export type InsertLotteryPrediction = z.infer<typeof insertLotteryPredictionSchema>;
