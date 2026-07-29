import { useEffect, useMemo, useState } from 'react'
import { type ComboBoxOption } from '../../../../../infra/shared/components/ComboBox'
import {
  createResourceOption,
  listResourceOptions,
} from '../../api'
import type { TabProps } from './types'
import CardSection from '../components/CardSection'
import MultiAddSection from '../components/MultiAddSection'

// ─── API shapes (match backend schema) ─────────────────────────────────────

export interface AircraftItem {
  aircraftTypeId: number | string | null
  numberOfAircraft: number | string | null
}

export interface AircraftMissionEquipmentItem {
  aircraftMissionEquipmentId: number | string | null
  quantity: number | string | null
}

export interface AircraftArmamentItem {
  aircraftArmamentId: number | string | null
  quantity: number | string | null
}

export interface SimulatorTypeItem {
  simulatorTypeId: number | string | null
  quantity: number | string | null
}

export interface MissionPlanningSystemItem {
  missionPlanningSystemId: number | string | null
  quantity: number | string | null
}

export interface GroundMaintenanceItem {
  groundMaintenanceId: number | string | null
  quantity: number | string | null
}

export interface GroundArmamentItem {
  groundArmamentId: number | string | null
  quantity: number | string | null
}

export interface PersonalFlightEquipmentItem {
  personalFlightEquipmentId: number | string | null
  quantity: number | string | null
}

export interface AviationLifeSupportItem {
  aviationLifeSupportEquipmentId: number | string | null
  quantity: number | string | null
}

export interface ClassroomRequirementItem {
  classroomRequirementId: number | string | null
  quantity: number | string | null
}

export interface TrainingMaterialAidItem {
  trainingMaterialAidId: number | string | null
  quantity: number | string | null
}

export interface ResourcesData {
  aircraftItems?: AircraftItem[] | null
  aircraftMissionEquipmentItems?: AircraftMissionEquipmentItem[] | null
  aircraftArmamentItems?: AircraftArmamentItem[] | null
  groundEquipmentSimulatorTypeItems?: SimulatorTypeItem[] | null
  groundEquipmentMissionPlanningSystemItems?: MissionPlanningSystemItem[] | null
  groundEquipmentMaintenanceItems?: GroundMaintenanceItem[] | null
  groundEquipmentArmamentItems?: GroundArmamentItem[] | null
  personalFlightEquipmentItems?: PersonalFlightEquipmentItem[] | null
  aviationLifeSupportEquipmentItems?: AviationLifeSupportItem[] | null
  classroomRequirementItems?: ClassroomRequirementItem[] | null
  trainingMaterialAidItems?: TrainingMaterialAidItem[] | null
}

// ─── Form state ────────────────────────────────────────────────────────────

interface FormResourceItem {
  id: string
  quantity: string
}

interface FormState {
  aircraftItems: FormResourceItem[]
  aircraftMissionEquipmentItems: FormResourceItem[]
  aircraftArmamentItems: FormResourceItem[]
  groundEquipmentSimulatorTypeItems: FormResourceItem[]
  groundEquipmentMissionPlanningSystemItems: FormResourceItem[]
  groundEquipmentMaintenanceItems: FormResourceItem[]
  groundEquipmentArmamentItems: FormResourceItem[]
  personalFlightEquipmentItems: FormResourceItem[]
  aviationLifeSupportEquipmentItems: FormResourceItem[]
  classroomRequirementItems: FormResourceItem[]
  trainingMaterialAidItems: FormResourceItem[]
}

type GroupId = 'aircraft' | 'ground' | 'personal' | 'classroom'

interface FieldDef {
  listKey: keyof FormState
  kind: string
  label: string
  entityLabel: string
  group: GroupId
}

