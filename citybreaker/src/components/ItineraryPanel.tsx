"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FaSpinner, FaTimes, FaFilePdf } from 'react-icons/fa';
import gsap from 'gsap';
import { saveAs } from 'file-saver';
import Image from 'next/image';

interface PlacePhotoInfo {
  name: string;
  photoUrl?: string;
}

interface ItineraryDay {
  title: string;
  activities: string[];
  dayPhoto?: string;
}

interface ItineraryPanelProps {
  cityName: string;
  placePhotos: PlacePhotoInfo[];
  onClose: () => void;
  tripLength: number;
  onTripLengthChange?: (days: number) => void;
}

const ItineraryPanel: React.FC<ItineraryPanelProps> = ({
  cityName,
  placePhotos,
  onClose,
  tripLength,
  onTripLengthChange,
}) => {
  const [itineraryData, setItineraryData] = useState<ItineraryDay[]>([]);
  const [displayPlaces, setDisplayPlaces] = useState<PlacePhotoInfo[]>(placePhotos);
  const [panelLoading, setPanelLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [currentTripLength, setCurrentTripLength] = useState(tripLength > 0 ? tripLength : 3);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const carouselRefs = useRef<(HTMLDivElement | null)[]>([]);

  const fetchItinerary = useCallback(async () => {
    setPanelLoading(true);
    setItineraryData([]);
    setActiveDay(0);
    setDisplayPlaces(placePhotos);

    if (cityName && placePhotos.length > 0 && currentTripLength >= 1) {
      try {
        const res = await fetch('/api/gemini-recommendations/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ places: placePhotos, tripLength: currentTripLength, cityName }),
        });

        if (!res.ok) {
          const error = await res.json();
          alert(`Itinerary fetch failed: ${error.error || res.statusText}`);
        } else {
          const data = await res.json();
          if (Array.isArray(data.itinerary)) {
            setItineraryData(data.itinerary);
            if (Array.isArray(data.enrichedPlaces)) {
              setDisplayPlaces(data.enrichedPlaces);
            }
          } else {
            alert('Unexpected itinerary format received.');
          }
        }
      } catch (err) {
        console.error('Fetch error:', err);
        alert('Network error while fetching itinerary.');
      }
    }

    setPanelLoading(false);
  }, [cityName, placePhotos, currentTripLength]);

  useEffect(() => {
    fetchItinerary();
  }, [fetchItinerary]);

  const downloadPDF = useCallback(async () => {
    if (!itineraryData.length || panelLoading || pdfLoading) return;

    setPdfLoading(true);
    try {
      const res = await fetch('/api/pdf-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places: placePhotos, tripLength: currentTripLength, cityName }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`PDF generation failed: ${error.error || res.statusText}`);
      } else {
        const blob = await res.blob();
        const contentDisposition = res.headers.get('Content-Disposition');
        let filename = `${cityName.replace(/\s+/g, '_')}_${currentTripLength}d_Itinerary.pdf`;
        if (contentDisposition) {
          const match = /filename="([^"]+)"/.exec(contentDisposition);
          if (match && match[1]) {
            filename = match[1];
          }
        }
        saveAs(blob, filename);
      }
    } catch (err) {
      console.error('PDF error:', err);
      alert('Network error while generating PDF.');
    } finally {
      setPdfLoading(false);
    }
  }, [itineraryData, panelLoading, pdfLoading, placePhotos, currentTripLength, cityName]);

  const handleDaysChange = (days: number) => {
    setCurrentTripLength(days);
    onTripLengthChange?.(days);
  };

  useEffect(() => {
    const el = panelRef.current;
    if (el) {
      gsap.fromTo(el, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4 });
    }
  }, []);

  const scrollTo = (i: number) => {
    setActiveDay(i);
    const container = panelRef.current;
    const target = contentRefs.current[i];
    if (container && target) {
      gsap.to(container, {
        scrollTop: target.offsetTop - container.offsetTop,
        duration: 0.5,
        ease: 'power2.out',
      });
    }
  };

  useEffect(() => {
    contentRefs.current = contentRefs.current.slice(0, itineraryData.length);
    carouselRefs.current = carouselRefs.current.slice(0, itineraryData.length);
  }, [itineraryData]);

  useEffect(() => {
    itineraryData.forEach((day, i) => {
      const container = carouselRefs.current[i];
      if (!container) return;
      const matches = displayPlaces.filter(p =>
        day.activities.some(a => a.toLowerCase().includes(p.name.toLowerCase()))
      );
      const photos = matches.map(m => m.photoUrl).filter(Boolean);

      if (photos.length > 1) {
        const slides = Array.from(container.children) as HTMLElement[];
        
        gsap.set(slides, { opacity: 0 });

        const tl = gsap.timeline({ repeat: -1 });
        slides.forEach(slide => {
          tl.to(slide, { opacity: 1, duration: 1 });
          tl.to(slide, { opacity: 0, duration: 1 }, "+=2");
        });
      }
    });
  }, [displayPlaces, itineraryData]);

  const isLoading = panelLoading || pdfLoading;
  const hasData = itineraryData.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4 pt-6 sm:pt-4">
      <div ref={panelRef} className="w-full max-w-3xl h-[85vh] bg-[#0f0f0f] text-[#f5f5f5] font-sans rounded-2xl overflow-y-auto shadow-2xl relative">
        <div className="sticky top-0 bg-[#1a1a1a] p-4 flex flex-wrap gap-2 justify-between items-center border-b border-gray-800 z-10">
          <h2 className="text-xl font-bold tracking-wide text-[#FFD600] w-full sm:w-auto">{cityName} Itinerary</h2>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={currentTripLength}
              onChange={e => handleDaysChange(Number(e.target.value))}
              className="bg-black text-[#FFD600] border border-gray-700 rounded px-2 py-1"
              disabled={isLoading}
            >
              {[3, 5, 7].map(n => (
                <option key={n} value={n}>{n}-Day</option>
              ))}
            </select>
            <button
              onClick={downloadPDF}
              disabled={isLoading || !hasData}
              className={`p-2 rounded transition ${
                isLoading || !hasData
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-[#FFD600] hover:bg-gray-800'
              }`}
              title="Download PDF"
            >
              {pdfLoading ? <FaSpinner className="animate-spin" /> : <FaFilePdf />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-gray-800 text-gray-400"
              title="Close"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        {hasData && (
          <div className="sticky top-[64px] bg-[#1a1a1a] border-b border-gray-800 flex flex-wrap">
            {itineraryData.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                className={`flex-1 py-2 text-sm font-medium transition ${
                  i === activeDay
                    ? 'bg-[#FFD600] text-black'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                Day {i + 1}
              </button>
            ))}
          </div>
        )}

        <div className="p-6 space-y-12">
          {panelLoading ? (
            <div className="flex justify-center py-20">
              <FaSpinner className="animate-spin text-gray-500" size={28} />
            </div>
          ) : !hasData ? (
            <p className="text-center text-gray-400 py-20">No itinerary data available.</p>
          ) : (
            itineraryData.map((day, i) => {
              const matched = displayPlaces.filter(p =>
                day.activities.some(a => a.toLowerCase().includes(p.name.toLowerCase()))
              );
              const photos = matched.map(m => m.photoUrl).filter(Boolean);
              return (
                // --- FIX: Changed the ref callback to a block body ---
                <div key={i} ref={el => { contentRefs.current[i] = el; }} className="space-y-3">
                  <h3 className="text-lg font-bold text-[#FFD600]">{day.title}</h3>
                  {photos.length > 0 && (
                    // --- FIX: Changed the ref callback to a block body ---
                    <div
                      className="relative w-full h-48 overflow-hidden rounded-lg shadow border border-[#FFD600]"
                      ref={el => { carouselRefs.current[i] = el; }}
                    >
                      {photos.map((url, j) => (
                        <Image
                          key={j}
                          src={url!}
                          alt={`Photo for ${day.title} Day ${i + 1}`}
                          fill
                          className="object-cover rounded-md"
                          sizes="(max-width: 768px) 100vw, 768px"
                          priority={i === 0 && j === 0}
                        />
                      ))}
                    </div>
                  )}
                  <ul className="list-disc list-inside text-sm text-gray-300 space-y-1 pl-4">
                    {day.activities.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ItineraryPanel;