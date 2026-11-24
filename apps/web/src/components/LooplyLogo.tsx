"use client";
import React from "react";

interface LooplyLogoProps {
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  className?: string;
  theme?: "dark" | "light";
}

export function LooplyLogo({ size = "md", animate = true, className = "", theme = "dark" }: LooplyLogoProps) {
  const heights = { sm: 32, md: 42, lg: 76 };
  const h = heights[size];
  const primary = theme === "dark" ? "#FFFFFF" : "#0B0F19";
  const accent = theme === "dark" ? "#10B981" : "#059669";

  return (
    <div className={`inline-flex items-center select-none ${className}`} aria-label="Looply">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@800;900&display=swap');

        @keyframes looplyBlackSnap {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(-2px, 1.5px); }
        }
        @keyframes looplyGreenSnap {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(2px, -1.5px); }
        }
        @keyframes looplyIntroLeft {
          0% { opacity: 0; transform: translateX(-26px) scale(0.9); }
          65% { opacity: 1; transform: translateX(3px) scale(1.03); }
          100% { opacity: 1; transform: translateX(0px) scale(1); }
        }
        @keyframes looplyIntroRight {
          0% { opacity: 0; transform: translateX(26px) scale(0.9); }
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
        viewBox="0 0 385 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        {/* Bottom-Left Deep Black Teardrop/Leaf-Cornered Interlocking Link (opens right) */}
        <g className={animate ? "looply-link-black" : ""}>
          <path
            d="M72 44H36C19.5 44 8 55.2 8 70C8 84.8 19.5 96 36 96H66C77.5 96 86.5 89 90.5 79H67C64.2 81.8 60.2 83.2 55.5 83.2H36C27.2 83.2 21 77.4 21 70C21 62.6 27.2 56.8 36 56.8H63.5L72 44Z"
            fill={primary}
          />
        </g>

        {/* Top-Right Emerald Green Teardrop/Leaf-Cornered Interlocking Link (opens left) */}
        <g className={animate ? "looply-link-green" : ""}>
          <path
            d="M44 68H80C96.5 68 108 56.8 108 42C108 27.2 96.5 16 80 16H50C38.5 16 29.5 23 25.5 33H49C51.8 30.2 55.8 28.8 60.5 28.8H80C88.8 28.8 95 34.6 95 42C95 49.4 88.8 55.2 80 55.2H52.5L44 68Z"
            fill={accent}
          />
        </g>

        {/* Heavy Slab-Serif "Looply" Wordmark in Deep Black */}
        <text
          x="124"
          y="82"
          fill={primary}
          fillOpacity={1}
          className={animate ? "looply-wordmark" : ""}
          style={{
            fontFamily: "'Roboto Slab', Georgia, serif",
            fontWeight: 900,
            fontSize: "68px",
            letterSpacing: "-1.5px",
          }}
        >
          Looply
        </text>
      </svg>
    </div>
  );
}
