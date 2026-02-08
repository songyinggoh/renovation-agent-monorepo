import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #c96b3c 0%, #b85a32 100%)",
          borderRadius: 36,
        }}
      >
        <svg width="110" height="110" viewBox="0 0 64 64">
          <path
            d="M32 8L6 28h6v24h14V36h12v16h14V28h6L32 8z"
            fill="#faf8f5"
          />
          <path
            d="M26 36h12v16H26z"
            fill="#b85a32"
            opacity="0.3"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
