"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import React from "react";

interface PlaceDetail {
  name: string;
  address: string;
  website?: string;
  photoUrl?: string;
  description?: string;
}

interface LocationMenuPopupProps {
  isOpen: boolean;
  onClose: () => void;
  type: "landmark" | "restaurant";
  place?: PlaceDetail;
  nearby: PlaceDetail[];
  activeTab: "info" | "nearby";
  setActiveTab: (tab: "info" | "nearby") => void;
}

export default function LocationMenuPopup({
  isOpen,
  onClose,
  type,
  place,
  nearby,
  activeTab,
  setActiveTab,
}: LocationMenuPopupProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex justify-center items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-md rounded-3xl bg-white/20 backdrop-blur-2xl border border-white/30 shadow-2xl p-6 text-white"
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={24} />
            </button>

            <h2 className="text-2xl font-bold mb-4">
              {type === "landmark" ? "Landmark Info" : "Restaurant Info"}
            </h2>

            {/* Tabs */}
            <div className="flex border-b border-white/30 mb-4">
              <button
                className={`px-4 py-2 text-sm font-semibold transition rounded-t-md ${activeTab === "info" ? "bg-yellow-300 text-black" : "text-white hover:text-yellow-300"}`}
                onClick={() => setActiveTab("info")}
              >
                Info
              </button>
              <button
                className={`ml-2 px-4 py-2 text-sm font-semibold transition rounded-t-md ${activeTab === "nearby" ? "bg-yellow-300 text-black" : "text-white hover:text-yellow-300"}`}
                onClick={() => setActiveTab("nearby")}
              >
                Nearby
              </button>
            </div>

            {/* Info Tab */}
            {activeTab === "info" && place && (
              <div className="space-y-2">
                {place.photoUrl && (
                  <img
                    src={place.photoUrl}
                    alt={place.name}
                    className="w-full rounded-xl"
                  />
                )}
                <h3 className="text-xl font-bold">{place.name}</h3>
                <p className="text-sm text-white/80">{place.address}</p>
                {place.description ? (
                  <p className="text-sm italic text-white/60">{place.description}</p>
                ) : (
                  <p className="text-sm italic text-white/40">(No description available)</p>
                )}
                {place.website && (
                  <a
                    href={place.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-300 underline text-sm"
                  >
                    Visit official site
                  </a>
                )}
              </div>
            )}

            {/* Nearby Tab */}
            {activeTab === "nearby" && (
              <ul className="space-y-3 max-h-60 overflow-y-auto">
                {nearby.length === 0 ? (
                  <li className="text-sm text-white/60 italic">No nearby places found.</li>
                ) : (
                  nearby.map((place, idx) => (
                    <li
                      key={idx}
                      className="bg-white/10 p-3 rounded-xl border border-white/20 hover:bg-white/20 transition"
                    >
                      <p className="text-sm font-semibold">{place.name}</p>
                      <p className="text-xs text-white/70">{place.address}</p>
                    </li>
                  ))
                )}
              </ul>
            )}

            <div className="mt-4">
              <button
                onClick={onClose}
                className="w-full bg-yellow-400 text-black py-2 px-4 rounded-xl hover:bg-yellow-300 transition"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
