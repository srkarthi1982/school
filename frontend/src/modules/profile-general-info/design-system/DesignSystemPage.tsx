import { useState, useMemo } from 'react';
import {
    HiOutlineBell,
    HiOutlineCheckCircle,
    HiOutlineExclamationTriangle,
    HiOutlineInformationCircle,
    HiOutlineXCircle,
    HiOutlineBookOpen,
    HiOutlineStar,
    HiOutlineArrowRight,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlinePencil,
    HiOutlineEye,
    HiOutlineHeart,
    HiOutlineShare,
    HiOutlinePlay,
    HiOutlineTrophy,
    HiOutlineChevronRight,
    HiOutlineChevronUp,
    HiOutlineChevronDown,
    HiOutlineMagnifyingGlass,
    HiOutlineFunnel,
    HiOutlineXMark,
    HiMiniChevronUpDown,
    HiOutlineRectangleGroup,
    HiOutlineSquares2X2,
    HiOutlineCursorArrowRipple,
    HiOutlineTag,
    HiOutlineDocumentText,
    HiOutlineChartBar,
    HiOutlineUsers,
    HiOutlinePencilSquare,
    HiOutlineMinus,
    HiOutlineTableCells,
    HiOutlineViewColumns,
} from 'react-icons/hi2';

// ─── Nav config ───────────────────────────────────────────────────────────────

type SectionId =
    | 'page-layouts' | 'dashboard-panels' | 'panels'
    | 'buttons' | 'badges' | 'typography'
    | 'alerts' | 'progress' | 'avatars'
    | 'inputs' | 'dividers' | 'table';

interface NavItem { id: SectionId; label: string; icon: React.ReactNode }

const NAV: NavItem[] = [
    { id: 'page-layouts', label: 'Page Layouts', icon: <HiOutlineRectangleGroup /> },
    { id: 'dashboard-panels', label: 'Dashboard Panels', icon: <HiOutlineViewColumns /> },
    { id: 'panels', label: 'Panels', icon: <HiOutlineSquares2X2 /> },
    { id: 'buttons', label: 'Buttons', icon: <HiOutlineCursorArrowRipple /> },
    { id: 'badges', label: 'Badges & Tags', icon: <HiOutlineTag /> },
    { id: 'typography', label: 'Typography', icon: <HiOutlineDocumentText /> },
    { id: 'alerts', label: 'Alerts', icon: <HiOutlineBell /> },
    { id: 'progress', label: 'Progress', icon: <HiOutlineChartBar /> },
    { id: 'avatars', label: 'Avatars', icon: <HiOutlineUsers /> },
    { id: 'inputs', label: 'Form Inputs', icon: <HiOutlinePencilSquare /> },
    { id: 'dividers', label: 'Dividers', icon: <HiOutlineMinus /> },
    { id: 'table', label: 'Table & Data Grid', icon: <HiOutlineTableCells /> },
];

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
    const [active, setActive] = useState<SectionId>('page-layouts');
    const current = NAV.find(n => n.id === active)!;

    return (
        <div className="flex h-full min-h-0 gap-0">

            {/* ── Left sidebar ──────────────────────────────────────────── */}
            <aside className="w-[210px] shrink-0 flex flex-col pe-3 pt-1">
                {/* Brand area */}
                <div className="mb-5 px-3">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em] mb-2">
                        <HiOutlineStar className="text-[11px]" />
                        DESIGN SYSTEM
                    </div>
                    <h1 className="text-[15px] font-bold text-primary tracking-[-0.01em]">
                        Component Library
                    </h1>
                    <p className="text-[11.5px] text-muted mt-0.5">
                        {NAV.length} sections
                    </p>
                </div>

                {/* Nav */}
                <nav className="flex flex-col gap-0.5 overflow-y-auto thin-scrollbar-light">
                    {NAV.map(item => {
                        const isActive = active === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActive(item.id)}
                                className="flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-[13px] font-medium w-full text-start border-none cursor-pointer transition-all duration-150"
                                style={{
                                    background: isActive ? 'var(--accent-light)' : 'transparent',
                                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                                }}
                            >
                                <span className="text-[16px] shrink-0">{item.icon}</span>
                                {item.label}
                            </button>
                        );
                    })}
                </nav>
            </aside>

            {/* ── Divider ───────────────────────────────────────────────── */}
            <div className="w-px bg-[var(--border)] self-stretch mx-1 shrink-0" />

            {/* ── Right content ─────────────────────────────────────────── */}
            <div className="flex-1 min-w-0 ps-8 pt-1 overflow-y-auto thin-scrollbar-light pb-10">
                {/* Section header */}
                <div className="mb-7">
                    <div className="flex items-center gap-2.5 mb-1">
                        <span className="text-[20px] text-accent">{current.icon}</span>
                        <h2 className="text-[22px] font-bold text-primary tracking-[-0.02em]">
                            {current.label}
                        </h2>
                    </div>
                    <div className="h-px bg-[var(--border)] mt-4" />
                </div>

                {/* Section content */}
                {active === 'page-layouts' && <PageSection />}
                {active === 'dashboard-panels' && <DashboardPanels />}
                {active === 'panels' && <PanelSection />}
                {active === 'buttons' && <ButtonSection />}
                {active === 'badges' && <BadgeSection />}
                {active === 'typography' && <TypographySection />}
                {active === 'alerts' && <AlertSection />}
                {active === 'progress' && <ProgressSection />}
                {active === 'avatars' && <AvatarSection />}
                {active === 'inputs' && <InputSection />}
                {active === 'dividers' && <DividerSection />}
                {active === 'table' && <TableSection />}
            </div>
        </div>
    );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function PanelSection() {
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">

            <div className="card px-[22px] py-5">
                <p className="text-3 font-semibold text-muted tracking-[0.06em] mb-2">BASIC PANEL</p>
                <p className="text-sm text-secondary leading-relaxed">
                    A simple card surface with border and subtle shadow. The default container for content.
                </p>
            </div>

            <div className="card p-0 overflow-hidden">
                <div className="px-[18px] py-3.5 border-b border-[var(--border)]">
                    <p className="text-sm font-bold text-primary">Panel Title</p>
                    <p className="text-3 text-muted mt-0.5">Optional subtitle here</p>
                </div>
                <div className="px-[18px] py-4">
                    <p className="text-sm text-secondary leading-relaxed">Panel body content goes here.</p>
                </div>
            </div>

            <div className="card p-0 overflow-hidden">
                <div
                    className="px-[18px] py-3.5 flex items-center gap-2.5"
                    style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
                >
                    <HiOutlineStar className="text-base text-white shrink-0" />
                    <div>
                        <p className="text-[13px] font-bold text-white">Navy Header</p>
                        <p className="text-[11px] text-white/55 mt-px">#11244E dark navy variant</p>
                    </div>
                </div>
                <div className="px-[18px] py-4">
                    <p className="text-sm text-secondary leading-relaxed">Panel body with a dark navy header strip.</p>
                </div>
            </div>

            <div className="card p-0 overflow-hidden">
                <div className="px-[18px] py-4">
                    <p className="text-sm font-bold text-primary mb-1.5">With Footer</p>
                    <p className="text-[13px] text-secondary leading-relaxed">Content area with an action footer below.</p>
                </div>
                <div className="px-[18px] py-3 border-t border-[var(--border)] bg-[var(--surface-2)] flex justify-end gap-2">
                    <Btn variant="ghost" size="sm">Cancel</Btn>
                    <Btn variant="primary" size="sm">Confirm</Btn>
                </div>
            </div>

            <div className="rounded-[14px] border-[1.5px] border-[var(--accent)] bg-[var(--accent-light)] px-5 py-4.5">
                <p className="text-[13px] font-bold text-accent mb-1.5">Accent Panel</p>
                <p className="text-[13px] text-secondary leading-relaxed">
                    Used for highlighted, featured, or "call to action" content blocks.
                </p>
            </div>

            <div className="rounded-[14px] border border-dashed border-[var(--border)] px-5 py-4.5 flex flex-col items-center justify-center gap-2 min-h-[110px] cursor-pointer">
                <HiOutlinePlus className="text-5.5 text-muted" />
                <p className="text-[13px] text-muted font-medium">Ghost / Empty Panel</p>
            </div>
        </div>
    );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md' | 'lg';

