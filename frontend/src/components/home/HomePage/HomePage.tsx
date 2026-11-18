"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { NewReport } from "@/components/report/NewReport";
import { ReportsSection } from "@/components/reports/ReportsSection";
import { AppShell } from "@/components/ui/AppShell";

/** One page: check a road at the top, saved reports underneath (hidden while details are entered and the photo is checked). */
export function HomePage() {
  const [busy, setBusy] = useState(false);
  // bumping this remounts the check flow, i.e. back to the empty upload screen
  const [run, setRun] = useState(0);

  const home = () => {
    setRun((n) => n + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AppShell onBrand={home}>
      <NewReport key={run} onBusy={setBusy} />
      <AnimatePresence initial={false}>
        {!busy && (
          <motion.div key="reports" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <ReportsSection />
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
