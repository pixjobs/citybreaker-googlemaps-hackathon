"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  X,
  Sparkles, // Changed from FileDown
  Users,
  Wallet,
  Star,
  Pin,
  MapPin,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import { saveAs } from "file-saver";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

// Register the ScrollTrigger plugin
gsap.registerPlugin(ScrollTrigger);

// Constants
const TRIP_LENGTH_OPTIONS = [3, 5, 7];
const DEFAULT_TRIP_LENGTH = 3;

// Types
interface EnrichedPlace {
  name: string;
  photoUrl?: string;
  website?: string;
  googleMapsUrl?: string;
  location?: { lat: number; lng: number };
}

interface ItineraryActivity {
  title: string;
  description: string;
  whyVisit: string;
  insiderTip: string;
  priceRange: string;
  audience: string;
  placeName: string;
}

interface ItineraryDay {
  title: string;
  dayPhotoUrl?: string;
  activities: ItineraryActivity[];
}

interface ApiResponse {
  city: string;
  days: number;
  places: EnrichedPlace[];
  itinerary: ItineraryDay[];
}

interface ItineraryPanelProps {
  cityName: string;
  places: { name: string }[];
  onClose: () => void;
  onZoomToLocation: (location: { lat: number; lng: number }) => void;
}

// Utility
const formatCityName = (input: string | undefined): string => {
  if (!input || typeof input !== "string") return "CityBreaker";
  return input
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// Activity Card
const ActivityCard: React.FC<{
  activity: ItineraryActivity;
  place?: EnrichedPlace;
  onZoomToLocation: (location: { lat: number; lng: number }) => void;
}> = ({ activity, place, onZoomToLocation }) => (
  <div className="bg-neutral-800/50 rounded-xl overflow-hidden flex flex-col sm:flex-row shadow-lg border border-neutral-700/60 activity-card">
    <div className="relative w-full sm:w-1/3 h-40 sm:h-auto flex-shrink-0">
      {place?.photoUrl ? (
        <Image
          src={place.photoUrl}
          alt={activity.title.replace(/"/g, "'")}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 33vw"
        />
      ) : (
        <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
          <Pin className="text-neutral-600" size={32} />
        </div>
      )}
    </div>
    <div className="p-4 sm:p-5 flex flex-col w-full">
      <div className="flex justify-between items-start gap-3 mb-2">
        <h4 className="font-serif text-lg sm:text-xl font-bold text-amber-300">
          {activity.title}
        </h4>
        {place?.location && (
          <button
            onClick={() => onZoomToLocation(place.location!)}
            className="flex-shrink-0 flex items-center gap-1.5 bg-blue-500/10 text-blue-400 px-2.5 py-1.5 rounded-full text-xs font-semibold hover:bg-blue-500/20 transition-colors"
            title={`View ${activity.placeName} on the map`}
          >
            <MapPin size={14} />
            Map
          </button>
        )}
      </div>
      <div className="flex items-center gap-x-4 gap-y-1 mb-3 text-neutral-400 text-xs sm:text-sm flex-wrap">
        <span className="flex items-center gap-1.5">
          <Wallet size={14} className="text-amber-400/80" /> {activity.priceRange}
        </span>
        <span className="flex items-center gap-1.5">
          <Users size={14} className="text-amber-400/80" /> {activity.audience}
        </span>
      </div>
      <div className="text-neutral-300 prose prose-sm prose-invert prose-p:leading-relaxed mb-4">
        <ReactMarkdown>{activity.description}</ReactMarkdown>
      </div>
      <div className="mt-auto pt-3 border-t border-neutral-700/60 grid grid-cols-1 gap-3 text-xs sm:text-sm">
        <div className="flex items-start gap-2">
          <Star className="text-amber-400 flex-shrink-0 mt-0.5" size={14} />
          <div>
            <h5 className="font-semibold text-neutral-200 mb-0.5">Why Visit</h5>
            <p className="text-neutral-400">{activity.whyVisit}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Pin className="text-amber-400 flex-shrink-0 mt-0.5" size={14} />
          <div>
            <h5 className="font-semibold text-neutral-200 mb-0.5">Insider Tip</h5>
            <p className="text-neutral-400">{activity.insiderTip}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Main Component
const ItineraryPanel: React.FC<ItineraryPanelProps> = ({
  cityName,
  places,
  onClose,
  onZoomToLocation,
}) => {
  const safeCityName = useMemo(() => formatCityName(cityName), [cityName]);
  const [itineraryData, setItineraryData] = useState<ItineraryDay[]>([]);
  const [enrichedPlaces, setEnrichedPlaces] = useState<EnrichedPlace[]>([]);
  const [panelLoading, setPanelLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTripLength, setCurrentTripLength] = useState(DEFAULT_TRIP_LENGTH);

  const panelRef = useRef<HTMLDivElement>(null);
  const itineraryCache = useRef<Record<string, ApiResponse>>({});
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const cacheKey = useMemo(() => {
    const sorted = places.map((p) => p.name).sort().join("|");
    return `${safeCityName}_${currentTripLength}_${sorted}`;
  }, [places, currentTripLength, safeCityName]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 100 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }
      );
      gsap.from(".header-element", {
        y: -30,
        opacity: 0,
        stagger: 0.1,
        delay: 0.5,
        ease: "power3.out",
      });
    }, panelRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      setPanelLoading(true);
      setError(null);
      
      const startTime = Date.now();
      const isCached = itineraryCache.current[cacheKey];

      if (isCached) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (itineraryCache.current[cacheKey]) {
        const cached = itineraryCache.current[cacheKey];
        setItineraryData(cached.itinerary);
        setEnrichedPlaces(cached.places);
        setPanelLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/gemini-recommendations/json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            places,
            tripLength: currentTripLength,
            cityName: safeCityName,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error((await res.json()).error || "Request failed");
        }

        const data: ApiResponse = await res.json();
        itineraryCache.current[cacheKey] = data;
        setItineraryData(data.itinerary || []);
        setEnrichedPlaces(data.places || []);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setError(err.message || "Something went wrong.");
        }
      } finally {
         const duration = Date.now() - startTime;
         setTimeout(() => setPanelLoading(false), Math.max(0, 1500 - duration));
      }
    };

    fetchData();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      controller.abort();
      document.removeEventListener("keydown", handleKeyDown);
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, [cacheKey]);

  useEffect(() => {
    if (!panelLoading && itineraryData.length > 0) {
      const ctx = gsap.context(() => {
        ScrollTrigger.batch(".day-block", {
          onEnter: batch => gsap.from(batch, { 
            autoAlpha: 0, 
            y: 50, 
            stagger: 0.15,
            ease: "power3.out" 
          }),
          start: "top 90%",
        });

        ScrollTrigger.batch(".activity-card", {
          onEnter: batch => gsap.from(batch, {
            autoAlpha: 0,
            x: -50,
            stagger: 0.1,
            ease: "back.out(1.7)"
          }),
          start: "top 95%",
        });
      }, panelRef);
      return () => {
        ScrollTrigger.getAll().forEach(t => t.kill());
        ctx.revert();
      }
    }
  }, [panelLoading, itineraryData]);

  // Renamed function to be more descriptive
  const generateExtendedItineraryPDF = useCallback(async () => {
    if (!itineraryData.length || pdfLoading) return;
    setPdfLoading(true);

    try {
      const res = await fetch("/api/pdf-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          places,
          tripLength: currentTripLength,
          cityName: safeCityName,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || "PDF generation failed");
      }

      const blob = await res.blob();
      const filename = `${safeCityName.replace(/\s+/g, "_")}_${currentTripLength}d_Itinerary.pdf`;
      saveAs(blob, filename);
    } catch (err: any) {
      alert(`PDF Download Failed: ${err?.message || "Unknown error"}`);
    } finally {
      setPdfLoading(false);
    }
  }, [pdfLoading, itineraryData, places, currentTripLength, safeCityName]);

  const isLoading = panelLoading || pdfLoading;
  const hasData = !panelLoading && !error && itineraryData.length > 0;

  const handleTripLengthChange = useCallback(
    (days: number) => {
      if (days !== currentTripLength && !panelLoading) {
        setCurrentTripLength(days);
      }
    },
    [currentTripLength, panelLoading]
  );

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={panelRef}
        className="absolute top-[80px] bottom-0 left-0 right-0 bg-neutral-900 text-neutral-200 font-sans shadow-2xl flex flex-col border-t border-neutral-700/50 overflow-y-auto sm:top-[88px] sm:left-1/2 sm:-translate-x-1/2 sm:max-w-4xl sm:w-full sm:rounded-2xl sm:border no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-20 bg-neutral-900/80 backdrop-blur-md p-3 sm:p-4 flex justify-between items-center border-b border-neutral-700/50">
          <div className="header-element bg-neutral-800 p-1 rounded-full flex items-center gap-1 border border-neutral-700">
            {TRIP_LENGTH_OPTIONS.map((days) => (
              <button
                key={days}
                onClick={() => handleTripLengthChange(days)}
                disabled={panelLoading}
                className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-200 disabled:cursor-not-allowed ${
                  currentTripLength === days
                    ? "bg-amber-400 text-black"
                    : "text-neutral-300 hover:bg-neutral-700/50"
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
          <h2 className="header-element hidden md:block font-serif text-lg text-white absolute left-1/2 -translate-x-1/2">
            Your <span className="text-amber-300">{safeCityName}</span> Itinerary
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={generateExtendedItineraryPDF} // Using renamed function
              disabled={isLoading || !hasData}
              className="header-element p-2 rounded-full text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Generate extended itinerary" // Updated aria-label
              title="Generate extended itinerary" // Added title for hover
            >
              {pdfLoading ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Sparkles size={20} /> // Using new icon
              )}
            </button>
            <button
              onClick={onClose}
              className="header-element p-2 rounded-full text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
              aria-label="Close itinerary panel"
            >
              <X size={24} />
            </button>
          </div>
        </header>

        <main className="flex-grow p-3 sm:p-4 lg:p-6">
          {panelLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500 pt-10">
              <div
                className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"
              />
              <p className="font-semibold mt-4">
                Crafting your {currentTripLength}-day itinerary...
              </p>
              <p className="text-sm text-neutral-600 mt-1">This can take a moment.</p>
            </div>
          ) : error ? (
            <div className="text-center h-full flex flex-col items-center justify-center text-amber-400/80 pt-10">
              <p className="font-semibold text-lg">Itinerary Generation Failed</p>
              <p className="text-sm text-neutral-400 mt-2 max-w-md">{error}</p>
            </div>
          ) : (
            <div className="space-y-6 sm:space-y-10">
              {itineraryData.map((day, i) => (
                <div key={day.title} className="space-y-4 sm:space-y-5 day-block">
                  <div className="relative w-full h-18 sm:h-24 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-amber-300/20">
                    {day.dayPhotoUrl && (
                      <Image
                        src={day.dayPhotoUrl}
                        alt={day.title.replace(/"/g, "'")}
                        fill
                        className="object-cover"
                        priority={i === 0}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-0 left-0 p-3 sm:p-5">
                      <span className="text-xs font-bold text-amber-300 uppercase tracking-widest">
                        Day {i + 1}
                      </span>
                      <h3 className="font-serif text-base sm:text-xl text-white mt-0.5 leading-tight">
                        {day.title}
                      </h3>
                    </div>
                  </div>
                  <div className="space-y-4 sm:space-y-5">
                    {day.activities.map((activity) => (
                      <ActivityCard
                        key={activity.title}
                        activity={activity}
                        place={enrichedPlaces.find(
                          (p) => p.name === activity.placeName
                        )}
                        onZoomToLocation={onZoomToLocation}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ItineraryPanel;