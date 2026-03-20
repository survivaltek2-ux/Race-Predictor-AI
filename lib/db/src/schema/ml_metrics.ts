import { pgTable, serial, text, real, integer, timestamp, json, index } from "drizzle-orm/pg-core";

export const mlMetricsTable = pgTable(
  "ml_metrics",
  {
    id: serial("id").primaryKey(),
    sportKey: text("sport_key").notNull(),
    predictionId: integer("prediction_id").notNull(),
    algorithmName: text("algorithm_name").notNull(),
    homeWinProb: real("home_win_prob").notNull(),
    awayWinProb: real("away_win_prob").notNull(),
    drawProb: real("draw_prob").default(0),
    confidence: real("confidence").notNull(),
    projectedTotal: real("projected_total"),
    insights: text("insights").default("[]"), // JSON stringified
    wasCorrect: integer("was_correct"), // null=pending, 0=wrong, 1=correct
    actualWinner: text("actual_winner"), // 'home', 'away', 'draw'
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    index("ml_metrics_sport_key_idx").on(table.sportKey),
    index("ml_metrics_prediction_id_idx").on(table.predictionId),
    index("ml_metrics_algorithm_idx").on(table.algorithmName),
    index("ml_metrics_resolved_idx").on(table.wasCorrect),
  ]
);

export type MLMetric = typeof mlMetricsTable.$inferSelect;
