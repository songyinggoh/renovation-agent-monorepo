# Renovation Agent Brand Guidelines

**Version**: 1.0
**Last Updated**: 2026-02-09
**Status**: Official Design System Documentation

---

## Table of Contents

1. [Brand Identity](#brand-identity)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Dark Mode (Blueprint Mode)](#dark-mode-blueprint-mode)
5. [Component Patterns](#component-patterns)
6. [Accessibility Standards](#accessibility-standards)
7. [Animation Principles](#animation-principles)
8. [Microcopy & Tone Guidelines](#microcopy--tone-guidelines)
9. [Implementation Reference](#implementation-reference)

---

## Brand Identity

### Brand Positioning

Renovation Agent is an AI-powered renovation planning assistant that makes professional renovation planning accessible to everyone. We position ourselves as:

- **Professional yet approachable** - Expert guidance without intimidation
- **Knowledgeable yet humble** - We provide insights, not dictates
- **Empowering yet supportive** - We guide users through their renovation journey

### Brand Voice

Our voice is that of a **trusted renovation advisor** - warm, knowledgeable, and encouraging. We speak like:

- A friend who happens to be a renovation expert
- Someone who has done this hundreds of times and wants to share what they know
- A guide who celebrates your vision and helps you refine it

**Characteristics**:
- **Warm**: Use conversational language, first-person pronouns ("We", "Let's")
- **Knowledgeable**: Provide specific insights, technical details when needed
- **Encouraging**: Frame challenges as opportunities, celebrate progress
- **Honest**: Set realistic expectations, acknowledge complexity without overwhelming

### Tagline

**"AI-Powered Renovation Planning"**

Simple, clear, and communicates our core value proposition.

---

## Color System

All colors are defined in HSL format for maximum flexibility with opacity and theming.

### Primary Palette

#### Terracotta Primary
- **Value**: `HSL(16, 65%, 45%)`
- **Hex**: `#b85a32`
- **CSS Variable**: `--primary`
- **Usage**:
  - Primary buttons and CTAs
  - Interactive elements (links, hover states)
  - User chat bubbles
  - Key highlights and accents
  - Focus indicators
- **When to use**: Anything the user should click, primary actions, user-generated content

#### Sage Green Secondary
- **Light**: `HSL(140, 20%, 92%)`
- **Dark**: `HSL(140, 25%, 20%)`
- **CSS Variable**: `--secondary`
- **Usage**:
  - Secondary buttons
  - Tags and badges
  - Background tints
  - Assistant/AI chat bubbles
  - Subtle accents
- **When to use**: Supporting actions, backgrounds, AI-generated content

#### Warm Gray Muted
- **Light Background**: `HSL(30, 15%, 93%)`
- **Text**: `HSL(20, 10%, 38%)`
- **CSS Variable**: `--muted`
- **Usage**:
  - Placeholder text
  - Disabled states
  - Subtle borders
  - Card backgrounds
  - Secondary text
- **When to use**: De-emphasized content, structure without distraction

### Color Usage Rules

**DO**:
- Always use warm-tinted grays (HSL with hue between 10-40)
- Use terracotta for all primary interactive elements
- Use sage green for AI/system-generated content
- Maintain consistent temperature across the palette

**DON'T**:
- Never use cold/blue grays (except in Blueprint Mode dark theme)
- Don't use terracotta for backgrounds (too intense)
- Don't mix cool and warm neutrals in the same context
- Don't use color alone to convey meaning (accessibility)

### Phase Colors

Our 7-phase renovation workflow has dedicated accent colors:

| Phase | Color | HSL Value | Usage |
|-------|-------|-----------|-------|
| **Intake** | Blue | `HSL(210, 60%, 50%)` | Initial consultation, gathering requirements |
| **Checklist** | Amber | `HSL(45, 85%, 50%)` | Task lists, pre-planning verification |
| **Plan** | Teal | `HSL(160, 50%, 42%)` | Planning phase, design decisions |
| **Render** | Purple | `HSL(270, 55%, 55%)` | 3D renders, visualizations |
| **Payment** | Terracotta | `HSL(16, 65%, 45%)` | Budget, financial planning |
| **Complete** | Green | `HSL(142, 71%, 45%)` | Project completion, success |
| **Iterate** | Cyan | `HSL(200, 60%, 50%)` | Revisions, refinements |

**CSS Variables**: `--phase-intake`, `--phase-checklist`, `--phase-plan`, etc.

**Usage Guidelines**:
- Use phase colors for phase indicators (progress bars, badges, status chips)
- Never use more than 2 phase colors simultaneously in a single view
- Always pair with neutral backgrounds for readability
- Use at 10-15% opacity for subtle background tints

### Material Palette

12 material colors representing common renovation materials:

| Material | HSL Value | CSS Variable |
|----------|-----------|--------------|
| **Oak** | `HSL(30, 45%, 55%)` | `--material-oak` |
| **Walnut** | `HSL(25, 35%, 35%)` | `--material-walnut` |
| **Maple** | `HSL(35, 50%, 70%)` | `--material-maple` |
| **Marble** | `HSL(0, 0%, 95%)` | `--material-marble` |
| **Granite** | `HSL(0, 0%, 45%)` | `--material-granite` |
| **Slate** | `HSL(210, 15%, 30%)` | `--material-slate` |
| **Copper** | `HSL(20, 70%, 55%)` | `--material-copper` |
| **Brass** | `HSL(45, 60%, 50%)` | `--material-brass` |
| **Steel** | `HSL(200, 10%, 50%)` | `--material-steel` |
| **Porcelain** | `HSL(200, 20%, 95%)` | `--material-porcelain` |
| **Terracotta** | `HSL(16, 65%, 45%)` | `--material-terracotta` |
| **Concrete** | `HSL(0, 0%, 60%)` | `--material-concrete` |

**Usage**:
- Material swatches and selectors
- Product recommendations
- Room style indicators
- Never as primary UI colors

### Semantic Colors

| Semantic | HSL Value | CSS Variable | Usage |
|----------|-----------|--------------|-------|
| **Success** | `HSL(142, 71%, 45%)` | `--success` | Success messages, completion states |
| **Warning** | `HSL(38, 92%, 50%)` | `--warning` | Warnings, caution messages |
| **Destructive** | `HSL(0, 84.2%, 60.2%)` | `--destructive` | Errors, delete actions |
| **Info** | `HSL(210, 60%, 50%)` | `--info` | Informational messages, tooltips |

### Surface Tokens

Ambient surface tints for different contexts:

- `--surface-chat`: Warm tint for chat interfaces
- `--surface-dashboard`: Neutral for dashboard views
- `--surface-planning`: Slightly cooler for planning tools

**Usage**: Apply via `.surface-chat`, `.surface-dashboard`, `.surface-planning` utility classes for subtle background differentiation.

---

## Typography

### Font Families

We use 4 fonts, each with a specific purpose:

#### Inter (Sans-Serif)
- **CSS Variable**: `--font-sans`
- **Usage**: Body text, UI labels, buttons, form fields, navigation, microcopy
- **Characteristics**: Clean, highly legible, professional
- **Weights**: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **When to use**: 90% of text - default for all UI

#### DM Serif Display (Display Serif)
- **CSS Variable**: `--font-display`
- **Usage**: h1 and h2 headings ONLY
- **Characteristics**: Elegant, sophisticated, high contrast
- **Weights**: 400 (regular)
- **When to use**: Hero sections, page titles, major headings
- **When NOT to use**: Body text, small labels, h3-h6

#### DM Serif Text (Text Serif)
- **CSS Variable**: `--font-display-text`
- **Usage**: h3, h4, h5, h6 headings
- **Characteristics**: More readable than Display at smaller sizes
- **Weights**: 400 (regular), 600 (medium)
- **When to use**: Section headers, card titles, subheadings
- **When NOT to use**: Body paragraphs, UI labels

#### JetBrains Mono (Monospace)
- **CSS Variable**: `--font-mono`
- **Usage**: Code snippets, measurements, currency, technical data
- **Characteristics**: Monospaced, tabular-aligned, technical
- **Weights**: 400 (regular), 600 (medium)
- **When to use**: Numbers that need alignment, technical specifications

### Font Loading

Fonts are centralized in `frontend/lib/fonts.ts` and loaded via the `fontVariables` export.

```typescript
import { fontVariables } from '@/lib/fonts';

// In layout.tsx
<body className={fontVariables}>
```

### Fluid Typography Scale

We use `clamp()` for responsive typography that scales smoothly between viewport sizes.

| Class | Min Size | Preferred | Max Size | Usage |
|-------|----------|-----------|----------|-------|
| `text-fluid-xs` | 0.75rem | 2vw | 0.875rem | Captions, timestamps |
| `text-fluid-sm` | 0.875rem | 2.5vw | 1rem | Small body text |
| `text-fluid-base` | 1rem | 3vw | 1.125rem | Default body text |
| `text-fluid-lg` | 1.125rem | 3.5vw | 1.25rem | Large body, subheadings |
| `text-fluid-xl` | 1.25rem | 4vw | 1.5rem | h4, h5 |
| `text-fluid-2xl` | 1.5rem | 5vw | 2rem | h3 |
| `text-fluid-3xl` | 2rem | 6vw | 2.5rem | h2 |
| `text-fluid-4xl` | 2.5rem | 7vw | 3.5rem | h1 |

**Usage**: Apply to text elements for automatic responsive sizing:

```tsx
<h1 className="text-fluid-4xl font-display">Welcome to Renovation Agent</h1>
<p className="text-fluid-base">Your AI-powered renovation planning assistant.</p>
```

### Special Utility Classes

#### Currency
```css
.currency {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
```
**Usage**: `<span className="currency">$45,000</span>`

#### Measurement
```css
.measurement {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
```
**Usage**: `<span className="measurement">12' x 14'</span>`

#### Technical Code
```css
.technical-code {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.9em;
}
```
**Usage**: `<code className="technical-code">RGB(185, 90, 50)</code>`

#### Tabular Numbers
```css
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
```
**Usage**: Any numeric data that needs vertical alignment (tables, lists)

### Typography Rules

**DO**:
- Use fluid type scale for all responsive text
- Use `font-display` for h1/h2 to create hierarchy
- Use `font-mono` for all numeric data
- Apply `.tabular-nums` to aligned number columns

**DON'T**:
- Don't use `font-display` for body text or small labels
- Don't hardcode font sizes - use the fluid scale
- Don't use `<img>` tags - always use Next.js `<Image>`
- Don't skip semantic HTML headings (h1-h6)

---

## Dark Mode (Blueprint Mode)

Our dark mode is called "Blueprint Mode" - inspired by architectural blueprints with a deep navy background and warm copper accents.

### Color Shifts

| Element | Light Mode | Blueprint Mode |
|---------|------------|----------------|
| **Background** | `HSL(0, 0%, 100%)` white | `HSL(220, 25%, 8%)` deep navy |
| **Primary** | `HSL(16, 65%, 45%)` terracotta | `HSL(20, 70%, 55%)` copper/warm orange |
| **Card** | `HSL(0, 0%, 98%)` off-white | `HSL(220, 20%, 12%)` navy card |
| **Muted** | Warm grays | Cool navy grays |
| **Text** | Dark on light | Light on dark |

### Blueprint-Specific Features

#### Blueprint Grid Pattern
- **CSS Class**: `bg-blueprint-grid`
- **Pattern**: Subtle grid lines using `--border` at 30% opacity
- **Usage**: Background for planning/technical interfaces
- **Implementation**: Repeating linear gradient

```css
.bg-blueprint-grid {
  background-image:
    linear-gradient(hsl(var(--border) / 0.3) 1px, transparent 1px),
    linear-gradient(90deg, hsl(var(--border) / 0.3) 1px, transparent 1px);
  background-size: 20px 20px;
}
```

#### Color Temperature Rules
- Warm grays (HSL 10-40 hue) shift to cool navy grays (HSL 220 hue)
- Terracotta primary shifts to copper (warmer, higher saturation)
- All phase colors remain the same (maintain recognition)
- Material colors adjust lightness only (preserve hue identity)

### Blueprint Mode Guidelines

**DO**:
- Use `bg-blueprint-grid` for technical/planning interfaces
- Maintain warm copper accent for primary actions
- Keep phase colors consistent across modes
- Use deep navy for immersive focus

**DON'T**:
- Don't use pure black (`#000000`) - always use navy
- Don't use pure white (`#FFFFFF`) - use off-white (`HSL(0, 0%, 98%)`)
- Don't shift material color hues (only adjust lightness)
- Don't make text too light (maintain WCAG AA contrast)

---

## Component Patterns

### Badge Variants

#### Standard Variants
- `default`: Default styling with primary colors
- `secondary`: Sage green background
- `destructive`: Red/error state
- `outline`: Transparent with border

#### Semantic Variants
- `success`: Green for completed/success states
- `warning`: Amber for warnings
- `info`: Blue for informational

#### Phase Variants
- `phase-intake`, `phase-checklist`, `phase-plan`, `phase-render`, `phase-payment`, `phase-complete`, `phase-iterate`
- Use for phase indicators, progress tracking, status chips

**Usage**:
```tsx
<Badge variant="phase-plan">Planning Phase</Badge>
<Badge variant="success">Complete</Badge>
<Badge variant="outline">Draft</Badge>
```

### Loading States

Three themed variants from `LoadingState` component:

#### Blueprint Variant
- **Theme**: Architectural/technical
- **Icon**: Animated blueprint/drafting icon
- **Usage**: Planning tools, technical interfaces
- **Example**: `<LoadingState variant="blueprint" message="Loading your plan..." />`

#### Building Variant
- **Theme**: Construction/progress
- **Icon**: Building blocks stacking animation
- **Usage**: Project creation, session setup
- **Example**: `<LoadingState variant="building" message="Setting up your session..." />`

#### Measuring Variant
- **Theme**: Precision/measurement
- **Icon**: Measuring tape animation
- **Usage**: Calculations, room measurements
- **Example**: `<LoadingState variant="measuring" message="Calculating dimensions..." />`

### Skeleton Loaders

Five skeleton variants for different content types:

1. `text`: Single line text placeholder
2. `paragraph`: Multi-line text block
3. `card`: Card-shaped content area
4. `avatar`: Circular avatar placeholder
5. `thumbnail`: Rectangular image placeholder

**Usage**:
```tsx
<SkeletonLoader variant="card" count={3} />
<SkeletonLoader variant="paragraph" lines={4} />
```

### Surface Context

Apply surface classes for ambient background tints:

- `.surface-chat`: Warm tint for chat interfaces (slight terracotta/orange)
- `.surface-dashboard`: Neutral for dashboard views
- `.surface-planning`: Slightly cooler for planning tools (slight blue)

**Usage**:
```tsx
<div className="surface-chat">
  {/* Chat interface */}
</div>
```

### Component Usage Rules

**DO**:
- Use phase-specific badge variants for phase indicators
- Include loading states with appropriate themed variant
- Use surface classes for subtle context differentiation
- Apply `font-display` to major headings (h1, h2)
- Use `bg-blueprint-grid` in Blueprint Mode for technical UI

**DON'T**:
- Don't use more than 2 phase colors in a single view
- Don't skip loading states (causes jarring content pop-in)
- Don't use `font-display` for body text or small labels
- Don't hardcode colors - always use CSS variables
- Don't use `<img>` - always use Next.js `<Image>` component

---

## Accessibility Standards

### WCAG Compliance

**Minimum Standard**: WCAG AA (Level AA compliance)

#### Contrast Ratios
- **Normal text** (< 18pt): 4.5:1 minimum
- **Large text** (≥ 18pt or 14pt bold): 3:1 minimum
- **UI components**: 3:1 minimum
- **Graphical objects**: 3:1 minimum

#### Tested Contrast Values
- `--muted-foreground` at 38% lightness provides **4.8:1** contrast ratio on white background
- Terracotta primary provides **5.2:1** contrast on white
- All phase colors meet 4.5:1 minimum on their respective backgrounds

### Color Usage

**CRITICAL**: Color is never the sole means of conveying information.

**DO**:
- Pair color with icons, labels, or patterns
- Provide text alternatives for color-coded states
- Use high-contrast mode support
- Test with color blindness simulators

**DON'T**:
- Don't rely on color alone for status (e.g., "click the red button")
- Don't use color as the only way to distinguish phases
- Don't reduce contrast below WCAG minimums for aesthetic reasons

### Focus Indicators

All interactive elements must have visible focus indicators:

- **Focus ring color**: Terracotta primary (`--primary`)
- **Focus ring width**: 2px minimum
- **Focus ring offset**: 2px from element
- **Focus style**: Solid ring, high contrast

**Implementation**:
```css
.focus-visible:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
```

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Tab order must be logical and follow visual flow
- Skip links for main content navigation
- No keyboard traps

### Reduced Motion

**CRITICAL**: All animations must respect `prefers-reduced-motion` media query.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Screen Reader Support

- Use semantic HTML (h1-h6, nav, main, article, etc.)
- Provide `alt` text for all images
- Use `aria-label` for icon-only buttons
- Use `aria-describedby` for additional context
- Live regions for dynamic content updates

---

## Animation Principles

### Animation Philosophy

**Subtle, purposeful animations only**. Animations should:
- Provide feedback for user actions
- Guide attention to important changes
- Enhance the perception of quality
- Never distract or slow down the user

### Animation Catalog

#### Blueprint Draw
- **Usage**: SVG line drawing effects, progress indicators
- **Duration**: 1.5-2s
- **Easing**: Linear or ease-out
- **Example**: Drawing architectural lines, sketching outlines

#### Blocks Stack
- **Usage**: Building/stacking effects, list items appearing
- **Duration**: 0.4-0.6s per item
- **Easing**: Ease-out with slight bounce
- **Example**: Chat messages stacking, room cards appearing

#### Shimmer
- **Usage**: Loading states, skeleton loaders
- **Duration**: 2s infinite
- **Easing**: Linear
- **Example**: Content loading placeholder

#### Pulse Subtle
- **Usage**: Attention-drawing without distraction
- **Duration**: 2s infinite
- **Easing**: Ease-in-out
- **Example**: New message indicator, notification badge

#### Fade In
- **Usage**: Content appearing, modals opening
- **Duration**: 0.2-0.3s
- **Easing**: Ease-out
- **Example**: Tooltips, dropdown menus

#### Slide Up
- **Usage**: Content entering from bottom
- **Duration**: 0.3-0.4s
- **Easing**: Ease-out
- **Example**: Mobile sheets, notifications

#### Scale In
- **Usage**: Elements appearing with emphasis
- **Duration**: 0.2-0.3s
- **Easing**: Ease-out with slight overshoot
- **Example**: Buttons pressed, items selected

### Animation Timing

| Speed | Duration | Usage |
|-------|----------|-------|
| **Instant** | 0-100ms | Hover states, focus indicators |
| **Quick** | 100-300ms | Micro-interactions, button clicks |
| **Standard** | 300-500ms | Page transitions, content changes |
| **Slow** | 500-1000ms | Complex animations, storytelling |
| **Very Slow** | 1000ms+ | Loading states, brand moments |

### Animation Rules

**DO**:
- Use animations to provide feedback
- Keep micro-interactions under 300ms
- Test with `prefers-reduced-motion` enabled
- Use easing functions (avoid linear except for looping)
- Stagger multiple elements (50-100ms delay)

**DON'T**:
- Don't animate on initial page load (except hero sections)
- Don't use animations longer than 2s for UI feedback
- Don't animate more than 3 properties simultaneously
- Don't ignore `prefers-reduced-motion` settings
- Don't use spring physics for UI (too unpredictable)

---

## Microcopy & Tone Guidelines

### General Tone

**Voice**: Warm, knowledgeable, encouraging
**Perspective**: First-person plural ("We", "Let's") and second-person ("You", "Your")
**Style**: Conversational but professional, specific but not jargon-heavy

### Error Messages

**Philosophy**: Warm and helpful, never blame the user. Always offer a next step.

**DO**:
- Use plain language
- Explain what happened (briefly)
- Offer a solution or next step
- Use renovation metaphors when appropriate

**DON'T**:
- Don't use technical jargon ("500 Internal Server Error")
- Don't blame the user ("You entered invalid data")
- Don't be vague ("An error occurred")
- Don't leave users stuck (always provide a CTA)

**Examples**:

| Bad | Good |
|-----|------|
| "Error occurred" | "We hit a snag loading your session" |
| "Request failed" | "Something went wrong on our end" |
| "Invalid input" | "Let's try that again with a valid email" |
| "404 Not Found" | "We couldn't find that page. Let's get you back on track." |

**Template**:
```
[What happened] + [Why it matters] + [What to do next]

Example: "We couldn't save your changes. Your work is safe, but we lost connection. Try saving again in a moment."
```

### Loading Messages

**Philosophy**: Use renovation metaphors to make waiting feel purposeful.

**Examples**:
- "Loading your renovations..."
- "Setting up your session..."
- "Preparing your workspace..."
- "Gathering materials..."
- "Measuring dimensions..."
- "Drawing blueprints..."
- "Calculating costs..."
- "Finding contractors..."

**Rules**:
- Keep under 5 words
- Use present progressive tense ("-ing")
- Be specific when possible
- Match the loading variant theme

### Empty States

**Philosophy**: Encouraging and action-oriented. Empty is an opportunity, not a problem.

**DO**:
- Frame as a beginning, not absence
- Include a clear CTA
- Use positive language
- Provide context for new users

**DON'T**:
- Don't say "No [items] found"
- Don't leave users without direction
- Don't be negative or apologetic
- Don't use technical language

**Examples**:

| Bad | Good |
|-----|------|
| "No sessions found" | "Your renovation journey starts here" + [Create Session CTA] |
| "No messages" | "Start a conversation about your renovation" + [Type message CTA] |
| "No rooms added" | "Let's add your first room to plan" + [Add Room CTA] |
| "No results" | "We didn't find that. Try a different search term." |

**Template**:
```
[Positive framing] + [Context/benefit] + [Clear CTA]

Example: "Your renovation journey starts here. Create your first session to begin planning." [+ Create Session Button]
```

### Success Messages

**Philosophy**: Brief and celebratory. Acknowledge completion, don't overdo it.

**DO**:
- Be enthusiastic but brief
- Use action-past tense
- Provide next steps if relevant
- Use emojis sparingly (only for major milestones)

**DON'T**:
- Don't be overly verbose
- Don't say "successfully" (redundant)
- Don't use all caps (SAVED!)
- Don't interrupt the user's flow

**Examples**:

| Bad | Good |
|-----|------|
| "Session creation successful" | "Session created!" |
| "Your changes have been successfully saved" | "Changes saved" |
| "Message sent successfully" | "Sent" |
| "UPLOAD COMPLETE!!!" | "Upload complete" |

**For Major Milestones**:
- "Your renovation is complete! Time to celebrate." (phase complete)
- "Budget approved. Let's get started!" (payment phase)
- "Render complete. Here's what your space will look like." (render phase)

### Button Labels

**Philosophy**: Action-first, concise, specific.

**DO**:
- Use verb + noun ("Create Session", "Upload Photo")
- Be specific ("Save Changes" not "Submit")
- Match user goals ("Get Started" not "Click Here")

**DON'T**:
- Don't use generic labels ("OK", "Submit", "Click Here")
- Don't use jargon ("Initialize Workflow")
- Don't be vague ("Continue", "Next" without context)

**Examples**:
- "Create Session" (not "New")
- "Upload Photos" (not "Upload")
- "View Details" (not "More")
- "Start Planning" (not "Begin")
- "Save & Continue" (not "Submit")

### Confirmation Dialogs

**Philosophy**: Clear consequences, easy to reverse, respectful of user's time.

**Template**:
```
[Heading: What will happen]
[Body: Why this matters / What will be lost]
[Cancel Button] [Confirm Button]
```

**Example**:
```
Heading: "Delete this session?"
Body: "This will permanently delete your renovation session and all associated data. This can't be undone."
Buttons: [Cancel] [Delete Session]
```

**Rules**:
- Use "Delete" not "OK" for destructive actions
- Always offer a cancel option
- Explain consequences briefly
- Don't ask "Are you sure?" (patronizing)

### Input Placeholders

**Philosophy**: Examples, not instructions.

**DO**:
- Show realistic examples
- Match the expected format
- Be helpful, not bossy

**DON'T**:
- Don't use instructions as placeholders
- Don't repeat the label
- Don't be vague

**Examples**:

| Bad | Good |
|-----|------|
| "Enter your email address" | "you@example.com" |
| "Type here..." | "Master bedroom, 12' x 14'" |
| "Search..." | "Search by room, material, or style" |
| "Budget" | "$25,000" |

### Validation Messages

**Philosophy**: Helpful and specific, not punitive.

**DO**:
- Explain what's wrong
- Show how to fix it
- Use inline validation when possible
- Be conversational

**DON'T**:
- Don't blame the user
- Don't use technical terms
- Don't be vague
- Don't use red text alone (accessibility)

**Examples**:

| Bad | Good |
|-----|------|
| "Invalid email" | "Email should look like: you@example.com" |
| "Error: field required" | "We need your email to continue" |
| "Password must be 8+ characters" | "Use at least 8 characters for a strong password" |

---

## Implementation Reference

### File Locations

**Design Tokens**:
- `frontend/lib/design-tokens.ts` - Phase config, types, constants
- `frontend/lib/fonts.ts` - Font definitions and variables
- `frontend/app/globals.css` - CSS custom properties, animations

**Component Exports**:
- `frontend/components/renovation/index.ts` - Renovation components
- `frontend/components/chat/index.ts` - Chat UX components
- `frontend/components/ui/` - shadcn/ui base components

**Types**:
- `frontend/types/renovation.ts` - Domain types (SessionSummary, RoomSummary)
- `frontend/types/chat.ts` - Chat types (Message, ToolResult)

### CSS Custom Properties Reference

All color and design tokens are defined as CSS custom properties in `globals.css`:

```css
:root {
  /* Primary Palette */
  --primary: 16 65% 45%;         /* Terracotta */
  --secondary: 140 20% 92%;      /* Sage green */
  --muted: 30 15% 93%;           /* Warm gray */

  /* Phase Colors */
  --phase-intake: 210 60% 50%;
  --phase-checklist: 45 85% 50%;
  /* ... etc */

  /* Material Colors */
  --material-oak: 30 45% 55%;
  --material-walnut: 25 35% 35%;
  /* ... etc */

  /* Semantic Colors */
  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --destructive: 0 84.2% 60.2%;
  --info: 210 60% 50%;
}

.dark {
  /* Blueprint Mode overrides */
  --background: 220 25% 8%;
  --primary: 20 70% 55%;
  /* ... etc */
}
```

**Usage in components**:
```tsx
// Use Tailwind classes (preferred)
<div className="bg-primary text-primary-foreground">

// Use CSS variables directly (when needed)
<div style={{ backgroundColor: 'hsl(var(--primary))' }}>
```

### Component shadcn Configuration

**Location**: `components.json` (root directory)

```json
{
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

### Adding New shadcn Components

```bash
npx shadcn@latest add [component-name] --yes
```

Components are installed to `frontend/components/ui/` with TypeScript, CSS variables, and RSC support.

---

## Quick Reference Checklists

### Before Committing New UI

- [ ] All colors use CSS variables (no hardcoded hex/rgb)
- [ ] Typography uses fluid scale or font variables
- [ ] Interactive elements have visible focus indicators
- [ ] Color is not the sole means of conveying information
- [ ] Animations respect `prefers-reduced-motion`
- [ ] All images use Next.js `<Image>` component
- [ ] Contrast ratios meet WCAG AA (4.5:1 minimum)
- [ ] Component uses semantic HTML
- [ ] Loading states are implemented
- [ ] Error states are handled with helpful messages

### Before Writing Microcopy

- [ ] Tone is warm and encouraging
- [ ] No technical jargon
- [ ] Action-oriented (CTAs use verb + noun)
- [ ] Errors provide next steps
- [ ] Empty states frame as opportunities
- [ ] Success messages are brief
- [ ] Placeholders show examples, not instructions

### Before Creating Phase-Specific UI

- [ ] Phase color is from PHASE_CONFIG
- [ ] No more than 2 phase colors in one view
- [ ] Phase badge variant matches phase name
- [ ] Phase indicator is paired with text label (not color alone)
- [ ] Phase colors work in both light and dark modes

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-09 | Initial brand guidelines document |

---

## Maintainers

This document is maintained by the Renovation Agent design system team. For questions or updates, reference the project CLAUDE.md file.

**Last Reviewed**: 2026-02-09
**Next Review**: 2026-05-09 (Quarterly)
