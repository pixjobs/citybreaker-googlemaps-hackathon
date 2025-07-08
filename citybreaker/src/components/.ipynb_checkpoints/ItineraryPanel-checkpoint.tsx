// components/ItineraryPanel.tsx

import React from 'react';
import { FaSpinner, FaTimes } from 'react-icons/fa';

interface PlacePhotoInfo {
  name: string;
  photoUrl?: string;
}

interface ItineraryPanelProps {
  cityName: string;
  itineraryMarkdown: string | null;
  isLoading: boolean;
  placePhotos: PlacePhotoInfo[];
  onClose: () => void;
}

// A more advanced parser to extract the photo suggestion and handle list items
const parseItinerary = (markdown: string, photos: PlacePhotoInfo[]) => {
  if (!markdown) return [];
  const days = markdown.split('###').slice(1);

  return days.map(dayBlock => {
    const lines = dayBlock.trim().split('\n');
    const titleLine = lines[0] || '';

    const photoSuggestionMatch = titleLine.match(/\[PHOTO_SUGGESTION: "([^"]+)"\]/);
    const photoPlaceName = photoSuggestionMatch ? photoSuggestionMatch[1] : null;
    const dayPhoto = photos.find(p => p.name === photoPlaceName)?.photoUrl;
    
    const title = titleLine.replace(/\[PHOTO_SUGGESTION: "([^"]+)"\]/, '').trim();
    
    // --- THE FIX IS HERE ---
    // The regex /^[*-]/ matches a line that starts with EITHER an asterisk OR a hyphen.
    const activities = lines
      .slice(1)
      .map(line => line.replace(/^[*-]/, '').trim()) // This now handles both list styles
      .filter(line => line.length > 0); // Ignore any empty lines
    
    return { title, activities, dayPhoto };
  });
};

export default function ItineraryPanel({ cityName, itineraryMarkdown, isLoading, placePhotos, onClose }: ItineraryPanelProps) {
  const structuredItinerary = parseItinerary(itineraryMarkdown || '', placePhotos);

  return (
    <div
      className="fixed z-20 bg-black/90 backdrop-blur-lg text-yellow-200 border-yellow-500/50
                 bottom-0 left-0 w-full h-[80vh] rounded-t-lg border-t
                 md:top-0 md:right-0 md:w-[450px] md:h-full md:rounded-none md:border-l"
    >
      <div className="p-4 flex justify-between items-center border-b border-yellow-700/50 sticky top-0 bg-black/80 backdrop-blur-sm z-10">
        <h2 className="text-xl font-bold text-yellow-300">Your {cityName} Adventure</h2>
        <button onClick={onClose} className="text-yellow-300 hover:text-white" aria-label="Close Itinerary">
          <FaTimes size={20} />
        </button>
      </div>
      
      <div className="h-[calc(100%-65px)] overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-yellow-300">
            <FaSpinner className="animate-spin text-4xl mb-4" />
            <p>Weaving your travel story...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {structuredItinerary.length > 0 ? (
              structuredItinerary.map((day, index) => (
                <div key={index} className="bg-yellow-900/10 overflow-hidden">
                  {day.dayPhoto ? (
                    <div className="relative h-48 bg-gray-800">
                      <img src={day.dayPhoto} alt={day.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                      <h3 className="absolute bottom-3 left-4 text-2xl font-bold text-white tracking-wide">{day.title}</h3>
                    </div>
                  ) : (
                     <h3 className="p-4 text-2xl font-bold text-yellow-400">{day.title}</h3>
                  )}
                  <ul className="p-4 space-y-3">
                    {day.activities.map((activity, actIndex) => (
                      <li key={actIndex} className="flex items-start text-sm text-yellow-100/90 leading-relaxed">
                        <span className="text-yellow-500 mr-3 mt-1">{activity.match(/^[✨🍸🥐🎭🌆]/)?.[0] || '•'}</span>
                        <span>{activity.replace(/^[✨🍸🥐🎭🌆]\s*/, '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="p-4 text-gray-400 italic">Could not generate an itinerary from the provided data.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}