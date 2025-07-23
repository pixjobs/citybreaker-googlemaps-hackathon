"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { AnimatePresence, motion } from "framer-motion";

interface RichWelcomeData {
  intro: string;
  vibeKeywords: string[];
  mustDo: string;
  hiddenGem: string;
  foodieTip: string;
}

const BackgroundSlideshow = ({ imageUrls }: { imageUrls: string[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  useEffect(() => {
    if (imageUrls.length < 2) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % imageUrls.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [imageUrls]);

  if (imageUrls.length === 0) return <div className="absolute inset-0 bg-black"></div>;

  return (
    <div className="absolute inset-0 -z-10 bg-black">
      <AnimatePresence>
        <motion.div
          key={currentIndex}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${imageUrls[currentIndex]})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 1.8 } }}
          exit={{ opacity: 0, transition: { duration: 1.8 } }}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] mix-blend-screen"></div>
      <div className="absolute inset-0 bg-[url('/static/scanlines.png')] bg-repeat opacity-10 pointer-events-none" />
    </div>
  );
};

export default function TravelText({
  active,
  destination,
  imageUrls,
  onComplete,
}: {
  active: boolean;
  destination: string;
  imageUrls: string[];
  onComplete: () => void;
}) {
  const [scene, setScene] = useState<'initial' | 'loading' | 'intro' | 'finished'>('initial');
  const [richData, setRichData] = useState<RichWelcomeData | null>(null);
  const masterTimelineRef = useRef<gsap.core.Timeline | null>(null);

  // --- IMPROVEMENT: Declared once to be used in both effects and render ---
  const isAppIntro = destination.startsWith("CityBreaker");

  useEffect(() => {
    if (active && destination && !isAppIntro) { // Use the variable here
      setScene('loading');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const fetchData = async () => {
        try {
          const response = await fetch('/api/travel-tips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok) throw new Error('Failed to fetch rich data.');
          const data: RichWelcomeData = await response.json();
          setRichData(data);
          setScene('intro');
        } catch (err) {
          console.error("⚠️ Gemini fetch failed:", err);
          setRichData({
            intro: `Welcome to ${destination} — your adventure begins here.`,
            vibeKeywords: [],
            mustDo: "",
            hiddenGem: "",
            foodieTip: ""
          });
          setScene('intro');
        }
      };

      fetchData();
    } else if (active) {
      setScene('intro');
    }
  }, [active, destination, isAppIntro]); // isAppIntro is now a dependency

  useEffect(() => {
    masterTimelineRef.current?.kill();

    if (scene === 'intro') {
      const introTl = gsap.timeline({
        onComplete: () => {
          // --- IMPROVEMENT: Directly call onComplete here ---
          // This ensures the parent knows the animation is done.
          onComplete(); 
          setScene('finished');
        }
      });
      introTl.fromTo("#intro-text",
        { autoAlpha: 0, scale: 0.95, y: 16 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 1.2, ease: "expo.out" })
        // --- IMPROVEMENT: Use different durations for app intro vs city intro ---
        .to("#intro-text", { duration: isAppIntro ? 4 : 12.5 }) // Shorter pause for the app intro
        .to("#intro-text", { autoAlpha: 0, scale: 1.05, y: -10, duration: 1.5, ease: "expo.inOut" });
      
      masterTimelineRef.current = introTl;
    }
  }, [scene, destination, isAppIntro, onComplete]); // Added dependencies

  if (scene === 'initial' || scene === 'finished') return null;
  // The second declaration of isAppIntro is now removed.

  return (
    <div id="travel-text-container" className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none font-['Press_Start_2P']">
      {/* --- FIX: Uncommented this line to use the `isAppIntro` variable --- */}
      {!isAppIntro && <BackgroundSlideshow imageUrls={imageUrls} />}
      
      <div className="relative bg-[#0c0c1c]/90 text-green-400 font-mono text-center p-5 rounded-sm border border-pink-500 w-11/12 max-w-sm backdrop-blur-md min-h-[120px] flex items-center justify-center shadow-[0_0_8px_#ff00cc]">
        <h2 id="intro-text" className="text-[10px] sm:text-sm md:text-base leading-snug invisible tracking-tight text-shadow-[0_0_3px_#39ff14]">
          {richData?.intro || destination}
        </h2>
      </div>
    </div>
  );
}