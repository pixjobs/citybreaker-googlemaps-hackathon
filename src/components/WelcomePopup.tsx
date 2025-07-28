"use client";

import { useEffect, useState } from "react";
import gsap from "gsap";

// ========== Types ==========
interface WelcomePopupProps {
  autoDismissMs?: number; // Time in milliseconds before auto-dismiss
}

// ========== Icons ==========
const ExploreIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2.5-3.5l6-2.5-2.5-6-6 2.5 2.5 6z" />
  </svg>
);

const DiscoverIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2.5l1.41 4.23h4.49l-3.63 2.63 1.41 4.23L12 11.23l-3.68 2.36 1.41-4.23L6.1 6.73h4.49L12 2.5zM19 11l-1.41-4.23h-4.49l3.63 2.63-1.41 4.23L19 11.23zM5 11l3.68 2.36-1.41-4.23L3.63 6.73H8.1L5 11zM12 15l1.41 4.23h4.49l-3.63-2.63L12 15zM12 15l-3.68 2.36 1.41 4.23h4.56L12 15z" />
  </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
  </svg>
);

// ========== Component ==========
export default function WelcomePopup({ autoDismissMs = 12000 }: WelcomePopupProps) {
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const seen = localStorage.getItem("hasSeenCityBreakerPopup");
    if (!seen) {
      setIsVisible(true);
    }
  }, []);

  // Entrance animation
  useEffect(() => {
    if (isVisible) {
      gsap.fromTo(
        "#welcome-popup",
        { autoAlpha: 0, scale: 0.95, y: -20 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.6, ease: "power3.out", delay: 0.4 }
      );

      const timer = setTimeout(() => handleClose(true), autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [isVisible, autoDismissMs]);

  const handleClose = (auto: boolean = false) => {
    gsap.to("#welcome-popup", {
      autoAlpha: 0,
      scale: 0.95,
      duration: 0.4,
      ease: "power3.in",
      onComplete: () => {
        setIsVisible(false);
        if (!auto) {
          localStorage.setItem("hasSeenCityBreakerPopup", "true");
        }
      }
    });
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md font-geist-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-popup-title"
    >
      <div
        id="welcome-popup"
        className="w-full max-w-lg rounded-xl border border-neutral-800 bg-[#1A1A1A]/95 p-6 text-white shadow-2xl sm:p-8"
      >
        <h1
          id="welcome-popup-title"
          className="font-mono text-5xl tracking-widest text-white sm:text-6xl"
        >
          CityBreaker
        </h1>
        <p className="mt-2 text-base text-neutral-400">
          A Submission for the Google Maps Platform Awards
        </p>

        <div className="my-6 h-px bg-neutral-800" />

        <div className="space-y-5 text-base text-neutral-300">
          <div className="flex items-center gap-4">
            <ExploreIcon className="h-8 w-8 flex-shrink-0 text-blue-400" />
            <p>
              <span className="font-semibold text-white">Explore</span> global cities with real-time data and stunning visuals.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <DiscoverIcon className="h-8 w-8 flex-shrink-0 text-amber-400" />
            <p>
              <span className="font-semibold text-white">Discover</span> hidden gems and must-do activities curated by AI.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <SearchIcon className="h-8 w-8 flex-shrink-0 text-emerald-400" />
            <p>
              <span className="font-semibold text-white">Search</span> for landmarks and restaurants directly on the map.
            </p>
          </div>
        </div>

        <button
          onClick={() => handleClose(false)}
          className="mt-8 w-full rounded-lg bg-white py-3 text-base font-bold text-black transition-colors duration-200 ease-in-out hover:bg-neutral-200"
        >
          Start Exploring
        </button>

        <p className="mt-4 text-center text-sm text-neutral-500">
          Project by{" "}
          <a
            href="https://devpost.com/frozenace"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-400 hover:text-blue-300 hover:underline"
          >
            Yang Pei
          </a>
        </p>
      </div>
    </div>
  );
}
