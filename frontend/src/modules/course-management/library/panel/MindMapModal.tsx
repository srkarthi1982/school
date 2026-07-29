import React, { useEffect, useRef, useMemo, useState, ReactNode, useCallback } from "react";
import { Markmap } from "markmap-view";
import { Transformer } from "markmap-lib";
import { useLibrarySummaryStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { INode } from "markmap-common";


export type TooltipTrigger = 'hover' | 'click' | 'both';
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
export interface TooltipProps {
    content: ReactNode;
    placement?: TooltipPlacement;
    trigger?: TooltipTrigger;
    delay?: number;
    className?: string;
    contentClassName?: string;
    style?: React.CSSProperties; // For fixed positioning
}

const ARROW_MAP: Record<TooltipPlacement, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 -mb-px',
    bottom: 'top-full left-1/2 -translate-x-1/2 -mt-px',
    left: 'right-full top-1/2 -translate-y-1/2 -mr-px',
    right: 'left-full top-1/2 -translate-y-1/2 -ml-px',
};

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    placement = 'top',
    delay = 0,
    className = '',
    contentClassName = '',
    style = {},
}) => {
    const isFixed = Object.keys(style).length > 0;
    const transitionStyle = delay > 0 ? { transitionDelay: `${delay}ms` } : {};

    if (isFixed) {
        return (
            <div className={`fixed pointer-events-auto z-50 ${className}`} style={style}>
                <div className={`relative bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-[var(--shadow-md)] rounded-lg p-3 max-w-xs whitespace-normal ${contentClassName}`}>
                    <div className="text-sm leading-relaxed text-[var(--text-secondary)]">{content}</div>
                    <div className={`absolute w-2.5 h-2.5 rotate-45 bg-[var(--surface)] border border-[var(--border)] ${ARROW_MAP[placement]}`} />
                </div>
            </div>
        );
    }

    return (
        <div className={`group relative inline-flex items-center ${className}`}>
            <div
                className={`relative z-50 invisible opacity-0 transition-all duration-200 ease-in-out group-hover:visible group-hover:opacity-100 ${ARROW_MAP[placement]}`}
                style={transitionStyle}
                role="tooltip"
            >
                <div className={`relative bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-[var(--shadow-md)] rounded-lg p-3 max-w-xs whitespace-normal ${contentClassName}`}>
                    <div className="text-sm leading-relaxed text-[var(--text-secondary)]">{content}</div>
                    <div className={`absolute w-2.5 h-2.5 rotate-45 bg-[var(--surface)] border border-[var(--border)] ${ARROW_MAP[placement]}`} />
                </div>
            </div>
        </div>
    );
};

interface MarkmapConfig {
    duration?: number;
    initialExpandLevel?: number;
    spacingHorizontal?: number;
    spacingVertical?: number;
    nodeMinHeight?: number;
    [key: string]: any;
}

interface MindmapProps {
    markdown: string;
    options?: MarkmapConfig;
    className?: string;
    autoFit?: boolean;
}

function Mindmap({ markdown, options, className = "", autoFit = true }: MindmapProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const mmRef = useRef<Markmap | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [selectedText, setSelectedText] = useState<string>('')

    // 1. Parse markdown → JSON tree
    const transformer = useMemo(() => new Transformer(), []);
    const { root, features } = useMemo(() => {
        // ✅ Use transform() (v0.14+) instead of deprecated parse()
        return transformer.transform(markdown);
    }, [markdown]);

    type ClickEvent = { target: { textContent: string, title: string, tagName: string } }
    const onClick = useCallback((e: ClickEvent) => {
        // console.log('content', e.target.textContent)
        // console.log('title', e.target.title)
        // console.log('tagName', e.target.tagName)
        const { target: { textContent, title, tagName } } = e

        if ("DIV" !== tagName) {
            return;
        }
        // console.log('text', textContent)
        setSelectedText(textContent)
    }, [])

    // 2. Initialize Markmap instance
    useEffect(() => {
        if (!svgRef.current) return;

        const mm = Markmap.create(svgRef.current, options);
        // console.log('x', root, features)
        mmRef.current = mm;
        mm.setData(root, features);
        setIsReady(true);

        // Cleanup on unmount to prevent memory leaks
        return () => {
            mm.destroy();
            mmRef.current = null;
            setIsReady(false);
        };
    }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

    // 3. Update when markdown or autoFit changes
    useEffect(() => {
        if (!mmRef.current) return;

        mmRef.current.setData(root, features);
        if (autoFit) mmRef.current.fit();
    }, [root, features, autoFit]);

    return (
        <div className={`relative w-full h-full ${className}`}>
            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm bg-gray-50/50">
                    Loading mindmap...
                </div>
            )}
            <svg ref={svgRef} className="w-full h-full block" onClick={e => onClick((e as unknown) as ClickEvent)} />
        </div>
    );
}


