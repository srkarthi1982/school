import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Survey, Question, SurveyPermission } from '../types/survey';
import questionPool from '../data/questionPool.json';
import surveysDummy from '../data/surveys.json';


interface SurveyState {
    surveys: Survey[]
    surveyPermissions: SurveyPermission
    getSurveys: () => Survey[]
    addSurvey: (survey: Omit<Survey, 'id' | 'createdAt'>) => void
    updateSurvey: (id: string, updates: Partial<Survey>) => void
    updatePermission: (surveyPermissions: SurveyPermission) => void
}

export const useSurveyStore = create<SurveyState>()(
    persist((set, get) => ({
        //surveys: surveysDummy.surveys as Survey[],
        surveys: [],
        surveyPermissions: {
            hasSurveyManage: false,
            hasSurveyTake: false
        },
        addSurvey: (surveyData) => {
            const newSurvey: Survey = {
                ...surveyData,
                id: Date.now().toString(),
                createdAt: new Date().toISOString()
            }
            set(state => ({
                surveys: [...state.surveys, newSurvey]
            }))

        },
        getSurveys: () => {

            const surveys = get().surveys;
            return surveys;


        },
        updateSurvey: (id, updates) => {
            set(state => ({
                surveys: state.surveys.map(s => s.id === id ? { ...s, ...updates } : s)
            }))
        },
        updatePermission: (surveyPermissions: SurveyPermission) => {
            set({ surveyPermissions })
        }
    }),
        { name: 'survey-localstorage' }
    )
)
