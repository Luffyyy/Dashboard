import React from "react";
import { motion } from "framer-motion";

export default function StatsCard({ icon: Icon, label, value, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4"
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </motion.div>
  );
}