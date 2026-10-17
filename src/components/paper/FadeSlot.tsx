'use client';
// One story position on the page. When the story in it changes (a skip promotes a reserve story, an
// undo brings one back) the old one fades out and the new one fades in, in the same place: opacity
// only, 150 ms, no layout animation and no slide (ARCHITECTURE §3a). Reduced motion turns it off.
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

export function FadeSlot({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default FadeSlot;
