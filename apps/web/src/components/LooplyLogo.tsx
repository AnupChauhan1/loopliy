"use client";
import React from "react";

interface LooplyLogoProps {
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  theme?: "dark" | "light";
  className?: string;
}

export function LooplyLogo({
  size = "md",
  animate = true,
  theme = "dark",
  className = "",
}: LooplyLogoProps) {
  const heights = { sm: 32, md: 42, lg: 84 };
  const h = heights[size];

  const primaryColor = theme === "dark" ? "#FFFFFF" : "#0B0F19";
  const emeraldColor = theme === "dark" ? "#10B981" : "#059669";

  return (
    <div className={`inline-flex items-center select-none ${className}`} aria-label="Looply">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@800;900&display=swap');

        @keyframes looplyMagneticLeft {
          0% {
            opacity: 0;
            transform: translate(-18px, 6px) scale(0.94);
          }
          100% {
            opacity: 1;
            transform: translate(0px, 0px) scale(1);
          }
        }

        @keyframes looplyMagneticRight {
          0% {
            opacity: 0;
            transform: translate(18px, -6px) scale(0.94);
          }
          100% {
            opacity: 1;
            transform: translate(0px, 0px) scale(1);
          }
        }

        @keyframes looplyCurtainText {
          0% {
            opacity: 0;
            transform: translateY(28px);
            letter-spacing: 2px;
          }
          100% {
            opacity: 1;
            transform: translateY(0px);
            letter-spacing: -1.5px;
          }
        }

        @keyframes looplyAmbientBreath {
          0%, 100% {
            filter: drop-shadow(0 0 0px rgba(16, 185, 129, 0));
          }
          50% {
            filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.35));
          }
        }

        .looply-prem-left {
          animation: looplyMagneticLeft 0.85s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .looply-prem-right {
          animation:
            looplyMagneticRight 0.85s cubic-bezier(0.16, 1, 0.3, 1) 0.08s both,
            looplyAmbientBreath 3.6s ease-in-out 1s infinite;
        }

        .looply-prem-wordmark {
          animation: looplyCurtainText 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.22s both;
        }
      `}</style>

      <svg
        height={h}
        viewBox="0 0 390 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        <defs>
          <clipPath id="looplyWordmarkMask">
            <rect x="118" y="8" width="272" height="96" />
          </clipPath>
        </defs>

        {/* Bottom-Left Interlocking Link */}
        <g className={animate ? "looply-prem-left" : ""}>
          <path
            d="M72 44H36C19.5 44 8 55.2 8 70C8 84.8 19.5 96 36 96H66C77.5 96 86.5 89 90.5 79H67C64.2 81.8 60.2 83.2 55.5 83.2H36C27.2 83.2 21 77.4 21 70C21 62.6 27.2 56.8 36 56.8H63.5L72 44Z"
            fill={primaryColor}
          />
        </g>

        {/* Top-Right Emerald Green Interlocking Link */}
        <g className={animate ? "looply-prem-right" : ""}>
          <path
            d="M44 68H80C96.5 68 108 56.8 108 42C108 27.2 96.5 16 80 16H50C38.5 16 29.5 23 25.5 33H49C51.8 30.2 55.8 28.8 60.5 28.8H80C88.8 28.8 95 34.6 95 42C95 49.4 88.8 55.2 80 55.2H52.5L44 68Z"
            fill={emeraldColor}
          />
        </g>

        {/* Masked Heavy Slab-Serif "Looply" Wordmark */}
        <g clipPath="url(#looplyWordmarkMask)">
          <text
            x="124"
            y="82"
            fill={primaryColor}
            className={animate ? "looply-prem-wordmark" : ""}
            style={{
              fontFamily: "'Roboto Slab', Georgia, serif",
              fontWeight: 900,
              fontSize: "68px",
            }}
          >
            Looply
          </text>
        </g>
      </svg>
    </div>
  );
}
