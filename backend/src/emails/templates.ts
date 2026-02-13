/**
 * Email templates for the Renovation Agent system
 *
 * Each template function returns { subject, html } ready for Resend.
 * Templates use inline styles for maximum email client compatibility.
 */

export interface EmailTemplate {
  subject: string;
  html: string;
}

// ─────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────

const BRAND_COLOR = '#b5553a'; // terracotta primary
const BRAND_BG = '#faf8f5';
const TEXT_COLOR = '#2d2a27';
const MUTED_COLOR = '#6b6560';

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:${BRAND_BG};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_COLOR};">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <tr><td>
      <div style="text-align:center;padding:24px 0;border-bottom:2px solid ${BRAND_COLOR};">
        <h1 style="margin:0;font-size:24px;color:${BRAND_COLOR};font-family:'DM Serif Display',Georgia,serif;">Renovation Agent</h1>
      </div>
      <div style="padding:32px 0;">
        ${body}
      </div>
      <div style="border-top:1px solid #e5e0db;padding:16px 0;text-align:center;font-size:12px;color:${MUTED_COLOR};">
        <p style="margin:0;">Renovation Agent &mdash; AI-powered renovation planning</p>
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;padding:12px 28px;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">${text}</a>`;
}

// ─────────────────────────────────────────────
// Template: Welcome
// ─────────────────────────────────────────────

export interface WelcomeData {
  userName: string;
  dashboardUrl: string;
}

export function welcomeTemplate(data: WelcomeData): EmailTemplate {
  return {
    subject: 'Welcome to Renovation Agent',
    html: layout('Welcome', `
      <h2 style="margin:0 0 16px;font-size:20px;">Welcome, ${data.userName}!</h2>
      <p style="margin:0 0 16px;line-height:1.6;color:${TEXT_COLOR};">
        Your account is ready. Start planning your renovation with our AI-powered assistant.
      </p>
      <p style="margin:0 0 24px;line-height:1.6;color:${MUTED_COLOR};">
        Create a session, describe your space, and we'll help you plan everything from materials to contractor recommendations.
      </p>
      <p>${button('Go to Dashboard', data.dashboardUrl)}</p>
    `),
  };
}

// ─────────────────────────────────────────────
// Template: Session Created
// ─────────────────────────────────────────────

export interface SessionCreatedData {
  userName: string;
  sessionTitle: string;
  sessionUrl: string;
}

export function sessionCreatedTemplate(data: SessionCreatedData): EmailTemplate {
  return {
    subject: `New session: ${data.sessionTitle}`,
    html: layout('Session Created', `
      <h2 style="margin:0 0 16px;font-size:20px;">Session Created</h2>
      <p style="margin:0 0 16px;line-height:1.6;">
        Hi ${data.userName}, your renovation session <strong>${data.sessionTitle}</strong> has been created.
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:${MUTED_COLOR};">
        The AI assistant is ready to help you through the intake process.
      </p>
      <p style="margin:16px 0 0;">${button('Open Session', data.sessionUrl)}</p>
    `),
  };
}

// ─────────────────────────────────────────────
// Template: Phase Transition
// ─────────────────────────────────────────────

export interface PhaseTransitionData {
  userName: string;
  sessionTitle: string;
  previousPhase: string;
  newPhase: string;
  sessionUrl: string;
}

const PHASE_LABELS: Record<string, string> = {
  INTAKE: 'Intake',
  CHECKLIST: 'Checklist',
  PLAN: 'Planning',
  RENDER: 'Visualization',
  PAYMENT: 'Payment',
  COMPLETE: 'Complete',
  ITERATE: 'Refinement',
};

export function phaseTransitionTemplate(data: PhaseTransitionData): EmailTemplate {
  const newLabel = PHASE_LABELS[data.newPhase] || data.newPhase;
  return {
    subject: `${data.sessionTitle} — now in ${newLabel} phase`,
    html: layout('Phase Update', `
      <h2 style="margin:0 0 16px;font-size:20px;">Phase Update</h2>
      <p style="margin:0 0 16px;line-height:1.6;">
        Hi ${data.userName}, your session <strong>${data.sessionTitle}</strong> has moved to the
        <span style="display:inline-block;padding:2px 10px;background:${BRAND_COLOR};color:#fff;border-radius:4px;font-size:13px;font-weight:600;">${newLabel}</span>
        phase.
      </p>
      <p style="margin:0 0 24px;line-height:1.6;color:${MUTED_COLOR};">
        Previously: ${PHASE_LABELS[data.previousPhase] || data.previousPhase}
      </p>
      <p>${button('Continue Session', data.sessionUrl)}</p>
    `),
  };
}

// ─────────────────────────────────────────────
// Template: Plan Ready
// ─────────────────────────────────────────────

export interface PlanReadyData {
  userName: string;
  sessionTitle: string;
  roomCount: number;
  estimatedBudget?: string;
  sessionUrl: string;
}

export function planReadyTemplate(data: PlanReadyData): EmailTemplate {
  const budgetLine = data.estimatedBudget
    ? `<p style="margin:0 0 8px;"><strong>Estimated Budget:</strong> ${data.estimatedBudget}</p>`
    : '';
  return {
    subject: `Your renovation plan for "${data.sessionTitle}" is ready`,
    html: layout('Plan Ready', `
      <h2 style="margin:0 0 16px;font-size:20px;">Your Renovation Plan is Ready!</h2>
      <p style="margin:0 0 16px;line-height:1.6;">
        Hi ${data.userName}, the AI has completed a renovation plan for <strong>${data.sessionTitle}</strong>.
      </p>
      <div style="padding:16px;background:#fff;border:1px solid #e5e0db;border-radius:8px;margin:0 0 24px;">
        <p style="margin:0 0 8px;"><strong>Rooms:</strong> ${data.roomCount}</p>
        ${budgetLine}
      </div>
      <p>${button('View Plan', data.sessionUrl)}</p>
    `),
  };
}

// ─────────────────────────────────────────────
// Template registry
// ─────────────────────────────────────────────

export type TemplateName = 'welcome' | 'session-created' | 'phase-transition' | 'plan-ready';

export type TemplateDataMap = {
  'welcome': WelcomeData;
  'session-created': SessionCreatedData;
  'phase-transition': PhaseTransitionData;
  'plan-ready': PlanReadyData;
};

const templateRenderers: { [K in TemplateName]: (data: TemplateDataMap[K]) => EmailTemplate } = {
  'welcome': welcomeTemplate,
  'session-created': sessionCreatedTemplate,
  'phase-transition': phaseTransitionTemplate,
  'plan-ready': planReadyTemplate,
};

/**
 * Render an email template by name
 */
export function renderTemplate<T extends TemplateName>(
  name: T,
  data: TemplateDataMap[T],
): EmailTemplate {
  const renderer = templateRenderers[name];
  return renderer(data);
}
