/**
 * AI Prompt Regression — Smoke Tests
 *
 * Sends each phase prompt to the real Gemini API and asserts:
 *   1. Response is non-empty and coherent (mentions renovation keywords)
 *   2. Token usage (input + output) stays within per-phase budgets
 *   3. Total token usage across all phases stays within aggregate budget
 *
 * Requires GOOGLE_API_KEY env var (real key, not a stub).
 * Skips gracefully when the key is missing or is a test stub.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getSystemPrompt } from '../../src/config/prompts.js';
import { GEMINI_MODELS } from '../../src/config/gemini.js';

// ── Token budgets ──────────────────────────────────────────────────
const MAX_INPUT_TOKENS_PER_PHASE = 3_000;
const MAX_OUTPUT_TOKENS_PER_PHASE = 2_000;
const MAX_TOTAL_TOKENS = 30_000;

// ── Test fixtures ──────────────────────────────────────────────────
const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000000';

const PHASE_SCENARIOS = [
  {
    phase: 'INTAKE',
    userMessage: 'I want to renovate my kitchen. What information do you need to get started?',
  },
  {
    phase: 'CHECKLIST',
    userMessage: 'What products do I need for a modern kitchen renovation?',
  },
  {
    phase: 'RENDER',
    userMessage: 'Can you help me visualize what my renovated kitchen would look like?',
  },
] as const;

/** Keywords that should appear in any renovation-assistant response */
const RENOVATION_KEYWORDS = /renovati|kitchen|design|style|room|budget|plan|material|product/i;

// ── Helpers ────────────────────────────────────────────────────────
const apiKey = process.env.GOOGLE_API_KEY;
const isRealKey = apiKey && apiKey !== 'test-key' && apiKey.length > 10;

interface TokenUsage {
  input: number;
  output: number;
}

function extractUsage(
  metadata: Record<string, unknown> | undefined,
): TokenUsage | null {
  if (!metadata) return null;

  // LangChain Gemini adapter nests usage under usageMetadata or usage
  const usage =
    (metadata.usageMetadata as Record<string, unknown> | undefined) ??
    (metadata.usage as Record<string, unknown> | undefined);

  if (!usage) return null;

  const input =
    (usage.promptTokenCount as number | undefined) ??
    (usage.prompt_tokens as number | undefined) ??
    0;
  const output =
    (usage.candidatesTokenCount as number | undefined) ??
    (usage.completion_tokens as number | undefined) ??
    0;

  return { input, output };
}

// ── Accumulator ────────────────────────────────────────────────────
const usageLedger: Array<{ phase: string; usage: TokenUsage }> = [];

// ── Tests ──────────────────────────────────────────────────────────
describe('AI Prompt Regression — Smoke Tests', () => {
  const runCondition = isRealKey;

  for (const { phase, userMessage } of PHASE_SCENARIOS) {
    it.skipIf(!runCondition)(
      `${phase}: valid response within token budget`,
      async () => {
        // Build phase prompt from the real template
        const systemPrompt = getSystemPrompt(phase, TEST_SESSION_ID);
        expect(systemPrompt).toBeTruthy();
        expect(systemPrompt).toContain(phase);

        // Create a fresh model for each call (no streaming, low tokens)
        const model = new ChatGoogleGenerativeAI({
          model: GEMINI_MODELS.FLASH,
          temperature: 0.3,
          maxOutputTokens: 1024,
          apiKey: apiKey!,
        });

        const response = await model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(userMessage),
        ]);

        // ── Assert non-empty, coherent response ──
        const text =
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);

        expect(text.length).toBeGreaterThan(20);
        expect(text).toMatch(RENOVATION_KEYWORDS);

        // ── Assert token budget ──
        const usage = extractUsage(
          response.response_metadata as Record<string, unknown> | undefined,
        );

        // Token metadata may not always be present, but if it is, enforce budgets
        if (usage) {
          usageLedger.push({ phase, usage });

          expect(
            usage.input,
            `${phase} input tokens (${usage.input}) exceeded budget (${MAX_INPUT_TOKENS_PER_PHASE})`,
          ).toBeLessThanOrEqual(MAX_INPUT_TOKENS_PER_PHASE);

          expect(
            usage.output,
            `${phase} output tokens (${usage.output}) exceeded budget (${MAX_OUTPUT_TOKENS_PER_PHASE})`,
          ).toBeLessThanOrEqual(MAX_OUTPUT_TOKENS_PER_PHASE);
        }
      },
    );
  }

  // ── Aggregate budget check ──
  afterAll(() => {
    if (usageLedger.length === 0) return;

    const totalTokens = usageLedger.reduce(
      (sum, { usage }) => sum + usage.input + usage.output,
      0,
    );

    // Print summary for GitHub Actions step summary
    console.log('\n┌─────────────────────────────────────────────────┐');
    console.log('│         AI Regression Token Usage Report         │');
    console.log('├──────────┬────────────┬─────────────┬────────────┤');
    console.log('│ Phase    │ Input Tkns │ Output Tkns │ Total      │');
    console.log('├──────────┼────────────┼─────────────┼────────────┤');
    for (const { phase, usage } of usageLedger) {
      const total = usage.input + usage.output;
      console.log(
        `│ ${phase.padEnd(8)} │ ${String(usage.input).padStart(10)} │ ${String(usage.output).padStart(11)} │ ${String(total).padStart(10)} │`,
      );
    }
    console.log('├──────────┼────────────┼─────────────┼────────────┤');
    console.log(
      `│ TOTAL    │            │             │ ${String(totalTokens).padStart(10)} │`,
    );
    console.log('└──────────┴────────────┴─────────────┴────────────┘');
    console.log(`Budget: ${totalTokens} / ${MAX_TOTAL_TOKENS} tokens`);

    if (totalTokens > MAX_TOTAL_TOKENS) {
      throw new Error(
        `Total token usage (${totalTokens}) exceeded budget (${MAX_TOTAL_TOKENS})`,
      );
    }
  });
});
