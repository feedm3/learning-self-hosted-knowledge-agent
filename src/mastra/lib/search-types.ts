import { z } from 'zod';
import { chunkSchema } from './chunker';

export const hitMetadataSchema = chunkSchema;

export const hitSchema = z.object({
  id: z.string(),
  score: z.number(),
  text: z.string(),
  metadata: hitMetadataSchema.omit({ text: true }),
});

export type SearchHit = z.infer<typeof hitSchema>;

export const rerankedHitSchema = hitSchema.extend({
  raw_score: z.number(),
});

export type RerankedHit = z.infer<typeof rerankedHitSchema>;

export interface RerankOptions {
  now?: Date;
  halfLifeDays?: number;
  sourceWeights?: Record<string, number>;
}
