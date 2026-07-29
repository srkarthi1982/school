/**
 * OfficeViewer — a full-screen, client-side, READ-ONLY viewer for Microsoft
 * Office files (docx / xlsx / pptx). It shares the same chrome as PdfViewer
 * (top bar + right-hand <ReaderToolsAside/>) so every reader is consistent.
 *
 * Reading is page-by-page with prev/next buttons (no long scrolling), matching
 * the PDF reader:
 *   - docx → docx-preview renders fixed pages; we show one at a time, scaled to
 *            fit the viewport, navigated with the header pager.
 *   - pptx → pptx-preview in 'slide' mode (one slide + its own next/prev).
 *   - xlsx → SheetJS (sheet_to_html) with a tab per sheet (spreadsheets scroll).
 *
 * Render libs are imported lazily so they only load when an Office file opens.
 * If a file can't be rendered, we surface an error with a Download fallback.
 */
import { ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    HiOutlineArrowDownTray,
    HiOutlineArrowLeft,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineExclamationCircle,
} from 'react-icons/hi2';
import { useI18n } from '../../../../infra/locales/I18nContext';
import ReaderToolsAside from './ReaderToolsAside';
import type { ReaderToolKey } from './ReaderToolsAside';
import { QuickSummaryPanel } from './QuickSummaryModal';
import { MindMapPanel } from './MindMapModal';
import { VoiceNarrationPanel } from './VoiceNarrationModal';
import { DocChatPanel } from './DocChatPanel';
import { ReaderProvider, type ReaderToolKey as RTK } from './ReaderContext';

type Kind = 'word' | 'excel' | 'ppt' | 'unsupported';

interface Props {
    blob: Blob;
    fileType: string;
    title: string;
    onClose: () => void;
    fileId: string;
    onPageChange?: (page: number, total: number) => void;
}

interface SheetTab {
    name: string;
    html: string;
}

const kindOf = (fileType: string): Kind => {
    switch ((fileType || '').toLowerCase()) {
        case 'doc':
        case 'docx':
            return 'word';
        case 'xls':
        case 'xlsx':
        case 'csv':
            return 'excel';
        case 'ppt':
        case 'pptx':
            return 'ppt';
        default:
            return 'unsupported';
    }
};

const ToolsPanel: Record<ReaderToolKey, React.ComponentType<any> | null> = {
    mindMap: MindMapPanel,
    quickSummary: QuickSummaryPanel,
    voiceNarration: VoiceNarrationPanel,
    docChat: DocChatPanel,
    filePreview: null
}

