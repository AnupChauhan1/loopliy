"use client";
import React, { useEffect, useState } from "react";
import { LooplyLogo } from "./LooplyLogo";

export function LooplySplashIntro() {
  const [stage, setStage] = useState<"enter" | "exit" | "done">("enter");

  useEffect(() => {
    const exitTimer = setTimeout(() => setStage("exit"), 1550);
    const doneTimer = setTimeout(() => setStage("done"), 2250);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (stage === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundColor: "#071114",
        backgroundImage:
          "radial-gradient(circle at 50% 48%, rgba(16,185,129,0.14) 0%, rgba(7,17,20,0.96) 58%), linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "100% 100%, 56px 56px, 56px 56px",
        transform: stage === "exit" ? "translateY(-100%)" : "translateY(0%)",
        transition: "transform 0.7s cubic-bezier(0.76, 0, 0.24, 1)",
      }}
    >
      <style>{`
        @keyframes looplyLuxuryStage {
          0% {
            opacity: 0;
            transform: scale(1.16);
            filter: blur(8px);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0px);
          }
        }

        @keyframes looplyLightSweep {
          0% {
            transform: translateX(-140%) skewX(-22deg);
            opacity: 0;
          }
          35% {
            opacity: 0.55;
          }
          100% {
            transform: translateX(240%) skewX(-22deg);
            opacity: 0;
          }
        }

        @keyframes looplyProgressLine {
          0% {
            transform: scaleX(0);
            opacity: 0.4;
          }
          100% {
            transform: scaleX(1);
            opacity: 1;
          }
        }

        .looply-luxury-container {
          animation: looplyLuxuryStage 0.95s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .looply-sheen-bar {
          animation: looplyLightSweep 1.1s cubic-bezier(0.16, 1, 0.3, 1) 0.55s forwards;
        }

        .looply-hairline-loader {
          transform-origin: left center;
          animation: looplyProgressLine 1.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
        }
      `}</style>

      {/* Subtle ambient top & bottom hairline border */}
      <div className="relative looply-luxury-container px-8 py-6">
        <LooplyLogo size="lg" animate={true} theme="dark" />

        {/* Diagonal luxury light sweep across the logo */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="looply-sheen-bar h-full w-24 opacity-0"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)",
            }}
          />
        </div>
      </div>

      {/* Ultra-thin precision emerald progress bar below logo */}
      <div className="mt-4 h-[2px] w-44 overflow-hidden rounded-full bg-white/10">
        <div
          className="looply-hairline-loader h-full w-full rounded-full"
          style={{
            background: "linear-gradient(90deg, #059669 0%, #34D399 100%)",
          }}
        />
      </div>
    </div>
  );
}
