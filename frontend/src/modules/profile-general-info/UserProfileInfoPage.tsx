import { useShallow } from "zustand/react/shallow";
import { useProfileInfoStore } from "./store";
import { HiKey, HiOutlineBackward, HiOutlineExclamationCircle, HiOutlinePencilSquare, HiOutlineUserCircle, HiOutlineClipboardDocumentList, HiOutlineDocumentText, HiOutlineClock, HiOutlineAdjustmentsHorizontal } from "react-icons/hi2";
import { useI18n } from "../../infra/locales/I18nContext";
import SectionHeader from "../../infra/shared/components/SectionHeader";
import EmptyState from "../../infra/shared/components/EmptyState";
import React, { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useAuthStore, { refreshUserInfo, selectUser, selectUserPermissions } from "../../infra/auth/useAuthStore";
import { UserProfileUpdate } from "../../api/generated";
import { useLocation, useNavigate } from "react-router-dom";
import DateTimePicker from "../../infra/shared/components/DateTimePicker";
import { CountryLookup } from "../../infra/shared/components/CountryLookup";
import DayView from "../dashboard-scheduling/schedule-management/components/DayView";
import StudentOverviewView from "../dashboard-scheduling/progress-tracker/studentView/StudentOverviewView";
import OverviewView from "../dashboard-scheduling/progress-tracker/otherView/OverviewView";
import type { StudentViewMode, ViewMode } from "../dashboard-scheduling/progress-tracker/store";
import useScheduleManagementStore from "../dashboard-scheduling/schedule-management/store";

function formatDate(strDate?: string | null): string {
    if (!strDate) return ''

    const date = new Date(strDate)
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day}-${month}-${year}`
}

function minutesToTimeString(totalMinutes?: number): string {
    if (!totalMinutes) return ''

    const minutes = Math.abs(totalMinutes)
    const hr = Math.floor(minutes / 60)
    const mins = minutes % 60

    return `${hr.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

interface UserProfileCardProps {
    children: ReactNode
    title: string
    /** Grid placement / extra classes, e.g. "lg:col-span-3". */
    className?: string
    /** Override the body padding (e.g. "p-0" for edge-to-edge tables). */
    bodyClassName?: string
    statusIconColor?: string
    /** Right-aligned controls in the card header (e.g. a column-settings menu). */
    headerActions?: ReactNode
}

const UserProfileCard: React.FC<UserProfileCardProps> = ({ title, statusIconColor, className = '', bodyClassName, headerActions, children }) => {
    return (
        <div className={`card p-0 overflow-hidden flex flex-col ${className}`}>
            <div
                className="px-3.5 py-1.5 flex items-center gap-2 shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
            >
                <p className="text-[11px] font-bold text-white uppercase tracking-[0.05em]">{title}</p>
                {statusIconColor && <StatusIcon color={statusIconColor} />}
                {headerActions && <div className="ms-auto flex items-center">{headerActions}</div>}
            </div>
            <div className={bodyClassName ?? "flex flex-col gap-3 text-[13px] px-4 py-3 flex-1"}>
                {children}
            </div>
        </div>
    )
}

interface StatusIconProps {
    color: string
    size?: number
}

const StatusIcon: React.FC<StatusIconProps> = ({ color, size = 15 }) => {
    return (
        <div style={{ borderRadius: `${size}px`, backgroundColor: color, color: color, height: size, width: size }} />
    )
}

interface StatusTagProps {
    color: 'red' | 'green',
    title?: string
    className?: string
}

const StatusTagColors: Record<'red' | 'green', { bg: string, fg: string }> = {
    green: { bg: 'rgba(34,197,94,0.10)', fg: '#16A34A' },
    red: { bg: 'rgba(220,38,38,0.10)', fg: '#DC2626' },
}

const StatusTag: React.FC<StatusTagProps> = ({ color, title, className }) => {
    const statusColor = StatusTagColors[color]
    const _className = 'rounded-full font-semibold shrink-0 px-[20px] py-[3px] text-[12px] ' + className
    return (
        <span className={_className} style={{ background: statusColor.bg, color: statusColor.fg }}>
            {title}
        </span>
    )
}

const CircularImage: React.FC<{ photo: string | null | undefined, fullName: string }> = ({ photo, fullName }) => {
    const names = fullName.trim().split(/\s+/);

    let firstLast = ''
    if (names.length > 0 && names[0].length > 0) {
        firstLast = `${names[0][0]}${names[names.length - 1][0]}`
    }

    return (
        <div className="w-[56px] h-[56px] rounded-full flex items-center justify-center overflow-hidden shrink-0"
            style={{ background: 'var(--navy)' }}
        >
            {!photo && <label className="text-[20px] font-bold text-white">{firstLast}</label>}
            {photo && (
                <img src={`data:image/png;base64,${photo}`} />
            )}
        </div>

    )
}

const LabelValueField: React.FC<{ label: string, value: string | null | undefined, separator?: string, valueClassName?: string }> = ({ label, value, separator = ":", valueClassName }) => {
    const labelClassName = 'w-[88px] shrink-0 text-start text-[10px] font-bold text-muted uppercase tracking-[0.04em]'
    const _valueClassName = 'text-[12px] text-primary leading-tight flex-1 min-w-0 truncate ' + (valueClassName ?? '')
    return (
        <div className="flex items-center gap-1.5">
            <div className={labelClassName}>{`${label}${separator}`}</div>
            <div className={_valueClassName} title={typeof value === 'string' ? value : undefined}>{value ? value : <span className="text-muted">—</span>}</div>
        </div>
    )
}

type CurrencyCol = { key: string; labelKey: string; center?: boolean; render: (item: any) => ReactNode }
const CURRENCY_COLUMNS: CurrencyCol[] = [
    { key: 'currency', labelKey: 'profile.currency', render: i => i.currency },
    { key: 'category', labelKey: 'profile.category', render: i => i.category },
    { key: 'type', labelKey: 'profile.type', render: i => i.type },
    { key: 'period', labelKey: 'profile.period', render: i => i.period },
    { key: 'lastPerformed', labelKey: 'profile.lastPerformed', render: i => formatDate(i.lastPerformed) },
    { key: 'score', labelKey: 'profile.score', render: i => i.score },
    { key: 'nextDue', labelKey: 'profile.nextDue', render: i => formatDate(i.nextDue) },
    { key: 'extendedTo', labelKey: 'profile.extendedTo', render: i => formatDate(i.extendedTo) },
    { key: 'daysRemaining', labelKey: 'profile.daysRemaining', render: i => i.daysRemaining },
    { key: 'status', labelKey: 'profile.status', center: true, render: i => <div className="flex justify-center"><StatusIcon color={i.status} /></div> },
]
const DEFAULT_CURRENCY_COLS = ['currency', 'type', 'lastPerformed']

function ColumnSettings({ columns, visible, onToggle, label }: { columns: CurrencyCol[]; visible: string[]; onToggle: (key: string) => void; label: (k: string) => string }) {
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
    const btnRef = useRef<HTMLButtonElement>(null)
    const toggleOpen = () => {
        if (!open) {
            const r = btnRef.current?.getBoundingClientRect()
            if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
        }
        setOpen(o => !o)
    }
    return (
        <>
            <button ref={btnRef} type="button" onClick={toggleOpen} className="text-white/70 hover:text-white p-0.5 bg-transparent border-none cursor-pointer flex items-center" title="Columns">
                <HiOutlineAdjustmentsHorizontal className="text-[15px]" />
            </button>
            {open && pos && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="fixed z-50 w-52 card p-1.5 flex flex-col gap-0.5 shadow-lg" style={{ top: pos.top, right: pos.right }}>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-2 py-1">Columns</p>
                        {columns.map(c => {
                            const checked = visible.includes(c.key)
                            const locked = visible.length <= 1 && checked
                            return (
                                <label key={c.key} className={`flex items-center gap-2 px-2 py-1 rounded-md text-[12px] text-primary ${locked ? 'opacity-50' : 'hover:bg-surface-2 cursor-pointer'}`}>
                                    <input type="checkbox" checked={checked} disabled={locked} onChange={() => onToggle(c.key)} className="accent-[var(--accent)] w-3.5 h-3.5" />
                                    {label(c.labelKey)}
                                </label>
                            )
                        })}
                    </div>
                </>
            )}
        </>
    )
}

export default function UserProfileInfoPage() {
    const { t } = useI18n();
    const fetchSchedule = useScheduleManagementStore(state => state.fetch);
    const fetchMyCourses = useScheduleManagementStore(state => state.fetchMyCourses);
    const selectCourse = useScheduleManagementStore(state => state.selectCourse);
    const entries = useScheduleManagementStore(state => state.entries);
    const myCourses = useScheduleManagementStore(state => state.myCourses);
    const scheduleLoaded = useScheduleManagementStore(state => state.loaded);
    // const coursesLoaded = useScheduleManagementStore(state => state.coursesLoaded);

    useEffect(() => {
        fetchSchedule();
        fetchMyCourses();
    }, []);

    const navigate = useNavigate();
    const activeUser = useAuthStore(selectUser);
    const refreshUser = useAuthStore(refreshUserInfo)
    const { user: forUser, toEdit } = useLocation().state || { user: null, toEdit: false }
    const [editProfile, setEditProfile] = useState<boolean>(false);
    const [refresh, setRefresh] = useState<boolean>(false);
    const [changePassword, setChangePassword] = useState(false);
    const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
    const [currencyCols, setCurrencyCols] = useState<string[]>(DEFAULT_CURRENCY_COLS)
    const toggleCurrencyCol = (key: string) => setCurrencyCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
    const visibleCurrencyCols = CURRENCY_COLUMNS.filter(c => currencyCols.includes(c.key))
    const user = forUser ?? activeUser
    const isFromOutside = !!forUser
    const isEditingForOtherUser = toEdit && forUser && forUser.username !== activeUser?.username

    useEffect(() => {
        if (selectedCourseId === null && myCourses.length > 0) {
            setSelectedCourseId(myCourses[0].id ?? null);
        }
    }, [myCourses, selectedCourseId]);

    useEffect(() => {
        if (selectedCourseId !== null) {
            selectCourse(selectedCourseId);
            //fetchSchedule();
        }
    }, [selectedCourseId]);

    const { userProfile, getProfileInfo, reset, isLoaded, update } = useProfileInfoStore(useShallow(s => ({
        userProfile: s.userProfile,
        isLoaded: s.isLoaded,
        getProfileInfo: s.getProfileInfo,
        reset: s.reset,
        update: s.update
    })))
    const { personalInformation, rank, command, qualification, platforms, fitness, airf, experience, currency, teachCourses } = userProfile;
    const filteredCourses = selectedCourseId
        ? (teachCourses ?? []).filter(c => c.id === selectedCourseId)
        : (teachCourses ?? []);
    const permissions = useAuthStore(selectUserPermissions);
    const handleDrillInto = (view: ViewMode | StudentViewMode) => {
        navigate('/dashboard-scheduling/progress-tracker', {
            state: {
                viewMode: view,
                perspective: permissions.has('student:read') ? 'student' : 'other',
                origin: 'profile'
            }
        });
    };
    const hasScheduleView = permissions.has('teacher:read') || permissions.has('student:read');

    const onEditClose = (refresh: boolean = false) => {
        setEditProfile(false);
        if (isEditingForOtherUser) {
            navigate(-1)
            return;
        }
        if (refresh) {
            (async () => await refreshUser())()
            setRefresh(r => !r)
        }
    }

    useEffect(() => {
        // console.log('xx', forUser);
        (async () => {
            if (user) {
                await getProfileInfo(user?.username)
                if (isEditingForOtherUser) {
                    setEditProfile(true)
                }
            }
        })()
        return () => reset()
    }, [refresh, isFromOutside])
    const showOverview = permissions.has('progress_tracker:teacher') || permissions.has('progress_tracker:admin')

    return (
        <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
            <SectionHeader icon={<HiOutlineUserCircle />} title={t('nav.profileGeneralInfo.title')} divider={false} />
            <div className="card px-4 py-2.5 flex flex-wrap items-center gap-3 shrink-0">
                <CircularImage fullName={personalInformation.fullName} photo={personalInformation.photo} />
                <div className="flex-1 min-w-0">
                    <h3 className="text-[16px] font-bold text-primary tracking-[-0.02em] uppercase">
                        {personalInformation.fullName}
                    </h3>
                    <p className="text-[13px] text-muted mt-0.5 flex gap-2 py-0.5 items-center">
                        {
                            isLoaded && !fitness && (
                                <>
                                    <label>{qualification}</label>
                                    <label>·</label>
                                    <label>{platforms[0]}</label>
                                </>
                            )
                        }
                        {
                            isLoaded && fitness && (
                                <>
                                    <label>{qualification}</label>
                                    <label>·</label>
                                    <label>{platforms[0]}</label>
                                    <label>·</label>
                                    <StatusTag color={fitness?.status == 'Fit' ? 'green' : 'red'} title={fitness?.status} className="uppercase" />
                                    <label>·</label>
                                    <StatusTag color={fitness?.isoPrep == 'Validated' ? 'green' : 'red'} title={`ISOPREP ${fitness?.isoPrep}`} />
                                </>
                            )

                        }

                    </p>
                </div>
                {
                    !isFromOutside && (
                        <div className="flex items-center gap-2 ms-auto">
                            {
                                'LDAP' !== user.auth_provider && (
                                    <button
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] font-semibold text-sm bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                        data-guide="profile:change-password"
                                        onClick={() => setChangePassword(true)}
                                    >
                                        <HiKey className="text-[13px]" />
                                        {t("profile.changePassword")}
                                    </button>
                                )
                            }
                            <button
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] font-semibold text-sm bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                data-guide="profile:edit"
                                onClick={() => setEditProfile(true)}
                            >
                                <HiOutlinePencilSquare className="text-[13px]" />
                                {t("profile.editProfile")}
                            </button>
                        </div>
                    )
                }
                {
                    isFromOutside && !toEdit && (
                        <div className="flex items-center gap-2 ms-auto">
                            <button onClick={() => navigate(-1)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] font-semibold text-sm bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans">
                                <HiOutlineBackward /> Back
                            </button>
                        </div>
                    )
                }
            </div>
            <div className="flex flex-col lg:flex-row gap-3 lg:flex-1 lg:min-h-0">
                <div className="flex flex-col gap-3 lg:flex-1 lg:min-w-0 lg:min-h-0 lg:overflow-hidden">
                    <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                        <UserProfileCard title={t("profile.basicInfo")} className="flex-1 min-w-0">
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                                <LabelValueField label={t("profile.rank")} value={rank} />
                                <LabelValueField label={t("profile.dob")} value={formatDate(personalInformation.dateOfBirth)} valueClassName="uppercase" />
                                <LabelValueField label={t("profile.country")} value={personalInformation.country} />
                                <LabelValueField label={t("profile.command")} value={command} />
                                <LabelValueField label={t("profile.email")} value={personalInformation.email} />
                                <LabelValueField label={t("profile.secondPlatform")} value={platforms.slice(1, platforms.length).join(', ')} />
                                <LabelValueField label={t("profile.mobileNo")} value={personalInformation.mobileNo} />
                                <LabelValueField label={t("profile.limitation")} value={fitness?.limitation} />
                                <LabelValueField label={t("profile.extNo")} value={personalInformation.extNo} />
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-start text-[10px] font-bold text-muted uppercase tracking-[0.04em] shrink-0">{t("profile.signature")}</div>
                                <div className="flex border border-bd justify-center rounded-[6px] flex-1">
                                    <div className="w-[140px] h-[40px] my-[4px]">
                                        {personalInformation.digitalSignature && <img src={`data:image/png;base64,${personalInformation.digitalSignature}`} />}
                                    </div>
                                </div>
                            </div>
                        </UserProfileCard>
                        <UserProfileCard title={t("profile.experience")} className="flex-1 min-w-0" bodyClassName="p-0">
                            <div className="overflow-auto max-h-[160px] thin-scrollbar-light">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-bd">
                                            <th className="px-3 py-2 text-start text-[11px] font-bold text-secondary uppercase tracking-[0.06em]">
                                                {t("profile.platform")}
                                            </th>
                                            <th className="px-3 py-2 text-start text-[11px] font-bold text-secondary uppercase tracking-[0.06em]">
                                                {t("profile.hour")}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-bd">
                                        {
                                            experience?.items.map((item, idx) => (
                                                <tr key={`exp_item_${idx}`} className="hover:bg-surface-2 transition-colors duration-100">
                                                    <td className="px-3 py-1.5 text-xs text-muted">{item.platform}</td>
                                                    <td className="px-3 py-1.5 text-xs text-muted">{minutesToTimeString(item.minutes)}</td>
                                                </tr>
                                            ))
                                        }
                                        {!experience?.items?.length && (
                                            <tr><td colSpan={2}><EmptyState bare compact icon={<HiOutlineClipboardDocumentList />} title={t("profile.noExperience")} /></td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </UserProfileCard>
                    </div>
                    <UserProfileCard title={t("nav.progressTracker")} className="shrink-0" bodyClassName="px-5 py-4">
                        {showOverview
                            ? <OverviewView onDrillInto={handleDrillInto} fromExternalView={true} />
                            : <StudentOverviewView onDrillInto={handleDrillInto} fromExternalView={true} />}
                    </UserProfileCard>
                    <div className="flex flex-col sm:flex-row gap-3 lg:flex-1 lg:min-h-0">
                        <UserProfileCard title={t("profile.airf")} statusIconColor={airf?.status} className="flex-1 min-w-0" bodyClassName="p-0 flex flex-col lg:flex-1 lg:min-h-0">
                            <div className="overflow-auto max-h-[260px] lg:max-h-none lg:flex-1 lg:min-h-0 thin-scrollbar-light">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-bd">
                                            <th className="px-3 py-2 text-start text-[11px] font-bold text-secondary uppercase tracking-[0.06em]">
                                                {t("profile.title")}
                                            </th>
                                            <th className="px-3 py-2 text-start text-[11px] font-bold text-secondary uppercase tracking-[0.06em]">
                                                {t("profile.published")}
                                            </th>
                                            <th className="px-3 py-2 text-start text-[11px] font-bold text-secondary uppercase tracking-[0.06em]">
                                                {t("profile.readOn")}
                                            </th>
                                            <th className="px-3 py-2 text-[11px] font-bold text-secondary uppercase tracking-[0.06em] text-center">
                                                {t("profile.status")}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-bd">
                                        {
                                            airf?.items.map((item, idx) => (
                                                <tr key={`airf_item_${idx}`} className="hover:bg-surface-2 transition-colors duration-100">
                                                    <td className="px-3 py-1.5 text-xs text-muted uppercase">{item.title}</td>
                                                    <td className="px-3 py-1.5 text-xs text-muted uppercase">{formatDate(item.publishedDate)}</td>
                                                    <td className="px-3 py-1.5 text-xs text-muted uppercase">{formatDate(item.readOnDate)}</td>
                                                    <td className="px-3 py-1.5 text-xs text-muted uppercase">
                                                        <div className="flex justify-center">
                                                            <StatusIcon color={item.status} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        }
                                        {!airf?.items?.length && (
                                            <tr><td colSpan={4}><EmptyState bare compact icon={<HiOutlineDocumentText />} title={t("profile.noAirf")} /></td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </UserProfileCard>

                        <UserProfileCard
                            title={t("profile.currency")}
                            className="flex-1 min-w-0"
                            bodyClassName="p-0 flex flex-col lg:flex-1 lg:min-h-0"
                            headerActions={
                                <ColumnSettings
                                    columns={CURRENCY_COLUMNS}
                                    visible={currencyCols}
                                    onToggle={toggleCurrencyCol}
                                    label={(k) => String(t(k as any))}
                                />
                            }
                        >
                            <div className="overflow-auto max-h-[260px] lg:max-h-none lg:flex-1 lg:min-h-0 thin-scrollbar-light">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-bd">
                                            {visibleCurrencyCols.map(col => (
                                                <th key={col.key} className={`px-3 py-2 text-[11px] font-bold text-secondary uppercase tracking-[0.06em] ${col.center ? 'text-center' : 'text-start'}`}>
                                                    {t(col.labelKey as any)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-bd">
                                        {
                                            currency?.items.map((item: any, idx: number) => (
                                                <tr key={`currency_item_${idx}`} className="hover:bg-surface-2 transition-colors duration-100">
                                                    {visibleCurrencyCols.map(col => (
                                                        <td key={col.key} className={`px-3 py-1.5 text-xs text-muted uppercase ${col.center ? 'text-center' : ''}`}>
                                                            {col.render(item)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))
                                        }
                                        {!currency?.items?.length && (
                                            <tr><td colSpan={visibleCurrencyCols.length}><EmptyState bare compact icon={<HiOutlineClock />} title={t("profile.noCurrency")} /></td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </UserProfileCard>
                    </div>
                </div>

                {hasScheduleView && (
                    <div className="lg:w-[320px] lg:shrink-0 lg:min-h-0">
                        <UserProfileCard title={t("attendance.schedules")} className="lg:h-full" bodyClassName="flex flex-col gap-3 px-4 py-4 lg:flex-1 lg:min-h-0">
                            {permissions.has('teacher:read') && (scheduleLoaded && (entries.length > 0 || myCourses.length > 0)) && (
                                <select
                                    value={selectedCourseId ?? ''}
                                    onChange={e => setSelectedCourseId(e.target.value ? Number(e.target.value) : null)}
                                    className="p-1.5 border rounded bg-surface-2 text-primary w-full shrink-0 text-[12px]"
                                >
                                    {/* <option value="">All Courses</option> */}
                                    {myCourses.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.title || `Course ${c.id}`}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {(scheduleLoaded && (entries.length > 0 || myCourses.length > 0)) ? (
                                <div className="overflow-auto max-h-[460px] lg:max-h-none lg:flex-1 lg:min-h-0 thin-scrollbar-light"><DayView canEdit={false} fromHour={6} toHour={17} /></div>
                            ) : (
                                <EmptyState bare compact icon={<HiOutlineClock />} title={t('schedule.noEntries')} />
                            )}
                        </UserProfileCard>
                    </div>
                )}
            </div>
            {editProfile && <EditProfileModal onClose={onEditClose} userId={user?.username} />}
            {changePassword && <ChangePasswordModal onClose={() => setChangePassword(false)} id={user?.id} />}
        </div >
    )
}


function EditProfileModal({ onClose, userId }: { onClose: (refresh: boolean) => void, userId: string | undefined }) {
    const { profile, update } = useProfileInfoStore(useShallow(s => ({
        profile: s.userProfile,
        update: s.update
    })))

    const [form, setForm] = useState<UserProfileUpdate>({
        profileId: profile.profileId,
        version: profile.version,
        country: profile.personalInformation.country,
        dateOfBirth: profile.personalInformation.dateOfBirth,
        email: profile.personalInformation.email,
        fullName: profile.personalInformation.fullName,
        mobileNo: profile.personalInformation.mobileNo,
        extNo: profile.personalInformation.extNo
    });
    const [submitting, setSubmitting] = useState<boolean>(false)
    const [error, setError] = useState<string>()

    const updateField = useCallback<(fieldName: string) => (e: ChangeEvent<HTMLInputElement>) => void>((fieldName: string) => (e: ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [fieldName]: e.target.value }))
    }, [])

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        (async () => {
            try {
                await update(form, userId!)
                // setSubmitting(false)
                onClose(true);
            } catch (e: any) {
                setError(e?.message || 'Failed to update user')
            } finally {
                setSubmitting(false)
            }
        })()
    }

    const onCountryChange = useCallback((selected: ({ id: number | string, value: string }) | null) => {
        if (selected) {
            setForm(prev => ({ ...prev, country: selected.value }))
        }

    }, [])

    const inputClass =
        'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'
    return (
        // Overlay
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => onClose(false)}>
            {/* Container */}
            <div className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Title */}
                <div
                    className="px-4 py-4 flex items-center justify-between shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}>
                    <div>
                        <p className="text-sm font-bold text-white ">Edit Profile</p>
                        <p className="text-xs text-white/50 mt-[3px]">{userId}</p>
                    </div>
                    <button className="text-white/50 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer" onClick={() => onClose(false)}>&times;</button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    <form id="edit-profile" className="flex flex-col gap-4" onSubmit={handleSubmit}>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Full Name</label>
                            <input className={inputClass} value={form.fullName} required onChange={updateField('fullName')} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Date of Birth</label>
                            <DateTimePicker value={form.dateOfBirth ?? ''} onChange={value => setForm((prev) => ({ ...prev, dateOfBirth: value }))} dateOnly={true} required={true} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Country</label>
                            <CountryLookup onChange={onCountryChange} value={form.country ? { id: form.country, value: form.country } : null} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Email</label>
                            <input className={inputClass} value={form.email} required onChange={updateField('email')} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Mobile No</label>
                            <input className={inputClass} value={form.mobileNo ?? ''} required onChange={updateField('mobileNo')} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Ext No</label>
                            <input className={inputClass} value={form.extNo ?? ''} onChange={updateField('extNo')} />
                        </div>
                        {/* <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Photo</label>
                            <img src={`data:image/png;base64,${profile.photo}`} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Digital Signature</label>
                            <img src={`data:image/png;base64,${profile.digitalSignature}`} />
                        </div> */}
                        {error && (
                            <div
                                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0" />
                                <p className="text-sm text-red-500">{error}</p>
                            </div>
                        )}
                    </form>
                </div>
                <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
                    <button
                        type="button"
                        onClick={() => onClose(false)}
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="edit-profile"
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {!submitting ? 'Save Changes' : 'Saving...'}
                    </button>
                </div>

            </div>
        </div>
    )
}

function ChangePasswordModal({ onClose, id }: { onClose: (refresh: boolean) => void, id: number }) {
    const doChangePassword = useProfileInfoStore(useShallow(s => s.changePassword))

    const [form, setForm] = useState({
        oldPassword: '',
        newPassword1: '',
        newPassword2: ''
    })
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const updateField = useCallback((name: string) => (e: ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [name]: e.target.value }))
    }, [])

    const { oldPassword, newPassword1, newPassword2 } = form

    const handleSubmit = useCallback((e: FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        (async () => {
            try {
                await doChangePassword({ old_password: form.oldPassword, new_password: newPassword1 }, id)
                onClose(true)
            } catch (e: any) {
                setError(e.message || 'Failed to save changes')
            } finally {
                setSubmitting(false)
            }
        })()
    }, [oldPassword, newPassword1, doChangePassword])

    const validatePassword2 = useCallback(() => {
        if (!newPassword1 || !newPassword2) {
            setError('')
            return;
        }

        if (newPassword1 !== newPassword2) {
            setError("Password doesn't match");
            return;
        }

        if (newPassword1.length < 8) {
            setError("Password should have at least 8 characters");
            return;
        }
        setError('')
    }, [newPassword1, newPassword2])

    // useEffect(() => {
    //     if (!newPassword1 || !newPassword2) {
    //         setError('')
    //         return;
    //     }

    //     if (newPassword1 !== newPassword2) {
    //         setError("Password doesn't match");
    //         return;
    //     }
    //     setError('')
    // }, [newPassword1, newPassword2])

    const inputClass =
        'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'
    return (
        // Overlay
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => onClose(false)}>
            {/* Container */}
            <div className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Title */}
                <div
                    className="px-4 py-4 flex items-center justify-between shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}>
                    <div>
                        <p className="text-sm font-bold text-white ">Change Password</p>
                    </div>
                    <button className="text-white/50 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer" onClick={() => onClose(false)}>&times;</button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    <form id="edit-profile" className="flex flex-col gap-4" onSubmit={handleSubmit}>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Old Password</label>
                            <input
                                type="password"
                                value={form.oldPassword}
                                onChange={updateField('oldPassword')}
                                className={inputClass}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">New Password</label>
                            <input
                                type="password"
                                value={form.newPassword1}
                                onChange={updateField('newPassword1')}
                                placeholder="Min 8 characters"
                                className={inputClass}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Confirm New Password</label>
                            <input
                                type="password"
                                value={form.newPassword2}
                                onChange={updateField('newPassword2')}
                                onBlur={validatePassword2}
                                className={inputClass}
                                required
                            />
                        </div>
                        {error && (
                            <div
                                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0" />
                                <p className="text-sm text-red-500">{error}</p>
                            </div>
                        )}
                    </form>
                </div>
                <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
                    <button
                        type="button"
                        onClick={() => onClose(false)}
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="edit-profile"
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!!submitting}
                    >
                        {!submitting ? 'Change Password' : 'Updating ...'}
                    </button>
                </div>

            </div>
        </div>
    )
}