const ITEM_FIELDS: readonly FieldDef[] = [
  { listKey: 'aircraftItems', kind: 'aircraft_type', label: 'Aircraft', entityLabel: 'aircraft type', group: 'aircraft' },
  { listKey: 'aircraftMissionEquipmentItems', kind: 'aircraft_mission_equipment', label: 'Aircraft Mission Equipment', entityLabel: 'mission equipment', group: 'aircraft' },
  { listKey: 'aircraftArmamentItems', kind: 'aircraft_armament', label: 'Aircraft Armament', entityLabel: 'armament', group: 'aircraft' },
  { listKey: 'groundEquipmentSimulatorTypeItems', kind: 'ground_equipment_simulator_type', label: 'Type of Simulator', entityLabel: 'simulator type', group: 'ground' },
  { listKey: 'groundEquipmentMissionPlanningSystemItems', kind: 'ground_equipment_mission_planning_system', label: 'Mission Planning System', entityLabel: 'mission planning system', group: 'ground' },
  { listKey: 'groundEquipmentMaintenanceItems', kind: 'ground_equipment_maintenance', label: 'Maintenance', entityLabel: 'maintenance equipment', group: 'ground' },
  { listKey: 'groundEquipmentArmamentItems', kind: 'ground_equipment_armament', label: 'Ground Armament', entityLabel: 'ground armament', group: 'ground' },
  { listKey: 'personalFlightEquipmentItems', kind: 'personal_flight_equipment', label: 'Personal Flight Equipment', entityLabel: 'personal flight equipment', group: 'personal' },
  { listKey: 'aviationLifeSupportEquipmentItems', kind: 'aviation_life_support_equipment', label: 'Aviation Life Support Equipment', entityLabel: 'life-support equipment', group: 'personal' },
  { listKey: 'classroomRequirementItems', kind: 'classroom_requirements', label: 'Classroom Requirements', entityLabel: 'classroom requirement', group: 'classroom' },
  { listKey: 'trainingMaterialAidItems', kind: 'training_material_aids', label: 'Training Material Aids', entityLabel: 'training material aid', group: 'classroom' },
]

const GROUPS: { id: GroupId; label: string; subtitle: string }[] = [
  { id: 'aircraft',  label: 'Aircraft Resources',     subtitle: 'Aircraft, mission equipment, and armament required for the course.' },
  { id: 'ground',    label: 'Ground Equipment',       subtitle: 'Simulators, mission planning, maintenance, and ground armament.' },
  { id: 'personal',  label: 'Personal & Life Support',subtitle: 'Flight equipment and life-support equipment carried by personnel.' },
  { id: 'classroom', label: 'Classroom & Training',   subtitle: 'Classroom facilities and training material aids.' },
]

const emptyState: FormState = {
  aircraftItems: [],
  aircraftMissionEquipmentItems: [],
  aircraftArmamentItems: [],
  groundEquipmentSimulatorTypeItems: [],
  groundEquipmentMissionPlanningSystemItems: [],
  groundEquipmentMaintenanceItems: [],
  groundEquipmentArmamentItems: [],
  personalFlightEquipmentItems: [],
  aviationLifeSupportEquipmentItems: [],
  classroomRequirementItems: [],
  trainingMaterialAidItems: [],
}

function num(v: unknown): string {
  return v == null || v === '' ? '' : String(v)
}

function toFormState(value: ResourcesData | null | undefined): FormState {
  if (!value) return { ...emptyState }
  return {
    aircraftItems: (value.aircraftItems ?? []).map((item) => ({
      id: num(item.aircraftTypeId),
      quantity: num(item.numberOfAircraft),
    })),
    aircraftMissionEquipmentItems: (value.aircraftMissionEquipmentItems ?? []).map((item) => ({
      id: num(item.aircraftMissionEquipmentId),
      quantity: num(item.quantity),
    })),
    aircraftArmamentItems: (value.aircraftArmamentItems ?? []).map((item) => ({
      id: num(item.aircraftArmamentId),
      quantity: num(item.quantity),
    })),
    groundEquipmentSimulatorTypeItems: (value.groundEquipmentSimulatorTypeItems ?? []).map((item) => ({
      id: num(item.simulatorTypeId),
      quantity: num(item.quantity),
    })),
    groundEquipmentMissionPlanningSystemItems: (value.groundEquipmentMissionPlanningSystemItems ?? []).map((item) => ({
      id: num(item.missionPlanningSystemId),
      quantity: num(item.quantity),
    })),
    groundEquipmentMaintenanceItems: (value.groundEquipmentMaintenanceItems ?? []).map((item) => ({
      id: num(item.groundMaintenanceId),
      quantity: num(item.quantity),
    })),
    groundEquipmentArmamentItems: (value.groundEquipmentArmamentItems ?? []).map((item) => ({
      id: num(item.groundArmamentId),
      quantity: num(item.quantity),
    })),
    personalFlightEquipmentItems: (value.personalFlightEquipmentItems ?? []).map((item) => ({
      id: num(item.personalFlightEquipmentId),
      quantity: num(item.quantity),
    })),
    aviationLifeSupportEquipmentItems: (value.aviationLifeSupportEquipmentItems ?? []).map((item) => ({
      id: num(item.aviationLifeSupportEquipmentId),
      quantity: num(item.quantity),
    })),
    classroomRequirementItems: (value.classroomRequirementItems ?? []).map((item) => ({
      id: num(item.classroomRequirementId),
      quantity: num(item.quantity),
    })),
    trainingMaterialAidItems: (value.trainingMaterialAidItems ?? []).map((item) => ({
      id: num(item.trainingMaterialAidId),
      quantity: num(item.quantity),
    })),
  }
}

