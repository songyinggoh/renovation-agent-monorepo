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

export const PHASE_CONFIG: Record<
  RenovationPhase,
  {
    label: string;
    description: string;
    icon: string;
    accentVar: string;
  }
> = {
  INTAKE: {
    label: 'Intake',
    description: 'Tell us about your project',
    icon: 'ClipboardList',
    accentVar: '--phase-intake',
  },
  CHECKLIST: {
    label: 'Checklist',
    description: 'Review your requirements',
    icon: 'CheckSquare',
    accentVar: '--phase-checklist',
  },
  PLAN: {
    label: 'Plan',
    description: 'Your renovation blueprint',
    icon: 'Map',
    accentVar: '--phase-plan',
  },
  RENDER: {
    label: 'Render',
    description: 'Visualize the result',
    icon: 'Image',
    accentVar: '--phase-render',
  },
  PAYMENT: {
    label: 'Payment',
    description: 'Secure your project',
    icon: 'CreditCard',
    accentVar: '--phase-payment',
  },
  COMPLETE: {
    label: 'Complete',
    description: 'Project delivered',
    icon: 'CheckCircle',
    accentVar: '--phase-complete',
  },
  ITERATE: {
    label: 'Iterate',
    description: 'Refine and improve',
    icon: 'RefreshCw',
    accentVar: '--phase-iterate',
  },
};

export const PHASE_INDEX: Record<RenovationPhase, number> = Object.fromEntries(
  RENOVATION_PHASES.map((phase, index) => [phase, index])
) as Record<RenovationPhase, number>;
