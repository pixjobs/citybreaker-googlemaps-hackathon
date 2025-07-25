"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import {
  FaPlaneDeparture,
  FaGlobe,
  FaMapMarkedAlt,
  FaHeart,
  FaBook,
  FaCity,
} from "react-icons/fa";

// The component now accepts a className prop to be controlled by its parent.
export default function CityBreakerLogo({ className = "" }: { className?: string }) {
  const cubeRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial fade-in animation for the whole logo
    if (logoRef.current) {
      gsap.fromTo(
        logoRef.current,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 1.2, ease: "power4.out", delay: 0.3 }
      );
    }

    // Continuous 3D rotation for the icon cube
    if (cubeRef.current) {
      gsap.to(cubeRef.current, {
        rotateY: 360,
        duration: 10,
        ease: "linear",
        repeat: -1,
        transformOrigin: "50% 50%",
      });
    }
  }, []);

  const icons = [
    <FaPlaneDeparture key="plane" />, <FaGlobe key="globe" />, <FaMapMarkedAlt key="map" />,
    <FaHeart key="heart" />, <FaBook key="book" />, <FaCity key="city" />,
  ];

  return (
    // The main container now uses the passed-in className for external sizing control.
    // The internal gap is also slightly reduced and responsive.
    <div
      ref={logoRef}
      className={`flex items-center gap-2 sm:gap-3 ${className}`}
    >
      {/* Rotating Cube of Icons */}
      <div
        ref={cubeRef}
        // ✅ COMPRESSED: Cube is now smaller (w-8 h-8) to fit better in the header.
        className="w-8 h-8 relative transform-style-preserve-3d"
        style={{ perspective: "800px" }}
      >
        {icons.map((Icon, idx) => (
          <div
            key={idx}
            className="absolute w-full h-full flex items-center justify-center text-lg text-yellow-300 bg-black/50 border border-yellow-500/50 rounded shadow-md"
            style={{
              // ✅ ADJUSTED: The translateZ value is smaller to match the new cube size.
              transform: `rotateY(${idx * 60}deg) translateZ(15px)`,
              backfaceVisibility: "hidden",
            }}
          >
            {Icon}
          </div>
        ))}
      </div>

      {/* ✅ REPLACED: SplitFlap is gone. Replaced with a simple, responsive text element. */}
      <span className="font-bold text-lg sm:text-xl tracking-widest text-yellow-300">
        CityBreaker
      </span>
    </div>
  );
}