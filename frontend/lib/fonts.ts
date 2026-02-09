import { Inter, DM_Serif_Display, DM_Serif_Text, JetBrains_Mono } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

export const dmSerifText = DM_Serif_Text({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-text",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const fontVariables = [
  inter.variable,
  dmSerifDisplay.variable,
  dmSerifText.variable,
  jetbrainsMono.variable,
].join(" ");
