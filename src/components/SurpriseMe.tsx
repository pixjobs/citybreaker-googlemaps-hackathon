"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import Image from "next/image";
import {
  FaTimes, FaDice, FaUtensils, FaTheaterMasks, FaRedo,
  FaSpinner, FaStar, FaMapSigns, FaGlobe, FaBookOpen,
  FaMapMarkerAlt, FaGamepad, FaDragon,
} from "react-icons/fa";

interface Suggestion {
  name: string;
  photoUrl: string;
  description: string;
  whyWorthIt: string;
  transportInfo: string;
  address: string;
  rating?: number;
  website?: string;
  tripAdvisorUrl: string;
  lat: number;
  lng: number;
}

interface SurpriseMeProps {
  isOpen: boolean;
  onClose: () => void;
  city: { name: string; lat: number; lng: number; timezone: string };
  onZoomToLocation: (location: { lat: number; lng: number }) => void;
}

type SurprisePrompt = "hungry" | "entertain" | "surprise" | "gamersParadise" | "mtgHotspots";

export default function SurpriseMe({ isOpen, onClose, city, onZoomToLocation }: SurpriseMeProps) {
  const [viewState, setViewState] = useState<"prompts" | "loading" | "result">("prompts");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const promptContainerRef = useRef<HTMLDivElement>(null);
  const resultContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabIndicatorRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const currentSuggestion = suggestions?.[activeTabIndex];

  const fetchSuggestions = useCallback(
    async (prompt: SurprisePrompt) => {
      setViewState("loading");
      setError(null);
      tabRefs.current = [];
      try {
        const res = await fetch("/api/surprise-me", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            city: { name: city.name, lat: city.lat, lng: city.lng },
          }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to get suggestions.");
        }
        const data: Suggestion[] = await res.json();
        if (data.length === 0) throw new Error("No suggestions found.");
        setSuggestions(data);
        setActiveTabIndex(0);
        setViewState("result");
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unexpected error occurred.");
        }
        setViewState("prompts");
      }
    },
    [city]
  );

  const handlePromptClick = (prompt: SurprisePrompt) => {
    gsap.to(promptContainerRef.current, {
      y: -20,
      autoAlpha: 0,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => {
        gsap.set(promptContainerRef.current, { y: 0, autoAlpha: 1 });
        fetchSuggestions(prompt);
      },
    });
  };

  const handleTabClick = (index: number) => {
    if (index === activeTabIndex) return;
    const tl = gsap.timeline({
      onComplete: () => setActiveTabIndex(index),
    });
    tl.to(contentRef.current, {
      autoAlpha: 0,
      y: 10,
      duration: 0.2,
      ease: "power2.in",
    });
  };

  const handleTryAgain = () => {
    setViewState("prompts");
    setSuggestions(null);
  };

  const handleZoomClick = () => {
    if (!currentSuggestion) return;
    onZoomToLocation({ lat: currentSuggestion.lat, lng: currentSuggestion.lng });
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      gsap.to(panelRef.current, {
        opacity: 1,
        y: 0,
        scale: 1,
        pointerEvents: "auto",
        duration: 0.4,
        ease: "power2.out",
      });
    } else {
      gsap.to(panelRef.current, {
        opacity: 0,
        y: -15,
        scale: 0.95,
        pointerEvents: "none",
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => {
          setViewState("prompts");
          setSuggestions(null);
        },
      });
    }
  }, [isOpen]);


  useEffect(() => {
    if (viewState === "result" && suggestions) {
      gsap.fromTo(resultContainerRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 });
      const activeTab = tabRefs.current[activeTabIndex];
      if (activeTab && tabIndicatorRef.current) {
        gsap.to(tabIndicatorRef.current, {
          x: activeTab.offsetLeft,
          width: activeTab.offsetWidth,
          duration: 0.4,
          ease: "power2.inOut",
        });
      }
    }
  }, [viewState, suggestions, activeTabIndex]);

  useEffect(() => {
    if (viewState === "result") {
      gsap.fromTo(
        contentRef.current,
        { autoAlpha: 0, y: -10 },
        { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out", delay: 0.05 }
      );
    }
  }, [activeTabIndex, viewState]);

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-gradient-to-br from-cyan-100/10 to-blue-300/10 backdrop-blur-md"
        />
      )}
      <div
        className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-5 sm:pt-4 pointer-events-none"
      >
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md rounded-xl shadow-2xl border border-cyan-200/30 backdrop-blur-lg bg-gradient-to-br from-cyan-100/20 to-blue-200/10 ring-1 ring-white/10 min-h-[22rem] max-h-[calc(100vh-4rem)] sm:max-h-[90vh] overflow-hidden flex flex-col text-white opacity-0 scale-95"
        >
          <button
            onClick={onClose}
            className="absolute top-2.5 right-2.5 text-gray-400 hover:text-yellow-200 transition-colors z-20"
          >
            <FaTimes size={20} />
          </button>

          {viewState === "loading" && (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-6">
              <FaSpinner size={40} className="animate-spin text-yellow-400" />
              <p className="mt-4 text-sm tracking-widest animate-pulse">
                Consulting the Oracle...
              </p>
            </div>
          )}

          <div
            style={{ display: viewState === "prompts" ? "flex" : "none" }}
            className="flex-grow"
          >
            <div
              ref={promptContainerRef}
              className="flex flex-col items-center justify-center text-center p-4 space-y-3 w-full"
            >
              <h2 className="text-xl sm:text-2xl font-bold tracking-wider text-yellow-300 mb-2">
                What’s Your Mission?
              </h2>
              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
              <button onClick={() => handlePromptClick("hungry")} className="prompt-button">
                <FaUtensils />
                <span>I’m Hungry</span>
              </button>
              <button onClick={() => handlePromptClick("entertain")} className="prompt-button">
                <FaTheaterMasks />
                <span>Entertain Me</span>
              </button>
              <button onClick={() => handlePromptClick("gamersParadise")} className="prompt-button">
                <FaGamepad />
                <span>Gamers Paradise</span>
              </button>
               <button onClick={() => handlePromptClick("mtgHotspots")} className="prompt-button">
                <FaDragon />
                <span>MTG Hotspots</span>
              </button>
              <button onClick={() => handlePromptClick("surprise")} className="prompt-button">
                <FaDice />
                <span>Surprise Me</span>
              </button>
            </div>
          </div>

          {viewState === "result" && suggestions && currentSuggestion && (
            <div ref={resultContainerRef} className="invisible flex-grow flex flex-col min-h-0">
              <div className="relative border-b border-yellow-500/20 px-2 sm:px-4">
                <div className="flex justify-around">
                  {suggestions.map((_, index) => (
                    <button
                      key={index}
                      // FIXED: Changed `(el) => (...)` to `(el) => { ... }` to fix the type error.
                      ref={(el) => { tabRefs.current[index] = el; }}
                      onClick={() => handleTabClick(index)}
                      className={`flex-1 py-2.5 text-sm font-semibold transition-colors duration-300 ${
                        activeTabIndex === index
                          ? "text-yellow-300"
                          : "text-gray-500 hover:text-yellow-400"
                      }`}
                    >
                      Option {index + 1}
                    </button>
                  ))}
                </div>
                <div
                  ref={tabIndicatorRef}
                  className="absolute bottom-0 h-0.5 bg-yellow-300 rounded-full"
                />
              </div>

              <div className="flex-grow overflow-y-auto">
                <div ref={contentRef}>
                  <div className="relative w-full h-36 sm:h-48">
                    <Image
                      key={currentSuggestion.name}
                      src={currentSuggestion.photoUrl}
                      alt={currentSuggestion.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 500px"
                      priority={activeTabIndex === 0}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  </div>
                  <div className="p-4 space-y-2.5">
                    <h3 className="text-lg sm:text-xl font-bold text-yellow-300">
                      {currentSuggestion.name}
                    </h3>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {currentSuggestion.description}
                    </p>

                    <div className="suggestion-section">
                      <h4 className="suggestion-section-header">
                        <FaStar /> Why It’s Worth It
                      </h4>
                      <p className="text-sm">{currentSuggestion.whyWorthIt}</p>
                    </div>

                    <div className="suggestion-section">
                      <h4 className="suggestion-section-header">
                        <FaMapSigns /> Getting There
                      </h4>
                      <p className="text-sm">{currentSuggestion.transportInfo}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 border-t border-yellow-500/20">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                  <button onClick={handleZoomClick} className="link-button">
                    <FaMapMarkerAlt />
                    <span>Map</span>
                  </button>
                  {currentSuggestion.website && (
                    <a
                      href={currentSuggestion.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-button"
                    >
                      <FaGlobe />
                      <span>Website</span>
                    </a>
                  )}
                  <a
                    href={currentSuggestion.tripAdvisorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-button"
                  >
                    <FaBookOpen />
                    <span>TripAdvisor</span>
                  </a>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleTryAgain}
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-yellow-200 transition-colors"
                  >
                    <FaRedo /> Try Again
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}