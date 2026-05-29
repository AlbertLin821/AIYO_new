"use client";

import { LazyMotion, domMax } from "framer-motion";

type Props = {
  children: React.ReactNode;
};

/** Wraps the app so Framer Motion loads domMax features once; use `m` from `@/lib/motion`, not `motion`. */
export default function MotionProvider({ children }: Props) {
  return (
    <LazyMotion features={domMax} strict>
      {children}
    </LazyMotion>
  );
}
