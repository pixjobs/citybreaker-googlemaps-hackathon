"use client";

import { useEffect, useRef } from "react";
import { Plane } from "lucide-react";
import gsap from "gsap";

export default function TravelOverlay({ active }: { active: boolean }) {
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active && iconRef.current) {
      const tl = gsap.timeline({
        defaults: { ease: "power4.out" },
      });

      tl.fromTo(
        iconRef.current,
        {
          scale: 0.3,
          opacity: 0,
          rotate: -30,
        },
        {
          scale: 1.5,
          opacity: 1,
          rotate: 0,
          duration: 1.2,
        }
      )
        .to(iconRef.current, {
          rotate: 10,
          scale: 1.3,
          duration: 1,
          ease: "power1.inOut",
        })
        .to(iconRef.current, {
          opacity: 0,
          scale: 0.5,
          rotate: -10,
          duration: 1,
          ease: "power4.in",
        });
    }
  }, [active]);

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center pointer-events-none">
      <div
        ref={iconRef}
        className="text-white"
        style={{
          fontSize: "8rem",
        }}
      >
        <Plane size={160} strokeWidth={1.5} />
      </div>
    </div>
  );
}
eeeee