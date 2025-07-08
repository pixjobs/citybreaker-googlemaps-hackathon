// src/components/TravelText.tsx
"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import gsap from "gsap";
import { FaPlane, FaPassport, FaMapLocationDot } from "react-icons/fa6";
import { AnimatePresence, motion } from "framer-motion";

// --- Data & Component Structures ---
interface Tip { icon: string; title: string; text: string; }

const AnimatedTip = ({ tip }: { tip: Tip }) => {
  const tipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tipRef.current) return;
    gsap.fromTo(tipRef.current, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power2.out" });
  }, [tip]);
  return (
    <div ref={tipRef} className="invisible">
      <h3 className="text-lg md:text-xl font-bold flex items-center justify-center gap-3 mb-2">{tip.icon} {tip.title}</h3>
      <p className="text-base md:text-lg text-yellow-300/90">{tip.text}</p>
    </div>
  );
};

const LoadingAnimation = ({ destination }: { destination: string }) => (
  <div className="p-4 flex flex-col items-center justify-center">
    <div className="relative w-16 h-16 mb-4">
      <FaPlane className="text-4xl text-yellow-400 animate-pulse" />
    </div>
    <p>Gathering intel for {destination}...</p>
  </div>
);

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
          animate={{ opacity: 1, transition: { duration: 2.0, ease: "easeInOut" } }}
          exit={{ opacity: 0, transition: { duration: 2.0, ease: "easeInOut" } }}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
    </div>
  );
};

// --- The Main TravelText Component ---
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
  const [scene, setScene] = useState<'initial' | 'loading' | 'intro' | 'tips' | 'finished'>('initial');
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const masterTimelineRef = useRef<gsap.core.Timeline | null>(null);

  const introTips = useMemo(() => ([{ 
    icon: '✈️', 
    title: 'Welcome', 
    text: "CityBreaker is your interactive travel dashboard. Explore cities, see local times, and dive into immersive flight-style transitions." 
  }]), []);

  // Effect 1: Handles data fetching and scene transitions
  useEffect(() => {
    if (!active) {
      setScene('initial');
      return;
    }
    const isIntro = destination === introTips[0].text;
    if (isIntro) {
      setTips(introTips);
      setScene('intro');
    } else {
      setScene('loading');
      const fetchTips = async () => {
        try {
          const response = await fetch('/api/travel-tips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination }),
          });
          if (!response.ok) throw new Error('Failed to fetch tips.');
          const data = await response.json();
          const formattedTips: Tip[] = [
            { icon: "✈️", title: "Airport Tip", text: data.tips.airportTip },
            { icon: "🚇", title: "Transport Tip", text: data.tips.transportTip },
            { icon: "💡", title: "Did You Know?", text: data.tips.funFact },
          ];
          setTips(formattedTips);
          setScene('intro');
        } catch (err) {
          console.error(err);
          setScene('finished');
          onComplete();
        }
      };
      fetchTips();
    }
  }, [active, destination, introTips, onComplete]);

  // Effect 2: Handles ONLY animations based on the current scene
  useEffect(() => {
    masterTimelineRef.current?.kill();
    if (scene === 'intro' && tips) {
      const isIntroText = tips[0].text === introTips[0].text;
      const introTl = gsap.timeline({
        onComplete: () => {
          if (isIntroText) {
            setScene('finished');
            onComplete();
          } else {
            setScene('tips');
          }
        },
      });
      introTl.fromTo("#intro-text", { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 1, ease: "back.out" })
             .to("#intro-text", { duration: isIntroText ? 3.5 : 2.5 })
             .to("#intro-text", { autoAlpha: 0, scale: 0.8, duration: 0.5, ease: "power2.in" });
      masterTimelineRef.current = introTl;
    } else if (scene === 'tips' && tips) {
      const tipCycleInterval = setInterval(() => {
        setCurrentTipIndex((prev) => (prev + 1) % tips.length);
      }, 5000);
      const tipsTl = gsap.timeline({
        delay: (tips.length * 5) + 1,
        onComplete: () => {
          setScene('finished');
          onComplete();
        },
      });
      tipsTl.to("#travel-text-container", { autoAlpha: 0, duration: 1 });
      masterTimelineRef.current = tipsTl;
      return () => clearInterval(tipCycleInterval);
    }
  }, [scene, tips, introTips, onComplete]);

  if (scene === 'initial' || scene === 'finished') return null;

  const currentTip = tips?.[currentTipIndex];
  const isIntroText = destination === introTips[0].text;

  return (
    <div id="travel-text-container" className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {!isIntroText && <BackgroundSlideshow imageUrls={imageUrls} />}
      <div className="relative bg-black/50 text-yellow-300 font-mono text-center p-6 rounded-lg border-2 border-yellow-400 w-11/12 max-w-md backdrop-blur-md">
        {scene === 'loading' && <LoadingAnimation destination={destination} />}
        {scene === 'intro' && (
          isIntroText ? (
             <p id="intro-text" className="text-xl md:text-2xl invisible">{destination}</p>
          ) : (
            <h2 id="intro-text" className="text-3xl md:text-4xl font-bold invisible">
              Welcome to <span className="text-yellow-400">{destination}</span>
            </h2>
          )
        )}
        {scene === 'tips' && currentTip && (
          <AnimatedTip key={currentTipIndex} tip={currentTip} />
        )}
      </div>
    </div>
  );
}