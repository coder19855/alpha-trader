/** Penalize or block entries after the move has already extended on the primary TF. */
export const CHASE_DECAY = {
  SCORE_BASELINE: 0.1,
  MOM_BASELINE: 0.15,
  SCORE_TO_R: 2.4,
  MOM_TO_R: 1.8,
  MAX_EXTENSION_R: 2.5,
  EXTENSION_START_R: 0.3,
  EXTENSION_BLOCK_R: 0.85,
  MAX_DECAY: 0.55,
  DECAY_PER_R: 0.38,
} as const;