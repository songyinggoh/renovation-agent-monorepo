import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Consolas", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
        "display-text": ["var(--font-display-text)", "Georgia", "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        "chat-user": "hsl(var(--chat-user))",
        "chat-assistant": "hsl(var(--chat-assistant))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        "phase-intake": "hsl(var(--phase-intake))",
        "phase-checklist": "hsl(var(--phase-checklist))",
        "phase-plan": "hsl(var(--phase-plan))",
        "phase-render": "hsl(var(--phase-render))",
        "phase-payment": "hsl(var(--phase-payment))",
        "phase-complete": "hsl(var(--phase-complete))",
        "phase-iterate": "hsl(var(--phase-iterate))",
        "material-oak": "hsl(var(--material-oak))",
        "material-walnut": "hsl(var(--material-walnut))",
        "material-maple": "hsl(var(--material-maple))",
        "material-marble": "hsl(var(--material-marble))",
        "material-granite": "hsl(var(--material-granite))",
        "material-slate": "hsl(var(--material-slate))",
        "material-copper": "hsl(var(--material-copper))",
        "material-brass": "hsl(var(--material-brass))",
        "material-steel": "hsl(var(--material-steel))",
        "material-porcelain": "hsl(var(--material-porcelain))",
        "material-terracotta": "hsl(var(--material-terracotta))",
        "material-concrete": "hsl(var(--material-concrete))",
        "chart-budget": "hsl(var(--chart-budget))",
        "chart-spent": "hsl(var(--chart-spent))",
        "chart-remaining": "hsl(var(--chart-remaining))",
        "chart-timeline": "hsl(var(--chart-timeline))",
        "surface-chat": "hsl(var(--surface-chat))",
        "surface-dashboard": "hsl(var(--surface-dashboard))",
        "surface-planning": "hsl(var(--surface-planning))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "slide-down": "slide-down 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
