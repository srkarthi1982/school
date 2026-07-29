import { create } from 'zustand'
import {
  getLessonCreation as masterGetLessonCreation,
  listResourceOptions,
  listLessonResourceOptions as masterListLessonResourceOptions,
} from '../course-info/api'
import type { LessonItem } from '../course-info/editor/tabs/LessonCreationTab'

// ---------------------------------------------------------------------------
// Course-wide lesson-detail cache for the schedule builder.
//
// getLessonCreation(courseId) returns EVERY lesson at once, so a single bundle
// fetch serves the detail popup for all lessons. We prefetch it once (deduped) —
// triggered when a lesson block scrolls into view — so clicking a block opens
// instantly.
//
// The schedule serves both the Course Builder (master) and Course Selection
// (instance). They fetch lessons from different endpoints, so the data source
// is an injected ``LessonDetailApi``. The objective option dictionaries
// (training/enabling objective, teaching point) are global master picklists
// shared by all courses, so they always use the master endpoint. Cache entries
// are keyed by ``scope:id`` so a master and an instance with the same numeric id
// never collide.
// ---------------------------------------------------------------------------

export interface LessonDetailApi {
  // Namespaces cache entries (e.g. 'master' | 'instance').
  scope: string
  getLessonCreation: typeof masterGetLessonCreation
  listLessonResourceOptions: typeof masterListLessonResourceOptions
}

export const masterLessonDetailApi: LessonDetailApi = {
  scope: 'master',
  getLessonCreation: masterGetLessonCreation,
  listLessonResourceOptions: masterListLessonResourceOptions,
}

export const lessonDetailKey = (api: LessonDetailApi, id: number) => `${api.scope}:${id}`

export interface LessonDetailBundle {
  status: 'loading' | 'ready' | 'error'
  error?: string
  lessons: Map<number, LessonItem>
  toMap: Map<number, string>
  eoMap: Map<number, string>
  tpMap: Map<number, string>
  resMap: Map<number, string>
  catMap: Map<string, string>
}

interface State {
  byKey: Record<string, LessonDetailBundle>
  prefetch: (id: number, api: LessonDetailApi) => void
  clear: (id: number, api: LessonDetailApi) => void
}

const emptyBundle = (status: LessonDetailBundle['status'], error?: string): LessonDetailBundle => ({
  status,
  error,
  lessons: new Map(),
  toMap: new Map(),
  eoMap: new Map(),
  tpMap: new Map(),
  resMap: new Map(),
  catMap: new Map(),
})

const toLabelMap = (rows: { id: number; label: string }[] | undefined): Map<number, string> =>
  new Map((rows ?? []).map((r) => [r.id, r.label]))

const useLessonDetailStore = create<State>((set, get) => ({
  byKey: {},

  prefetch: (id, api) => {
    if (!Number.isFinite(id)) return
    const key = lessonDetailKey(api, id)
    // Dedup: a fetch is already in flight or done for this course.
    if (get().byKey[key]) return
    set((s) => ({ byKey: { ...s.byKey, [key]: emptyBundle('loading') } }))
    ;(async () => {
      try {
        const [creation, toOpts, eoOpts, tpOpts, lessonRes] = await Promise.all([
          api.getLessonCreation(id),
          listResourceOptions('training_objective'),
          listResourceOptions('enabling_objective'),
          listResourceOptions('teaching_point'),
          api.listLessonResourceOptions(id),
        ])
        const lessons = new Map<number, LessonItem>()
        for (const l of creation.data?.data?.lessons ?? []) {
          if (l.id != null) lessons.set(Number(l.id), l)
        }
        const resMap = new Map<number, string>()
        const catMap = new Map<string, string>()
        for (const cat of lessonRes.data ?? []) {
          catMap.set(cat.category, cat.categoryLabel)
          for (const r of cat.resources) resMap.set(r.id, r.label)
        }
        set((s) => ({
          byKey: {
            ...s.byKey,
            [key]: {
              status: 'ready',
              lessons,
              toMap: toLabelMap(toOpts.data),
              eoMap: toLabelMap(eoOpts.data),
              tpMap: toLabelMap(tpOpts.data),
              resMap,
              catMap,
            },
          },
        }))
      } catch (e) {
        set((s) => ({
          byKey: {
            ...s.byKey,
            [key]: emptyBundle('error', (e as Error)?.message || 'Failed to load lesson detail.'),
          },
        }))
      }
    })()
  },

  clear: (id, api) =>
    set((s) => {
      const key = lessonDetailKey(api, id)
      if (!(key in s.byKey)) return s
      const next = { ...s.byKey }
      delete next[key]
      return { byKey: next }
    }),
}))

export default useLessonDetailStore

export const prefetchLessonDetails = (id: number, api: LessonDetailApi = masterLessonDetailApi) =>
  useLessonDetailStore.getState().prefetch(id, api)
export const clearLessonDetails = (id: number, api: LessonDetailApi = masterLessonDetailApi) =>
  useLessonDetailStore.getState().clear(id, api)
