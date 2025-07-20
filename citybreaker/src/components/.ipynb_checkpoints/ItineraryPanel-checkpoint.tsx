"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FaSpinner, FaTimes, FaFilePdf } from 'react-icons/fa';
import gsap from 'gsap';
import { saveAs } from 'file-saver';

// Types for places & days
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
  itineraryMarkdown: string | null;
  placePhotos: PlacePhotoInfo[];
  isLoading: boolean;
  onClose: () => void;
}

// Parse raw markdown into structured days
const parseItinerary = (markdown: string, photos: PlacePhotoInfo[]): ItineraryDay[] => {
  if (!markdown) return [];
  return markdown.split('###').slice(1).map(block => {
    const lines = block.trim().split('\n');
    const heading = lines.shift() || '';
    const photoMatch = heading.match(/\[PHOTO_SUGGESTION: "([^"]+)"\]/);
    const title = heading.replace(/\[PHOTO_SUGGESTION:[^\]]+\]/, '').trim();
    const dayPhoto = photoMatch ? photos.find(p => p.name === photoMatch[1])?.photoUrl : undefined;
    const activities = lines
      .map(l => l.replace(/^[*-]\s*/, '').trim())
      .filter(l => l);
    return { title, activities, dayPhoto };
  });
};

const ItineraryPanel: React.FC<ItineraryPanelProps> = ({
  cityName,
  itineraryMarkdown,
  placePhotos,
  isLoading: parentLoading,
  onClose,
}) => {
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  const [loading, setLoading] = useState(parentLoading);
  const [selectedDays, setSelectedDays] = useState(3);
  const [activeDay, setActiveDay] = useState(0);

  const panelRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);

  // When markdown or photos update, re-parse
  useEffect(() => {
    setItinerary(parseItinerary(itineraryMarkdown || '', placePhotos));
    setActiveDay(0);
  }, [itineraryMarkdown, placePhotos]);

  // Fetch JSON itinerary when days change
  const fetchItinerary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/gemini-recommendations/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places: placePhotos, tripLength: selectedDays, cityName }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const { itinerary: md } = await res.json();
      setItinerary(parseItinerary(md, placePhotos));
      setActiveDay(0);
    } catch (err) {
      console.error('Fetch itin error:', err);
      setItinerary([]);
    } finally {
      setLoading(false);
    }
  }, [placePhotos, selectedDays, cityName]);

  // Download PDF
  const downloadPDF = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/gemini-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places: placePhotos, tripLength: selectedDays, cityName }),
      });
      if (!res.ok) throw new Error(`Download failed ${res.status}`);
      const blob = await res.blob();
      saveAs(blob, `${cityName.replace(/\s+/g, '_')}_${selectedDays}d_Itinerary.pdf`);
    } catch (err) {
      console.error('PDF download error:', err);
      alert('Could not download PDF.');
    } finally {
      setLoading(false);
    }
  }, [placePhotos, selectedDays, cityName]);

  // Initial load and on days change
  useEffect(() => {
    if (placePhotos.length) {
      fetchItinerary();
    } else {
      setItinerary([]);
    }
  }, [fetchItinerary, placePhotos]);

  // GSAP entry animation
  useEffect(() => {
    const el = panelRef.current;
    if (el) {
      gsap.fromTo(el, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' });
    }
  }, []);

  // Scroll to day
  const scrollTo = (i: number) => {
    setActiveDay(i);
    const container = panelRef.current;
    const target = contentRefs.current[i];
    if (container && target) {
      gsap.to(container, { scrollTop: target.offsetTop, duration: 0.6, ease: 'power2.out' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
      <div
        ref={panelRef}
        className="w-full max-w-xl h-[85vh] bg-gray-900 text-gray-100 font-sans rounded-2xl overflow-y-auto shadow-2xl relative"
      >
        <div className="sticky top-0 bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700 z-10">
          <h2 className="text-3xl font-bold tracking-wide">{cityName} Adventure</h2>
          <div className="flex items-center space-x-2">
            <select
              value={selectedDays}
              onChange={e => setSelectedDays(Number(e.target.value))}
              className="bg-gray-700 text-gray-200 p-2 rounded-lg"
            >{[3, 5, 7].map(d => (
              <option key={d} value={d}>{d}-Day</option>
            ))}</select>
            <button
              onClick={downloadPDF}
              disabled={loading}
              className="p-2 rounded-full hover:bg-gray-700 transition"
            >
              {loading ? <FaSpinner className="animate-spin" size={18}/> : <FaFilePdf size={18}/>}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-700 transition"
            ><FaTimes size={18}/></button>
          </div>
        </div>

        {/* Day tabs */}
        {itinerary.length > 0 && (
          <div className="sticky top-16 bg-gray-800 flex overflow-x-auto border-b border-gray-700 z-10">
            {itinerary.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                className={`flex-1 py-3 font-medium ${
                  i === activeDay
                    ? 'bg-yellow-500 text-gray-900'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Day {i + 1}
              </button>
            ))}
          </div>
        )}

        <div className="p-6 space-y-8">
          {loading ? (
            <div className="flex justify-center py-20"><FaSpinner className="animate-spin" size={32}/></div>
          ) : itinerary.length === 0 ? (
            <p className="text-center text-gray-500 py-20">No itinerary available. Please select some places above.</p>
          ) : (
            itinerary.map((day, i) => (
              <div
                key={i}
                ref={el => (contentRefs.current[i] = el)}
                className="space-y-4"
              >
                <h3 className="text-2xl font-semibold mb-2">{day.title}</h3>
                {day.dayPhoto && (
                  <div className="w-full h-48 overflow-hidden rounded-lg shadow-lg">
                    <img
                      src={day.dayPhoto}
                      alt={day.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <ul className="list-disc list-inside space-y-1 text-base">
                  {day.activities.map((act, j) => (
                    <li key={j}>{act}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ItineraryPanel;