import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#b85a32",
          borderRadius: 6,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22">
          <path
            d="M11 2L2 10h2.5v8.5h5V13h3v5.5h5V10H20L11 2z"
            fill="#faf8f5"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
