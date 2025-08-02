"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import { Download, X } from "lucide-react";
import Image from "next/image";
import ActivityCard from "./ActivityCard";

gsap.registerPlugin(ScrollTrigger);

const TRIP_LENGTH_OPTIONS = [3, 5, 7];
const DEFAULT_TRIP_LENGTH = 3;
const POLLING_INTERVAL_MS = 3000;

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
  title?: string;
  dayPhotoUrl?: string;
  activities: ItineraryActivity[];
}

interface ApiResponse {
  itinerary: ItineraryDay[];
  places: EnrichedPlace[];
}

type PdfJobStatus = 'IDLE' | 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

interface PdfJobResponse {
  status: PdfJobStatus;
  pdfUrl?: string;
  error?: string;
}

interface ItineraryPanelProps {
  cityName: string;
  places: { name: string; photoUrl?: string }[];
  onClose: () => void;
  onZoomToLocation: (location: { lat: number; lng: number }) => void;
}

const formatCityName = (input: string | undefined): string => {
  if (!input || typeof input !== "string") return "CityBreaker";
  return input.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

const ItineraryPanel: React.FC<ItineraryPanelProps> = ({
  cityName,
  places,
  onClose,
  onZoomToLocation,
}) => {
  const [itineraryData, setItineraryData] = useState<ItineraryDay[]>([]);
  const [enrichedPlaces, setEnrichedPlaces] = useState<EnrichedPlace[]>([]);
  const [panelLoading, setPanelLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTripLength, setCurrentTripLength] = useState(DEFAULT_TRIP_LENGTH);

  const [pdfJobId, setPdfJobId] = useState<string | null>(null);
  const [pdfJobStatus, setPdfJobStatus] = useState<PdfJobStatus>('IDLE');
  const [pdfJobError, setPdfJobError] = useState<string | null>(null);
  const [finalPdfUrl, setFinalPdfUrl] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const itineraryCacheRef = useRef(new Map<number, ApiResponse>());
  const prevPlacesKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const safeCityName = useMemo(() => formatCityName(cityName), [cityName]);
  const placesKey = useMemo(
    () => JSON.stringify((places || []).map((p) => (p.name || "").trim()).sort()),
    [places]
  );
  const hasData = !panelLoading && !error && itineraryData.length > 0;
  const isGeneratingPdf = pdfJobStatus === 'PENDING' || pdfJobStatus === 'PROCESSING';

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const _ctx = gsap.context(() => {
      gsap.fromTo(panelRef.current, { opacity: 0, y: 100 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" });
      gsap.from(".header-element", { y: -30, opacity: 0, stagger: 0.1, delay: 0.5, ease: "power3.out" });
    }, panelRef);
    return () => _ctx.revert();
  }, []);

  useEffect(() => {
    if (prevPlacesKeyRef.current !== placesKey) {
      itineraryCacheRef.current.clear();
      prevPlacesKeyRef.current = placesKey;
    }
    const cachedData = itineraryCacheRef.current.get(currentTripLength);
    if (cachedData) {
      setItineraryData(cachedData.itinerary || []);
      setEnrichedPlaces(cachedData.places || []);
      setPanelLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const currentReq = ++requestIdRef.current;
    setPanelLoading(true);
    setError(null);
    const startTime = Date.now();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/gemini-recommendations/json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ places, tripLength: currentTripLength, cityName: safeCityName }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errorResponse = await res.json().catch(() => null) as { error?: unknown };
          throw new Error(typeof errorResponse?.error === "string" ? errorResponse.error : "Request failed");
        }
        const data: ApiResponse = await res.json();
        if (currentReq === requestIdRef.current && !controller.signal.aborted) {
          const originalItinerary = data.itinerary || [];
          const allEnrichedPlaces = data.places || [];
          const enrichedItinerary = originalItinerary.map(day => {
            if (day.dayPhotoUrl) return day;
            const firstPlaceName = day.activities?.[0]?.placeName;
            if (!firstPlaceName) return day;
            const photoPlace = allEnrichedPlaces.find(p => p.name === firstPlaceName);
            return { ...day, dayPhotoUrl: photoPlace?.photoUrl };
          });

          setItineraryData(enrichedItinerary);
          setEnrichedPlaces(allEnrichedPlaces);
          itineraryCacheRef.current.set(currentTripLength, {
            itinerary: enrichedItinerary,
            places: allEnrichedPlaces,
          });
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "An unknown error occurred.");
        }
      } finally {
        const duration = Date.now() - startTime;
        const delay = Math.max(0, 1500 - duration);
        timeoutId = setTimeout(() => {
          if (currentReq === requestIdRef.current && !controller.signal.aborted) {
            setPanelLoading(false);
          }
        }, delay);
      }
    };
    fetchData();
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      controller.abort();
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleKeyDown);
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, [safeCityName, currentTripLength, placesKey, places]);

  useEffect(() => {
    if (!panelLoading && hasData) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ctx = gsap.context(() => {
        ScrollTrigger.batch(".day-block", { onEnter: batch => gsap.from(batch, { autoAlpha: 0, y: 50, stagger: 0.15, ease: "power3.out" }), start: "top 90%" });
        ScrollTrigger.batch(".activity-card", { onEnter: batch => gsap.from(batch, { autoAlpha: 0, x: -50, stagger: 0.1, ease: "back.out(1.7)" }), start: "top 95%" });
      }, panelRef);
      return () => {
        ScrollTrigger.getAll().forEach((t) => t.kill());
      };
    }
  }, [panelLoading, hasData]);

  useEffect(() => {
    if (!isGeneratingPdf || !pdfJobId) {
      return;
    }
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/pdf-itinerary?jobId=${pdfJobId}`);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Failed to get job status.' }));
          throw new Error(errorData.error);
        }
        const data: PdfJobResponse = await res.json();
        if (data.status !== pdfJobStatus) {
            setPdfJobStatus(data.status);
        }
        if (data.status === 'COMPLETE') {
          setFinalPdfUrl(data.pdfUrl || null);
          setPdfJobId(null);
          setPdfJobStatus('IDLE');
        } else if (data.status === 'FAILED') {
          setPdfJobError(data.error || 'An unknown error occurred during PDF generation.');
          setPdfJobId(null);
          setPdfJobStatus('IDLE');
        }
      } catch (err) {
        console.error(err);
        setPdfJobStatus('FAILED');
        setPdfJobError(err instanceof Error ? err.message : 'Could not connect to check status.');
        setPdfJobId(null);
      }
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [pdfJobId, isGeneratingPdf, pdfJobStatus]);

  const startPdfGenerationJob = useCallback(async () => {
    if (isGeneratingPdf) return;
    setPdfJobStatus('PENDING');
    setPdfJobError(null);
    setPdfJobId(null);
    setFinalPdfUrl(null);
    try {
      const res = await fetch("/api/pdf-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ places, tripLength: currentTripLength, cityName: safeCityName }),
      });
      if (res.status !== 202) {
        const errorPayload = await res.json().catch(() => ({ error: "Failed to start job." }));
        throw new Error(errorPayload.error);
      }
      const { jobId } = await res.json();
      setPdfJobId(jobId);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "An unknown error occurred";
      setPdfJobStatus('FAILED');
      setPdfJobError(errorMsg);
    }
  }, [isGeneratingPdf, places, currentTripLength, safeCityName]);

  const handleTripLengthChange = useCallback((days: number) => {
    if (days !== currentTripLength && !panelLoading) {
      setFinalPdfUrl(null);
      setPdfJobError(null);
      setCurrentTripLength(days);
    }
  }, [currentTripLength, panelLoading]);

  const findPlace = useCallback((name: string | undefined) => {
    if (!name) return undefined;
    return enrichedPlaces.find((p) => p.name === name || p.name.toLowerCase() === name.toLowerCase());
  }, [enrichedPlaces]);

  const renderPdfButton = () => {
    if (finalPdfUrl) {
      return (
        <button
          onClick={() => window.open(finalPdfUrl, '_blank')}
          className="header-element flex min-w-[250px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105 hover:shadow-lg"
        >
          <Download size={16} />
          Download Ready
        </button>
      );
    }
    return (
      <button
        onClick={startPdfGenerationJob}
        disabled={isGeneratingPdf}
        className="header-element flex min-w-[250px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105 hover:shadow-lg disabled:pointer-events-none disabled:opacity-60"
      >
        {isGeneratingPdf ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span>Generating...</span>
          </>
        ) : (
          "Generate Premium PDF Itinerary"
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={panelRef}
        className="no-scrollbar absolute bottom-0 left-0 right-0 top-[80px] flex flex-col border-t border-neutral-700/50 bg-neutral-900 font-sans text-neutral-200 shadow-2xl sm:left-1/2 sm:top-[88px] sm:w-full sm:max-w-4xl sm:-translate-x-1/2 sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-20 flex flex-col border-b border-neutral-700/50 bg-neutral-900/80 p-3 backdrop-blur-md sm:p-4">
          <div className="flex w-full items-center justify-between">
            <div className="header-element flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800 p-1">
              {TRIP_LENGTH_OPTIONS.map((days) => (
                <button
                  key={days}
                  onClick={() => handleTripLengthChange(days)}
                  disabled={panelLoading}
                  className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed ${currentTripLength === days ? "bg-amber-400 text-black" : "text-neutral-300 hover:bg-neutral-700/50"}`}
                >
                  {days} Days
                </button>
              ))}
            </div>
            <h2 className="header-element absolute left-1/2 hidden -translate-x-1/2 font-serif text-lg text-white md:block">
              Your <span className="text-amber-300">{safeCityName}</span> Itinerary
            </h2>
            <div className="flex items-center gap-2">
              {hasData && !panelLoading && renderPdfButton()}
              <button
                onClick={onClose}
                className="header-element rounded-full p-2 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                aria-label="Close itinerary panel"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          {pdfJobError && (
            <div className="mt-2 w-full rounded-md border border-red-500/50 bg-red-500/10 p-2 text-center text-sm text-red-300">
              PDF Generation Failed: {pdfJobError}
            </div>
          )}
        </header>
        <main className="flex-grow overflow-y-auto p-3 sm:p-4 lg:p-6">
          {panelLoading ? (
            <div className="flex h-full flex-col items-center justify-center pt-10 text-neutral-500">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
              <p className="mt-4 font-semibold">Crafting your {currentTripLength}-day itinerary...</p>
              <p className="mt-1 text-sm text-neutral-600">This can take a moment.</p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center pt-10 text-amber-400/80">
              <p className="text-lg font-semibold">Itinerary Generation Failed</p>
              <p className="mt-2 max-w-md text-center text-sm text-neutral-400">{error}</p>
            </div>
          ) : !hasData ? (
            <div className="flex h-full items-center justify-center text-neutral-400">
              <p>No itinerary data available.</p>
            </div>
          ) : (
            <div className="space-y-6 sm:space-y-10">
              {itineraryData.map((day, i) => {
                const altText = String(day.title ?? `Day ${i + 1}`).replace(/"/g, "'");
                return (
                  <div key={day.title ?? `day-${i}`} className="day-block space-y-4 sm:space-y-5">
                    <div className="relative h-40 w-full overflow-hidden rounded-xl border-2 border-amber-300/20 sm:h-56 sm:rounded-2xl md:h-72">
                      {day.dayPhotoUrl ? (
                        <Image src={day.dayPhotoUrl} alt={altText} fill unoptimized className="object-cover" priority={i === 0} sizes="(max-width: 768px) 100vw, 50vw" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-neutral-800/40"><span className="text-xs text-neutral-400">No photo available</span></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                      <div className="absolute bottom-0 left-0 p-3 sm:p-5">
                        <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Day {i + 1}</span>
                        <h3 className="mt-0.5 font-serif text-base leading-tight text-white sm:text-xl">{day.title ?? `Highlights`}</h3>
                      </div>
                    </div>
                    <div className="space-y-4 sm:space-y-5">
                      {day.activities?.map((activity, ai) => (
                        <ActivityCard key={`${i}-${ai}-${activity.title || "untitled"}-${activity.placeName || "unknown"}`} activity={activity} place={findPlace(activity.placeName)} onZoomToLocation={onZoomToLocation} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ItineraryPanel;