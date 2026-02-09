import { z } from 'zod';

export const checklistItemSchema = z.object({
  id: z.string(),
  category: z.string(),
  description: z.string(),
  priority: z.enum(['must-have', 'nice-to-have', 'optional']),
  estimatedBudget: z.number().optional(),
  completed: z.boolean().default(false),
});

export const checklistSchema = z.array(checklistItemSchema).min(1);

export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type Checklist = z.infer<typeof checklistSchema>;
