/**
 * PdfViewer — a lightweight full-screen PDF reader built on react-pdf (pdf.js).
 *
 * Renders one page at a time with previous/next navigation and zoom controls,
 * styled with the app's theme tokens. The pdf.js worker is bundled via Vite's
 * `?url` import so it works offline (no CDN dependency); its version is pinned
 * to match react-pdf's `pdfjs-dist` (mismatch → "API/Worker version" error).
 *
 * The right-hand reading-assistant rail is shared with OfficeViewer via
 * <ReaderToolsAside/> so every reader looks and behaves the same.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
    HiOutlineArrowLeft,
    HiOutlineArrowDownTray,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineMagnifyingGlassMinus,
    HiOutlineMagnifyingGlassPlus,
} from 'react-icons/hi2';
import { useI18n } from '../../../../infra/locales/I18nContext';
import ReaderToolsAside from './ReaderToolsAside';
import { ReaderProvider, type ReaderToolKey } from './ReaderContext';
import type { FileVersion } from '../store';
import { MindMapPanel } from './MindMapModal';
import { QuickSummaryPanel } from './QuickSummaryModal';
import { VoiceNarrationPanel } from './VoiceNarrationModal';
import { DocChatPanel } from './DocChatPanel';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const STEP = 0.2;

const ToolsPanel: Record<ReaderToolKey, React.ComponentType<any> | null> = {
    mindMap: MindMapPanel,
    quickSummary: QuickSummaryPanel,
    voiceNarration: VoiceNarrationPanel,
    docChat: DocChatPanel,
    filePreview: null
}


export default function PdfViewer({
    fileUrl, title, onClose, materialId, material,onPageChange
}: {
    fileUrl: string;
    title: string;
    onClose: () => void;
    /** Optional callback when page changes (for progress tracking). */
    onPageChange?: (page: number, total: number) => void;
    materialId: string;
    material: FileVersion | null;
}) {
    const { t } = useI18n();
    const [numPages, setNumPages] = useState(0);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [boxW, setBoxW] = useState(0);
    const [asideTool, setAsideTool] = useState<ReaderToolKey | undefined>('filePreview');

    const onToolClick = useCallback((tool: ReaderToolKey) => setAsideTool(tool), []);

    const ctx = useMemo(
        () => ({ materialId, material, materialType: "pdf" as const }),
        [materialId, material]
    );

    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        const update = () => setBoxW(el.clientWidth);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const pageWidth = boxW ? Math.max(1, Math.round(boxW * scale)) : undefined;

    const goPrev = () => setPageNumber((p) => Math.max(1, p - 1));
    const goNext = () => {
        setPageNumber((p) => {
            const newPage = Math.min(numPages || p, p + 1);
            onPageChange?.(newPage, numPages);
            return newPage;
        });
    };
    const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, +(s - STEP).toFixed(2)));
    const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + STEP).toFixed(2)));

    const iconBtn =
        'inline-flex items-center justify-center w-9 h-9 rounded-lg text-primary hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed';
    const ACTIVE_ASIDE_PANEL = asideTool ? ToolsPanel[asideTool] : null;

    return (
        <ReaderProvider {...ctx}>
            <div className="flex flex-col h-full w-full overflow-hidden bg-bg">
                <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-bd bg-surface shrink-0">
                    <div className="min-w-0 flex items-center gap-3">
                        <button onClick={onClose} className={iconBtn} aria-label={t('library.back')}>
                            <HiOutlineArrowLeft className="text-[20px]" />
                        </button>
                        <h2 className="text-base font-semibold text-primary truncate" title={title}>
                            {title}
                        </h2>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={zoomOut} className={iconBtn} disabled={scale <= MIN_SCALE} aria-label="zoom out">
                            <HiOutlineMagnifyingGlassMinus className="text-[20px]" />
                        </button>
                        <span className="text-xs text-secondary w-12 text-center tabular-nums">
                            {Math.round(scale * 100)}%
                        </span>
                        <button onClick={zoomIn} className={iconBtn} disabled={scale >= MAX_SCALE} aria-label="zoom in">
                            <HiOutlineMagnifyingGlassPlus className="text-[20px]" />
                        </button>

                        <span className="mx-2 h-5 w-px bg-[var(--border)]" />

                        <button onClick={goPrev} className={iconBtn} disabled={pageNumber <= 1} aria-label="previous page">
                            <HiOutlineChevronLeft className="text-[20px]" />
                        </button>
                        <span className="text-xs text-secondary tabular-nums whitespace-nowrap">
                            {t('library.page')} {pageNumber} / {numPages || '…'}
                        </span>
                        <button
                            onClick={goNext}
                            className={iconBtn}
                            disabled={!numPages || pageNumber >= numPages}
                            aria-label="next page"
                        >
                            <HiOutlineChevronRight className="text-[20px]" />
                        </button>

                        <span className="mx-2 h-5 w-px bg-[var(--border)]" />

                        <a href={fileUrl} target="_blank" rel="noreferrer" className={iconBtn} aria-label={t('library.download')}>
                            <HiOutlineArrowDownTray className="text-[20px]" />
                        </a>
                    </div>
                </header>

                <div className="flex-1 min-h-0 flex">
                    <div ref={contentRef} className="flex-1 min-w-0 overflow-auto thin-scrollbar-light flex justify-center">
                        <Document
                            file={fileUrl}
                            onLoadSuccess={({ numPages: n }) => {
                                setNumPages(n);
                                setPageNumber((p) => {
                                    const clamped = Math.min(p, n);
                                    // Report the page count once on open so consumers learn the
                                    // total (a single-page doc is then "fully read" on open, and a
                                    // multi-page doc shows in-progress until the last page).
                                    onPageChange?.(clamped, n);
                                    return clamped;
                                });
                            }}
                            loading={<div className="text-secondary text-sm mt-10">{t('library.loadingPdf')}</div>}
                            error={<div className="text-secondary text-sm mt-10">{t('library.failedPdf')}</div>}
                            className="h-fit"
                        >
                            <Page
                                pageNumber={pageNumber}
                                width={pageWidth}
                                renderTextLayer
                                renderAnnotationLayer
                            />
                        </Document>
                    </div>

                    {asideTool && asideTool !== 'filePreview' && ACTIVE_ASIDE_PANEL && (
                        <ACTIVE_ASIDE_PANEL onClose={() => setAsideTool('filePreview')} />
                    )}
                    <ReaderToolsAside onToolClick={onToolClick} activeTool={asideTool} />
                </div>
            </div>
        </ReaderProvider>
    );
}
