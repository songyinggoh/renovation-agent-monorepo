import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Renovation Agent - AI-Powered Renovation Planning";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #faf8f5 0%, #f0e6dc 50%, #e8d5c4 100%)",
          position: "relative",
        }}
      >
        {/* Blueprint grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(184, 90, 50, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(184, 90, 50, 0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* House icon */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 64 64"
          style={{ marginBottom: 24 }}
        >
          <path
            d="M32 6L4 30h8v24h16V38h8v16h16V30h8L32 6z"
            fill="#b85a32"
            opacity="0.9"
          />
          <path
            d="M28 38h8v16h-8z"
            fill="#faf8f5"
          />
        </svg>

        {/* Title */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "#2e1f14",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          Renovation Agent
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 24,
            color: "#b85a32",
            marginTop: 12,
            fontWeight: 500,
          }}
        >
          AI-Powered Renovation Planning
        </div>

        {/* Decorative bar */}
        <div
          style={{
            width: 80,
            height: 4,
            borderRadius: 2,
            background: "#b85a32",
            marginTop: 28,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
