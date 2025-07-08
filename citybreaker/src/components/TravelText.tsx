"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { FaPlane, FaPassport, FaMapLocationDot } from "react-icons/fa6";

// --- Data structure for a single tip from our new API ---
interface Tip {
  icon: string;
  title: string;
  text: string;
}

// --- NEW: A sub-component to animate a SINGLE tip ---
const AnimatedTip = ({ tip }: { tip: Tip }) => {
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tipRef.current) return;
    const el = tipRef.current;

    // Animate the letters of the tip's text
    const textEl = el.querySelector(".tip-text");
    if (textEl) {
      textEl.innerHTML = tip.text
        .split("")
        .map((c) => `<span class="letter">${c}</span>`)
        .join("");
    }

    const letterSpans = el.querySelectorAll<HTMLSpanElement>(".letter");
    const tl = gsap.timeline();

    // Animate the whole tip container in, then the letters
    tl.fromTo(el, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" })
      .fromTo(
        letterSpans,
        { autoAlpha: 0, y: 10 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          ease: "power1.out",
          stagger: { amount: 1.0, each: 0.02 },
        },
        "-=0.3" // Start this animation slightly before the container finishes
      );

  }, [tip]); // Re-run this animation whenever the tip prop changes

  return (
    <div ref={tipRef} className="invisible">
      <h3 className="text-lg md:text-xl font-bold flex items-center justify-center gap-3 mb-2">
        <span>{tip.icon}</span>
        <span>{tip.title}</span>
      </h3>
      <p className="tip-text text-base md:text-lg text-yellow-300/90"></p>
    </div>
  );
};

// --- The main TravelText component, now acting as a controller ---
export default function TravelText({
  active,
  destination,
  onComplete,
}: {
  active: boolean;
  destination: string;
  onComplete: () => void;
}) {
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const mainTimelineRef = useRef<gsap.core.Timeline | null>(null);

  // Effect 1: Fetch data
  useEffect(() => {
    if (active && destination) {
      const fetchTips = async () => {
        setIsLoading(true);
        setError(null);
        setTips(null);
        try {
          const response = await fetch('/api/travel-tips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination }),
          });
          if (!response.ok) throw new Error('Failed to fetch tips.');
          const data = await response.json();
          setTips(data.tips);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      };
      fetchTips();
    }
  }, [active, destination]);

  // Effect 2: Control the overall lifecycle (cycling tips and final fade out)
  useEffect(() => {
    // Kill any previous timeline when props change
    mainTimelineRef.current?.kill();

    if (active && tips && !isLoading && !error) {
      // Start cycling through tips
      const cycleInterval = setInterval(() => {
        setCurrentTipIndex((prevIndex) => (prevIndex + 1) % tips.length);
      }, 5000); // Change tip every 5 seconds

      // Create a master timeline to handle the final fade-out
      const masterTl = gsap.timeline({
        delay: 15, // Wait 15 seconds (3 tips * 5s each) before starting to fade out
        onComplete: () => onComplete(),
      });
      masterTl.to("#travel-text-container", { autoAlpha: 0, duration: 1, ease: "power2.inOut" });
      mainTimelineRef.current = masterTl;

      // Cleanup function
      return () => {
        clearInterval(cycleInterval);
        mainTimelineRef.current?.kill();
      };
    }
  }, [active, tips, isLoading, error, onComplete]);

  if (!active) return null;

  const currentTip = tips?.[currentTipIndex];

  return (
    <div
      id="travel-text-container"
      className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/90 text-yellow-300 font-mono text-center z-50 pointer-events-none p-6 rounded-lg border-2 border-yellow-400 w-11/12 max-w-md"
      style={{ lineHeight: "1.5" }}
    >
      {isLoading && <p>Brewing fresh travel tips for {destination}...</p>}
      {error && <p className="text-red-500">Error: Could not fetch tips.</p>}
      
      {/* Render the AnimatedTip component only when we have a tip to show */}
      {currentTip && (
        <AnimatedTip key={currentTipIndex} tip={currentTip} />
      )}
    </div>
  );
}