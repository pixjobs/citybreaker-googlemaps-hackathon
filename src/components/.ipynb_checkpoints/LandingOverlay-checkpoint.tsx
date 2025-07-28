"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function LandingOverlay({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // fade in the overlay
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 1 });

    // retro arcade zoom
    gsap.fromTo(
      titleRef.current,
      { scale: 0.2, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 1,
        ease: "back.out(1.7)",
        delay: 0.5,
      }
    );

    const handleWheel = () => {
      gsap.to(overlayRef.current, {
        opacity: 0,
        duration: 0.8,
        onComplete: onDismiss,
      });
      window.removeEventListener("wheel", handleWheel);
    };

    window.addEventListener("wheel", handleWheel);

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [onDismiss]);

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 bg-black/80 z-50 flex flex-col justify-center items-center text-center text-retro-gray px-4"
    >
      <h1
        ref={titleRef}
        className="text-4xl md:text-5xl font-pixel mb-4 text-retro-neonGreen drop-shadow-[0_0_10px_#00ff00]"
      >
        CityBreaker
      </h1>
      <h2 className="text-md md:text-xl font-pixel mb-6 text-retro-neonCyan">
        Your Ultimate City Break Planner
      </h2>
      <p className="mb-6 max-w-md text-retro-gray font-pixel text-sm md:text-base">
        Plan, discover, and explore the best spots in your favourite city — all
        in one place. Scroll or swipe to continue.
      </p>
    </div>
  );
}
