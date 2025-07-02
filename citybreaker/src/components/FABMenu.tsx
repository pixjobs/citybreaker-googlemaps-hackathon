"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Compass, ArrowLeft, MapPinned } from "lucide-react";

export default function FABMenu() {
  const [open, setOpen] = useState(false);

  const toggleMenu = () => setOpen(!open);

  const items = [
    { icon: <Compass size={18} />, label: "Surprise Me" },
    { icon: <ArrowLeft size={18} />, label: "Backtrack" },
    { icon: <MapPinned size={18} />, label: "Itinerary" },
  ];

  return (
    <>
      {/* main FAB */}
      <motion.button
        onClick={toggleMenu}
        className="fixed bottom-6 right-6 z-50 bg-blue-600 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <Plus />
      </motion.button>

      {/* radial menu items */}
      <AnimatePresence>
        {open &&
          items.map((item, index) => (
            <motion.button
              key={item.label}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: 1,
                scale: 1,
                x: -Math.cos((index + 1) * Math.PI / 4) * 80,
                y: -Math.sin((index + 1) * Math.PI / 4) * 80,
              }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed bottom-6 right-6 z-40 bg-white text-gray-900 rounded-full w-12 h-12 shadow-md flex items-center justify-center"
              aria-label={item.label}
            >
              {item.icon}
            </motion.button>
          ))}
      </AnimatePresence>
    </>
  );
}
