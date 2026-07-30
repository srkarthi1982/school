/**
 * LibraryPanelPage — "Digital Library" style re-implementation of the Course
 * Management library UI.
 *
 * Layout (adapted from the digital-library reference, using the app's theme
 * tokens so it respects light/dark and CONTRIBUTING):
 *   - a row-based file list on the left, and
 *   - a sticky "File Details" panel on the right (cover, description, metadata,
 *     and the per-role actions).
 * PDFs open in a full-screen reader (PdfViewer / pdf.js).
 *
 * It reuses the shared `useLibraryStore` and generated API client. Access is
 * permission-gated (library:read / :write / :manage), not role-based:
 *   - upload General → library:manage, Course → library:write, Personal → library:read
 *   - approve/reject + see-all → library:manage
 * Course uploads by non-managers are created `pending` until approved.
 */
import { type ChangeEvent, type DragEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useShallow } from 'zustand/react/shallow';
import {
    HiOutlineAcademicCap,
    HiOutlineArrowLeft,
    HiOutlineArrowUpTray,
    HiOutlineBookmarkSquare,
    HiOutlineBookOpen,
    HiOutlineDocument,
    HiOutlineDocumentText,
    HiOutlineEye,
    HiOutlineFolder,
    HiOutlineExclamationCircle,
    HiOutlineFolderOpen,
    HiOutlineMagnifyingGlass,
    HiOutlinePhoto,
    HiOutlinePlus,
    HiOutlinePresentationChartBar,
    HiOutlineTableCells,
    HiOutlineTrash,
    HiOutlineVideoCamera,
    HiOutlineXMark,
} from 'react-icons/hi2';
import { FaFilePdf } from 'react-icons/fa';

import {
    type ApprovedStatus,
    type FileVersion,
    type MaterialType,
    type User,
    useLibraryStore,
} from '../store';
import {
    deleteMaterialApiV1LibraryMaterialIdDelete,
    getAllLibraryMaterialsWithUserProgressApiV1LibraryUserUserIdMaterialsGet,
    updateMaterialApiV1LibraryMaterialIdPut,
    uploadMaterialApiV1LibraryUploadPost,
} from '../../../../api/generated';
import { client } from '../../../../api/client';
import { formDataBodySerializer } from '../../../../api/generated/core/bodySerializer.gen';
import type { CourseMasterResponse } from '../../../../api/generated/types.gen';
import useAuthStore, { selectUser, selectUserPermissions } from '../../../../infra/auth/useAuthStore';
import type { PermissionCode } from '../../../../infra/shared/types/permissions';
import { extractErrorMessage } from '../../../../infra/shared/utils/apiError';
import { generateId } from '../../../../infra/shared/utils/uid';
import { useToast } from '../../../../infra/shared/store/useToastStore';
import { useI18n } from '../../../../infra/locales/I18nContext';
import SectionHeader from '../../../../infra/shared/components/SectionHeader';
import ProgressBar from './ProgressBar';
import { useLibrarySummaryStore } from '../store';
import SummarizingStatusPill from '../../../../infra/shared/components/SummarizingStatusPill';

// ---------------------------------------------------------------------------
// Static config & pure helpers (no React state)
// ---------------------------------------------------------------------------

const MATERIAL_CARDS: ReadonlyArray<{
    type: MaterialType;
    titleKey: 'library.general' | 'library.course' | 'library.personal';
    descKey: 'library.generalDesc' | 'library.courseDesc' | 'library.personalDesc';
    icon: typeof HiOutlineBookOpen;
}> = [
        { type: 'general', titleKey: 'library.general', descKey: 'library.generalDesc', icon: HiOutlineBookOpen },
        { type: 'course', titleKey: 'library.course', descKey: 'library.courseDesc', icon: HiOutlineAcademicCap },
        { type: 'personal', titleKey: 'library.personal', descKey: 'library.personalDesc', icon: HiOutlineFolder },
    ];

const getDefaultCategory = (type: MaterialType): string =>
    type === 'general' ? 'General' : type === 'course' ? 'Course' : 'Personal';

const normalizeCourse = (course?: string): string => (course || '').trim().toLocaleLowerCase();

const matchesAnyCourse = (courseName: string, allowed: string[]): boolean => {
    const target = normalizeCourse(courseName);
    return allowed.some((c) => normalizeCourse(c) === target);
};

/** Human-readable byte size, e.g. 2.5 MB. */
const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i += 1;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** Who may upload into a given material space (permission-gated). */
const canUpload = (type: MaterialType, perms: ReadonlySet<PermissionCode>): boolean => {
    if (type === 'general') return perms.has('library:manage');
    if (type === 'course') return (perms.has('library:manage') || perms.has('teacher:read')) && perms.has('library:write');
    return perms.has('student:read') && perms.has('library:write');
};

/** Icon for a file, keyed off its extension. */
const FileIcon = ({ type, className = 'text-[42px]' }: { type: string; className?: string }) => {
    switch (type.toLowerCase()) {
        case 'pdf': return <FaFilePdf className={`text-red-500 ${className}`} />;
        case 'xls':
        case 'xlsx': return <HiOutlineTableCells className={`text-green-500 ${className}`} />;
        case 'ppt':
        case 'pptx': return <HiOutlinePresentationChartBar className={`text-orange-500 ${className}`} />;
        case 'doc':
        case 'docx': return <HiOutlineDocument className={`text-blue-500 ${className}`} />;
        case 'jpg':
        case 'jpeg':
        case 'png': return <HiOutlinePhoto className={`text-pink-500 ${className}`} />;
        case 'mp4':
        case 'webm': return <HiOutlineVideoCamera className={`text-violet-500 ${className}`} />;
        default: return <HiOutlineDocumentText className={`text-muted ${className}`} />;
    }
};

// Status badge colours — the one place literal rgba() values are allowed
// (CONTRIBUTING "Status badge pattern — never build dynamic Tailwind classes").
const STATUS_COLORS: Record<ApprovedStatus, { bg: string; text: string }> = {
    approved: { bg: 'rgba(34,197,94,0.12)', text: '#16A34A' },
    rejected: { bg: 'rgba(220,38,38,0.12)', text: '#DC2626' },
    pending: { bg: 'rgba(245,158,11,0.12)', text: '#D97706' },
    unknown: { bg: 'rgba(100,116,139,0.12)', text: '#64748B' },
};

