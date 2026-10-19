"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState =
  | { kind: "idle" }
  | { kind: "requesting" } // waiting for microphone permission
  | { kind: "recording"; startedAt: number }
  | { kind: "transcribing" }
  | { kind: "error"; reason: "denied" | "unsupported" | "no-speech" | "failed"; message: string };

const MAX_SECONDS = 30;
const MIN_MS = 400; // shorter than this is almost always an accidental tap

export function voiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Records a short voice question and turns it into text via /api/transcribe.
 * `level` (0–1) drives the live meter. `start()` / `stop()` / `cancel()`.
 */
export function useVoiceRecorder(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>({ kind: "idle" });
  const [level, setLevel] = useState(0);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const startedAt = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const limit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    clearTimeout(limit.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const transcribe = useCallback(async (blob: Blob) => {
    setState({ kind: "transcribing" });
    try {
      const form = new FormData();
      form.append("audio", blob, "question.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Transcription failed");
      const text = data.text?.trim();
      if (!text) {
        setState({ kind: "error", reason: "no-speech", message: "We didn't catch that. Try again a little closer to the mic." });
        return;
      }
      setState({ kind: "idle" });
      onTextRef.current(text);
    } catch (err) {
      setState({ kind: "error", reason: "failed", message: err instanceof Error ? err.message : "Transcription failed" });
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    stop();
    cleanup();
    setState({ kind: "idle" });
  }, [cleanup, stop]);

  const start = useCallback(async () => {
    if (!voiceSupported()) {
      setState({ kind: "error", reason: "unsupported", message: "Voice questions aren't supported in this browser. You can type instead." });
      return;
    }
    cancelled.current = false;
    setState({ kind: "requesting" });
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (cancelled.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;

      // Live level meter from the microphone signal.
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(media).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        raf.current = requestAnimationFrame(tick);
      };
      tick();

      const rec = new MediaRecorder(media);
      recorder.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const duration = Date.now() - startedAt.current;
        cleanup();
        if (cancelled.current) return;
        if (duration < MIN_MS) {
          setState({ kind: "error", reason: "no-speech", message: "Hold the mic while you speak, then let go." });
          return;
        }
        void transcribe(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
      };
      startedAt.current = Date.now();
      rec.start();
      setState({ kind: "recording", startedAt: startedAt.current });
      limit.current = setTimeout(stop, MAX_SECONDS * 1000);
    } catch (err) {
      cleanup();
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setState({
        kind: "error",
        reason: denied ? "denied" : "failed",
        message: denied
          ? "Microphone access is blocked. Allow it in your browser's site settings, then try again."
          : "Couldn't start the microphone.",
      });
    }
  }, [cleanup, stop, transcribe]);

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, level, start, stop, cancel, reset, maxSeconds: MAX_SECONDS };
}
