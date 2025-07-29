"use client";

import Image from "next/image";
import React from "react";
import ReactMarkdown from "react-markdown";
import { MapPin, Pin, Star, Users, Wallet } from "lucide-react";

// --- TYPE DEFINITIONS ---
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

interface ActivityCardProps {
  activity: ItineraryActivity;
  place?: EnrichedPlace;
  onZoomToLocation: (location: { lat: number; lng: number }) => void;
}


// --- COMPONENT ---

const ActivityCard: React.FC<ActivityCardProps> = ({ activity, place, onZoomToLocation }) => (
  <div className="activity-card flex flex-col overflow-hidden rounded-xl border border-neutral-700/60 bg-neutral-800/50 shadow-lg sm:flex-row">
    <div className="relative h-40 w-full flex-shrink-0 sm:h-auto sm:w-1/3">
        {place?.photoUrl ? (
          <Image
            src={place.photoUrl}
            alt={activity.title.replace(/"/g, "'")}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
            priority={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-800">
            <Pin className="text-neutral-600" size={32} />
          </div>
        )}

    </div>

    <div className="flex w-full flex-col p-4 sm:p-5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h4 className="font-serif text-lg font-bold text-amber-300 sm:text-xl">
          {activity.title}
        </h4>
        
        {/* ✅ THE DEFINITIVE FIX: This condition is now 100% safe. */}
        {/* It guarantees that place.location, lat, and lng are all valid numbers before rendering the button. */}
        {place?.location &&
          isFinite(place.location.lat) &&
          isFinite(place.location.lng) && (
            <button
              onClick={() => onZoomToLocation(place.location!)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-500/20"
              title={`View ${activity.placeName} on the map`}
            >
              <MapPin size={14} />
              Map
            </button>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400 sm:text-sm">
        <span className="flex items-center gap-1.5">
          <Wallet size={14} className="text-amber-400/80" /> {activity.priceRange}
        </span>
        <span className="flex items-center gap-1.5">
          <Users size={14} className="text-amber-400/80" /> {activity.audience}
        </span>
      </div>
      <div className="prose prose-sm prose-invert prose-p:leading-relaxed mb-4 text-neutral-300">
        <ReactMarkdown>{activity.description}</ReactMarkdown>
      </div>
      <div className="mt-auto grid grid-cols-1 gap-3 border-t border-neutral-700/60 pt-3 text-xs sm:text-sm">
        <div className="flex items-start gap-2">
          <Star className="mt-0.5 flex-shrink-0 text-amber-400" size={14} />
          <div>
            <h5 className="mb-0.5 font-semibold text-neutral-200">Why Visit</h5>
            <p className="text-neutral-400">{activity.whyVisit}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Pin className="mt-0.5 flex-shrink-0 text-amber-400" size={14} />
          <div>
            <h5 className="mb-0.5 font-semibold text-neutral-200">Insider Tip</h5>
            <p className="text-neutral-400">{activity.insiderTip}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default ActivityCard;