const normalizeApprovedStatus = (status?: string | null): ApprovedStatus => {
    const normalized = status?.trim().toLowerCase();
    return normalized === 'approved' || normalized === 'rejected' || normalized === 'pending'
        ? normalized
        : 'unknown';
};

const StatusBadge = ({ status }: { status: ApprovedStatus }) => {
    const colors = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;
    return (
        <span
            className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
            style={{ background: colors.bg, color: colors.text }}
        >
            {status}
        </span>
    );
};


/** Decide whether `user` is allowed to open `file`. */
const canViewDocument = (
    file: FileVersion,
    user: User | null,
    perms: ReadonlySet<PermissionCode>,
    accessibleCourseCodes: string[],
): boolean => {
    if (!user) return false;
    if (perms.has('library:manage')) return true;        // managers see everything
    if (file.uploadedBy === user.full_name) return true; // always see your own uploads

    if (file.materialType === 'personal') return false;  // owner only (handled above)

    if (file.materialType === 'course') {
        const courseName = file.course || '';
        if (!courseName) return false;
        return (
            file.approvedStatus === 'approved' &&
            (matchesAnyCourse(courseName, accessibleCourseCodes) || (user.usercourses?.length ? matchesAnyCourse(courseName, user.usercourses) : false))
        );
    }

    return file.approvedStatus === 'approved'; // general
};




