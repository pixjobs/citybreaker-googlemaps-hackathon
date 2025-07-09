"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { FaStar, FaStreetView, FaUtensils } from "react-icons/fa6";
import { AnimatePresence, motion } from "framer-motion";

// --- NEW: Define the rich data structure from our API ---
interface RichWelcomeData {
  intro: string;
  vibeKeywords: string[];
  mustDo: string;
  hiddenGem: string;
  foodieTip: string;
}

// --- NEW: A more generic Tip component for cycling ---
interface Tip {
  icon: React.ReactNode;
  title: string;
  text: string;
}

const AnimatedTip = ({ tip }: { tip: Tip }) => {
  const tipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tipRef.current) return;
    gsap.fromTo(tipRef.current, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power2.out" });
  }, [tip]);
  return (
    <div ref={tipRef} className="invisible">
      <h3 className="text-lg md:text-xl font-bold flex items-center justify-center gap-3 mb-2">
        {tip.icon}
        <span>{tip.title}</span>
      </h3>
      <p className="text-base md:text-lg text-yellow-300/90">{tip.text}</p>
    </div>
  );
};

const LoadingAnimation = ({ destination }: { destination: string }) => (
  <div className="p-4 flex flex-col items-center justify-center">
    <div className="relative w-16 h-16 mb-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
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
  const [scene, setScene] = useState<'initial' | 'loading' | 'intro' | 'keywords' | 'tips' | 'finished'>('initial');
  const [richData, setRichData] = useState<RichWelcomeData | null>(null);
  const [tipsToCycle, setTipsToCycle] = useState<Tip[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const masterTimelineRef = useRef<gsap.core.Timeline | null>(null);

  // Effect 1: Fetch rich data
  useEffect(() => {
    if (active && destination && !destination.startsWith("CityBreaker")) {
      setScene('loading');
      const fetchData = async () => {
        try {
          const response = await fetch('/api/travel-tips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination }),
          });
          if (!response.ok) throw new Error('Failed to fetch rich data.');
          const data: RichWelcomeData = await response.json();
          setRichData(data);
          setScene('intro');
        } catch (err) {
          console.error(err);
          setScene('finished');
          onComplete();
        }
      };
      fetchData();
    } else if (active) {
      // Handle initial app intro
      setScene('intro');
    }
  }, [active, destination, onComplete]);

  // Effect 2: Run animations based on the current scene
  useEffect(() => {
    masterTimelineRef.current?.kill();

    if (scene === 'intro') {
      const isAppIntro = destination.startsWith("CityBreaker");
      const introTl = gsap.timeline({
        onComplete: () => setScene(isAppIntro ? 'finished' : 'keywords'),
      });
      introTl.fromTo("#intro-text", { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 1, ease: "back.out" })
             .to("#intro-text", { duration: 2.5 })
             .to("#intro-text", { autoAlpha: 0, scale: 0.8, duration: 0.5, ease: "power2.in" });
      masterTimelineRef.current = introTl;

    } else if (scene === 'keywords' && richData) {
      const keywordsTl = gsap.timeline({
        onComplete: () => {
          // Prepare tips for the next scene
          setTipsToCycle([
            { icon: <FaStar className="text-yellow-400" />, title: "Must-Do", text: richData.mustDo },
            { icon: <FaStreetView className="text-teal-400" />, title: "Hidden Gem", text: richData.hiddenGem },
            { icon: <FaUtensils className="text-orange-400" />, title: "Foodie Tip", text: richData.foodieTip },
          ]);
          setScene('tips');
        },
      });
      keywordsTl.fromTo(".vibe-keyword", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, stagger: 0.2, duration: 0.5, ease: "power2.out" })
                .to(".vibe-keyword", { duration: 2.5 })
                .to(".vibe-keyword", { autoAlpha: 0, y: -20, stagger: 0.1, duration: 0.5, ease: "power2.in" });
      masterTimelineRef.current = keywordsTl;

    } else if (scene === 'tips' && tipsToCycle.length > 0) {
      const tipCycleInterval = setInterval(() => {
        setCurrentTipIndex((prev) => (prev + 1) % tipsToCycle.length);
      }, 4000);

      const tipsTl = gsap.timeline({
        delay: (tipsToCycle.length * 4),
        onComplete: () => {
          setScene('finished');
          onComplete();
        },
      });
      tipsTl.to("#travel-text-container", { autoAlpha: 0, duration: 1 });
      masterTimelineRef.current = tipsTl;

      return () => clearInterval(tipCycleInterval);
    }
  }, [scene, richData, onComplete, destination, tipsToCycle]);

  if (scene === 'initial' || scene === 'finished') return null;

  const currentTip = tipsToCycle[currentTipIndex];
  const isAppIntro = destination.startsWith("CityBreaker");

  return (
    <div id="travel-text-container" className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {!isAppIntro && <BackgroundSlideshow imageUrls={imageUrls} />}
      
      <div className="relative bg-black/50 text-yellow-300 font-mono text-center p-6 rounded-lg border-2 border-yellow-400 w-11/12 max-w-md backdrop-blur-md min-h-[150px] flex items-center justify-center">
        {scene === 'loading' && <LoadingAnimation destination={destination} />}
        
        {scene === 'intro' && (
          isAppIntro ? (
            <p id="intro-text" className="text-xl md:text-2xl invisible">{destination}</p>
          ) : (
            <h2 id="intro-text" className="text-3xl md:text-4xl font-bold invisible">
              {richData?.intro}
            </h2>
          )
        )}

        {scene === 'keywords' && richData?.vibeKeywords && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {richData.vibeKeywords.map(keyword => (
              <span key={keyword} className="vibe-keyword invisible bg-yellow-400/20 text-yellow-300 text-sm font-semibold px-3 py-1 rounded-full border border-yellow-400/50">
                {keyword}
              </span>
            ))}
          </div>
        )}

        {scene === 'tips' && currentTip && (
          <AnimatedTip key={currentTipIndex} tip={currentTip} />
        )}
      </div>
    </div>
  );
}