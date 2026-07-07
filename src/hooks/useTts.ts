"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Chrome (desktop and Android) loads voices asynchronously; getVoices()
// returns [] until voiceschanged fires, so keep the list in a ref.
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    voices.find((v) => v.lang === "en-US" && v.name.includes("Google")) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

export function useTts(rate = 0.9) {
  const [supported, setSupported] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  // Must be called from a user gesture (Android requirement).
  const speak = useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window) || !text.trim()) return;
      window.speechSynthesis.cancel(); // Chrome queues otherwise
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = rate;
      const voice = pickVoice(voicesRef.current);
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    },
    [rate],
  );

  return { speak, supported };
}