function fromFormState(form: FormState): ResourcesData {
  return {
    aircraftItems: form.aircraftItems.map((it) => ({
      aircraftTypeId: it.id === '' ? null : Number(it.id),
      numberOfAircraft: it.quantity === '' ? null : Number(it.quantity),
    })),
    aircraftMissionEquipmentItems: form.aircraftMissionEquipmentItems.map((it) => ({
      aircraftMissionEquipmentId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
    aircraftArmamentItems: form.aircraftArmamentItems.map((it) => ({
      aircraftArmamentId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
    groundEquipmentSimulatorTypeItems: form.groundEquipmentSimulatorTypeItems.map((it) => ({
      simulatorTypeId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
    groundEquipmentMissionPlanningSystemItems: form.groundEquipmentMissionPlanningSystemItems.map((it) => ({
      missionPlanningSystemId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
    groundEquipmentMaintenanceItems: form.groundEquipmentMaintenanceItems.map((it) => ({
      groundMaintenanceId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
    groundEquipmentArmamentItems: form.groundEquipmentArmamentItems.map((it) => ({
      groundArmamentId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
    personalFlightEquipmentItems: form.personalFlightEquipmentItems.map((it) => ({
      personalFlightEquipmentId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
    aviationLifeSupportEquipmentItems: form.aviationLifeSupportEquipmentItems.map((it) => ({
      aviationLifeSupportEquipmentId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
    classroomRequirementItems: form.classroomRequirementItems.map((it) => ({
      classroomRequirementId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
    trainingMaterialAidItems: form.trainingMaterialAidItems.map((it) => ({
      trainingMaterialAidId: it.id === '' ? null : Number(it.id),
      quantity: it.quantity === '' ? null : Number(it.quantity),
    })),
  }
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ResourcesTab({
  value,
  onChange,
  onMarkComplete,
  readOnly,
  reloadToken,
}: TabProps<ResourcesData>) {
  const [data, setData] = useState<FormState>(() => toFormState(value))
  const [pendingIds, setPendingIds] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const f of ITEM_FIELDS) {
      initial[f.kind] = ''
    }
    return initial
  })
  const [optionsByKind, setOptionsByKind] = useState<Record<string, ComboBoxOption[]>>({})

  useEffect(() => {
    setData((prev) => {
      if (!value) return emptyState
      const prevWire = fromFormState(prev)
      const prevJson = JSON.stringify(prevWire)
      const nextJson = JSON.stringify(value)
      if (prevJson === nextJson) return prev
      return toFormState(value)
    })
  }, [value])

  // Load all option dictionaries on mount, and reload after a .docx import
  // (reloadToken bump). The cleanup flips `cancelled`, so a stale in-flight
  // load from a previous run can't overwrite freshly imported options.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const f of ITEM_FIELDS) {
        try {
          const resp = await listResourceOptions(f.kind)
          if (cancelled) return
          if (resp.success && resp.data) {
            const opts: ComboBoxOption[] = resp.data.map((o: any) => ({
              value: String(o.id),
              label: o.label,
            }))
            setOptionsByKind((prev) => ({ ...prev, [f.kind]: opts }))
          }
        } catch {
          // Empty dictionary is fine — the combo box just shows "No matches".
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const update = (patch: Partial<FormState>) => {
    const next = { ...data, ...patch }
    setData(next)
    onChange(fromFormState(next))
  }

  const makeCreateHandler = (kind: string) => async (label: string) => {
    const resp = await createResourceOption(kind, label)
    const created: ComboBoxOption = resp.success && resp.data
      ? { value: String(resp.data.id), label: resp.data.label }
      : { value: label, label }
    setOptionsByKind((prev) => {
      const existing = prev[kind] ?? []
      if (existing.some((o) => o.value === created.value)) return prev
      return { ...prev, [kind]: [...existing, created].sort((a, b) => a.label.localeCompare(b.label)) }
    })
    return created
  }

  const optionsFor = useMemo(() => {
    const map: Record<string, ComboBoxOption[]> = {}
    for (const f of ITEM_FIELDS) {
      map[f.kind] = optionsByKind[f.kind] ?? []
    }
    return map
  }, [optionsByKind])

  const labelForKind = (kind: string, id: string): string => {
    const opts = optionsByKind[kind] ?? []
    return opts.find((o) => o.value === id)?.label ?? '—'
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[18px] font-bold text-primary">Resources</h2>
          <p className="text-[12px] text-muted mt-0.5">
            Add the resources required to run this course. Click a category to expand and add items.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onMarkComplete}
            className="px-3 py-1.5 rounded-[8px] bg-[rgba(34,197,94,0.10)] text-[#16A34A] text-[12px] font-semibold border-none cursor-pointer hover:bg-[rgba(34,197,94,0.18)] transition-colors"
          >
            Mark Complete
          </button>
        )}
      </header>

      {GROUPS.map((g) => {
        const groupFields = ITEM_FIELDS.filter((f) => f.group === g.id)
        const totalAdded = groupFields.reduce(
          (acc, f) => acc + (data[f.listKey] as FormResourceItem[]).length,
          0,
        )
        return (
          <div key={g.id} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-[14px] font-bold text-primary uppercase tracking-wide">
                {g.label}
              </h3>
              <span className="text-[11.5px] text-muted">
                {groupFields.length} categories · {totalAdded} added
              </span>
            </div>
            <p className="text-[12px] text-muted -mt-1">{g.subtitle}</p>

            <div className="flex flex-col gap-3">
              {groupFields.map((f) => {
                const items = data[f.listKey] as FormResourceItem[]
                return (
                  <CardSection
                    key={f.listKey}
                    title={f.label}
                    countBadge={items.length}
                    collapsible
                    defaultOpen={items.length > 0}
                  >
                    <MultiAddSection
                      pendingId={pendingIds[f.kind] ?? ''}
                      setPendingId={(v) =>
                        setPendingIds((prev) => ({ ...prev, [f.kind]: v }))
                      }
                      options={optionsFor[f.kind]}
                      onAdd={() => {
                        const current = data[f.listKey] as FormResourceItem[]
                        const pendingId = pendingIds[f.kind]
                        if (pendingId === '' || current.some((it) => it.id === pendingId)) return
                        update({
                          [f.listKey]: [...current, { id: pendingId, quantity: '' }],
                        } as Partial<FormState>)
                        setPendingIds((prev) => ({ ...prev, [f.kind]: '' }))
                      }}
                      onRemove={(idx) => {
                        const current = data[f.listKey] as FormResourceItem[]
                        update({
                          [f.listKey]: current.filter((_, i) => i !== idx),
                        } as Partial<FormState>)
                      }}
                      onQuantityChange={(idx, next) => {
                        const current = data[f.listKey] as FormResourceItem[]
                        const nextItems = current.map((it, i) =>
                          i === idx ? { ...it, quantity: next } : it,
                        )
                        update({ [f.listKey]: nextItems } as Partial<FormState>)
                      }}
                      onCreate={makeCreateHandler(f.kind)}
                      entityLabel={f.entityLabel}
                      items={items}
                      optionLabelFor={(id) => labelForKind(f.kind, id)}
                      showQuantity
                      readOnly={readOnly}
                    />
                  </CardSection>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