interface BtnProps {
    variant?: BtnVariant;
    size?: BtnSize;
    disabled?: boolean;
    icon?: React.ReactNode;
    iconEnd?: React.ReactNode;
    children: React.ReactNode;
    onClick?: () => void;
}

export function Btn({ variant = 'primary', size = 'md', disabled, icon, iconEnd, children, onClick }: BtnProps) {
    const sizeMap: Record<BtnSize, { padding: string; fontSize: number; height: number; gap: number }> = {
        sm: { padding: '0 12px', fontSize: 12, height: 30, gap: 5 },
        md: { padding: '0 18px', fontSize: 13, height: 36, gap: 7 },
        lg: { padding: '0 24px', fontSize: 14, height: 44, gap: 8 },
    };
    const variantMap: Record<BtnVariant, React.CSSProperties> = {
        primary: { background: 'var(--accent)', color: '#fff', border: '1.5px solid transparent' },
        secondary: { background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1.5px solid var(--border)' },
        outline: { background: 'transparent', color: 'var(--accent)', border: '1.5px solid var(--accent)' },
        ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1.5px solid transparent' },
        danger: { background: 'rgba(220, 38, 38, 0.08)', color: '#DC2626', border: '1.5px solid rgba(220, 38, 38, 0.25)' },
    };
    const s = sizeMap[size];
    const v = variantMap[variant];
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: s.gap,
                height: s.height, padding: s.padding, fontSize: s.fontSize,
                fontWeight: 600, fontFamily: 'var(--font)', borderRadius: 9,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                transition: 'opacity 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
                whiteSpace: 'nowrap', ...v,
            }}
        >
            {icon}{children}{iconEnd}
        </button>
    );
}

