export const RENOVATION_PHASES = [
  'INTAKE',
  'CHECKLIST',
  'PLAN',
  'RENDER',
  'PAYMENT',
  'COMPLETE',
  'ITERATE',
] as const;

export type RenovationPhase = (typeof RENOVATION_PHASES)[number];
