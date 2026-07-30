import '../../../api/client'   // ← ALWAYS first: configures baseUrl + auth interceptor
import { client } from '../../../api/client'
import { create, createStore } from 'zustand'
import * as api from '../../../api/generated';
import type { CourseMasterResponse, MaterialSummaryMindmapRead, MaterialSummaryRead, MaterialSummaryVoiceNarrationRead } from '../../../api/generated/types.gen';
import { getSummaryApiV1LibrarySummaryMaterialIdGet, getSummaryMindmapApiV1LibrarySummaryMindmapMaterialIdGet, getSummaryVoiceNarrationApiV1LibrarySummaryNarrationMaterialIdGet } from '../../../api/generated';

export type MaterialType = 'general' | 'course' | 'personal' | 'course_master';
export type UserRole = 'admin' | 'teacher' | 'student';
export type ApprovedStatus = 'approved' | 'rejected' | 'pending' | 'unknown';

export interface User {
    id: number;
    username: string;
    full_name: string;
    //role: UserRole;
    roles: UserRole | string | Array<UserRole | string>;
    usercourses: string[];
    is_teacher?: boolean;
    is_admin?: boolean;
    is_head_of_class?: boolean;
}

export interface FileVersion {
    id: string;
    fileId: string;
    name: string;
    version: number;
    category: string;
    materialType: MaterialType;
    course?: string;
    topic?: string;
    folder?: string;
    fileType: string;
    fileSize?: number;
    uploadedBy: string;
    uploadedAt: string;
    date: string;
    description?: string;
    fileUrl?: string;
    previewUrl?: string;
    coverImage?: string;
    approvedStatus?: ApprovedStatus;
    summary_ts: string | null;
    pagesRead?: number;
    totalPages?: number;
    aircraftViewer?: AircraftViewerMetadata;
}

export type AircraftViewerMetadata = {
    content_kind: 'aircraft_viewer';
    viewer_package_id: string;
    viewer_entrypoint: string;
    viewer_relative_root?: string;
    source_filename?: string;
};

export interface FolderItem {
    id: string;
    name: string;
    createdBy: string;
}

const intialMetadata: Partial<FileVersion> = {
    category: '',
    course: '',
    topic: '',
    folder: '',
    fileId: '',
    coverImage: ''
};

interface LibraryState {
    selectedType: MaterialType | null;
    selectedFile: FileVersion | null;
    fileVersions: FileVersion[];
    folders: FolderItem[];
    showPreview: boolean;
    showUpload: boolean;
    dragging: boolean;
    courseFilter: string;
    selectedFolder: string;
    newFolderName: string;
    uploadFile: File | null;
    previewHtml: string;
    courses: CourseMasterResponse[];
    metadata: Partial<FileVersion>;
    selectedCourse: string;
    onCourseChanged: any;
    getCourses: () => Promise<CourseMasterResponse[]>;
    setFileVersions: (file: FileVersion[]) => void;
    setFolders: (folder: FolderItem[]) => void;
    setSelectedType: (type: MaterialType | null) => void;
    setSelectedFile: (file: FileVersion | null) => void;
    addFileVersion: (file: FileVersion) => void;
    addFolder: (folder: FolderItem) => void;
    moveFileToFolder: (field: string, folderName: string) => void;
    deleteFileVersion: (id: string) => void;
    setShowPreview: (show: boolean) => void;
    setShowUpload: (show: boolean) => void;
    setDragging: (dragging: boolean) => void;
    setCourseFilter: (course: string) => void;
    setSelectedFolder: (folder: string) => void;
    setNewFolderName: (name: string) => void;
    setUploadFile: (file: File | null) => void;
    setPreviewHtml: (html: string) => void;
    setMetadata: (metadata: Partial<FileVersion>) => void;
    updateMetadata: (updates: Partial<FileVersion>) => void;
    resetUploadState: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
    selectedType: null,
    selectedFile: null,
    fileVersions: [],
    folders: [],
    showPreview: false,
    showUpload: false,
    dragging: false,
    courseFilter: 'All',
    selectedFolder: 'All',
    newFolderName: '',
    uploadFile: null,
    metadata: intialMetadata,
    previewHtml: '',
    selectedCourse: '',
    getCourses: async () => {
        const response = (await api.listCourseMastersApiV1CourseMastersGet({ query: { sort_by: 'description', sort_order: 'asc' } })).data;
        if (response?.success) {
            set({ courses: response.data });
            return response.data;
        }
        return [];
    },
    courses: [],
    onCourseChanged: (selectedCourse: string) => set({ selectedCourse }),
    setFileVersions: (files: FileVersion[]) => set({ fileVersions: files }),
    setFolders: (folders: FolderItem[]) => set({ folders }),
    setSelectedType: (type: MaterialType | null) =>
        set({
            selectedType: type,
        }),
    setSelectedFile: (file: FileVersion | null) =>
        set({
            selectedFile: file,
        }),
    addFileVersion: (file: FileVersion) =>
        set((state) => ({
            fileVersions: [
                ...state.fileVersions, file
            ]
        })),
    addFolder: (folder: FolderItem) =>
        set((state) => ({
            folders: [...state.folders, folder],
        })),
    moveFileToFolder: (field: string, folderName: string) =>
        set((state) =>
        ({
            fileVersions: state.fileVersions.map((file) => file.id === field ? {
                ...file,
                folder: folderName
            } : file),
            selectedFile: state.selectedFile
        })),
    deleteFileVersion: (id: string) => set((state) =>
    ({
        fileVersions: state.fileVersions.filter((x) => x.id !== id),
    })),
    setShowPreview: (show: boolean) => set({ showPreview: show }),
    setShowUpload: (show: boolean) => set({ showUpload: show }),
    setDragging: (dragging: boolean) => set({ dragging }),
    setCourseFilter: (course: string) => set({ courseFilter: course }),
    setSelectedFolder: (folder: string) => set({ selectedFolder: folder }),
    setNewFolderName: (name: string) => set({ newFolderName: name }),
    setUploadFile: (file: File | null) => set({ uploadFile: file }),
    setMetadata: (metadata: Partial<FileVersion>) => set({ metadata }),
    setPreviewHtml: (html: string) => set({ previewHtml: html }),
    updateMetadata: (updates: Partial<FileVersion>) => set((state) => ({
        metadata: { ...state.metadata, ...updates },
    })),