function ButtonSection() {
    return (
        <div className="card px-6 py-5.5 flex flex-col gap-5">
            <div>
                <Label>Variants</Label>
                <div className="flex gap-2.5 flex-wrap items-center">
                    <Btn variant="primary">Primary</Btn>
                    <Btn variant="secondary">Secondary</Btn>
                    <Btn variant="outline">Outline</Btn>
                    <Btn variant="ghost">Ghost</Btn>
                    <Btn variant="danger">Danger</Btn>
                </div>
            </div>
            <Divider />
            <div>
                <Label>Sizes</Label>
                <div className="flex gap-2.5 flex-wrap items-center">
                    <Btn size="sm">Small</Btn>
                    <Btn size="md">Medium</Btn>
                    <Btn size="lg">Large</Btn>
                </div>
            </div>
            <Divider />
            <div>
                <Label>With Icons</Label>
                <div className="flex gap-2.5 flex-wrap items-center">
                    <Btn variant="primary" icon={<HiOutlinePlus className="text-[15px]" />}>Add Item</Btn>
                    <Btn variant="outline" iconEnd={<HiOutlineArrowRight className="text-[15px]" />}>Continue</Btn>
                    <Btn variant="secondary" icon={<HiOutlinePencil className="text-sm" />}>Edit</Btn>
                    <Btn variant="danger" icon={<HiOutlineTrash className="text-sm" />}>Delete</Btn>
                </div>
            </div>
            <Divider />
            <div>
                <Label>Disabled</Label>
                <div className="flex gap-2.5 flex-wrap items-center">
                    <Btn disabled>Primary</Btn>
                    <Btn variant="secondary" disabled>Secondary</Btn>
                    <Btn variant="outline" disabled>Outline</Btn>
                </div>
            </div>
            <Divider />
            <div>
                <Label>Icon Only</Label>
                <div className="flex gap-2.5 flex-wrap items-center">
                    {([
                        { icon: <HiOutlineEye />, v: 'ghost' },
                        { icon: <HiOutlinePencil />, v: 'outline' },
                        { icon: <HiOutlineHeart />, v: 'secondary' },
                        { icon: <HiOutlineShare />, v: 'primary' },
                        { icon: <HiOutlineTrash />, v: 'danger' },
                    ] as const).map(({ icon, v }, i) => (
                        <button key={i} style={{
                            width: 36, height: 36, borderRadius: 9,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 17, cursor: 'pointer', fontFamily: 'var(--font)',
                            border: v === 'primary' ? '1.5px solid transparent'
                                : v === 'outline' ? '1.5px solid var(--accent)'
                                    : v === 'danger' ? '1.5px solid rgba(220,38,38,0.25)'
                                        : '1.5px solid var(--border)',
                            background: v === 'primary' ? 'var(--accent)'
                                : v === 'danger' ? 'rgba(220,38,38,0.08)'
                                    : v === 'secondary' ? 'var(--surface-2)'
                                        : 'transparent',
                            color: v === 'primary' ? '#fff'
                                : v === 'danger' ? '#DC2626'
                                    : v === 'outline' ? 'var(--accent)'
                                        : 'var(--text-secondary)',
                        }}>
                            {icon}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export function Badge({ label, color }: { label: string; color: string }) {
    const map: Record<string, { bg: string; text: string; border: string }> = {
        teal: { bg: 'rgba(45,212,191,0.12)', text: '#0D9488', border: 'rgba(45,212,191,0.35)' },
        green: { bg: 'rgba(34,197,94,0.10)', text: '#16A34A', border: 'rgba(34,197,94,0.30)' },
        blue: { bg: 'rgba(59,130,246,0.10)', text: '#2563EB', border: 'rgba(59,130,246,0.30)' },
        amber: { bg: 'rgba(245,158,11,0.10)', text: '#D97706', border: 'rgba(245,158,11,0.30)' },
        red: { bg: 'rgba(220,38,38,0.09)', text: '#DC2626', border: 'rgba(220,38,38,0.28)' },
        purple: { bg: 'rgba(147,51,234,0.09)', text: '#7C3AED', border: 'rgba(147,51,234,0.28)' },
        gray: { bg: 'var(--surface-2)', text: 'var(--text-muted)', border: 'var(--border)' },
    };
    const c = map[color] ?? map.gray;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px',
            borderRadius: 99, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.03em',
            background: c.bg, color: c.text, border: `1px solid ${c.border}`,
        }}>
            {label}
        </span>
    );
}

export function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
    return (
        <span className="inline-flex items-center gap-[5px] h-[26px] px-2.5 rounded-[7px] text-3 font-medium bg-[var(--surface-2)] text-secondary border border-[var(--border)]">
            {label}
            {onRemove && (
                <span onClick={onRemove} className="cursor-pointer opacity-60 text-sm leading-none">×</span>
            )}
        </span>
    );
}

function BadgeSection() {
    const [tags, setTags] = useState(['React', 'TypeScript', 'CSS', 'Vite']);
    return (
        <div className="card px-6 py-5.5 flex flex-col gap-5">
            <div>
                <Label>Status Badges</Label>
                <div className="flex gap-2 flex-wrap items-center">
                    <Badge label="Active" color="green" />
                    <Badge label="Pending" color="amber" />
                    <Badge label="Completed" color="teal" />
                    <Badge label="In Review" color="blue" />
                    <Badge label="Failed" color="red" />
                    <Badge label="Draft" color="gray" />
                    <Badge label="Premium" color="purple" />
                </div>
            </div>
            <Divider />
            <div>
                <Label>Removable Tags</Label>
                <div className="flex gap-2 flex-wrap">
                    {tags.map(t => (
                        <Tag key={t} label={t} onRemove={() => setTags(prev => prev.filter(x => x !== t))} />
                    ))}
                    {tags.length === 0 && (
                        <span className="text-[13px] text-muted">All tags removed — refresh to reset</span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Typography ───────────────────────────────────────────────────────────────

function TypographySection() {
    return (
        <div className="card px-6 py-5.5 flex flex-col gap-4">
            {[
                { tag: 'H1', text: 'Heading Level 1', size: 26, weight: 700, tracking: '-0.02em' },
                { tag: 'H2', text: 'Heading Level 2', size: 20, weight: 700, tracking: '-0.015em' },
                { tag: 'H3', text: 'Heading Level 3', size: 16, weight: 700, tracking: '-0.01em' },
                { tag: 'H4', text: 'Heading Level 4', size: 14, weight: 600, tracking: '0' },
            ].map(h => (
                <div key={h.tag} className="flex items-baseline gap-3.5">
                    <span className="w-7 text-[10.5px] font-bold text-muted tracking-[0.06em] shrink-0">{h.tag}</span>
                    <span style={{ fontSize: h.size, fontWeight: h.weight, color: 'var(--text-primary)', letterSpacing: h.tracking, lineHeight: 1.2 }}>{h.text}</span>
                </div>
            ))}
            <Divider />
            {[
                { tag: 'Body', text: 'Regular body text — used for most readable paragraph content.', size: 14, color: 'var(--text-primary)', weight: 400 },
                { tag: 'Secondary', text: 'Secondary text — slightly dimmer, for supporting information.', size: 14, color: 'var(--text-secondary)', weight: 400 },
                { tag: 'Muted', text: 'Muted text — captions, labels, timestamps, helper text.', size: 13, color: 'var(--text-muted)', weight: 400 },
                { tag: 'Caption', text: 'Caption / overline — UPPERCASE TRACKING FOR LABELS.', size: 11, color: 'var(--text-muted)', weight: 600 },
                { tag: 'Link', text: 'Accent link — used for interactive text elements.', size: 14, color: 'var(--accent)', weight: 500 },
            ].map(t => (
                <div key={t.tag} className="flex items-baseline gap-3.5">
                    <span className="w-[70px] text-[10.5px] font-bold text-muted tracking-[0.06em] shrink-0">{t.tag}</span>
                    <span style={{
                        fontSize: t.size, color: t.color, fontWeight: t.weight,
                        letterSpacing: t.tag === 'Caption' ? '0.08em' : undefined,
                        textTransform: t.tag === 'Caption' ? 'uppercase' : undefined,
                    }}>{t.text}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

interface AlertProps { type: 'info' | 'success' | 'warning' | 'error'; title: string; message: string }

export function Alert({ type, title, message }: AlertProps) {
    const config = {
        info: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', text: '#2563EB', icon: <HiOutlineInformationCircle className="text-[18px]" /> },
        success: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)', text: '#16A34A', icon: <HiOutlineCheckCircle className="text-[18px]" /> },
        warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', text: '#D97706', icon: <HiOutlineExclamationTriangle className="text-[18px]" /> },
        error: { bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.25)', text: '#DC2626', icon: <HiOutlineXCircle className="text-[18px]" /> },
    }[type];
    return (
        <div className="flex gap-3 px-4 py-[13px] rounded-[11px]" style={{ background: config.bg, border: `1px solid ${config.border}` }}>
            <span className="shrink-0 mt-px" style={{ color: config.text }}>{config.icon}</span>
            <div>
                <p className="text-3.25 font-bold mb-0.5" style={{ color: config.text }}>{title}</p>
                <p className="text-3.75 text-secondary leading-[1.55]">{message}</p>
            </div>
        </div>
    );
}

function AlertSection() {
    return (
        <div className="flex flex-col gap-2.5">
            <Alert type="info" title="Information" message="Your profile data is synced and up to date." />
            <Alert type="success" title="Success!" message="Assignment submitted successfully before the deadline." />
            <Alert type="warning" title="Heads up" message="Your session will expire in 10 minutes. Save your work." />
            <Alert type="error" title="Error" message="Failed to load course content. Please refresh the page." />
        </div>
    );
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export function ProgressBar({ label, value, color, showPercent = true }: { label: string; value: number; color?: string; showPercent?: boolean }) {
    const fill = color ?? 'var(--accent)';
    return (
        <div>
            <div className="flex justify-between mb-1.5">
                <span className="text-3.75 font-medium text-secondary">{label}</span>
                {showPercent && <span className="text-3 font-semibold text-muted">{value}%</span>}
            </div>
            <div className="progress-track">
                <div className="progress-fill" style={{ width: `${value}%`, background: fill }} />
            </div>
        </div>
    );
}

function ProgressSection() {
    return (
        <div className="card px-6 py-5.5 flex flex-col gap-4">
            <ProgressBar label="Computer Science" value={68} />
            <ProgressBar label="Mathematics" value={42} color="linear-gradient(90deg, #3B82F6, rgba(59,130,246,0.7))" />
            <ProgressBar label="History" value={85} color="linear-gradient(90deg, #22C55E, rgba(34,197,94,0.7))" />
            <ProgressBar label="Arabic Language" value={20} color="linear-gradient(90deg, #F59E0B, rgba(245,158,11,0.7))" />
            <Divider />
            <div>
                <Label>Segmented / Step Progress</Label>
                <div className="flex gap-1 mt-0.5">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`flex-1 h-[7px] rounded-full transition-[background] duration-300 ${i <= 3 ? 'bg-accent' : 'bg-[var(--border)]'}`} />
                    ))}
                </div>
                <p className="text-3 text-muted mt-1.5">Step 3 of 5</p>
            </div>
        </div>
    );
}

// ─── Avatars ──────────────────────────────────────────────────────────────────

export function Avatar({ initials, size, color, ring }: { initials: string; size: number; color: string; ring?: boolean }) {
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0,
            border: ring ? '3px solid var(--surface)' : undefined,
            boxShadow: ring ? '0 0 0 2px var(--accent)' : undefined,
            letterSpacing: '-0.01em',
        }}>
            {initials}
        </div>
    );
}

function AvatarSection() {
    const people = [
        { initials: 'OM', color: '#11244E' },
        { initials: 'SA', color: '#2563EB' },
        { initials: 'FN', color: '#7C3AED' },
        { initials: 'LK', color: '#D97706' },
        { initials: 'RM', color: '#DC2626' },
    ];
    return (
        <div className="card px-6 py-5.5 flex flex-col gap-5">
            <div>
                <Label>Sizes</Label>
                <div className="flex gap-3 items-center">
                    <Avatar initials="OM" size={28} color="#11244E" />
                    <Avatar initials="OM" size={36} color="#11244E" />
                    <Avatar initials="OM" size={46} color="#11244E" />
                    <Avatar initials="OM" size={56} color="#11244E" />
                    <Avatar initials="OM" size={70} color="#11244E" />
                </div>
            </div>
            <Divider />
            <div>
                <Label>Stacked Group</Label>
                <div className="flex">
                    {people.map((p, i) => (
                        <div key={i} style={{ marginInlineStart: i === 0 ? 0 : -10, zIndex: people.length - i }}>
                            <Avatar initials={p.initials} size={36} color={p.color} ring />
                        </div>
                    ))}
                    <div className="w-9 h-9 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[11px] font-bold text-muted" style={{ marginInlineStart: -10, border: '3px solid var(--surface)', boxShadow: '0 0 0 2px var(--border)' }}>+9</div>
                </div>
            </div>
            <Divider />
            <div>
                <Label>With Status Dot</Label>
                <div className="flex gap-4 items-center">
                    {[
                        { color: '#06555C', dot: '#22C55E', label: 'Online' },
                        { color: '#2563EB', dot: '#F59E0B', label: 'Away' },
                        { color: '#7C3AED', dot: '#94A3B8', label: 'Offline' },
                    ].map(({ color, dot, label }) => (
                        <div key={label} className="flex items-center gap-2">
                            <div className="relative w-10 h-10">
                                <Avatar initials="OM" size={40} color={color} />
                                <div className="absolute bottom-px right-px w-2.5 h-2.5 rounded-full border-2 border-[var(--surface)]" style={{ background: dot }} />
                            </div>
                            <span className="text-3.75 text-secondary">{label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export function DsInput({ label, placeholder, type = 'text', error, helper }: {
    label: string; placeholder?: string; type?: string; error?: string; helper?: string;
}) {
    return (
        <div className="flex flex-col gap-[5px]">
            <label className="text-3.75 font-semibold text-secondary">{label}</label>
            <input
                type={type}
                placeholder={placeholder}
                className="h-[38px] px-3 rounded-[9px] bg-[var(--surface)] text-primary text-3.4 font-sans outline-none w-full transition-[border-color] duration-150 ease-in-out"
                style={{ border: `1.5px solid ${error ? 'rgba(220,38,38,0.6)' : 'var(--border)'}` }}
                onFocus={e => { if (!error) e.target.style.borderColor = 'var(--accent)'; }}
                onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border)'; }}
            />
            {error && <span className="text-3.5 text-[#DC2626]">{error}</span>}
            {helper && <span className="text-3.5 text-muted">{helper}</span>}
        </div>
    );
}

export function DsSelect({ label, options }: { label: string; options: string[] }) {
    return (
        <div className="flex flex-col gap-[5px]">
            <label className="text-3.75 font-semibold text-secondary">{label}</label>
            <select className="h-[38px] px-3 rounded-[9px] bg-[var(--surface)] text-primary text-3.4 font-sans outline-none w-full" style={{ border: '1.5px solid var(--border)' }}>
                {options.map(o => <option key={o}>{o}</option>)}
            </select>
        </div>
    );
}

function InputSection() {
    return (
        <div className="card px-6 py-5.5">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-[18px]">
                <DsInput label="Full Name" placeholder="Enter your name" helper="Your display name across the platform." />
                <DsInput label="Email Address" placeholder="hello@example.com" type="email" />
                <DsInput label="Password" placeholder="••••••••" type="password" />
                <DsInput label="With Error" placeholder="invalid@" error="Please enter a valid email address." />
                <DsSelect label="Course Category" options={['Computer Science', 'Mathematics', 'History', 'Arabic Language']} />
                <DsSelect label="Status" options={['Active', 'Paused', 'Completed', 'Draft']} />
            </div>
        </div>
    );
}

// ─── Dividers ─────────────────────────────────────────────────────────────────

function DividerSection() {
    return (
        <div className="card px-6 py-5.5 flex flex-col gap-5">
            <div><Label>Solid</Label><div className="h-px bg-[var(--border)]" /></div>
            <div><Label>Dashed</Label><div className="h-px border-t border-dashed border-[var(--border)]" /></div>
            <div>
                <Label>With Label</Label>
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span className="text-3.5 font-semibold text-muted tracking-[0.06em]">OR</span>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                </div>
            </div>
            <div>
                <Label>Accent</Label>
                <div className="h-0.5 rounded-full" style={{ background: 'linear-gradient(90deg, var(--accent), transparent)' }} />
            </div>
            <div>
                <Label>Notification Bell (component composition example)</Label>
                <div className="flex items-center gap-3">
                    <div className="relative w-[38px] h-[38px] rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center cursor-pointer">
                        <HiOutlineBell className="text-[18px] text-secondary" />
                        <div className="absolute top-[7px] right-[7px] w-2 h-2 rounded-full bg-[#EF4444] border-2 border-[var(--surface)]" />
                    </div>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <Badge label="3 new" color="red" />
                </div>
            </div>
        </div>
    );
}

// ─── Page Layouts ─────────────────────────────────────────────────────────────

function PageSection() {
    const [activeTab, setActiveTab] = useState('overview');
    return (
        <div className="flex flex-col gap-4">

            <Label>Simple — Title + Subtitle</Label>
            <div className="card px-8 py-7">
                <div className="max-w-[600px]">
                    <h1 className="text-2xl font-bold text-primary tracking-[-0.02em] mb-1.5">Page Title</h1>
                    <p className="text-sm text-muted leading-relaxed">A short description of what this page is about. Keep it concise — one or two sentences maximum.</p>
                </div>
            </div>

            <Label>With Breadcrumb</Label>
            <div className="card px-8 py-7">
                <div className="flex items-center gap-1.5 mb-3.5">
                    {['Dashboard', 'Courses', 'Computer Science'].map((crumb, i, arr) => (
                        <span key={crumb} className="flex items-center gap-1.5">
                            <span style={{ fontSize: 12.5, color: i === arr.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: i === arr.length - 1 ? 600 : 400, cursor: i < arr.length - 1 ? 'pointer' : 'default' }}>{crumb}</span>
                            {i < arr.length - 1 && <HiOutlineChevronRight className="text-[12px] text-muted" />}
                        </span>
                    ))}
                </div>
                <h1 className="text-2xl font-bold text-primary tracking-[-0.02em] mb-1.5">Computer Science</h1>
                <p className="text-sm text-muted">Introduction to algorithms, data structures, and programming fundamentals.</p>
            </div>

            <Label>With Actions</Label>
            <div className="card px-8 py-7">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <p className="text-3.5 font-bold text-accent tracking-[0.08em] uppercase mb-1.5">My Courses</p>
                        <h1 className="text-2xl font-bold text-primary tracking-[-0.02em] mb-1.5">Active Courses</h1>
                        <p className="text-sm text-muted">Manage and track your enrolled courses.</p>
                    </div>
                    <div className="flex gap-2.5 items-center shrink-0">
                        <Btn variant="secondary" size="sm" icon={<HiOutlineShare className="text-sm" />}>Export</Btn>
                        <Btn variant="primary" size="sm" icon={<HiOutlinePlus className="text-sm" />}>Enroll</Btn>
                    </div>
                </div>
            </div>

            <Label>With Status Badge</Label>
            <div className="card px-8 py-7">
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-bold text-primary tracking-[-0.02em]">Mid-term Assignment</h1>
                    <Badge label="Due Soon" color="amber" />
                    <Badge label="Draft" color="gray" />
                </div>
                <p className="text-sm text-muted">Submit your research paper on early Islamic history. Max 3,000 words.</p>
            </div>

            <Label>With Tabs</Label>
            <div className="card p-0 overflow-hidden">
                <div className="px-8 pt-7 pb-0">
                    <h1 className="text-2xl font-bold text-primary tracking-[-0.02em] mb-1.5">My Profile</h1>
                    <p className="text-sm text-muted mb-5">Manage your personal information and preferences.</p>
                    <div className="flex gap-0 border-b-2 border-[var(--border)]">
                        {[{ id: 'overview', label: 'Overview' }, { id: 'courses', label: 'Courses' }, { id: 'activity', label: 'Activity' }, { id: 'settings', label: 'Settings' }].map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 18px', border: 'none', background: 'transparent', fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: activeTab === tab.id ? 700 : 500, color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', position: 'relative', marginBottom: -2, borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent', transition: 'color 0.15s ease' }}>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="px-8 py-5 text-muted text-[13.5px]">
                    Showing content for: <strong className="text-primary">{activeTab}</strong>
                </div>
            </div>

            <Label>Hero — Dark Banner Header</Label>
            <div className="rounded-[14px] overflow-hidden border border-[var(--border)]">
                <div className="px-9 pt-9 pb-10 relative overflow-hidden" style={{ background: 'linear-gradient(130deg, var(--navy) 0%, var(--navy-mid) 60%, var(--navy-deep) 100%)' }}>
                    <div className="absolute top-[-30px] w-[180px] h-[180px] rounded-full pointer-events-none" style={{ insetInlineEnd: -30, background: 'rgba(255,255,255,0.03)' }} />
                    <div className="absolute bottom-[-50px] w-[130px] h-[130px] rounded-full pointer-events-none" style={{ insetInlineEnd: 50, background: 'rgba(45,212,191,0.07)' }} />
                    <p className="text-[11px] font-semibold text-white/45 tracking-[0.1em] uppercase mb-2.5">Learning Path</p>
                    <h1 className="text-6.5 font-bold text-white tracking-[-0.02em] mb-2.5 leading-[1.25]">History of the Middle East</h1>
                    <p className="text-sm text-white/60 mb-[22px] leading-relaxed max-w-[480px]">A comprehensive study of Middle Eastern history from early Islamic civilization through the modern era.</p>
                    <div className="flex gap-2.5 flex-wrap">
                        <button className="inline-flex items-center gap-[7px] px-5 py-2.5 rounded-[10px] border-none bg-[#2DD4BF] text-[#022C32] text-[13px] font-bold cursor-pointer font-sans">
                            <HiOutlinePlay className="text-sm" /> Continue Learning
                        </button>
                        <button className="inline-flex items-center gap-[7px] px-5 py-2.5 rounded-[10px] bg-transparent text-white text-[13px] font-semibold cursor-pointer font-sans" style={{ border: '1.5px solid rgba(255,255,255,0.2)' }}>
                            View Syllabus
                        </button>
                    </div>
                </div>
                <div className="bg-[var(--surface)] px-9 py-4 flex gap-9 flex-wrap border-t border-[var(--border)]">
                    {[{ label: 'Progress', value: '60%' }, { label: 'Lessons', value: '12 / 20' }, { label: 'Duration', value: '8h 30m' }, { label: 'Enrolled', value: '1,240' }].map(stat => (
                        <div key={stat.label}>
                            <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-[3px]">{stat.label}</p>
                            <p className="text-base font-bold text-primary">{stat.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            <Label>Empty State</Label>
            <div className="card px-8 py-[52px] flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-[16px] bg-accent-light flex items-center justify-center text-accent mb-1">
                    <HiOutlineBookOpen className="text-6.5" />
                </div>
                <h2 className="text-4.5 font-bold text-primary">No courses yet</h2>
                <p className="text-[13.5px] text-muted max-w-[320px] leading-relaxed">You haven't enrolled in any courses. Start your learning journey by browsing the catalog.</p>
                <div className="mt-2">
                    <Btn variant="primary" icon={<HiOutlinePlus className="text-sm" />}>Browse Courses</Btn>
                </div>
            </div>
        </div>
    );
}

// ─── Dashboard Panels ────────────────────────────────────────────────────────

function DashboardPanels() {
    return (
        <div className="flex flex-col gap-4">
            <Label>Hero Banner</Label>
            <HeroBanner />
            <Label>Content Cards (3-column layout)</Label>
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-4">
                <LearningPathPanel />
                <TrainingCard />
                <ActiveCoursesCard />
            </div>
            <Label>Supporting Cards (2-column layout)</Label>
            <div className="grid grid-cols-[1fr_1fr] gap-4">
                <AnnouncementsCard />
                <AchievementCard />
            </div>
        </div>
    );
}

function HeroBanner() {
    return (
        <div className="rounded-[18px] px-8 py-7 text-white relative overflow-hidden" style={{ background: 'linear-gradient(130deg, var(--navy) 0%, var(--navy-mid) 60%, var(--navy-deep) 100%)' }}>
            <div className="absolute top-[-40px] w-[200px] h-[200px] rounded-full pointer-events-none" style={{ insetInlineEnd: -40, background: 'rgba(255,255,255,0.04)' }} />
            <div className="absolute bottom-[-55px] w-[150px] h-[150px] rounded-full pointer-events-none" style={{ insetInlineEnd: 60, background: 'rgba(45,212,191,0.08)' }} />
            <p className="text-[11px] font-semibold text-white/50 tracking-[0.1em] uppercase mb-2">Dashboard</p>
            <h2 className="text-[20px] font-bold mb-[18px] leading-[1.35]">مرحباً، عمر في منصة التعلم</h2>
            <button className="inline-flex items-center gap-2 px-5 py-[9px] rounded-[10px] border-none bg-[#2DD4BF] text-[#022C32] text-[13px] font-bold cursor-pointer tracking-[0.01em] font-sans">
                <HiOutlinePlay className="text-sm" />ابدأ التدريب
            </button>
        </div>
    );
}

const learningPathItems = [
    { label: 'تاريخ الإسلام المبكر', status: 'done' },
    { label: 'الدولة الأموية والعباسية', status: 'done' },
    { label: 'تاريخ الإمبراطورية العثمانية', status: 'active' },
    { label: 'الحركات القومية الحديثة', status: 'upcoming' },
];

function LearningPathPanel() {
    return (
        <div className="card p-0 overflow-hidden">
            <div className="px-4 py-[13px] border-b border-[var(--border)] bg-[var(--surface-2)]">
                <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-0.5">سير التعلم</p>
                <p className="text-[13px] font-bold text-primary">تاريخ الشرق الأوسط</p>
            </div>
            <div className="py-2.5">
                {learningPathItems.map((item, i) => {
                    const isDone = item.status === 'done';
                    const isActive = item.status === 'active';
                    return (
                        <div key={i} className={`flex items-center gap-3 px-4 py-[9px] cursor-pointer transition-[background] duration-150 ${isActive ? 'bg-accent-light' : 'bg-transparent'}`}>
                            <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${isDone || isActive ? 'bg-accent text-white' : 'bg-[var(--border)] text-muted'}`}>
                                {isDone ? '✓' : isActive ? <div className="w-[7px] h-[7px] rounded-full bg-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-muted" />}
                            </div>
                            <span className={`flex-1 leading-snug text-3.75 ${isActive ? 'font-bold text-accent' : isDone ? 'font-medium text-muted line-through' : 'font-medium text-secondary'}`}>{item.label}</span>
                            {isActive && <HiOutlineChevronRight className="text-[13px] text-accent shrink-0" />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function TrainingCard() {
    return (
        <div className="card px-5 py-[18px] flex flex-col gap-3.5">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[9px] bg-accent-light flex items-center justify-center text-accent shrink-0">
                    <HiOutlinePlay className="text-[15px]" />
                </div>
                <p className="text-[13px] font-bold text-primary">ابدأ التدريب</p>
            </div>
            <div>
                <div className="flex justify-between mb-1.5">
                    <span className="text-3 text-muted">التقدم الحالي</span>
                    <span className="text-3 font-bold text-accent">60%</span>
                </div>
                <div className="progress-track h-2"><div className="progress-fill" style={{ width: '60%' }} /></div>
            </div>
            <p className="text-3.75 text-secondary leading-[1.55] px-3 py-2.5 bg-[var(--surface-2)] rounded-[9px] border border-[var(--border)]">
                أكمل <strong className="text-primary">"مقدمة في علوم الحاسوب"</strong>
            </p>
            <button className="flex items-center justify-center gap-[7px] py-2.5 rounded-[10px] border-none bg-accent text-white text-[13px] font-bold cursor-pointer tracking-[0.01em] font-sans">
                <HiOutlinePlay className="text-sm" />ابدأ الدرس
            </button>
        </div>
    );
}

const activeCourses = [
    { name: 'علوم الحاسوب', progress: 60, color: 'linear-gradient(90deg, var(--accent), rgba(45,212,191,0.7))' },
    { name: 'التاريخ', progress: 25, color: 'linear-gradient(90deg, #3B82F6, rgba(59,130,246,0.7))' },
];

function ActiveCoursesCard() {
    return (
        <div className="card px-5 py-[18px] flex flex-col gap-3.5">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[9px] bg-accent-light flex items-center justify-center text-accent shrink-0">
                    <HiOutlineBookOpen className="text-[15px]" />
                </div>
                <p className="text-[13px] font-bold text-primary">دوراتي النشطة</p>
            </div>
            <div className="flex flex-col gap-3.5">
                {activeCourses.map(c => (
                    <div key={c.name}>
                        <div className="flex justify-between mb-1.5">
                            <span className="text-[13px] font-medium text-primary">{c.name}</span>
                            <span className="text-3 font-bold text-accent">{c.progress}%</span>
                        </div>
                        <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${c.progress}%`, background: c.color }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AnnouncementsCard() {
    return (
        <div className="card px-5 py-[18px] flex flex-col gap-3.5">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 bg-[rgba(245,158,11,0.1)] text-[#D97706]">
                    <HiOutlineBell className="text-[15px]" />
                </div>
                <p className="text-[13px] font-bold text-primary">الإعلانات الهامة</p>
            </div>
            <div className="px-3.5 py-3 rounded-[10px] flex gap-2.5 items-start bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.22)]">
                <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] bg-[#D97706]" />
                <p className="text-[13px] text-secondary leading-relaxed">تذكير: اختبار منتصف الفصل الأسبوع القادم</p>
            </div>
        </div>
    );
}

function AchievementCard() {
    return (
        <div className="card px-5 py-[18px] flex items-center gap-4">
            <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center shrink-0 text-accent" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.18) 0%, rgba(6,85,92,0.12) 100%)', border: '1px solid rgba(45,212,191,0.25)' }}>
                <HiOutlineTrophy className="text-2xl" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10.5px] font-bold text-accent uppercase tracking-[0.08em] mb-1">أحدث الإنجازات</p>
                <p className="text-[13px] font-bold text-primary mb-[3px]">تم إكمال وحدة</p>
                <p className="text-3.75 text-secondary">"البرمجة بلغة بايثون"</p>
            </div>
            <div className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold text-accent bg-[rgba(45,212,191,0.12)] border border-[rgba(45,212,191,0.3)]">
                ✓ مكتمل
            </div>
        </div>
    );
}

// ─── Table & Data Grid ────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null;

interface Student {
    id: number; name: string; course: string; progress: number;
    status: 'active' | 'completed' | 'paused'; grade: string;
}

const TABLE_DATA: Student[] = [
    { id: 1, name: 'Omar Mahmoud', course: 'Computer Science', progress: 68, status: 'active', grade: 'A' },
    { id: 2, name: 'Sara Ali', course: 'History', progress: 35, status: 'active', grade: 'B+' },
    { id: 3, name: 'Fatima Nasser', course: 'Mathematics', progress: 91, status: 'completed', grade: 'A+' },
    { id: 4, name: 'Laith Karimi', course: 'Arabic Language', progress: 20, status: 'paused', grade: 'C' },
    { id: 5, name: 'Rania Mustafa', course: 'Computer Science', progress: 55, status: 'active', grade: 'B' },
    { id: 6, name: 'Ahmad Yousef', course: 'Mathematics', progress: 78, status: 'active', grade: 'A-' },
    { id: 7, name: 'Noor Ibrahim', course: 'History', progress: 100, status: 'completed', grade: 'A' },
    { id: 8, name: 'Karim Hassan', course: 'Arabic Language', progress: 12, status: 'paused', grade: 'D' },
];

const STATUS_MAP: Record<Student['status'], { label: string; bg: string; text: string }> = {
    active: { label: 'Active', bg: 'rgba(34,197,94,0.1)', text: '#16A34A' },
    completed: { label: 'Completed', bg: 'rgba(45,212,191,0.1)', text: '#0D9488' },
    paused: { label: 'Paused', bg: 'rgba(245,158,11,0.1)', text: '#D97706' },
};

type SortKey = keyof Pick<Student, 'name' | 'course' | 'progress' | 'grade'>;

export function TableSection() {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<Student['status'] | 'all'>('all');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 5;

    const filtered = useMemo(() => {
        let rows = TABLE_DATA;
        if (search) rows = rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.course.toLowerCase().includes(search.toLowerCase()));
        if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);
        rows = [...rows].sort((a, b) => {
            const av = a[sortKey], bv = b[sortKey];
            const cmp = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv));
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return rows;
    }, [search, statusFilter, sortKey, sortDir]);

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const toggleSort = (key: SortKey) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc'); } };
    const toggleRow = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const allChecked = pageRows.length > 0 && pageRows.every(r => selected.has(r.id));
    const toggleAll = () => {
        if (allChecked) setSelected(prev => { const n = new Set(prev); pageRows.forEach(r => n.delete(r.id)); return n; });
        else setSelected(prev => { const n = new Set(prev); pageRows.forEach(r => n.add(r.id)); return n; });
    };
    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <HiMiniChevronUpDown className="text-[14px] text-muted opacity-50" />;
        return sortDir === 'asc' ? <HiOutlineChevronUp className="text-[12px] text-accent" /> : <HiOutlineChevronDown className="text-[12px] text-accent" />;
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px]">
                    <HiOutlineMagnifyingGlass className="absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-muted pointer-events-none" />
                    <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search students or courses…" className="w-full h-9 ps-9 pe-3 rounded-[9px] bg-[var(--surface-2)] text-primary text-3.4 font-sans outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-[border-color] duration-150" />
                    {search && <button onClick={() => setSearch('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"><HiOutlineXMark className="text-[15px]" /></button>}
                </div>
                <div className="flex items-center gap-1.5">
                    <HiOutlineFunnel className="text-[14px] text-muted shrink-0" />
                    {(['all', 'active', 'completed', 'paused'] as const).map(s => (
                        <button key={s} onClick={() => { setStatusFilter(s); setPage(0); }} className={`px-3 py-1 rounded-full text-3 font-semibold capitalize transition-all duration-150 ${statusFilter === s ? 'bg-accent text-white' : 'bg-[var(--surface-2)] text-muted hover:text-secondary'}`}>
                            {s === 'all' ? 'All' : STATUS_MAP[s].label}
                        </button>
                    ))}
                </div>
                {selected.size > 0 && (
                    <div className="flex items-center gap-2 ms-auto">
                        <span className="text-3 text-muted">{selected.size} selected</span>
                        <button onClick={() => setSelected(new Set())} className="text-3 text-muted hover:text-primary px-2 py-0.5 rounded border border-[var(--border)]">Clear</button>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-[var(--border)]" style={{ background: 'var(--navy)' }}>
                                <th className="w-10 px-4 py-3">
                                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer" />
                                </th>
                                {([{ key: 'name', label: 'Student' }, { key: 'course', label: 'Course' }, { key: 'progress', label: 'Progress' }, { key: 'grade', label: 'Grade' }] as { key: SortKey; label: string }[]).map(col => (
                                    <th key={col.key} className="px-4 py-3 text-3 font-bold text-white/60 tracking-[0.06em] uppercase whitespace-nowrap">
                                        <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 text-white/60 hover:text-white transition-colors">{col.label}<SortIcon col={col.key} /></button>
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-3 font-bold text-muted tracking-[0.06em] uppercase">Status</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {pageRows.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No results match your filters.</td></tr>
                            ) : pageRows.map(row => {
                                const st = STATUS_MAP[row.status];
                                const isSelected = selected.has(row.id);
                                return (
                                    <tr key={row.id} className={`transition-colors duration-100 ${isSelected ? 'bg-accent-light' : 'hover:bg-[var(--surface-2)]'}`}>
                                        <td className="w-10 px-4 py-3"><input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)} className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer" /></td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-full bg-[var(--navy)] flex items-center justify-center text-[10px] font-bold text-white shrink-0">{row.name.split(' ').map(n => n[0]).join('')}</div>
                                                <span className="text-3.4 font-semibold text-primary whitespace-nowrap">{row.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-3.4 text-secondary whitespace-nowrap">{row.course}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5 min-w-[100px]">
                                                <div className="flex-1 progress-track"><div className="progress-fill" style={{ width: `${row.progress}%` }} /></div>
                                                <span className="text-3 font-semibold text-accent w-7 text-end">{row.progress}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3"><span className="text-3.4 font-bold text-primary">{row.grade}</span></td>
                                        <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-3 font-semibold" style={{ background: st.bg, color: st.text }}>{st.label}</span></td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button className="w-7 h-7 rounded-[9px] flex items-center justify-center text-muted hover:text-primary hover:bg-[var(--surface-2)] transition-colors"><HiOutlineEye className="text-[14px]" /></button>
                                                <button className="w-7 h-7 rounded-[9px] flex items-center justify-center text-muted hover:text-primary hover:bg-[var(--surface-2)] transition-colors"><HiOutlinePencil className="text-[14px]" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]">
                    <span className="text-3 text-muted">
                        {filtered.length === 0 ? '0 results' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
                    </span>
                    <div className="flex items-center gap-1">
                        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded-[9px] text-3 font-medium text-secondary border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
                        {Array.from({ length: totalPages }, (_, i) => (
                            <button key={i} onClick={() => setPage(i)} className={`w-7 h-7 rounded-[9px] text-3 font-semibold transition-colors ${page === i ? 'bg-accent text-white' : 'text-secondary hover:bg-[var(--surface-2)]'}`}>{i + 1}</button>
                        ))}
                        <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded-[9px] text-3 font-medium text-secondary border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
                    </div>
                </div>
            </div>

            {/* Summary row */}
            <div className="flex flex-wrap gap-3">
                {(['active', 'completed', 'paused'] as const).map(s => {
                    const count = TABLE_DATA.filter(r => r.status === s).length;
                    const st = STATUS_MAP[s];
                    return (
                        <div key={s} className="card flex-1 min-w-[120px] px-4 py-3.5 flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: st.text }} />
                            <div>
                                <p className="text-[11px] font-bold text-muted uppercase tracking-[0.07em]">{st.label}</p>
                                <p className="text-[22px] font-bold text-primary leading-tight">{count}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function Divider() { return <div className="h-px bg-[var(--border)]" />; }

export function Label({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-2.5">{children}</p>;
}