export function MindMapPanel() {
    const { mindmap } = useLibrarySummaryStore(useShallow(s => ({ mindmap: s.mindmap })))

    return (
        <div className="w-full overflow-y-hidden bg-surface">
            {/* Body */}
            <div className="p-6 w-full h-full">
                {/* <Mindmap markdown={mindmap?.markdown || ''} options={{
                    autoFit: true,
                    duration: 100,
                    zoom: true,
                    pan: true
                }} /> */}
                <MarkmapWithTooltip value={mindmap?.markdown || ''} />
            </div>
        </div>

    )
}

export default function MindMapModal({ onClose }: { onClose: () => void }) {
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
                        <p className="text-[13px] font-bold text-white">Mind Map</p>
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
                    {/* <Mindmap markdown={SAMPLE_DATA['Architecture']} options={{
                        autoFit: true,
                        duration: 300,
                        zoom: true,
                        pan: true
                    }} /> */}
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


// Local node type (markmap-lib intentionally hides tree types in v0.18.x)
type MarkmapNode = INode & {
    label: string;
    data?: Record<string, any>;
    children?: MarkmapNode[];
    [key: string]: any;
};

// ✅ Fix: Extend Markmap to include event methods (TS definitions sometimes omit them)
type MarkmapWithEvents = Markmap & {
    on: (event: string, listener: (node: MarkmapNode, event: MouseEvent) => void) => void;
    off: (event: string, listener: (node: MarkmapNode, event: MouseEvent) => void) => void;
};

const MARKMAP_HEIGHT = '500px';

// Keep tooltip within viewport bounds
const clampPosition = (x: number, y: number, width: number, height: number) => {
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    return {
        x: Math.min(Math.max(x, 10), vw - width - 10),
        y: Math.min(Math.max(y, 10), vh - height - 10),
    };
};

export interface MarkmapWithTooltipProps {
    value: string;
    trigger?: TooltipTrigger;
    className?: string;
    tooltipProps?: Omit<TooltipProps, 'children' | 'content' | 'placement'>;
}

export const MarkmapWithTooltip: React.FC<MarkmapWithTooltipProps> = ({
    value,
    trigger = 'click',
    className = '',
    tooltipProps = {},
}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipContent, setTooltipContent] = useState<React.ReactNode>('');
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const containerRef = useRef<SVGSVGElement>(null);
    const markmapRef = useRef<Markmap | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Attach tooltip data to every node
    const enrichTreeWithTooltips = useCallback((tree: MarkmapNode) => {
        const walk = (node: MarkmapNode) => {
            if (node.children?.length) node.children.forEach(walk);
            node.data = node.data || {};
            node.data.tooltip = node.data.tooltip || `ℹ️ ${node.label}`;
        };
        walk(tree);
        return tree;
    }, []);
    // Initialize Markmap instance
    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const mm = Markmap.create(container,
            // {
            //     autoFit: false,
            //     duration: 0, // Disable D3 transitions for instant tooltip response
            // }
            {
                autoFit: true,
                duration: 100,
                zoom: true,
                pan: true
            }
        );
        // ✅ Safe type assertion for event methods
        const mmWithEvents = mm as MarkmapWithEvents;
        markmapRef.current = mm;
        // markmapRef.current.handleClick = handleInteraction2

        const handleHover = (node: MarkmapNode, event: MouseEvent) => {
            if (trigger === 'click') return;
            handleInteraction(node, event);
        };

        const handleClick = (node: MarkmapNode, event: MouseEvent) => {
            if (trigger === 'hover') return;
            handleInteraction(node, event);
        };
        console.log('x', mmWithEvents)
        if (mmWithEvents.on) {
            mmWithEvents.on('nodehover', handleHover);
            mmWithEvents.on('nodeclick', handleClick);
        }

        // Transform & set data
        if (value) {
            const transformer = new Transformer();
            const { root } = transformer.transform(value);
            const enrichedRoot = enrichTreeWithTooltips((root as any) as MarkmapNode);
            mm.setData(enrichedRoot as any);
        }

        return () => {
            if (mmWithEvents.off) {
                mmWithEvents.off('nodehover', handleHover);
                mmWithEvents.off('nodeclick', handleClick);
            }
            mm.destroy();
            markmapRef.current = null;
        };
    }, [containerRef, trigger, value, enrichTreeWithTooltips]);

    // Update mindmap when markdown changes
    useEffect(() => {
        if (markmapRef.current && value) {
            const transformer = new Transformer();
            const { root } = transformer.transform(value);
            const enrichedRoot = enrichTreeWithTooltips((root as any) as MarkmapNode);
            markmapRef.current.setData(enrichedRoot as any);
        }
    }, [value, enrichTreeWithTooltips]);

    const handleInteraction = (node: MarkmapNode, event: MouseEvent) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            const content = node.data?.tooltip || node.label;
            setTooltipContent(content);

            const tooltipWidth = 280;
            const tooltipHeight = 60;
            const clamped = clampPosition(event.clientX, event.clientY + 12, tooltipWidth, tooltipHeight);

            setPosition({ x: clamped.x, y: clamped.y });
            setShowTooltip(true);
        }, 50);
    };

    type ClickEvent = { target: { textContent: string, title: string, tagName: string }, clientX: number, clientY: number }

    const onClick = useCallback((e: ClickEvent) => {
        // console.log('content', e.target.textContent)
        // console.log('title', e.target.title)
        // console.log('tagName', e.target.tagName)
        const { target: { textContent, title, tagName }, clientX, clientY } = e

        if ("DIV" !== tagName) {
            setShowTooltip(false)
            return;
        }
        // console.log('text', textContent)
        // setSelectedText(textContent)
        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(() => {
            // const content = node.data?.tooltip || node.label;
            const content = textContent
            setTooltipContent(content);

            const tooltipWidth = 280;
            const tooltipHeight = 60;
            // const clamped = clampPosition(event.clientX, event.clientY + 12, tooltipWidth, tooltipHeight);
            const clamped = clampPosition(clientX, clientY + 12, tooltipWidth, tooltipHeight);

            setPosition({ x: clamped.x, y: clamped.y });
            setShowTooltip(true);
        }, 50);
    }, [])

    const hideTooltip = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (trigger === 'click') return;
        setShowTooltip(false);
    }, [trigger]);

    // Close on outside click for click/both modes
    useEffect(() => {
        if (trigger !== 'click' && trigger !== 'both') return;

        const handleClickOutside = (e: MouseEvent) => {
            if (showTooltip && !containerRef.current?.contains(e.target as Node)) {
                setShowTooltip(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [trigger, showTooltip]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return (
        <div className={`relative w-full h-full ${className}`}>
            <svg ref={containerRef} className="w-full h-full block" onMouseOver={e => onClick((e as unknown) as ClickEvent)} />
            {showTooltip && (
                <Tooltip
                    content={tooltipContent}
                    placement="top"
                    trigger={trigger}
                    className="pointer-events-auto"
                    style={{ top: position.y, left: position.x }}
                    contentClassName="max-w-[280px]"
                    {...tooltipProps}
                />
            )}
        </div>
    );
};