"use client"; // Ensure this component is marked as a client component

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FaSpinner, FaTimes, FaFilePdf } from 'react-icons/fa';
import gsap from 'gsap';
import { saveAs } from 'file-saver';

// --- Interfaces ---
// Re-declare interfaces here or import them if they are shared
interface PlacePhotoInfo {
  name: string;
  photoUrl?: string;
}
interface ItineraryDay {
  title: string;
  activities: string[];
  dayPhoto?: string; // URL of the photo for the day
}

interface ItineraryPanelProps {
  cityName: string;
  placePhotos: PlacePhotoInfo[]; // Initial list of places
  onClose: () => void;
  tripLength: number; // Controlled by parent, but we'll manage its default here
  onTripLengthChange: (days: number) => void;
}

// --- Component ---
const ItineraryPanel: React.FC<ItineraryPanelProps> = ({
  cityName,
  placePhotos: initialPlacePhotos, // Rename prop to avoid conflict with state
  onClose,
  tripLength: controlledTripLength, // Rename prop to avoid conflict
  onTripLengthChange,
}) => {
  // --- State ---
  const [itineraryData, setItineraryData] = useState<ItineraryDay[]>([]);
  const [displayPlaces, setDisplayPlaces] = useState<PlacePhotoInfo[]>(initialPlacePhotos); // For UI previews
  const [panelLoading, setPanelLoading] = useState(true); // Loading state for fetching itinerary
  const [pdfLoading, setPdfLoading] = useState(false); // Loading state for PDF generation
  const [activeDay, setActiveDay] = useState(0);
  const [currentTripLength, setCurrentTripLength] = useState(controlledTripLength > 0 ? controlledTripLength : 3); // Manage internal trip length, default to 3

  // --- Refs ---
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);

  // --- Fetch Itinerary Data ---
  const fetchItinerary = useCallback(async () => {
    setPanelLoading(true);
    setItineraryData([]); // Clear previous data
    setActiveDay(0); // Reset active day
    setDisplayPlaces(initialPlacePhotos); // Reset display places to initial

    // Fetch only if essential data is available and trip length is valid
    if (cityName && initialPlacePhotos.length > 0 && currentTripLength >= 1) {
      try {
        const res = await fetch('/api/gemini-recommendations/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            places: initialPlacePhotos, // Send original places
            tripLength: currentTripLength,
            cityName,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          console.error('API Error fetching itinerary:', errorData.error || res.statusText);
          alert(`Could not fetch itinerary: ${errorData.error || res.statusText}`);
          setItineraryData([]);
        } else {
          const data = await res.json();
          if (data.itinerary && Array.isArray(data.itinerary)) {
            setItineraryData(data.itinerary);
            // Update displayPlaces if backend provided enriched ones
            if (data.enrichedPlaces && Array.isArray(data.enrichedPlaces) && data.enrichedPlaces.length > 0) {
              setDisplayPlaces(data.enrichedPlaces);
            }
          } else {
            console.error('Received invalid itinerary data format:', data);
            alert('Received unexpected data format for itinerary.');
            setItineraryData([]);
          }
        }
      } catch (err) {
        console.error('Network error fetching itinerary:', err);
        alert('A network error occurred while fetching the itinerary.');
        setItineraryData([]);
      }
    } else {
      // If initial data is insufficient, clear loading state immediately
      setItineraryData([]); // Ensure empty if data isn't ready/valid
    }
    setPanelLoading(false);
  }, [cityName, initialPlacePhotos, currentTripLength, onTripLengthChange]); // Include onTripLengthChange for completeness, though not directly used here

  // Fetch itinerary when component mounts or relevant props/state change
  useEffect(() => {
    fetchItinerary();
  }, [fetchItinerary]); // Dependency array ensures it only runs when fetchItinerary changes

  // --- Generate PDF ---
  const downloadPDF = useCallback(async () => {
    if (!itineraryData || itineraryData.length === 0 || panelLoading || pdfLoading) {
        // Prevent download if no data, loading, or already downloading PDF
        return;
    }
    setPdfLoading(true);
    try {
      const res = await fetch('/api/gemini-recommendations', { // Call the PDF generation route
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          places: initialPlacePhotos, // Pass original places to backend
          tripLength: currentTripLength,
          cityName,
          // Backend infers direct PDF download from absence of sessionId
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error('PDF generation failed:', errorData.error || res.statusText);
        alert(`Could not generate PDF: ${errorData.error || res.statusText}`);
      } else {
        const blob = await res.blob();
        // Use the correct filename from backend response (if provided) or construct one
        const filename = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `${cityName.replace(/\s+/g, '_')}_${currentTripLength}d_Itinerary.pdf`;
        saveAs(blob, filename);
      }
    } catch (err) {
      console.error('Network error during PDF download:', err);
      alert('A network error occurred while downloading the PDF.');
    } finally {
      setPdfLoading(false);
    }
  }, [itineraryData, panelLoading, pdfLoading, initialPlacePhotos, currentTripLength, cityName]);

  // --- Trip Length Change Handler ---
  const handleDaysChange = (days: number) => {
    setCurrentTripLength(days);
    // The useEffect watching currentTripLength will trigger a new fetch
    onTripLengthChange(days); // Notify parent if needed
  };

  // --- GSAP Animation ---
  useEffect(() => {
    const el = panelRef.current;
    if (el) {
      gsap.fromTo(el, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' });
    }
  }, []);

  // --- Scroll to Day ---
  const scrollTo = (i: number) => {
    setActiveDay(i);
    const container = panelRef.current;
    const target = contentRefs.current[i];
    if (container && target) {
      gsap.to(container, {
        scrollTop: target.offsetTop - container.offsetTop, // Adjust for container's scroll position
        duration: 0.6,
        ease: 'power2.out',
      });
    }
  };

  // --- Update Content Refs ---
  useEffect(() => {
    // Ensure contentRefs array matches the number of itinerary items
    contentRefs.current = contentRefs.current.slice(0, itineraryData.length);
  }, [itineraryData]);

  // --- Render Logic ---
  const isAnythingLoading = panelLoading || pdfLoading;
  const hasItineraryData = itineraryData.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
      <div
        ref={panelRef}
        className="w-full max-w-xl h-[85vh] bg-gray-900 text-gray-100 font-sans rounded-2xl overflow-y-auto shadow-2xl relative"
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700 z-10">
          <h2 className="text-3xl font-bold tracking-wide">{cityName} Adventure</h2>
          <div className="flex items-center space-x-2">
            {/* Trip Length Selector */}
            <select
              value={currentTripLength}
              onChange={e => handleDaysChange(Number(e.target.value))}
              className="bg-gray-700 text-gray-200 p-2 rounded-lg"
              disabled={isAnythingLoading}
            >
              {[3, 5, 7].map(d => ( // Defaulting to 3 days visually
                <option key={d} value={d}>
                  {d}-Day
                </option>
              ))}
            </select>
            {/* PDF Download Button */}
            <button
              onClick={downloadPDF}
              disabled={isAnythingLoading || !hasItineraryData}
              className={`p-2 rounded-full transition ${isAnythingLoading || !hasItineraryData ? 'text-gray-500 cursor-not-allowed' : 'hover:bg-gray-700'}`}
            >
              {pdfLoading ? <FaSpinner className="animate-spin" size={18} /> : <FaFilePdf size={18} />}
            </button>
            {/* Close Button */}
            <button
              onClick={onClose}
              disabled={isAnythingLoading}
              className={`p-2 rounded-full transition ${isAnythingLoading ? 'text-gray-500 cursor-not-allowed' : 'hover:bg-gray-700'}`}
            >
              <FaTimes size={18} />
            </button>
          </div>
        </div>

        {/* Day Tabs */}
        {hasItineraryData && (
          <div className="sticky top-16 bg-gray-800 flex overflow-x-auto border-b border-gray-700 z-10">
            {itineraryData.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                disabled={isAnythingLoading}
                className={`flex-1 py-3 font-medium transition ${
                  i === activeDay
                    ? 'bg-yellow-500 text-gray-900'
                    : `${isAnythingLoading ? 'text-gray-500' : 'text-gray-400 hover:text-gray-200'}`
                }`}
              >
                Day {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Itinerary Content */}
        <div className="p-6 space-y-8">
          {panelLoading ? (
            <div className="flex justify-center py-20">
              <FaSpinner className="animate-spin" size={32} />
            </div>
          ) : !hasItineraryData ? (
            <p className="text-center text-gray-500 py-20">
              No itinerary available. Please select some places and a trip length.
            </p>
          ) : (
            itineraryData.map((day, i) => (
              <div
                key={i}
                ref={el => (contentRefs.current[i] = el)}
                className="space-y-4"
              >
                <h3 className="text-2xl font-semibold mb-2">{day.title}</h3>
                {/* Display Photo if available for the day */}
                {day.dayPhoto && (
                  <div className="w-full h-48 overflow-hidden rounded-lg shadow-lg">
                    <img src={day.dayPhoto} alt={day.title} className="w-full h-full object-cover" />
                  </div>
                )}
                {/* Activities List */}
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