/**
 * FileViewer — navigation-based file viewer that replaces the old `openFile`
 * state-mutation pattern.  It is mounted inside the Layout so the sidebar
 * survives route changes, and `fullBleed` is toggled to drop content padding.
 *
 * Opening a file is now a real navigation — the browser back button returns
 * to whatever page you came from (Course-Selection MaterialFiles, Lesson Detail,
 * or the Library panel itself).
 *
 * Download + renderer pipeline (Library API):
 *   1. GET /api/v1/library/download/:materialId → Blob (auth via interceptor)
 *   2. Pick renderer by extension → PdfViewer or OfficeViewer (lazy loaded)
 *   3. Track pages_read via PUT /api/v1/library/progress/:materialId/:userId
 */
import { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../../../../infra/locales/I18nContext';
import { useToast } from '../../../../infra/shared/store/useToastStore';
import useAuthStore, { selectUser } from '../../../../infra/auth/useAuthStore';
import useFullBleedStore from '../../../../infra/shared/store/useFullBleedStore';
import { client } from '../../../../api/client';
import { getMaterialApiV1LibraryMaterialIdGet, updateMaterialUserProgressApiV1LibraryProgressMaterialIdUserIdPut } from '../../../../api/generated';
import type { FileVersion } from '../store';
import { useLibrarySummaryStore } from '../store';
import PdfViewer from './PdfViewer';
import { ReaderProvider } from './ReaderContext';
import type { ReaderToolKey } from './ReaderToolsAside';
import { MindMapPanel } from './MindMapModal';
import { QuickSummaryPanel } from './QuickSummaryModal';
import { VoiceNarrationPanel } from './VoiceNarrationModal';

const OfficeViewer = lazy(() => import('./OfficeViewer'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OFFICE_EXTS = new Set(['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'csv']);
const downloadUrl = (id: string): string => `/api/v1/library/download/${id}`;

interface FileVersionMeta {
    id: string;
    name: string;
    fileType: string;
}

const ToolsPanel: Record<ReaderToolKey, React.ComponentType<any> | null> = {
    mindMap: MindMapPanel,
    quickSummary: QuickSummaryPanel,
    voiceNarration: VoiceNarrationPanel,
    filePreview: null,
    docChat: null

};

/**
 * Construct a lightweight FileVersion-like object from the raw blob + extension.
 * Used so that <ReaderProvider> / AI-tools can call the Library summary API.
 */
const buildFileVersion = (name: string, fileType: string, materialId: string): FileVersion => ({
    id: materialId,
    fileId: materialId,
    name,
    version: 1,
    category: 'Course',
    materialType: 'course',
    fileType,
    uploadedBy: '—',
    uploadedAt: new Date().toISOString(),
    date: new Date().toISOString(),
    pagesRead: 0,
    totalPages: 0,
    summary_ts: null,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FileViewer() {
    const { t } = useI18n();
    const navigate = useNavigate();
    const toast = useToast();
    const user = useAuthStore(selectUser);
    const { materialId } = useParams<{ materialId: string }>();
    const setFullBleed = useFullBleedStore((s) => s.setFullBleed);

    const [fileMeta, setFileMeta] = useState<FileVersionMeta | null>(null);
    const [viewerUrl, setViewerUrl] = useState<string | null>(null);
    const [officeBlob, setOfficeBlob] = useState<Blob | null>(null);
    const [officeType, setOfficeType] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Keep ReaderProvider in sync with the current materialId (important for AI tools).
    const summaryStore = useLibrarySummaryStore();

    // -----------------------------------------------------------------------
    // Fetch file from Library API
    // -----------------------------------------------------------------------

    useEffect(() => {
        if (!materialId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setViewerUrl(null);
        setOfficeBlob(null);
        setOfficeType('');
        setFileMeta(null);

        const mid = Number(materialId);
        summaryStore
            .getSummary(mid)
            .catch(() => {});
        summaryStore
            .getMindmap(mid)
            .catch(() => {});
        summaryStore
            .getVoiceNarrationText(mid)
            .catch(() => {});

        (async () => {
            try {
                const { data, error: fetchError, response } = await client.get({
                    url: downloadUrl(materialId),
                    parseAs: 'blob',
                });
                if (cancelled) return;
                if (fetchError || !data) {
                    setError(t('library.failedPdf'));
                    toast.error({ title: t('library.actionFailed'), body: t('library.failedPdf') });
                    navigate(-1);
                    return;
                }
                const { data: meta } = await getMaterialApiV1LibraryMaterialIdGet({ path: { material_id: Number(materialId) } });
                const materialName = meta?.title || meta?.file_name || `File-${materialId}`;
                const blob = data as Blob;
                if (cancelled) return;
                // Extract extension from filename in Content-Disposition header
                // (blob.type is a long MIME like
                //  "application/vnd.openxmlformats-...ml.document" that doesn't match
                //  OFFICE_EXTS keys).
                const ext = (() => {
                    const cd = response?.headers?.get('content-disposition') || '';
                    const m = cd.match(/filename\*?=(?:UTF-[\d']*)?["']?([^";\n]+)/i);
                    if (m) {
                        const fn = decodeURIComponent(m[1].trim());
                        const fileExt = fn.split('.').pop()?.toLowerCase();
                        if (fileExt) return fileExt;
                    }
                    // Fallback: blob.type is e.g. "application/pdf", parse it.
                    const ct = blob.type?.split(';')[0]?.split('/').pop()?.replace('x-', '');
                    return (ct || 'pdf').toLowerCase();
                })();

                if (ext === 'pdf') {
                    // Use direct URL so react-pdf (pdf.js worker) can fetch it natively.
                    setViewerUrl(downloadUrl(materialId));
                    setFileMeta({ id: materialId, name: materialName, fileType: ext });
                } else if (OFFICE_EXTS.has(ext)) {
                    setOfficeBlob(blob);
                    setOfficeType(ext);
                    setFileMeta({ id: materialId, name: materialName, fileType: ext });
                } else {
                    // Images / video / unknown — let the browser handle it in a new tab, but keep the reader route active.
                    const objectUrl = URL.createObjectURL(blob);
                    window.open(objectUrl, '_blank', 'noopener');
                    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
                    // No viewer to show — the file was opened externally.
                }
                setLoading(false);
            } catch (err) {
                if (!cancelled) {
                    setError((err as Error).message);
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materialId]); // intentional: re-run only when materialId changes

    // Full-bleed toggle
    useEffect(() => {
        setFullBleed(true);
        return () => {
            setFullBleed(false);
            // Cleanup object URLs when unmounting
            if (viewerUrl) URL.revokeObjectURL(viewerUrl);
            setViewerUrl(null);
            setOfficeBlob(null);
            setOfficeType('');
        };
    }, [setFullBleed, setViewerUrl]);

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------

    const onClose = useCallback(() => {
        navigate(-1);
    }, [navigate]);

    // -----------------------------------------------------------------------
    // Progress tracking
    // -----------------------------------------------------------------------

    const persistProgress = useCallback(
        async (pageNum: number) => {
            if (!materialId || !user) return;
            const matId = Number(materialId);
            if (Number.isNaN(matId)) return;
            try {
                await updateMaterialUserProgressApiV1LibraryProgressMaterialIdUserIdPut({
                    path: { material_id: matId, user_id: user.id },
                    body: { pages_read: pageNum } as any,
                });
            } catch {
                // Non-fatal: progress is nice-to-have; don't block reading.
                console.warn('Progress persist failed for', materialId, pageNum);
            }
        },
        [materialId, user],
    );

    const handlePdfPageChange = useCallback(
        (pageNum: number, _total: number) => {
            void persistProgress(pageNum);
        },
        [persistProgress],
    );

    const handleOfficePageChange = useCallback(
        (pageNum: number, _total: number) => {
            void persistProgress(pageNum);
        },
        [persistProgress],
    );

    // -----------------------------------------------------------------------
    // Material version — must be called before any early returns
    // -----------------------------------------------------------------------

    const materialVersion: FileVersion = useMemo(
        () => buildFileVersion(fileMeta?.name ?? '', fileMeta?.fileType ?? 'pdf', fileMeta?.id ?? '0'),
        [fileMeta],
    );

    // -----------------------------------------------------------------------
    // Loading / error
    // -----------------------------------------------------------------------

    if (loading) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-bg text-secondary text-sm">
                {t('library.loadingFile')}
            </div>
        );
    }

    if (error && !fileMeta) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-bg text-secondary text-sm flex-col gap-4">
                <span>{error}</span>
                <button
                    onClick={onClose}
                    className="bg-accent text-white text-[12px] font-semibold py-2 px-4 rounded"
                >
                    Back
                </button>
            </div>
        );
    }

    if (!fileMeta) return null;

    // -----------------------------------------------------------------------
    // Render — choose the appropriate viewer
    // -----------------------------------------------------------------------

    // PDF reader
    if (viewerUrl) {
        return (
            <ReaderProvider
                materialId={fileMeta.id}
                material={materialVersion}
                materialType="pdf"
            >
                <PdfViewer
                    fileUrl={viewerUrl}
                    title={fileMeta.name}
                    onClose={onClose}
                    onPageChange={handlePdfPageChange}
                    materialId={fileMeta.id}
                    material={materialVersion}
                />
            </ReaderProvider>
        );
    }

    // Office reader (lazy-loaded)
    if (officeBlob && officeType) {
        return (
            <Suspense
                fallback={
                    <div className="h-full w-full flex items-center justify-center bg-bg text-secondary text-sm">
                        {t('library.loadingFile')}
                    </div>
                }
            >
                <ReaderProvider
                    materialId={fileMeta.id}
                    material={materialVersion}
                    materialType="office"
                >
                    <OfficeViewer
                        blob={officeBlob}
                        fileType={officeType}
                        title={fileMeta.name}
                        onClose={onClose}
                        onPageChange={handleOfficePageChange}
                        fileId={fileMeta.id}
                    />
                </ReaderProvider>
            </Suspense>
        );
    }

    // Fallback (e.g. image/video that opened in new tab)
    return (
        <div className="h-full w-full flex items-center justify-center bg-bg text-secondary text-sm flex-col gap-4">
            <span>{t('library.loadingFile')}</span>
            <button
                onClick={onClose}
                className="bg-accent text-white text-[12px] font-semibold py-2 px-4 rounded"
            >
                Back
            </button>
        </div>
    );
}
