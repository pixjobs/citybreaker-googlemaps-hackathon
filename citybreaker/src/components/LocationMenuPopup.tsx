"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import React from "react";

interface LocationMenuPopupProps {
  isOpen: boolean;
  onClose: () => void;
  type: "landmark" | "restaurant";
  items: string[];
}

export default function LocationMenuPopup({
  isOpen,
  onClose,
  type,
  items,
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
            className="relative w-full max-w-md rounded-3xl bg-white/20 backdrop-blur-2xl border border-white/30 shadow-2xl p-6"
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* close button */}
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={24} />
            </button>

            <h2 className="text-2xl font-semibold text-white mb-4">
              {type === "landmark" ? "Landmarks" : "Restaurants & Bars"}
            </h2>

            <ul className="space-y-2">
              {items.map((item, index) => (
                <li
                  key={index}
                  className="bg-white/20 text-white px-4 py-3 rounded-xl hover:bg-white/30 transition-colors backdrop-blur-sm"
                >
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
