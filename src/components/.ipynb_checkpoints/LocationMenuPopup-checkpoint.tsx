"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Star, Globe, MessageSquare, Video, Info, Loader2 } from "lucide-react";
import React, { useEffect } from "react";
import Image from "next/image";

// --- TYPE DEFINITIONS (Unchanged) ---
export interface Review {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  profile_photo_url: string;
}

export interface RichPlaceDetails {
  place_id?: string;
  website?: string;
  rating?: number;
  reviews?: Review[];
  editorialSummary?: { overview?: string };
}

export interface YouTubeVideo {
  id?: string;
  title?: string;
  thumbnail?: string;
  channelTitle?: string;
}

// --- PROPS INTERFACE (Refined) ---
interface LocationMenuPopupProps {
  isOpen: boolean;
  onClose: () => void;
  // `place` no longer needs a photoUrl, as we use the stable place_id
  place?: { name: string; address: string }; 
  details?: RichPlaceDetails;
  youtubeVideos?: YouTubeVideo[];
  isLoading: boolean; // For the initial fetch of basic details
  isReviewsLoading: boolean; // Specific loading state for reviews
  isVideosLoading: boolean; // Specific loading state for videos
  activeTab: "info" | "reviews" | "videos";
  setActiveTab: (tab: "info" | "reviews" | "videos") => void;
  // Functions to trigger on-demand data fetching from the parent
  onFetchReviews: () => void;
  onFetchVideos: () => void;
}

// --- SUB-COMPONENTS (Unchanged) ---

const StarRating = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-1">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        size={16}
        className={i < Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-500"}
      />
    ))}
    <span className="ml-1 text-sm font-bold text-white">{rating.toFixed(1)}</span>
  </div>
);

const SkeletonLoader = () => (
  <div className="space-y-4 pt-2">
    <div className="bg-slate-700/50 rounded-lg h-32 w-full animate-pulse"></div>
    <div className="space-y-2 mt-4">
      <div className="bg-slate-700/50 rounded-md h-4 w-3/4 animate-pulse"></div>
      <div className="bg-slate-700/50 rounded-md h-4 w-1/2 animate-pulse"></div>
    </div>
    <div className="bg-slate-700/50 rounded-md h-8 w-1/3 animate-pulse mt-4"></div>
  </div>
);

const ReviewCard = ({ review }: { review: Review }) => (
  <motion.li
    className="bg-slate-900/50 p-3 rounded-xl border border-white/10"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <div className="flex items-start mb-2">
      <div className="relative w-10 h-10 rounded-full mr-3 overflow-hidden flex-shrink-0">
        <Image src={review.profile_photo_url} alt={review.author_name} fill sizes="40px" className="object-cover" />
      </div>
      <div className="flex-1">
        <p className="font-semibold">{review.author_name}</p>
        <StarRating rating={review.rating} />
      </div>
      <p className="ml-auto text-xs text-white/50 whitespace-nowrap">{review.relative_time_description}</p>
    </div>
    <p className="text-sm text-white/80 leading-relaxed">{review.text}</p>
  </motion.li>
);

const VideoCard = ({ video }: { video: YouTubeVideo }) => (
  <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
    <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center bg-slate-900/50 p-2 rounded-xl border border-transparent hover:border-yellow-400/50 hover:bg-slate-900 transition-all group">
      <div className="relative w-28 h-[72px] rounded-md mr-4 overflow-hidden flex-shrink-0">
        <Image src={video.thumbnail!} alt={video.title || "YouTube video thumbnail"} fill sizes="112px" className="object-cover group-hover:scale-105 transition-transform" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-sm leading-tight group-hover:text-yellow-300 transition-colors">{video.title}</p>
        <p className="text-xs text-white/60 mt-1">{video.channelTitle}</p>
      </div>
    </a>
  </motion.li>
);