/** Extensions opened in the in-app Office viewer (read-only). */
const OFFICE_EXTS = new Set(['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'csv']);

const PILL_ACTIVE = 'bg-accent text-white border border-accent';
const PILL_IDLE = 'bg-surface border border-bd text-secondary hover:border-accent hover:text-accent';
const PRIMARY_BTN =
    'inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0';
const SECONDARY_BTN =
    'inline-flex items-center gap-1.5 bg-surface border border-bd text-secondary text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:bg-surface-2 hover:text-primary transition-colors cursor-pointer font-sans shrink-0';
// Shared form-field styling for the upload modal (inputs + selects).
const FIELD_CLS =
    'w-full px-3 py-2.5 rounded-lg border border-bd bg-surface text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-shadow';
const FIELD_RO_CLS = 'w-full px-3 py-2.5 rounded-lg border border-bd bg-surface-2 text-secondary text-sm';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LibraryPanelPage() {
    const { t } = useI18n();
    const navigate = useNavigate();
    const toast = useToast();
    const user = useAuthStore(selectUser) as unknown as User | null;
    const perms = useAuthStore(selectUserPermissions); // ReadonlySet<PermissionCode>
    const canManage = perms.has('library:manage');

    const {
        selectedType, selectedFile, fileVersions, folders, dragging, courseFilter,
        selectedFolder, newFolderName, uploadFile, metadata,
        getCourses, setSelectedType, setSelectedFile, setFileVersions, setFolders,
        addFolder, moveFileToFolder, setShowUpload, showUpload, setDragging,
        setCourseFilter, setSelectedFolder, setNewFolderName, setUploadFile,
        setMetadata, updateMetadata, resetUploadState,
    } = useLibraryStore(
        useShallow((s) => ({
            selectedType: s.selectedType,
            selectedFile: s.selectedFile,
            fileVersions: s.fileVersions,
            folders: s.folders,
            dragging: s.dragging,
            courseFilter: s.courseFilter,
            selectedFolder: s.selectedFolder,
            newFolderName: s.newFolderName,
            uploadFile: s.uploadFile,
            metadata: s.metadata,
            showUpload: s.showUpload,
            getCourses: s.getCourses,
            setSelectedType: s.setSelectedType,
            setSelectedFile: s.setSelectedFile,
            setFileVersions: s.setFileVersions,
            setFolders: s.setFolders,
            addFolder: s.addFolder,
            moveFileToFolder: s.moveFileToFolder,
            setShowUpload: s.setShowUpload,
            setDragging: s.setDragging,
            setCourseFilter: s.setCourseFilter,
            setSelectedFolder: s.setSelectedFolder,
            setNewFolderName: s.setNewFolderName,
            setUploadFile: s.setUploadFile,
            setMetadata: s.setMetadata,
            updateMetadata: s.updateMetadata,
            resetUploadState: s.resetUploadState,
        })),
    );

    const [accessCourses, setAccessCourses] = useState<CourseMasterResponse[]>([]);
    const [search, setSearch] = useState('');
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [showAircraftUpload, setShowAircraftUpload] = useState(false);
    const [aircraftFile, setAircraftFile] = useState<File | null>(null);
    const [aircraftTitle, setAircraftTitle] = useState('');
    const [aircraftDescription, setAircraftDescription] = useState('');
    const [aircraftError, setAircraftError] = useState('');
    const [aircraftUploading, setAircraftUploading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const aircraftInputRef = useRef<HTMLInputElement | null>(null);
    const coverInputRef = useRef<HTMLInputElement | null>(null);

    // ---------------------------------------------------------------------------
    // Helper: compress large image files to a Base64 data URL (max size in KB)
    // ---------------------------------------------------------------------------
    const compressImageToDataUrl = async (file: File, maxSizeKB: number = 200): Promise<string> => {
        // Read the file as a data URL
        const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
        });

        // Create an image element to get dimensions
        const img = await new Promise<HTMLImageElement>((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.src = dataUrl;
        });

        // If the image is already small enough, return original data URL
        const initialSizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
        if (initialSizeKB <= maxSizeKB) return dataUrl;

        // Iteratively scale down the image until it fits the size limit
        let { width, height } = img;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        while (true) {
            canvas.width = width;
            canvas.height = height;
            ctx?.clearRect(0, 0, width, height);
            ctx?.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const compressedSizeKB = Math.round((compressedDataUrl.length * 3) / 4 / 1024);
            if (compressedSizeKB <= maxSizeKB || width <= 100 || height <= 100) {
                return compressedDataUrl;
            }
            // Reduce dimensions by 20% and try again
            width = Math.floor(width * 0.8);
            height = Math.floor(height * 0.8);
        }
    };

    const accessibleCourseCodes = useMemo(() => accessCourses.map((c) => c.title), [accessCourses]);

    /** Navigate to the FileViewer route for a given Library file. */
    const viewFile = useCallback(
        (file: FileVersion) => {
            if (!canViewDocument(file, user, perms, accessibleCourseCodes)) {
                toast.error({ title: t('library.actionFailed'), body: t('library.unavailableAccess') });
                return;
            }
            navigate(file.aircraftViewer
                ? `/course-management/library/aircraft-viewer/${file.id}`
                : `/course-management/library/view/${file.id}`);
        },
        [user, perms, accessibleCourseCodes, toast, t, navigate],
    );

    // -----------------------------------------------------------------------
    // Data loading
    // -----------------------------------------------------------------------

    const loadMaterials = useCallback(async () => {
        if (!user) return;
        try {
            const { data } = await getAllLibraryMaterialsWithUserProgressApiV1LibraryUserUserIdMaterialsGet({
                path: { user_id: user.id },
            });
            const body: any = data;
            const materials: any[] = Array.isArray(body) ? body : body?.data ?? [];

            const files: FileVersion[] = materials.map((item) => {
                let meta: Record<string, any> = {};
                try {
                    meta = item.metadata_json ? JSON.parse(item.metadata_json) : {};
                } catch {
                    meta = {};
                }
                const now = new Date().toISOString();
                return {
                    id: String(item.id),
                    fileId: item.fileId ?? '',
                    name: item.title,
                    version: Number(item.version) || 1,
                    category: item.category,
                    materialType: item.material_type as MaterialType,
                    course: meta.course || '',
                    topic: meta.topic || '',
                    folder: item.folder || meta.folder || '',
                    // Prefer the filename extension (xlsx/docx/pptx/pdf) — deriving from
                    // content_type yields ugly MIME subtypes like
                    // "vnd.openxmlformats-officedocument.spreadsheetml.sheet" for Office files.
                    fileType: (item.file_name?.split('.').pop() || item.content_type?.split('/')[1] || '').toLowerCase(),
                    fileSize: item.file_size ?? undefined,
                    uploadedBy: item.uploaded_by || user.full_name || '',
                    uploadedAt: item.upload_date || now,
                    date: item.upload_date || now,
                    description: item.description || '',
                    fileUrl: item.file_url || '',
                    previewUrl: item.file_url || '',
                    coverImage: meta.coverImage || '',
                    approvedStatus: normalizeApprovedStatus(item.approved_status || 'approved'),
                    summary_ts: item.summary_ts || null,
                    pagesRead: Number(item.pages_read ?? meta.pages_read ?? 0),
                    totalPages: Number(item.totalPages ?? meta.total_pages ?? 0),
                    aircraftViewer: meta.content_kind === 'aircraft_viewer'
                        && typeof meta.viewer_package_id === 'string'
                        && typeof meta.viewer_entrypoint === 'string'
                        && ['index.htm', 'index.html'].includes(meta.viewer_entrypoint.toLowerCase())
                        ? {
                            content_kind: 'aircraft_viewer',
                            viewer_package_id: meta.viewer_package_id,
                            viewer_entrypoint: meta.viewer_entrypoint,
                            viewer_relative_root: meta.viewer_relative_root,
                            source_filename: meta.source_filename,
                        }
                        : undefined,
                };
            });

            const dont_show = (f: FileVersion) => {
                if (f.materialType !== 'course' && f.materialType !== 'course_master') return false;

                return f.materialType === 'course_master' || (f.materialType === 'course' && f.approvedStatus !== 'approved')
            }
            // setFileVersions(files.filter(f => !dont_show));
            setFileVersions(files.filter(f => {
                if(f.materialType === 'general' || f.materialType === 'personal') return true;
                return f.materialType === 'course' && f.approvedStatus === 'approved'
            }))

            const folderNames = Array.from(
                new Set(
                    files
                        .filter((f) => f.materialType === 'personal' && f.folder)
                        .map((f) => f.folder!.trim())
                        .filter(Boolean),
                ),
            );
            setFolders(folderNames.map((name) => ({ id: generateId(), name, createdBy: user.full_name })));
        } catch (err) {
            console.error('Failed to load library materials', err);
        }
    }, [user, setFileVersions, setFolders]);

    useEffect(() => {
        if (!user) return;
        let active = true;
        (async () => {
            try {
                const courses = await getCourses();
                if (active) setAccessCourses(courses);

            } catch (err) {
                console.error('Failed to fetch courses', err);
            }
        })();
        return () => {
            active = false;
        };
    }, [user, getCourses]);

    useEffect(() => {
        void loadMaterials();
    }, [loadMaterials]);

    // Reset selectedFile when it's no longer in the refreshed file list
    // (e.g. file was deleted from CSM while this tab was open)
    useEffect(() => {
        if (!selectedFile || fileVersions.length === 0) return
        if (!fileVersions.some(f => f.id === selectedFile.id)) {
            setSelectedFile(null)
        }
    }, [selectedFile, fileVersions, setSelectedFile])

    // Deep-link support (e.g. "View course library" from a lesson detail page):
    // ?type=course&course=<title> pre-selects the Course tab and filters to that
    // course. Applied once on mount, then the params are cleared so they don't
    // linger in the URL or re-fire on later state changes.
    const [searchParams, setSearchParams] = useSearchParams();
    useEffect(() => {
        const type = searchParams.get('type');
        const course = searchParams.get('course');
        if (!type && !course) return;
        if (type === 'general' || type === 'course' || type === 'personal') {
            setSelectedType(type);
        }
        if (course) setCourseFilter(course);
        setSearchParams({}, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const {
        // summary, mindmap, voiceNarrationText,
        summarizeMaterial,
        // summarizingIds,
    } = useLibrarySummaryStore(
        useShallow((s) => ({
            summary: s.summary,
            mindmap: s.mindmap,
            voiceNarrationText: s.voiceNarrationText,
            summarizeMaterial: s.summarizeMaterial,
            // summarizingIds: s.summarizingIds,
        }))
    );

    // -----------------------------------------------------------------------
    // Derived lists
    // -----------------------------------------------------------------------

    const latestFiles = useMemo(() => {
        const matches = fileVersions.filter((f) => {
            const typeOk = !selectedType || f.materialType === selectedType;
            const searchOk = !search || f.name.toLowerCase().includes(search.toLowerCase());
            return typeOk && searchOk;
        });

        const latest = new Map<string, FileVersion>();
        for (const f of matches) {
            const key = `${f.name}-${f.category}`;
            const existing = latest.get(key);
            if (!existing || existing.version < f.version) latest.set(key, f);
        }
        return Array.from(latest.values());
    }, [fileVersions, selectedType, search]);

    const visibleFiles = useMemo(() => {
        if (!user) return [];
        let files = [...latestFiles];

        if (selectedType === 'course') {
            files = files.filter((f) => {
                if (canManage) return true; // managers see all (incl. pending, to approve)
                if (f.uploadedBy === user.full_name) return true;
                return f.approvedStatus === 'approved' && matchesAnyCourse(f.course || '', accessibleCourseCodes);
            });
        }

        if (selectedType === 'personal') {
            files = files.filter((f) => f.uploadedBy === user.full_name);
        }

        if (courseFilter !== 'All') {
            files = files.filter((f) => normalizeCourse(f.course) === normalizeCourse(courseFilter));
        }

        // Folders only exist in the Personal space, so the folder filter must not
        // leak into Course/General (a stale selectedFolder would empty the grid).
        if (selectedType === 'personal' && selectedFolder !== 'All') {
            files = files.filter((f) => f.folder === selectedFolder);
        }

        return files;
    }, [user, perms, canManage, latestFiles, selectedType, courseFilter, selectedFolder, accessibleCourseCodes]);

    const userFolders = useMemo(
        () => (user ? folders.filter((f) => f.createdBy === user.full_name) : []),
        [folders, user],
    );

    const courseTabs = useMemo(
        () => ['All', ...new Set(fileVersions.filter((f) => f.course).map((f) => f.course as string))],
        [fileVersions],
    );

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const beginUpload = (file: File) => {
        if (!selectedType) return;
        setUploadError(null);
        const extension = file.name.split('.').pop()?.toLowerCase() || '';
        setUploadFile(file);
        setMetadata({
            name: file.name,
            category: getDefaultCategory(selectedType),
            course: '',
            topic: '',
            folder: selectedType === 'personal' && selectedFolder !== 'All' ? selectedFolder : '',
            fileType: extension,
            fileId: `FILE-${Date.now()}`,
            //pagesRead: 0,
            //totalPages: 0,
            coverImage: '',
        });
        setShowUpload(true);
    };

    const onFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) beginUpload(file);
        e.target.value = '';
    };

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedType || !canUpload(selectedType, perms)) return;
        if (selectedType === 'course') {
            return;
        }
        const file = e.dataTransfer?.files[0];
        if (file) beginUpload(file);
    };

    const createFolder = () => {
        const name = newFolderName.trim();
        if (!name || !user) return;
        addFolder({ id: generateId(), name, createdBy: user.full_name });
        setSelectedFolder(name);
        setNewFolderName('');
        setCreatingFolder(false);
    };

    const cancelCreateFolder = () => {
        setNewFolderName('');
        setCreatingFolder(false);
    };

    const saveUpload = async () => {
        if (!uploadFile || !selectedType || !user) return;
        setUploadError(null);

        // if (selectedType === 'course' && !metadata.course?.trim()) {
        //     alert('Please select a course before uploading course material');
        //     return;
        // }

        const siblings = fileVersions.filter((f) => f.name === metadata.name && f.category === metadata.category);
        const nextVersion = siblings.length ? Math.max(...siblings.map((f) => f.version)) + 1 : 1;

        // hey-api never throws — it returns { data, error }. The backend now decides
        // `uploaded_by` and the approval status server-side, so we don't send them.
        // Determine total pages for PDFs; other formats default to 1 page.
        const extension = (metadata.fileType || '').toLowerCase();
        let totalPages = 1;
        if (extension === 'pdf') {
            try {
                const arrayBuffer = await uploadFile.arrayBuffer();
                const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
                totalPages = doc.numPages;
            } catch {
                totalPages = 1;
            }
        } else if (OFFICE_EXTS.has(extension)) {
            // Attempt to compute total pages for Office documents.
            try {
                if (extension === 'doc' || extension === 'docx') {
                    const { renderAsync } = await import('docx-preview');
                    const arrayBuffer = await uploadFile.arrayBuffer();
                    const tempDiv = document.createElement('div');
                    await renderAsync(arrayBuffer, tempDiv, undefined, {
                        breakPages: true,
                        inWrapper: true,
                        ignoreLastRenderedPageBreak: false,
                        ignoreWidth: true,
                        experimental: true,
                    });
                    totalPages = tempDiv.querySelectorAll('section.docx').length || 1;
                } else if (extension === 'xls' || extension === 'xlsx' || extension === 'csv') {
                    const XLSX = await import('xlsx');
                    const buf = await uploadFile.arrayBuffer();
                    const wb = XLSX.read(buf, { type: 'array' });
                    totalPages = wb.SheetNames.length || 1;
                } else if (extension === 'ppt' || extension === 'pptx') {
                    const { init } = await import('pptx-preview');
                    const buf = await uploadFile.arrayBuffer();
                    const previewer = init(document.createElement('div'), { width: 100, height: 100, mode: 'slide' });
                    await previewer.preview(buf);
                    totalPages = previewer.slideCount || 1;
                }
            } catch {
                totalPages = 1;
            }
        }

        const { data, error } = await uploadMaterialApiV1LibraryUploadPost({
            body: {
                file: uploadFile,
                title: metadata.name || uploadFile.name,
                category: metadata.category || getDefaultCategory(selectedType),
                material_type: selectedType,
                version: `${nextVersion}`,
                totalPages: totalPages,
                pagesRead: 0,
                // Backend reads `folder` from a top-level form field (and overwrites
                // metadata_json.folder with it), so it must be sent here.
                folder: metadata.folder || '',
                //...(metadata.coverImage ? { coverimage: dataURLtoBlob(metadata.coverImage) } : {}),
                metadata_json: JSON.stringify({
                    course: metadata.course,
                    topic: metadata.topic,
                    folder: metadata.folder,
                    coverImage: metadata.coverImage,
                    //pagesRead: 0,
                    //totalPages: totalPages,
                }),
            } as any,
        });

        if (error) {
            console.error('Library upload failed', error);
            setUploadError(extractErrorMessage(error));
            return;
        }
        resetUploadState();
        await loadMaterials();
        toast.success({ title: t('library.uploaded') });
        setSelectedFile(null);
        // Auto-trigger summarization for the newly uploaded file (non-blocking)
        const materialId = (data as any)?.id ?? (data as any)?.data?.id;
        if (materialId && 'personal' !== selectedType) {
            try {
                await summarizeMaterial(materialId);
            } catch {
                console.warn("Summarization trigger failed for", materialId);
            }
        }
    };

    const resetAircraftUpload = () => {
        setShowAircraftUpload(false);
        setAircraftFile(null);
        setAircraftTitle('');
        setAircraftDescription('');
        setAircraftError('');
        setAircraftUploading(false);
    };

    const saveAircraftUpload = async () => {
        if (!aircraftFile || aircraftUploading) return;
        if (!aircraftFile.name.toLowerCase().endsWith('.exe')) {
            setAircraftError('Select a supported .exe Aircraft Viewer package.');
            return;
        }
        setAircraftUploading(true);
        setAircraftError('');
        const { data, error } = await client.post({
            url: '/api/v1/library/aircraft-viewer/upload',
            body: {
                file: aircraftFile,
                title: aircraftTitle.trim() || aircraftFile.name.replace(/\.exe$/i, ''),
                description: aircraftDescription.trim(),
            },
            ...formDataBodySerializer,
            headers: { 'Content-Type': null },
        });
        if (error) {
            setAircraftError(extractErrorMessage(error));
            setAircraftUploading(false);
            return;
        }
        resetAircraftUpload();
        await loadMaterials();
        const newId = String((data as any)?.id ?? '');
        if (newId) {
            const created = useLibraryStore.getState().fileVersions.find((item) => item.id === newId);
            if (created) setSelectedFile(created);
        }
        toast.success({ title: 'Aircraft Viewer uploaded' });
    };

    const setApproval = async (status: Extract<ApprovedStatus, 'approved' | 'rejected'>) => {
        if (!selectedFile) return;
        const materialId = Number(selectedFile.id);
        if (Number.isNaN(materialId)) return;
        const { error } = await updateMaterialApiV1LibraryMaterialIdPut({
            body: { approved_status: status } as any,
            path: { material_id: materialId },
        });
        if (error) {
            console.error(`Failed to ${status} document`, error);
            toast.error({ title: t('library.actionFailed'), body: extractErrorMessage(error) });
            return;
        }
        const updated: FileVersion = { ...selectedFile, approvedStatus: status };
        setSelectedFile(updated);
        setFileVersions(fileVersions.map((f) => (f.id === selectedFile.id ? updated : f)));
    };

    const changeFolder = async (newFolder: string) => {
        if (!selectedFile) return;
        const materialId = Number(selectedFile.id);
        if (!Number.isNaN(materialId)) {
            const { error } = await updateMaterialApiV1LibraryMaterialIdPut({
                body: { folder: newFolder } as any,
                path: { material_id: materialId },
            });
            if (error) {
                console.error('Failed to save folder change', error);
                toast.error({ title: t('library.actionFailed'), body: extractErrorMessage(error) });
                return;
            }
        }
        moveFileToFolder(selectedFile.id, newFolder);
        setSelectedFile({ ...selectedFile, folder: newFolder });
    };

    const deleteFile = async () => {
        if (!selectedFile) return;
        const materialId = Number(selectedFile.id);
        if (Number.isNaN(materialId)) return;
        if (!window.confirm(t('library.confirmDelete'))) return;
        const { error } = await deleteMaterialApiV1LibraryMaterialIdDelete({
            path: { material_id: materialId },
        });
        if (error) {
            console.error('Failed to delete material', error);
            toast.error({ title: t('library.deleteFailed'), body: extractErrorMessage(error) });
            return;
        }
        toast.success({ title: t('library.deleted') });
        setSelectedFile(null);
        await loadMaterials();
    };

    // -----------------------------------------------------------------------
    // Derived lists
    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (!user) return null;

    // 1) Space picker (no material type chosen yet).
    if (!selectedType) {
        return (
            <div className="flex flex-col gap-4 lg:min-h-0">
                <SectionHeader icon={<HiOutlineBookmarkSquare />} title={t('library.library')} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:flex-1 lg:min-h-0">
                    {MATERIAL_CARDS.map((card) => {
                        const Icon = card.icon;
                        return (
                            <button
                                key={card.type}
                                onClick={() => setSelectedType(card.type)}
                                className="card px-5 py-8 flex flex-col items-center justify-center gap-5 hover:shadow-lg transition-all"
                            >
                                <div className="rounded-full bg-accent-light p-8 text-accent">
                                    <Icon className="text-[52px]" />
                                </div>
                                <div className="text-center">
                                    <h2 className="text-2xl font-bold text-primary">{t(card.titleKey)}</h2>
                                    <p className="text-sm text-secondary mt-2">{t(card.descKey)}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    // 2) Digital-library browser: list (left) + File Details (right).
    return (
        <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
            {/* Header — breadcrumb lets you jump back up without the Back button */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <nav aria-label="breadcrumb" className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[22px] text-accent shrink-0">
                        <HiOutlineBookmarkSquare />
                    </span>
                    <button
                        onClick={() => {
                            setSelectedType(null);
                            setSelectedFile(null);
                        }}
                        className="text-[15px] font-semibold text-secondary hover:text-accent transition-colors shrink-0"
                    >
                        {t('library.library')}
                    </button>
                    <span className="text-muted text-[14px] shrink-0">/</span>
                    <button
                        onClick={() => {
                            setSelectedFolder('All');
                            setCourseFilter('All');
                            setSelectedFile(null);
                        }}
                        disabled={!(selectedType === 'personal' && selectedFolder !== 'All')}
                        className={`text-[15px] font-semibold capitalize truncate ${selectedType === 'personal' && selectedFolder !== 'All'
                            ? 'text-secondary hover:text-accent transition-colors'
                            : 'text-primary cursor-default'
                            }`}
                    >
                        {selectedType} {t('library.materials')}
                    </button>
                    {selectedType === 'personal' && selectedFolder !== 'All' && (
                        <>
                            <span className="text-muted text-[14px] shrink-0">/</span>
                            <span className="text-[15px] font-semibold text-primary truncate">{selectedFolder}</span>
                        </>
                    )}
                </nav>
                <div className="flex items-center gap-2 shrink-0">
                    {selectedType === 'general' && canManage && (
                        <>
                            <button onClick={() => aircraftInputRef.current?.click()} className={SECONDARY_BTN}>
                                <HiOutlineArrowUpTray className="text-[18px]" />
                                Upload Aircraft Viewer
                            </button>
                            <input
                                ref={aircraftInputRef}
                                type="file"
                                accept=".exe,application/vnd.microsoft.portable-executable,application/x-msdownload"
                                className="hidden"
                                onChange={(event) => {
                                    const selected = event.target.files?.[0];
                                    event.target.value = '';
                                    if (!selected) return;
                                    if (!selected.name.toLowerCase().endsWith('.exe')) {
                                        toast.error({ title: 'Unsupported package', body: 'Select an .exe Aircraft Viewer package.' });
                                        return;
                                    }
                                    setAircraftFile(selected);
                                    setAircraftTitle(selected.name.replace(/\.exe$/i, ''));
                                    setShowAircraftUpload(true);
                                }}
                            />
                        </>
                    )}
                    {(canUpload(selectedType, perms) && selectedType !== 'course') && (
                        <>
                            <button onClick={() => fileInputRef.current?.click()} className={PRIMARY_BTN}>
                                <HiOutlineArrowUpTray className="text-[18px]" />
                                {t('library.upload')}
                            </button>
                            <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
                        </>
                    )}
                    <button
                        onClick={() => {
                            setSelectedType(null);
                            setSelectedFile(null);
                        }}
                        className={SECONDARY_BTN}
                    >
                        <HiOutlineArrowLeft className="text-[18px]" />
                        {t('library.back')}
                    </button>
                </div>
            </div>

            {/* Toolbar: search + contextual filters */}
            <div className="card px-4 py-3 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[16px]" />
                        <input
                            type="text"
                            placeholder={t('common.search')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                    </div>

                    {/* Personal: create-folder affordance (inline-reveal, keeps the bar tidy) */}
                    {selectedType === 'personal' &&
                        (creatingFolder ? (
                            <div className="flex items-center gap-2">
                                <input
                                    autoFocus
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') createFolder();
                                        if (e.key === 'Escape') cancelCreateFolder();
                                    }}
                                    placeholder={t('library.folderNamePlaceholder')}
                                    className="w-[180px] px-3 py-2 rounded-lg border border-bd bg-surface text-primary text-sm focus:outline-none focus:border-accent"
                                />
                                <button onClick={createFolder} className={PRIMARY_BTN}>
                                    {t('library.createFolder')}
                                </button>
                                <button onClick={cancelCreateFolder} className={SECONDARY_BTN} aria-label={t('library.cancel')}>
                                    <HiOutlineXMark className="text-[16px]" />
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setCreatingFolder(true)} className={SECONDARY_BTN}>
                                <HiOutlinePlus className="text-[16px]" />
                                {t('library.newFolder')}
                            </button>
                        ))}
                </div>

                {/* Course filter chips */}
                {selectedType === 'course' && courseTabs.length > 1 && (
                    <div className="flex gap-2 flex-wrap items-center border-t border-bd pt-3">
                        {courseTabs.map((course) => (
                            <button
                                key={course}
                                onClick={() => setCourseFilter(course)}
                                className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${courseFilter === course ? PILL_ACTIVE : PILL_IDLE
                                    }`}
                            >
                                {course}
                            </button>
                        ))}
                    </div>
                )}

                {/* Personal folder chips */}
                {selectedType === 'personal' && (
                    <div className="flex gap-2 flex-wrap items-center border-t border-bd pt-3">
                        <span className="text-[11px] font-bold text-muted uppercase tracking-[0.06em] mr-1">
                            {t('library.folders')}
                        </span>
                        <button
                            onClick={() => setSelectedFolder('All')}
                            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${selectedFolder === 'All' ? PILL_ACTIVE : PILL_IDLE
                                }`}
                        >
                            {t('library.all')}
                        </button>
                        {userFolders.map((folder) => (
                            <button
                                key={folder.id}
                                onClick={() => setSelectedFolder(folder.name)}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${selectedFolder === folder.name ? PILL_ACTIVE : PILL_IDLE
                                    }`}
                            >
                                <HiOutlineFolder className="text-[15px]" />
                                {folder.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* List + details */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start lg:items-stretch lg:flex-1 lg:min-h-0">
                {/* File list card — also the drag-and-drop target */}
                <div
                    className={`card overflow-hidden min-h-[460px] lg:min-h-0 flex flex-col transition-shadow ${dragging ? 'ring-2 ring-accent' : ''
                        }`}
                    onDragOver={(e) => {
                        if (!canUpload(selectedType, perms)) return;
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                >
                    {/* List header strip */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-bd">
                        <span className="text-[13px] font-semibold text-primary">{t('library.files')}</span>
                        <span className="text-[12px] text-muted tabular-nums">
                            {visibleFiles.length} {t('library.materials')}
                        </span>
                    </div>

                    {visibleFiles.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6 py-16">
                            <div className="rounded-full bg-surface-2 p-5 text-muted">
                                <HiOutlineFolderOpen className="text-[36px]" />
                            </div>
                            <p className="text-sm font-medium text-secondary">{t('library.noFiles')}</p>
                            {canUpload(selectedType, perms) && (
                                <p className="text-[12px] text-muted max-w-[260px]">{t('library.dragDropHint')}</p>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto thin-scrollbar-light divide-y divide-[var(--border)]">
                            {visibleFiles.map((file) => {
                                const viewable = canViewDocument(file, user, perms, accessibleCourseCodes);
                                const active = selectedFile?.id === file.id;
                                return (
                                    <div
                                        key={file.id}
                                        onClick={() => setSelectedFile(file)}
                                        onDoubleClick={() => viewFile(file)}
                                        className={`px-4 py-3 flex items-center gap-4 cursor-pointer transition-colors ${active ? 'bg-accent-light' : 'hover:bg-surface-2'
                                            } ${!viewable ? 'opacity-60' : ''}`}
                                    >
                                        {/* Cover / icon */}
                                        <div className="w-12 h-12 shrink-0 rounded-lg bg-surface-2 flex items-center justify-center overflow-hidden">
                                            {file.coverImage ? (
                                                <img src={file.coverImage} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <FileIcon type={file.fileType} className="text-[26px]" />
                                            )}
                                        </div>

                                        {/* Title + uploader (+ folder for personal) */}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-primary truncate" title={file.name}>
                                                {file.name}
                                            </p>
                                            <p className="text-[12px] text-muted truncate">
                                                {t('library.by')} {file.uploadedBy || '—'}
                                                {selectedType === 'personal' && file.folder ? ` · ${file.folder}` : ''}
                                            </p>
                                        </div>

                                        {/* Type / size (hidden on small screens) */}
                                        <span className="hidden sm:inline text-[12px] font-semibold text-secondary uppercase w-12 text-center">
                                            {file.fileType || '—'}
                                        </span>
                                        <span className="hidden md:inline text-[12px] text-muted w-16 text-right tabular-nums">
                                            {formatBytes(file.fileSize)}
                                        </span>

                                        {/* Status (hidden for Course tab) */}
                                        {selectedType !== 'course' && (
                                            <>
                                                <div className="flex items-center justify-center w-[90px] shrink-0">
                                                    {file.approvedStatus && <StatusBadge status={file.approvedStatus} />}
                                                </div>
                                            </>
                                        )}
                                        <div className="flex items-center justify-center w-[130px] shrink-0">
                                            {selectedType !== 'personal' && <SummarizingStatusPill materialId={file.id} />}
                                        </div>
                                        <div className="w-40">
                                            <ProgressBar
                                                value={file.pagesRead || 0}
                                                max={file.totalPages && file.totalPages > 0 ? file.totalPages : 1}
                                                compact
                                                showLabel={!!(file.totalPages && file.totalPages > 0)} />
                                            {file.totalPages && file.totalPages > 0 ? null : (
                                                <div className="text-[10px] text-muted truncate"> No progress</div>
                                            )}
                                        </div>
                                        {/* View action */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                viewFile(file);
                                            }}
                                            disabled={!viewable}
                                            title={t('library.view')}
                                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-accent hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                        >
                                            <HiOutlineEye className="text-[20px]" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* File Details card */}
                <aside className="card overflow-hidden min-h-[460px] lg:min-h-0 flex flex-col">
                    <div className="px-5 py-3 border-b border-bd">
                        <h3 className="text-[15px] font-semibold text-primary">{t('library.fileDetails')}</h3>
                    </div>
                    {!selectedFile ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6 py-10">
                            <HiOutlineDocumentText className="text-[40px] text-muted" />
                            <p className="text-sm text-muted">{t('library.selectFilePrompt')}</p>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 flex flex-col gap-4 px-5 py-5 overflow-y-auto thin-scrollbar-light">
                            {/* Cover / big icon */}
                            <div className="w-full h-40 rounded-xl bg-surface-2 flex items-center justify-center overflow-hidden">
                                {selectedFile.coverImage ? (
                                    <img src={selectedFile.coverImage} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <FileIcon type={selectedFile.fileType} className="text-[56px]" />
                                )}
                            </div>

                            <div>
                                <p className="text-base font-bold text-primary break-words">{selectedFile.name}</p>
                                <p className="text-[12px] text-muted mt-0.5">
                                    {t('library.by')} {selectedFile.uploadedBy || '—'}
                                </p>
                            </div>

                            {selectedFile.description && (
                                <p className="text-[13px] text-secondary leading-relaxed">{selectedFile.description}</p>
                            )}

                            <dl className="flex flex-col gap-2 text-[13px]">
                                <DetailRow label={t('library.version')} value={(selectedFile.version || 1)} />
                                <DetailRow label={t('library.fileType')} value={(selectedFile.fileType || '—').toUpperCase()} />
                                <DetailRow label={t('library.fileSize')} value={formatBytes(selectedFile.fileSize)} />
                                <DetailRow label={t('library.dateAdded')} value={selectedFile.uploadedAt.slice(0, 10)} />
                                <DetailRow label={t('library.category')} value={selectedFile.category} />
                                {selectedType !== 'course' && (
                                    <DetailRow
                                        label={t('library.approvedStatus')}
                                        value={selectedFile.approvedStatus ? <StatusBadge status={selectedFile.approvedStatus} /> : '—'}
                                    />
                                )}
                            </dl>

                            {/* {selectedFile && <SummarizingPill materialId={selectedFile.id} large />} */}

                            {/* Primary action */}
                            <button
                                onClick={() => viewFile(selectedFile)}
                                disabled={!canViewDocument(selectedFile, user, perms, accessibleCourseCodes)}
                                className={`${PRIMARY_BTN} w-full justify-center ${!canViewDocument(selectedFile, user, perms, accessibleCourseCodes)
                                    ? 'opacity-40 cursor-not-allowed'
                                    : ''
                                    }`}
                            >
                                <HiOutlineEye className="text-[18px]" />
                                {t('library.open')}
                            </button>

                            {/* Personal: move to folder */}
                            {selectedType === 'personal' && (
                                <label className="text-[13px] text-secondary">
                                    {t('library.folder')}
                                    <select
                                        value={selectedFile.folder || ''}
                                        onChange={(e) => changeFolder(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 rounded-xl border border-bd bg-surface text-primary"
                                    >
                                        <option value="">{t('library.noFolder')}</option>
                                        {userFolders.map((folder) => (
                                            <option key={folder.id} value={folder.name}>
                                                {folder.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}

                            {/* Manager: approve / reject pending (hidden for Course tab) */}
                            {selectedType !== 'course' && canManage && selectedFile.approvedStatus === 'pending' && (
                                <div className="flex gap-2 pt-2 border-t border-bd">
                                    <button
                                        onClick={() => setApproval('approved')}
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold"
                                        style={{ background: STATUS_COLORS.approved.bg, color: STATUS_COLORS.approved.text }}
                                    >
                                        {t('library.approve')}
                                    </button>
                                    <button
                                        onClick={() => setApproval('rejected')}
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold"
                                        style={{ background: STATUS_COLORS.rejected.bg, color: STATUS_COLORS.rejected.text }}
                                    >
                                        {t('library.reject')}
                                    </button>
                                </div>
                            )}

                            {/* Delete — owner of the file or a manager. Backend enforces the same rule. (hidden for Course tab) */}
                            {selectedType !== 'course' && (canManage || selectedFile.uploadedBy === user.full_name) && (
                                <button
                                    onClick={deleteFile}
                                    className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold mt-1"
                                    style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}
                                >
                                    <HiOutlineTrash className="text-[16px]" />
                                    {t('library.delete')}
                                </button>
                            )}
                        </div>
                    )}
                </aside>
            </div>

            {/* Upload modal */}
            {showUpload && (
                <Modal
                    title={t('library.uploadFile')}
                    onClose={() => {
                        setUploadError(null);
                        setShowUpload(false);
                    }}
                >
                    {/* Scrollable body */}
                    <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar-light px-6 py-5 flex flex-col gap-5">
                        {/* Selected-file summary — shows what you're about to upload */}
                        <div className="flex items-center gap-3 p-3 rounded-xl border border-bd bg-surface-2">
                            <div className="w-12 h-12 shrink-0 rounded-lg bg-surface flex items-center justify-center">
                                <FileIcon type={metadata.fileType || ''} className="text-[26px]" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-primary truncate" title={uploadFile?.name}>
                                    {uploadFile?.name || metadata.name}
                                </p>
                                <p className="text-[12px] text-muted tabular-nums">
                                    {(metadata.fileType || '—').toUpperCase()} · {formatBytes(uploadFile?.size)}
                                </p>
                            </div>
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-accent-light text-accent capitalize shrink-0">
                                {selectedType}
                            </span>
                        </div>

                        {/* Title (editable) */}
                        <Labeled label={t('library.title')}>
                            <input
                                value={metadata.name || ''}
                                onChange={(e) => updateMetadata({ name: e.target.value })}
                                placeholder={t('library.titlePlaceholder')}
                                className={FIELD_CLS}
                            />
                        </Labeled>

                        {/* Category (optional grouping) */}
                        <Labeled label={t('library.category')} hint={t('library.optional')}>
                            <input
                                value={metadata.category || ''}
                                onChange={(e) => updateMetadata({ category: e.target.value })}
                                className={FIELD_CLS}
                            />
                        </Labeled>
                        <Labeled label={t('library.coverImage')} hint={t('library.optional')}>
                            <div className="flex gap-2 items-center">
                                {/* Preview of selected cover image (if any) */}
                                {metadata.coverImage ? (
                                    <img
                                        src={metadata.coverImage}
                                        alt="Cover preview"
                                        className="h-12 w-12 object-cover rounded"
                                    />
                                ) : (
                                    <div className="h-12 w-12 bg-surface-2 flex items-center justify-center rounded">
                                        <HiOutlinePhoto className="text-muted" />
                                    </div>
                                )}
                                <input
                                    ref={coverInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            // Compress large images before storing as base64
                                            compressImageToDataUrl(file, 200).then((dataUrl) => {
                                                updateMetadata({ coverImage: dataUrl });
                                            });
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => coverInputRef.current?.click()}
                                    className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0"
                                >
                                    {t('library.select')}
                                </button>
                            </div>
                        </Labeled>

                        {selectedType === 'course' && (
                            <>
                                <Labeled label={t('library.course')}>
                                    <select
                                        value={metadata.course || ''}
                                        onChange={(e) => updateMetadata({ course: e.target.value })}
                                        required
                                        className={FIELD_CLS}
                                    >
                                        <option value="">{t('library.selectCourse')}</option>
                                        {accessCourses.map((course) => (
                                            <option key={course.id} value={course.title}>
                                                {course.title}
                                            </option>
                                        ))}
                                    </select>
                                </Labeled>
                                <Labeled label={t('library.topic')} hint={t('library.optional')}>
                                    <input
                                        value={metadata.topic || ''}
                                        onChange={(e) => updateMetadata({ topic: e.target.value })}
                                        className={FIELD_CLS}
                                    />
                                </Labeled>
                            </>
                        )}

                        {selectedType === 'personal' && (
                            <Labeled label={t('library.folder')} hint={t('library.optional')}>
                                <select
                                    value={metadata.folder || ''}
                                    onChange={(e) => updateMetadata({ folder: e.target.value })}
                                    className={FIELD_CLS}
                                >
                                    <option value="">{t('library.selectFolder')}</option>
                                    {userFolders.map((folder) => (
                                        <option key={folder.id} value={folder.name}>
                                            {folder.name}
                                        </option>
                                    ))}
                                </select>
                            </Labeled>
                        )}

                        {uploadError && (
                            <div
                                className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm"
                                style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}
                            >
                                <HiOutlineExclamationCircle className="text-[16px] shrink-0 mt-px" />
                                <span>{uploadError}</span>
                            </div>
                        )}
                    </div>

                    {/* Pinned footer — always visible, no scrolling to reach Save */}
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-bd bg-surface shrink-0">
                        <button
                            onClick={() => {
                                setUploadError(null);
                                setShowUpload(false);
                            }}
                            className={SECONDARY_BTN}
                        >
                            {t('library.cancel')}
                        </button>
                        <button onClick={saveUpload} className={PRIMARY_BTN}>
                            <HiOutlineArrowUpTray className="text-[16px]" />
                            {t('library.saveUpload')}
                        </button>
                    </div>
                </Modal>
            )}
            {showAircraftUpload && (
                <Modal title="Upload Aircraft Viewer" onClose={resetAircraftUpload}>
                    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-4">
                        <p className="text-sm text-secondary">
                            Upload a 7-Zip-compatible self-extracting .exe containing index.htm (or index.html) and the complete
                            Aircraft Viewer web assets. The executable is inspected and extracted, never run.
                        </p>
                        <Labeled label="Package">
                            <div className={FIELD_RO_CLS}>{aircraftFile?.name || 'No file selected'}</div>
                        </Labeled>
                        <Labeled label="Display title">
                            <input
                                value={aircraftTitle}
                                onChange={(event) => setAircraftTitle(event.target.value)}
                                className={FIELD_CLS}
                                disabled={aircraftUploading}
                            />
                        </Labeled>
                        <Labeled label="Description" hint={t('library.optional')}>
                            <textarea
                                value={aircraftDescription}
                                onChange={(event) => setAircraftDescription(event.target.value)}
                                className={`${FIELD_CLS} min-h-24 resize-y`}
                                disabled={aircraftUploading}
                            />
                        </Labeled>
                        {aircraftError && (
                            <div className="rounded-lg bg-[var(--danger-light)] px-3 py-2 text-sm text-[var(--danger)]">
                                {aircraftError}
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-bd bg-surface shrink-0">
                        <button onClick={resetAircraftUpload} className={SECONDARY_BTN} disabled={aircraftUploading}>
                            {t('library.cancel')}
                        </button>
                        <button onClick={saveAircraftUpload} className={PRIMARY_BTN} disabled={aircraftUploading || !aircraftFile}>
                            <HiOutlineArrowUpTray className="text-[16px]" />
                            {aircraftUploading ? 'Validating and extracting…' : 'Upload and extract'}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Local presentational sub-components
// ---------------------------------------------------------------------------

/** A "label … value" row in the File Details panel. */
function DetailRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{label}</dt>
            <dd className="text-primary font-medium text-right">{value}</dd>
        </div>
    );
}

/** A labelled form field wrapper used in the upload modal. */
function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <label className="block text-[13px] font-semibold text-secondary">{label}</label>
                {hint && <span className="text-[11px] text-muted">{hint}</span>}
            </div>
            {children}
        </div>
    );
}

/** Centered overlay dialog with a header bar and a close button. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-surface rounded-2xl shadow-2xl w-[92%] max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-bd flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-semibold text-primary truncate">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-secondary hover:text-primary transition-colors -mr-1 p-1 rounded-lg hover:bg-surface-2"
                    >
                        <HiOutlineXMark className="text-[22px]" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
