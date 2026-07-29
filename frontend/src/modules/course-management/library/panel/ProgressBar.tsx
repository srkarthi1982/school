import React from "react";

type Props = {
    value: number;
    max?: number;
    className?: string;
    showLabel?: boolean;
    compact?: boolean;
};

export default function ProgressBar({ value, max = 0, className = '', showLabel = true, compact = false }: Props) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;

    return (
        <div className={`flex items-center gap-3 ${className}`}>
            <div className={`w-full bg-slate-200 rounded-full overflow-hidden ${compact ? 'h-2' : 'h-3'}`}>
                <div className={`bg-blue-500 h-full transition-all duration-500 ease-out`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>

            {showLabel && (
                <div className={`text-xs font-semibold ${compact ? 'w-10 text-right' : 'w-12 text-right'}`}>
                    {pct}%
                </div>
            )}
        </div>
    );
}