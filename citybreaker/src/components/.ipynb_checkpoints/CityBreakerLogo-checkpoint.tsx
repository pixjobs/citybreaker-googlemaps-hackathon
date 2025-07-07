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

export default function CityBreakerLogo() {
  const cubeRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Entrance animation
    if (logoRef.current) {
      gsap.fromTo(
        logoRef.current,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 1.2, ease: "power4.out", delay: 0.3 }
      );
    }

    // Continuous cube rotation
    if (cubeRef.current) {
      gsap.to(cubeRef.current, {
        rotateY: 360,
        duration: 10,
        ease: "linear",
        repeat: -1,
      });
    }
  }, []);

  const icons = [
    <FaPlaneDeparture key="plane" />,
    <FaGlobe key="globe" />,
    <FaMapMarkedAlt key="map" />,
    <FaHeart key="heart" />,
    <FaBook key="book" />,
    <FaCity key="city" />,
  ];

  return (
    <div
      ref={logoRef}
      className="flex items-center gap-4 text-yellow-300 font-bold text-xl tracking-widest"
    >
      {/* Animated Cube */}
      <div
        ref={cubeRef}
        className="w-12 h-12 relative transform-style-preserve-3d"
        style={{
          perspective: "800px",
        }}
      >
        {icons.map((Icon, idx) => (
          <div
            key={idx}
            className="absolute w-full h-full flex items-center justify-center text-2xl bg-black border border-yellow-400 rounded shadow"
            style={{
              transform: `rotateY(${idx * 60}deg) translateZ(30px)`,
              backfaceVisibility: "hidden",
            }}
          >
            {Icon}
          </div>
        ))}
      </div>

      {/* Brand Name */}
      <span className="citybreaker-title bg-black border border-yellow-400 px-3 py-1 rounded shadow text-yellow-300 font-mono text-lg">
        CityBreaker
      </span>
    </div>
  );
}
