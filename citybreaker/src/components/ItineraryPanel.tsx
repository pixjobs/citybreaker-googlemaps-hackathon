"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader, X, FileDown, Users, Wallet, Star, Pin } from 'lucide-react';
import gsap from 'gsap';
import { saveAs } from 'file-saver';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';

// --- Configuration ---
const MIN_TRIP_DAYS = 3;
const MAX_TRIP_DAYS = 7;

// --- Type Definitions ---
interface EnrichedPlace { name: string; photoUrl?: string; website?: string; googleMapsUrl?: string; }
interface ItineraryActivity { title: string; description: string; whyVisit: string; insiderTip: string; priceRange: string; audience: string; placeName: string; }
interface ItineraryDay { title: string; dayPhotoUrl?: string; activities: ItineraryActivity[]; }
interface ApiResponse { city: string; days: number; places: EnrichedPlace[]; itinerary: ItineraryDay[]; }

interface ItineraryPanelProps {
  cityName: string;
  places: { name: string }[];
  onClose: () => void;
  tripLength: number;
}

// --- Child Component ---
const ActivityCard: React.FC<{ activity: ItineraryActivity; place?: EnrichedPlace }> = ({ activity, place }) => (
  <div className="bg-neutral-800/50 rounded-xl overflow-hidden flex flex-col sm:flex-row shadow-lg border border-neutral-700/60">
    <div className="relative w-full sm:w-1/3 h-40 sm:h-auto flex-shrink-0">
      {place?.photoUrl ? (
        <Image src={place.photoUrl} alt={activity.title.replace(/"/g, "'")} fill className="object-cover" sizes="(max-width: 640px) 100vw, 33vw" />
      ) : (
        <div className="w-full h-full bg-neutral-800 flex items-center justify-center"><Pin className="text-neutral-600" size={32} /></div>
      )}
    </div>
    <div className="p-4 sm:p-5 flex flex-col">
      <h4 className="font-serif text-lg sm:text-xl font-bold text-amber-300 mb-2">{activity.title}</h4>
      <div className="flex items-center gap-x-4 gap-y-1 mb-3 text-neutral-400 text-xs sm:text-sm flex-wrap">
        <span className="flex items-center gap-1.5"><Wallet size={14} className="text-amber-400/80" /> {activity.priceRange}</span>
        <span className="flex items-center gap-1.5"><Users size={14} className="text-amber-400/80" /> {activity.audience}</span>
      </div>
      <div className="text-neutral-300 prose prose-sm prose-invert prose-p:leading-relaxed mb-4">
        <ReactMarkdown>{activity.description}</ReactMarkdown>
      </div>
      <div className="mt-auto pt-3 border-t border-neutral-700/60 grid grid-cols-1 gap-3 text-xs sm:text-sm">
        <div className="flex items-start gap-2"><Star className="text-amber-400 flex-shrink-0 mt-0.5" size={14} /><div><h5 className="font-semibold text-neutral-200 mb-0.5">Why Visit</h5><p className="text-neutral-400">{activity.whyVisit}</p></div></div>
        <div className="flex items-start gap-2"><Pin className="text-amber-400 flex-shrink-0 mt-0.5" size={14} /><div><h5 className="font-semibold text-neutral-200 mb-0.5">Insider Tip</h5><p className="text-neutral-400">{activity.insiderTip}</p></div></div>
      </div>
    </div>
  </div>
);

// --- Main Panel Component ---
const ItineraryPanel: React.FC<ItineraryPanelProps> = ({ cityName, places, onClose, tripLength }) => {
  const [itineraryData, setItineraryData] = useState<ItineraryDay[]>([]);
  const [enrichedPlaces, setEnrichedPlaces] = useState<EnrichedPlace[]>([]);
  const [panelLoading, setPanelLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTripLength, setCurrentTripLength] = useState(Math.max(tripLength, MIN_TRIP_DAYS));
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Use a ref to hold the onClose callback. This prevents the useEffect hook
  // from re-running if the parent component passes a new function reference.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Stabilize the 'places' dependency by stringifying it.
  const placesJson = JSON.stringify(places);

  useEffect(() => {
    setIsMounted(true);

    // Define the async data fetching function *inside* the effect.
    const fetchData = async () => {
      setPanelLoading(true);
      setError(null);
      setItineraryData([]);

      const currentPlaces = JSON.parse(placesJson);

      if (!cityName || !currentPlaces || currentPlaces.length === 0) {
        setError("City name and places are required to generate an itinerary.");
        setPanelLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/gemini-recommendations/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ places: currentPlaces, tripLength: currentTripLength, cityName }),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Request failed with status ${res.status}`);
        }
        const data: ApiResponse = await res.json();
        setItineraryData(data.itinerary || []);
        setEnrichedPlaces(data.places || []);
      } catch (err: unknown) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : "An unknown network error occurred.");
      } finally {
        setPanelLoading(false);
      }
    };

    fetchData();
    
    // Animate the panel on mount
    gsap.fromTo(panelRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });

    // Setup keyboard listener
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup listener on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  // The effect correctly depends on stable values. It will only re-run if the trip length or places/city actually change.
  }, [currentTripLength, cityName, placesJson]);

  const downloadPDF = useCallback(async () => {
    if (!itineraryData.length || pdfLoading) return;
    setPdfLoading(true);
    const currentPlaces = JSON.parse(placesJson);
    try {
      const res = await fetch('/api/pdf-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places: currentPlaces, tripLength: currentTripLength, cityName }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `PDF generation failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const filename = `${cityName.replace(/\s+/g, '_')}_${currentTripLength}d_Itinerary.pdf`;
      saveAs(blob, filename);
    } catch (err: unknown) {
      console.error('PDF download error:', err);
      alert(err instanceof Error ? `PDF Download Failed: ${err.message}` : "An unknown error occurred.");
    } finally {
      setPdfLoading(false);
    }
  }, [itineraryData, pdfLoading, cityName, currentTripLength, placesJson]);
  
  // Hydration-safe guard: render nothing on the server or initial client render.
  if (!isMounted) {
    return null;
  }

  const isLoading = panelLoading || pdfLoading;
  const hasData = !panelLoading && !error && itineraryData.length > 0;

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&display=swap');
        .font-serif { font-family: 'Playfair Display', serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" onClick={onClose}>
        <div 
          ref={panelRef} 
          className="absolute top-[80px] left-0 right-0 bg-neutral-900 text-neutral-200 font-sans shadow-2xl flex flex-col border-t border-neutral-700/50 h-[calc(100vh-80px)] overflow-y-auto sm:top-[88px] sm:h-[calc(100vh-88px)] sm:left-1/2 sm:-translate-x-1/2 sm:max-w-4xl sm:w-full sm:rounded-2xl sm:border no-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="sticky top-0 z-20 bg-neutral-900/80 backdrop-blur-md p-3 sm:p-4 flex justify-end items-center border-b border-neutral-700/50">
            <div className="flex items-center gap-2">
              <button 
                onClick={downloadPDF} 
                disabled={isLoading || !hasData}
                className="p-2 rounded-full text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Download itinerary as PDF"
              >
                {pdfLoading ? <Loader className="animate-spin" size={20} /> : <FileDown size={20} />}
              </button>
              <button 
                onClick={onClose} 
                className="p-2 rounded-full text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                aria-label="Close itinerary panel"
              >
                <X size={24} />
              </button>
            </div>
          </header>

          <main className="flex-grow p-3 sm:p-4 lg:p-6">
            {panelLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500 pt-10">
                <Loader className="animate-spin mb-4" size={32} />
                <p className="font-semibold">Crafting your personalized itinerary...</p>
              </div>
            ) : error ? (
              <div className="text-center h-full flex flex-col items-center justify-center text-amber-400/80 pt-10">
                <p className="font-semibold text-lg">Itinerary Generation Failed</p>
                <p className="text-sm text-neutral-400 mt-2 max-w-md">{error}</p>
              </div>
            ) : (
              <div className="space-y-6 sm:space-y-10">
                {itineraryData.map((day, i) => (
                  <div key={day.title} ref={el => { contentRefs.current[i] = el; }} className="space-y-4 sm:space-y-5">
                    <div className="relative w-full h-18 sm:h-24 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-amber-300/20">
                      {day.dayPhotoUrl && <Image src={day.dayPhotoUrl} alt={day.title.replace(/"/g, "'")} fill className="object-cover" priority={i === 0} />}
                      <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-black/80 to-transparent" />
                      <div className="absolute bottom-0 left-0 p-3 sm:p-5">
                        <span className="text-xs font-bold text-amber-300 uppercase tracking-widest">Day {i + 1}</span>
                        <h3 className="font-serif text-base sm:text-xl text-white mt-0.5 leading-tight">{day.title}</h3>
                      </div>
                    </div>
                    <div className="space-y-4 sm:space-y-5">
                      {day.activities.map(activity => (
                        <ActivityCard key={activity.title} activity={activity} place={enrichedPlaces.find(p => p.name === activity.placeName)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
};

export default ItineraryPanel;