export default function OfficeViewer({ blob, fileType, title, onClose, fileId, onPageChange }: Props) {
    const { t } = useI18n();
    const kind = useMemo(() => kindOf(fileType), [fileType]);

    const contentRef = useRef<HTMLDivElement | null>(null);
    const docxRef = useRef<HTMLDivElement | null>(null);
    const pptxRef = useRef<HTMLDivElement | null>(null);
    const pptxPreview = useRef<any>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [sheets, setSheets] = useState<SheetTab[]>([]);
    const [activeSheet, setActiveSheet] = useState(0);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(0);
    const [asideState, setAsideState] = useState<RTK | undefined>('filePreview')
    const [refresh, setRefresh] = useState<boolean>(false)

    const onToolClick = useCallback((tool: RTK) => {
        setAsideState(tool)
    }, [])

    const downloadUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
    useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        setSheets([]);
        setActiveSheet(0);
        setPage(1);
        setPageCount(0);

        (async () => {
            try {
                if (kind === 'word') {
                    const { renderAsync } = await import('docx-preview');
                    if (cancelled || !docxRef.current) return;
                    docxRef.current.innerHTML = '';
                    await renderAsync(blob, docxRef.current, undefined, {
                        className: 'docx',
                        inWrapper: true,
                        breakPages: true,
                        ignoreLastRenderedPageBreak: false,
                        ignoreWidth: true,
                        experimental: true,
                    });
                    if (!cancelled) {
                        const count = docxRef.current.querySelectorAll('section.docx').length || 1;
                        setPageCount(count);
                        // Report the page count once on open so consumers learn the total
                        // (a single-page doc is "fully read" on open; multi-page stays
                        // in-progress until the reader pages to the last section).
                        onPageChange?.(1, count);
                    }
                } else if (kind === 'excel') {
                    const XLSX = await import('xlsx');
                    const buf = await blob.arrayBuffer();
                    if (cancelled) return;
                    const wb = XLSX.read(buf, { type: 'array' });
                    const tabs: SheetTab[] = wb.SheetNames.map((name) => ({
                        name,
                        html: XLSX.utils.sheet_to_html(wb.Sheets[name], { editable: false }),
                    }));
                    if (cancelled) return;
                    setSheets(tabs);
                    if (!cancelled)
                        onPageChange?.(1, tabs.length || 1);
                } else if (kind === 'ppt') {
                    const { init } = await import('pptx-preview');
                    const buf = await blob.arrayBuffer();
                    if (cancelled || !pptxRef.current) return;
                    pptxRef.current.innerHTML = '';
                    const el = contentRef.current;
                    const availW = (el?.clientWidth || 960) - 16;
                    const availH = (el?.clientHeight || 540) - 16;
                    const width = Math.max(1, Math.min(availW, Math.round((availH * 4) / 3)));
                    const previewer = init(pptxRef.current, { width, height: availH, mode: 'slide' });
                    await previewer.preview(buf);
                    if (!cancelled) setPageCount(previewer.slideCount || 0);
                    pptxPreview.current = previewer;
                    if (!cancelled) onPageChange?.(1, previewer.slideCount || 1);
                } else {
                    throw new Error('unsupported file type');
                }
                if (!cancelled) setLoading(false);
            } catch (err) {
                console.error('Office render failed', err);
                if (!cancelled) {
                    setError(true);
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [blob, kind]);

    useEffect(() => {
        if (kind !== 'word' || loading || error) return;
        const host = docxRef.current;
        if (!host) return;
        const sections = host.querySelectorAll<HTMLElement>('section.docx');
        sections.forEach((sec, i) => {
            sec.style.display = i === page - 1 ? 'block' : 'none';
        });
        if (contentRef.current) contentRef.current.scrollTop = 0;
    }, [kind, loading, error, page, pageCount, refresh]);

    useEffect(() => {
        if (kind !== 'ppt' || loading || error) return;
        const previewer = pptxPreview.current;
        if (!previewer) return;
        let prev = previewer.currentIndex;
        const timer = setInterval(() => {
            const current = previewer.currentIndex;
            if (current !== prev && current >= 1 && current <= (previewer.slideCount || 1)) {
                prev = current;
                onPageChange?.(current, previewer.slideCount || 1);
            }
        }, 400);
        return () => clearInterval(timer);
    }, [kind, loading, error, onPageChange]);

    const iconBtn =
        'inline-flex items-center justify-center w-9 h-9 rounded-lg text-primary hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

    const goPrev = () => setPage((p) => Math.max(1, p - 1));
    const goNext = () => {
        setPage((p) => {
            const newPage = Math.min(pageCount || p, p + 1);
            onPageChange?.(newPage, pageCount);
            return newPage;
        });
    };

    const bodyOverflow = kind === 'ppt' ? 'overflow-hidden' : 'overflow-auto';
    const ACTIVE_ASIDE_PANEL = asideState ? ToolsPanel[asideState] : null;

    const ctx = useMemo(
        () => ({ materialId: fileId, material: null, materialType: "office" as const }),
        [fileId]
    );

    return (
        <ReaderProvider {...ctx}>
            <div className="flex flex-col h-full w-full overflow-hidden bg-bg">
                <style>{`
                    .xlsx-view table { border-collapse: collapse; width: max-content; font-size: 13px; color: var(--text-primary); }
                    .xlsx-view td, .xlsx-view th { border: 1px solid var(--border); padding: 6px 10px; white-space: nowrap; background: var(--surface); }
                    .xlsx-view tr:first-child td { background: var(--surface-2); font-weight: 600; }
                    .docx-host .docx-wrapper { background: transparent !important; padding: 0 !important; display: block !important; }
                    .docx-host .docx-wrapper > section.docx { width: 100% !important; min-height: 0 !important; box-shadow: none !important; margin: 0 !important; }
                `}</style>

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
                        {kind === 'word' && pageCount > 0 && (
                            <>
                                <button onClick={goPrev} className={iconBtn} disabled={page <= 1} aria-label="previous page">
                                    <HiOutlineChevronLeft className="text-[20px]" />
                                </button>
                                <span className="text-xs text-secondary tabular-nums whitespace-nowrap">
                                    {t('library.page')} {page} / {pageCount}
                                </span>
                                <button
                                    onClick={goNext}
                                    className={iconBtn}
                                    disabled={page >= pageCount}
                                    aria-label="next page"
                                >
                                    <HiOutlineChevronRight className="text-[20px]" />
                                </button>
                                <span className="mx-2 h-5 w-px bg-[var(--border)]" />
                            </>
                        )}
                        {kind === 'ppt' && pageCount > 0 && (
                            <span className="text-xs text-secondary tabular-nums whitespace-nowrap">
                                {pageCount} {t('library.slides')}
                            </span>
                        )}
                        <a
                            href={downloadUrl}
                            download={title}
                            className={iconBtn}
                            aria-label={t('library.download')}
                            title={t('library.download')}
                        >
                            <HiOutlineArrowDownTray className="text-[20px]" />
                        </a>
                    </div>
                </header>

                {kind === 'excel' && !error && sheets.length > 1 && (
                    <div className="flex gap-1 px-4 py-2 border-b border-bd bg-surface overflow-x-auto thin-scrollbar-light shrink-0">
                        {sheets.map((s, i) => (
                            <button
                                key={s.name}
                                onClick={() => { setActiveSheet(i); onPageChange?.(i + 1, sheets.length); }}
                                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors ${activeSheet === i
                                    ? 'bg-accent text-white'
                                    : 'bg-surface border border-bd text-secondary hover:text-accent'
                                    }`}
                            >
                                {s.name}
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex-1 min-h-0 flex">
                    <div ref={contentRef} className={`flex-1 min-w-0 ${bodyOverflow} thin-scrollbar-light relative display-${asideState !== 'filePreview' ? 'none' : 'block'}`}>
                        {error ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-4 px-6">
                                <HiOutlineExclamationCircle className="text-[40px] text-muted" />
                                <p className="text-sm text-secondary max-w-[320px]">{t('library.failedFile')}</p>
                                <a
                                    href={downloadUrl}
                                    download={title}
                                    className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity"
                                >
                                    <HiOutlineArrowDownTray className="text-[16px]" />
                                    {t('library.download')}
                                </a>
                            </div>
                        ) : (
                            <>
                                {loading && (
                                    <div className="absolute inset-0 flex items-center justify-center text-secondary text-sm">
                                        {t('library.loadingFile')}
                                    </div>
                                )}

                                {kind === 'word' && <div ref={docxRef} className="docx-host w-full" />}

                                {kind === 'excel' && sheets[activeSheet] && (
                                    <div
                                        className="xlsx-view"
                                        dangerouslySetInnerHTML={{ __html: sheets[activeSheet].html }}
                                    />
                                )}

                                {kind === 'ppt' && <div ref={pptxRef} className="w-full h-full flex items-center justify-center" />}
                            </>
                        )}
                    </div>

                    {asideState && asideState !== 'filePreview' && ACTIVE_ASIDE_PANEL && (
                        <ACTIVE_ASIDE_PANEL onClose={() => setAsideState('filePreview')} />
                    )}
                    <ReaderToolsAside onToolClick={onToolClick} activeTool={asideState} />
                </div>
            </div>
        </ReaderProvider >
    );
}