// --- REFINED MAIN COMPONENT ---
export default function LocationMenuPopup({
  isOpen,
  onClose,
  place,
  details,
  youtubeVideos = [],
  isLoading,
  isReviewsLoading,
  isVideosLoading,
  activeTab,
  setActiveTab,
  onFetchReviews,
  onFetchVideos,
}: LocationMenuPopupProps) {
  
  // --- REFINEMENT: This effect triggers the on-demand data fetching ---
  useEffect(() => {
    // When the "Reviews" tab is selected, and reviews haven't been loaded yet, fetch them.
    if (activeTab === "reviews" && details?.reviews?.length === 0) {
      onFetchReviews();
    }
    // When the "Videos" tab is selected, and videos haven't been loaded yet, fetch them.
    if (activeTab === "videos" && youtubeVideos.length === 0) {
      onFetchVideos();
    }
  }, [activeTab, details, youtubeVideos, onFetchReviews, onFetchVideos]);

  const tabs = [
    { id: "info", label: "Info", icon: <Info size={16} />, disabled: isLoading },
    // REFINEMENT: Disable tab only while its specific content is loading
    { id: "reviews", label: "Reviews", icon: isReviewsLoading ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />, disabled: isLoading || isReviewsLoading },
    { id: "videos", label: "Videos", icon: isVideosLoading ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />, disabled: isLoading || isVideosLoading },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex justify-center items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="relative w-full max-w-lg rounded-3xl bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 border border-white/10 shadow-2xl p-6 text-white overflow-hidden" initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors z-10" onClick={onClose} aria-label="Close"><X size={24} /></button>

            {place && (
              <div className="mb-4 pr-8">
                <motion.h2 layoutId={`place-title-${place.name}`} className="text-2xl font-bold text-yellow-300">{place.name}</motion.h2>
                <p className="text-sm text-white/50">{place.address}</p>
              </div>
            )}

            <div className="relative flex border-b border-white/10 mb-4">
              {tabs.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} disabled={tab.disabled} className={`relative flex items-center gap-2 px-4 py-2 text-sm font-semibold transition rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${activeTab === tab.id ? "text-white" : "text-white/50 hover:text-white"} disabled:text-white/20 disabled:cursor-not-allowed`}>
                  {tab.icon} {tab.label}
                  {activeTab === tab.id && <motion.div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-yellow-400" layoutId="underline" />}
                </button>
              ))}
            </div>

            <div className="min-h-[250px] max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
              {isLoading ? <SkeletonLoader /> : (
                <AnimatePresence mode="wait">
                  <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                    {activeTab === "info" && (
                      <div className="space-y-4">
                        {/* REFINEMENT: Use the stable place_id to fetch photo via your API proxy */}
                        {place?.name && details?.place_id && (
                          <div className="relative w-full h-48 rounded-xl overflow-hidden shadow-lg">
                            <Image src={`/api/proxy-photo?placeid=${details.place_id}`} alt={place.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" priority />
                          </div>
                        )}
                        {details?.rating && <StarRating rating={details.rating} />}
                        {details?.editorialSummary?.overview && (
                          <div>
                            <h4 className="font-bold text-white mb-1">About this place</h4>
                            <p className="text-sm text-white/70 leading-relaxed">{details.editorialSummary.overview}</p>
                          </div>
                        )}
                        {details?.website && (
                          <a href={details.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors group">
                            <Globe size={16} className="mr-2" /> Visit Website <span className="ml-1 group-hover:translate-x-1 transition-transform">→</span>
                          </a>
                        )}
                      </div>
                    )}

                    {activeTab === "reviews" && (
                      // REFINEMENT: Show skeleton loader specifically for this tab while loading
                      isReviewsLoading ? <SkeletonLoader /> : (
                        <ul className="space-y-3">
                          {details?.reviews && details.reviews.length > 0 ? (
                            details.reviews.map((review, idx) => <ReviewCard key={idx} review={review} />)
                          ) : (
                            <li className="text-sm text-white/60 italic text-center pt-8">No reviews available for this location.</li>
                          )}
                        </ul>
                      )
                    )}

                    {activeTab === "videos" && (
                      // REFINEMENT: Show skeleton loader specifically for this tab while loading
                      isVideosLoading ? <SkeletonLoader /> : (
                        <ul className="space-y-3">
                          {youtubeVideos.length > 0 ? (
                            youtubeVideos.map((video) => <VideoCard key={video.id} video={video} />)
                          ) : (
                            <li className="text-sm text-white/60 italic text-center pt-8">No relevant videos were found.</li>
                          )}
                        </ul>
                      )
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}