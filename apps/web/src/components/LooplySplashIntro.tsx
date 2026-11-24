"use client";

import { useEffect, useState } from "react";
import { LooplyLogo } from "./LooplyLogo";

export function LooplySplashIntro() {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const fade = setTimeout(() => setFading(true), 1600);
    const remove = setTimeout(() => setGone(true), 2100);
    return () => {
      clearTimeout(fade);
      clearTimeout(remove);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className={`fixed inset-0 z-[300] flex items-center justify-center transition-opacity duration-500 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        backgroundColor: "#0B191E",
        backgroundImage:
          "linear-gradient(rgba(156,163,175,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(156,163,175,0.06) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }}
    >
      <LooplyLogo animate={true} size="lg" theme="dark" />
    </div>
  );
}
