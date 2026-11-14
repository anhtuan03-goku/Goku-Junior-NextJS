import { ImageResponse } from "next/og";

export const alt = "naut.frame — Minimalist Visual Journal & Curated Photography";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
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
          backgroundColor: "#fafafa",
          color: "#18181b",
          padding: "64px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            border: "2px solid #e4e4e7",
            borderRadius: "24px",
            backgroundColor: "#ffffff",
            padding: "56px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.04)",
          }}
        >
          {/* Minimalist Gallery Frame Emblem */}
          <div
            style={{
              width: "84px",
              height: "84px",
              border: "7px solid #18181b",
              borderRadius: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "28px",
              backgroundColor: "#fafafa",
            }}
          >
            <div
              style={{
                width: "46px",
                height: "46px",
                border: "2.5px solid #52525b",
                borderRadius: "6px",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              fontSize: "64px",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              marginBottom: "16px",
            }}
          >
            <span>naut</span>
            <span style={{ color: "#71717a" }}>.frame</span>
          </div>

          <div
            style={{
              fontSize: "24px",
              color: "#52525b",
              textAlign: "center",
              maxWidth: "740px",
              lineHeight: 1.45,
            }}
          >
            Minimalist visual journal & curated infinite photography — crafted with
            Zero-PII privacy.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
