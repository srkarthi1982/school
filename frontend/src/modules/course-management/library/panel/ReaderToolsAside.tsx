/**
 * ReaderToolsAside - the shared right-hand "reading-assistant" tools rail.
 * Buttons are enabled/disabled based on summary data availability.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
    HiOutlineBookOpen,
    HiOutlineChatBubbleOvalLeftEllipsis,
    HiOutlineNewspaper,
    HiOutlineShare,
    HiOutlineSpeakerWave,
} from "react-icons/hi2";
import type { IconType } from "react-icons";
import { useReaderContext, type ReaderToolKey } from "./ReaderContext";
export type { ReaderToolKey };
import { useLibrarySummaryStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../../../infra/locales/I18nContext";
import { useLibraryStore, User } from '../store';
import useAuthStore, { selectUser } from '../../../../infra/auth/useAuthStore';
import { updateMaterialUserProgressApiV1LibraryProgressMaterialIdUserIdPut } from '../../../../api/generated/sdk.gen';

type BtnTool = { key: ReaderToolKey; icon: IconType; enabled: boolean };

export default function ReaderToolsAside({
    onToolClick = () => {},
    activeTool,
}: {
    onToolClick?: (key: ReaderToolKey) => void;
    activeTool?: ReaderToolKey;
}) {
    const { t } = useI18n();
    const user = useAuthStore(selectUser) as unknown as User | null;
    const [notice, setNotice] = useState('');
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { materialId } = useReaderContext();
    const { selectedFile, setSelectedFile, setFileVersions, fileVersions } = useLibraryStore();
    const { summary, mindmap, voiceNarrationText } = useLibrarySummaryStore(
        useShallow(s => ({
            summary: s.summary,
            mindmap: s.mindmap,
            voiceNarrationText: s.voiceNarrationText,
        }))
    );

    const handleMarkCompleted = async () => {
        if (selectedFile?.totalPages && selectedFile?.id) {
            const { error } = await updateMaterialUserProgressApiV1LibraryProgressMaterialIdUserIdPut({
                path: { material_id: Number(selectedFile.id), user_id: (user?.id ?? 0) },
                body: {
                    pages_read: selectedFile.totalPages
                } as any,
            });
            if (!error) {
                const updatedFile = {
                    ...selectedFile,
                    pagesRead: selectedFile.totalPages,
                    totalPages: selectedFile.totalPages,
                };
                setSelectedFile(updatedFile);
                setFileVersions(fileVersions.map((f) => (f.id === selectedFile.id ? updatedFile : f)));
            }
        }
    };

    const handleMarkNotCompleted = async () => {
        if (selectedFile?.totalPages && selectedFile?.id) {
            const { error } = await updateMaterialUserProgressApiV1LibraryProgressMaterialIdUserIdPut({
                path: { material_id: Number(selectedFile.id), user_id: (user?.id ?? 0) },
                body: {
                    pages_read: 0
                } as any,
            });
            if (!error) {
                const updatedFile = {
                    ...selectedFile,
                    pagesRead: 0,
                    totalPages: selectedFile.totalPages,
                };
                setSelectedFile(updatedFile);
                setFileVersions(fileVersions.map((f) => (f.id === selectedFile.id ? updatedFile : f)));
            }
        }
    };



    const tools: BtnTool[] = useMemo(() => [
        { key: "filePreview", icon: HiOutlineNewspaper, enabled: true },
        // Chat about this document — always available (works for library
        // materials AND lesson material files, unlike the summary tools).
        { key: "docChat", icon: HiOutlineChatBubbleOvalLeftEllipsis, enabled: true },
        { key: "mindMap", icon: HiOutlineShare, enabled: !!(mindmap?.markdown) },
        {
            key: "voiceNarration",
            icon: HiOutlineSpeakerWave,
            enabled: !!(voiceNarrationText && (voiceNarrationText as any[]).length > 0),
        },
        { key: "quickSummary", icon: HiOutlineBookOpen, enabled: !!(summary?.overall_summary) },
    ], [summary, mindmap, voiceNarrationText]);

    const onClick = useCallback((tool: BtnTool) => {
        if (!tool.enabled) return;
        onToolClick(tool.key);
    }, [onToolClick]);

    return (
        <aside className="w-44 shrink-0 border-l border-bd bg-surface p-3 flex flex-col gap-2 overflow-y-auto thin-scrollbar-light">
            {tools.map(tool => {
                const Icon = tool.icon;
                const disabled = !tool.enabled;
                const isActive = activeTool === tool.key;
                let cls = "w-full rounded-xl border px-3 py-4 flex flex-col items-center gap-2 transition-colors text-[11px] font-semibold ";
                if (disabled) {
                    cls += "bg-surface-3 text-surface-4 border-surface-3 cursor-not-allowed opacity-50";
                } else if (isActive) {
                    cls += "bg-surface-2 border-accent text-accent border-accent";
                } else {
                    cls += "bg-surface-2 text-secondary border-bd hover:text-accent hover:border-accent";
                }
                return (
                    <button
                        key={tool.key}
                        disabled={disabled}
                        onClick={() => onClick(tool)}
                        className={cls}
                        title={disabled
                            ? t("library.noSummaryAvailable")
                            : t(`library.${tool.key}` as any)
                        }
                    >
                        <Icon className="text-[24px]" />
                        <span className="text-center leading-tight">{t(`library.${tool.key}` as any)}</span>
                    </button>
                );
            })}
			<div className="flex-1"></div>
            <button
                onClick={handleMarkCompleted}
                className="w-full rounded-xl border border-bd bg-surface-2 px-3 py-4 flex flex-col items-center gap-2 text-secondary hover:text-accent hover:border-accent transition-colors mt-4"
            >
                <span className="text-[11px] font-semibold text-center leading-tight">Mark as Completed</span>
            </button>
            <button
                onClick={handleMarkNotCompleted}
                className="w-full rounded-xl border border-bd bg-surface-2 px-3 py-4 flex flex-col items-center gap-2 text-secondary hover:text-accent hover:border-accent transition-colors"
            >
                <span className="text-[11px] font-semibold text-center leading-tight">Mark as Not Completed</span>
            </button>
        </aside>
    );
}
