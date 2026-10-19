"use client";

import { Loader2, Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVoiceRecorder, voiceSupported } from "@/hooks/use-voice-recorder";
import { cn } from "@/lib/utils";

const CANCEL_DISTANCE = 80; // px of sliding away that cancels a hold-to-talk

/**
 * Voice questions. Phones: press and hold, release to send, slide away to cancel.
 * Mouse/keyboard: click to start, click again to send, Esc to cancel.
 * The transcript is handed to `onTranscript`, which asks it like a typed question.
 */
export function MicButton({ onTranscript, className }: { onTranscript: (text: string) => void; className?: string }) {
  const [heard, setHeard] = useState<string | null>(null);
  const { state, level, start, stop, cancel, reset, maxSeconds } = useVoiceRecorder((text) => {
    setHeard(text);
    // Show what we heard for a moment, then ask it.
    setTimeout(() => {
      setHeard(null);
      onTranscript(text);
    }, 600);
  });
  const supported = useSyncExternalStore(
    () => () => {},
    voiceSupported,
    () => true,
  );

  const hold = useRef<{ x: number; y: number; id: number } | null>(null);
  const lastPointer = useRef<string | null>(null);
  const [cancelHint, setCancelHint] = useState(false);
  const recording = state.kind === "recording";
  const busy = state.kind === "requesting" || state.kind === "transcribing";

  // Errors become a toast, then the button resets.
  useEffect(() => {
    if (state.kind === "error") {
      toast.error(state.message);
      reset();
    }
  }, [state, reset]);

  // Esc cancels a recording from anywhere.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, cancel]);

  if (!supported) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn("inline-flex", className)}>
            <Button type="button" variant="ghost" size="icon" disabled className="size-10 rounded-xl" aria-label="Voice not supported">
              <Mic />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Voice isn&apos;t supported in this browser</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={recording ? "destructive" : "ghost"}
        size="icon"
        aria-label={recording ? "Stop and send voice question" : "Ask with your voice"}
        aria-pressed={recording}
        disabled={busy}
        className={cn("size-10 shrink-0 touch-none rounded-xl select-none", recording && "bg-destructive text-white hover:bg-destructive/90", className)}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
          if (e.pointerType === "mouse") return; // mouse uses click-to-toggle
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          hold.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          setCancelHint(false);
          void start();
        }}
        onPointerMove={(e) => {
          if (!hold.current) return;
          const far = Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > CANCEL_DISTANCE;
          setCancelHint(far);
        }}
        onPointerUp={() => {
          if (!hold.current) return;
          hold.current = null;
          if (cancelHint) cancel();
          else stop();
          setCancelHint(false);
        }}
        onPointerCancel={() => {
          hold.current = null;
          cancel();
        }}
        onClick={() => {
          // Touch is handled by hold-to-talk above; clicks here come from mouse or keyboard.
          const touch = lastPointer.current === "touch" || lastPointer.current === "pen";
          lastPointer.current = null;
          if (touch) return;
          if (recording) stop();
          else if (state.kind === "idle") void start();
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : recording ? <Square className="fill-current" /> : <Mic />}
      </Button>

      {(recording || state.kind === "transcribing" || heard) && (
        <RecordingPanel
          state={heard ? "heard" : recording ? "recording" : "transcribing"}
          startedAt={state.kind === "recording" ? state.startedAt : 0}
          level={level}
          maxSeconds={maxSeconds}
          cancelHint={cancelHint}
          heard={heard}
          onCancel={cancel}
          onSend={stop}
        />
      )}
    </>
  );
}

function RecordingPanel({
  state,
  startedAt,
  level,
  maxSeconds,
  cancelHint,
  heard,
  onCancel,
  onSend,
}: {
  state: "recording" | "transcribing" | "heard";
  startedAt: number;
  level: number;
  maxSeconds: number;
  cancelHint: boolean;
  heard: string | null;
  onCancel: () => void;
  onSend: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [state]);
  const seconds = state === "recording" ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  // Portal to <body> so no transformed ancestor can shift this fixed panel.
  return createPortal(
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8" role="status" aria-live="assertive">
      <div
        className={cn(
          "flex w-full max-w-sm items-center gap-3 rounded-2xl border bg-popover px-4 py-3 shadow-xl transition-colors",
          cancelHint && "border-destructive bg-destructive/10",
        )}
      >
        {state === "recording" && (
          <>
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60" />
              <span className="relative inline-flex size-3 rounded-full bg-destructive" />
            </span>
            <span className="tabular w-10 text-sm font-medium">
              0:{String(seconds).padStart(2, "0")}
            </span>
            <LevelBars level={level} />
            <span className="sr-only">Recording. Up to {maxSeconds} seconds.</span>
            <div className="ml-auto flex items-center gap-1">
              <span className="hidden text-xs text-muted-foreground md:inline">Esc to cancel</span>
              <span className="text-xs text-muted-foreground md:hidden">{cancelHint ? "Release to cancel" : "Release to send"}</span>
              <Button variant="ghost" size="icon" className="hidden size-8 md:inline-flex" onClick={onCancel} aria-label="Cancel recording">
                <X />
              </Button>
              <Button size="sm" className="hidden md:inline-flex" onClick={onSend}>
                Send
              </Button>
            </div>
          </>
        )}
        {state === "transcribing" && (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" /> Turning your voice into text…
          </p>
        )}
        {state === "heard" && heard && (
          <p className="text-sm">
            <span className="text-muted-foreground">Heard: </span>
            <span className="font-medium">“{heard}”</span>
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function LevelBars({ level }: { level: number }) {
  // Five bars that react to the microphone level, tallest in the middle.
  const shape = [0.45, 0.75, 1, 0.75, 0.45];
  return (
    <span className="flex h-6 items-center gap-0.5" aria-hidden>
      {shape.map((s, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-primary transition-[height] duration-75"
          style={{ height: `${Math.max(12, Math.min(100, level * s * 140))}%` }}
        />
      ))}
    </span>
  );
}
