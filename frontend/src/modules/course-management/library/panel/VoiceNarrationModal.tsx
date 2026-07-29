import React, { useState, useRef, useEffect } from "react";
import { client } from "../../../../api/client";
import { useLibrarySummaryStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { useReaderContext } from "./ReaderContext";

interface TranscriptSegment {
    id: number;
    start: number;
    end: number;
    text: string;
}

interface AudioPlayerProps {
    audioUrl: string;
    transcript: TranscriptSegment[];
}

function AudioPlayer({ audioUrl, transcript }: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const transcriptRef = useRef<HTMLDivElement>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);

    // Sync time with transcript
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime);

            // Find active segment
            const active = transcript.find(
                (seg) => audio.currentTime * 1000 >= seg.start && audio.currentTime * 1000 < seg.end
            );

            if (active) {
                setActiveSegmentId(active.id);
                // Auto-scroll to keep active segment centered
                const el = document.getElementById(`segment-${active.id}`);
                if (el && transcriptRef.current) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            } else {
                setActiveSegmentId(null);
            }
        };

        const onLoadedMetadata = () => setDuration(audio.duration);

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
        };
    }, [transcript]);

    // Handle seeking via native progress bar
    // const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    //     const audio = audioRef.current;
    //     if (!audio) return;
    //     audio.currentTime = parseFloat(e.target.value);
    // };

    return (
        <div className="mx-auto p-6 space-y-6 overflow-hidden">
            {/* Native Audio Player */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <audio
                    ref={audioRef}
                    src={audioUrl}
                    className="w-full"
                    controls
                    // Hide default controls if you want custom UI:
                    controlsList="noplaybackrate"
                // style={{ display: 'none' }}
                />

                {/* Optional: Custom progress bar synced with native audio */}
                {/* <div className="mt-4 space-y-1">
                    <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-400 font-mono">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div> */}
            </div>

            {/* Teleprompter Transcript */}
            <div ref={transcriptRef} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 max-h-[calc(100vh-250px)] overflow-y-auto space-y-1">
                {transcript.map((segment) => {
                    const isActive = segment.id === activeSegmentId;
                    const isPast = currentTime * 1000 >= segment.end;

                    return (
                        <div
                            key={segment.id}
                            id={`segment-${segment.id}`}
                            className={`px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer ${isActive
                                ? "bg-indigo-50 border-l-4 border-indigo-500 text-indigo-900 font-medium"
                                : isPast
                                    ? "text-gray-400"
                                    : "text-gray-600 hover:bg-gray-50"
                                }`}
                            onClick={() => {
                                if (audioRef.current) {
                                    audioRef.current.currentTime = segment.start / 1000;
                                }
                            }}
                        >
                            <span className={`text-xs font-mono mr-2 ${isActive ? "text-indigo-500" : "text-gray-400"}`}>
                                {formatTime(segment.start/1000.0)}
                            </span>
                            {segment.text}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}


export function VoiceNarrationPanel() {
    const { voiceNarrationText } = useLibrarySummaryStore(
        useShallow(s => ({ voiceNarrationText: s.voiceNarrationText }))
    )

    // console.log('narrationtext', voiceNarrationText)
    return (
        <div className="w-full overflow-y-hidden bg-surface">
            {/* Body */}
            <div className="p-6 w-full h-full">
                <AudioPlayer audioUrl={`${client.getConfig().baseUrl}/api/v1/library/summary/voice/${useReaderContext().materialId}`} transcript={voiceNarrationText as Array<TranscriptSegment>} />
            </div>
        </div>

    )
}
export default function VoiceNarrationModal({ onClose, materialId }: { onClose: () => void, materialId: number }) {
    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div
                className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-6 py-4 flex items-center justify-between shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
                >
                    <div>
                        <p className="text-[13px] font-bold text-white">Voice Narration</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-white/50 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer"
                    >
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 gap-4 flex flex-col">
                    {/* <AudioPlayer audioUrl={`${client.getConfig().baseUrl}/api/v1/library/summary/voice/${materialId}`} transcript={script} /> */}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}