    resetUploadState: () => set({
        uploadFile: null,
        metadata: intialMetadata,
        showUpload: false,
    }),
}));

interface LibrarySummaryState {
    summary?: MaterialSummaryRead
    voiceNarrationText?: Array<any> | null | undefined
    mindmap?: MaterialSummaryMindmapRead
    // summarizingIds: Set<number>
    getSummary: (materialId: number) => Promise<void>
    getVoiceNarrationText: (materialId: number) => Promise<void>
    getMindmap: (materialId: number) => Promise<void>
    summarizeMaterial: (materialId: number) => Promise<void>
    refreshAll: () => Promise<void>
    pollStatus: () => Promise<void>
}

export const useLibrarySummaryStore = create<LibrarySummaryState>((set, get) => ({
    summary: undefined,
    voiceNarrationText: [],
    mindmap: undefined,
    // summarizingIds: new Set(),
    getSummary: async (materialId) => {
        const { data } = await getSummaryApiV1LibrarySummaryMaterialIdGet({ path: { material_id: materialId } })
        if ((data as any)?.success) {
            set({ summary: data?.data })
        } else {
            set({ summary: undefined })
        }
    },
    getVoiceNarrationText: async (materialId) => {
        const { data } = await getSummaryVoiceNarrationApiV1LibrarySummaryNarrationMaterialIdGet({ path: { material_id: materialId } })
        if ((data as any)?.success) {
            set({ voiceNarrationText: data?.data.narration_text })
        } else {
            set({ voiceNarrationText: undefined })
        }
    },
    getMindmap: async (materialId) => {
        const { data } = await getSummaryMindmapApiV1LibrarySummaryMindmapMaterialIdGet({ path: { material_id: materialId } })
        if ((data as any)?.success) {
            set({ mindmap: data?.data })
        } else {
            set({ mindmap: undefined})
        }
    },
    summarizeMaterial: async (materialId) => {
        // const newIds = new Set(get().summarizingIds);
        // newIds.add(materialId);
        // set({ summarizingIds: newIds });
        try {
            await client.post({
                url: `/api/v1/library/summarize/${materialId}`,
            });

            // await Promise.all([
            //     get().getSummary(materialId),
            //     get().getMindmap(materialId),
            //     get().getVoiceNarrationText(materialId),
            // ]);
        } finally {
            // newIds.delete(materialId);
            // set({ summarizingIds: newIds });
        }
    },
    refreshAll: async () => {
        const { summary, mindmap } = get();
        const mid = summary?.id ?? mindmap?.id;
        if (mid) {
            await Promise.all([
                get().getSummary(mid),
                get().getMindmap(mid),
                get().getVoiceNarrationText(mid),
            ]);
        }
    },
    pollStatus: async () => {

    }
}))
