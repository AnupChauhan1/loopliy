"use client";
import React from "react";

interface LooplyLogoProps {
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  className?: string;
}

export function LooplyLogo({ size = "md", animate = true, className = "" }: LooplyLogoProps) {
  const heights = { sm: 32, md: 42, lg: 72 };
  const h = heights[size];

  return (
    <div className={`inline-flex items-center select-none ${className}`} aria-label="Looply">
      <style>{`
        @keyframes looplyBlackSnap {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(-2.5px, 1.5px); }
        }
        @keyframes looplyGreenSnap {
          0%, 100% { transform: translate(0px, 0px); filter: drop-shadow(0 0 0px rgba(16,185,129,0)); }
          50% { transform: translate(2.5px, -1.5px); filter: drop-shadow(0 0 6px rgba(16,185,129,0.45)); }
        }
        @keyframes looplyIntroLeft {
          0% { opacity: 0; transform: translateX(-28px) scale(0.88); }
          65% { opacity: 1; transform: translateX(3px) scale(1.03); }
          100% { opacity: 1; transform: translateX(0px) scale(1); }
        }
        @keyframes looplyIntroRight {
          0% { opacity: 0; transform: translateX(28px) scale(0.88); }
          65% { opacity: 1; transform: translateX(-3px) scale(1.03); }
          100% { opacity: 1; transform: translateX(0px) scale(1); }
        }
        @keyframes looplyTextReveal {
          0% { opacity: 0; transform: translateX(-14px); }
          100% { opacity: 1; transform: translateX(0px); }
        }
        .looply-link-black {
          animation: looplyIntroLeft 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                     looplyBlackSnap 2.8s ease-in-out 0.8s infinite;
        }
        .looply-link-green {
          animation: looplyIntroRight 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                     looplyGreenSnap 2.8s ease-in-out 0.8s infinite;
        }
        .looply-wordmark {
          animation: looplyTextReveal 0.65s cubic-bezier(0.22, 1, 0.36, 1) 0.25s both;
        }
      `}</style>

      <svg
        height={h}
        viewBox="0 0 360 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        {/* Bottom-Left Deep Black Interlocking Chain Link */}
        <g className={animate ? "looply-link-black" : ""}>
          <path
            d="M66 44H34C20.745 44 10 54.745 10 68C10 81.255 20.745 92 34 92H62C71.5 92 79.5 86.2 83 78H62C59.8 80.2 56.8 81.5 53.5 81.5H34C26.544 81.5 20.5 75.456 20.5 68C20.5 60.544 26.544 54.5 34 54.5H60L66 44Z"
            fill="#0B0F19"
          />
        </g>

        {/* Top-Right Emerald Green Interlocking Chain Link */}
        <g className={animate ? "looply-link-green" : ""}>
          <path
            d="M44 66H76C89.255 66 100 55.255 100 42C100 28.745 89.255 18 76 18H48C38.5 18 30.5 23.8 27 32H48C50.2 29.8 53.2 28.5 56.5 28.5H76C83.456 28.5 89.5 34.544 89.5 42C89.5 49.456 83.456 55.5 76 55.5H50L44 66Z"
            fill="#059669"
          />
        </g>

        {/* Bold Slab-Serif "Looply" Wordmark */}
        <text
          x="116"
          y="79"
          fill="#0B0F19"
          className={animate ? "looply-wordmark" : ""}
          style={{
            fontFamily: "'Roboto Slab', 'Rockwell', 'Courier Prime', Georgia, serif",
            fontWeight: 900,
            fontSize: "64px",
            letterSpacing: "-1.5px",
          }}
        >
          Looply
        </text>
      </svg>
    </div>
  );
}
