import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { processingApi } from "../api";
import type { ProcessingStatus } from "../types";

// ── Audio engine ─────────────────────────────────────────────────────────────
// Shared AudioContext – must be created/resumed from a user gesture (click)
// so the browser's autoplay policy allows sound playback.
let sharedAudioCtx: AudioContext | null = null;

/** Ensure the shared AudioContext exists and is running. Call from a click handler. */
export function ensureAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioContext();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

function playApprovalSound() {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state !== "running") return;
    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25]; // C5 → E5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.2);
    });
  } catch {
    // Audio not available — silently ignore
  }
}

// ── Context ──────────────────────────────────────────────────────────────────
interface SoundContextValue {
  soundEnabled: boolean;
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const SoundContext = createContext<SoundContextValue>({
  soundEnabled: true,
  setSoundEnabled: () => {},
});

export const useSoundContext = () => useContext(SoundContext);

// ── Provider + invisible polling component ───────────────────────────────────
export function ProcessingSoundProvider({ children }: { children: React.ReactNode }) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevAllowedRef = useRef<number>(-1);

  // Always poll processing status so sound works on any page
  const { data: status } = useQuery<ProcessingStatus>({
    queryKey: ["processing-status"],
    queryFn: processingApi.getActiveStatus,
    refetchInterval: (query) => {
      const s = query.state.data;
      return s?.status === "running" && s.total > 0 ? 2000 : false;
    },
  });

  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    playApprovalSound();
  }, [soundEnabled]);

  // Play chime when allowed count increases
  useEffect(() => {
    if (status?.status === "running" && status?.summary) {
      const currentAllowed = status.summary.allowed || 0;
      if (prevAllowedRef.current >= 0 && currentAllowed > prevAllowedRef.current) {
        playSound();
      }
      prevAllowedRef.current = currentAllowed;
    }
  }, [status?.summary?.allowed, status?.status, playSound]);

  // Reset counter when job finishes so it's ready for the next run
  useEffect(() => {
    if (status?.status === "completed" || status?.status === "failed" || status?.status === "idle") {
      prevAllowedRef.current = -1;
    }
  }, [status?.status]);

  return (
    <SoundContext.Provider value={{ soundEnabled, setSoundEnabled }}>
      {children}
    </SoundContext.Provider>
  );
}
