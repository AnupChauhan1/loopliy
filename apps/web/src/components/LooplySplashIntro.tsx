"use client";
import React, { useEffect, useState } from "react";
import { LooplyLogo } from "./LooplyLogo";

export function LooplySplashIntro() {
  const [phase, setPhase] = useState<"visible" | "fading" | "hidden">("visible");

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fading"), 1550);
    const hideTimer = setTimeout(() => setPhase("hidden"), 2050);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden transition-opacity duration-500 ${
        phase === "fading" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        backgroundColor: "#091518",
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }}
    >
      <style>{`
        @keyframes looplyFullScreenZoomStage {
          0% {
            opacity: 0;
            transform: scale(3.4);
            filter: blur(10px);
          }
          38% {
            opacity: 1;
            transform: scale(0.76);
            filter: blur(0px);
          }
          62% {
            opacity: 1;
            transform: scale(1.08);
          }
          80% {
            opacity: 1;
            transform: scale(0.98);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .looply-splash-zoom-stage {
          animation: looplyFullScreenZoomStage 1.25s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      {/* Subtle radial emerald aura behind the logo */}
      <div
        className="absolute w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(16,185,129,0.16) 0%, rgba(9,21,24,0) 70%)",
        }}
      />

      <div className="looply-splash-zoom-stage relative z-10">
        <LooplyLogo size="lg" animate={true} theme="dark" />
      </div>
    </div>
  );
}
