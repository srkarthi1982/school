import { create } from "zustand"
import { changePasswordApiV1UsersUserIdPasswdPut, getProfileApiV1ProfileInfoUserIdGet, PasswordChange, SuccessResponseUserProfileResponse, updateProfileApiV1ProfileInfoPut, UserProfileResponse, UserProfileUpdate } from "../../api/generated"
import { extractErrorMessage } from "../../infra/shared/utils/apiError"

interface ProfileInfoState {
    userProfile: UserProfileResponse
    isLoaded: boolean
    getProfileInfo: (userId: string) => Promise<void>
    reset: () => void
    update: (o: UserProfileUpdate, userId: string) => Promise<void>
    changePassword: (o: PasswordChange, id: number) => Promise<void>
}

const defaultUserProfile: UserProfileResponse = {
    profileId: 0,
    version: 0,
    personalInformation: {
        country: '',
        fullName: '',
        dateOfBirth: '',
        email: '',
        mobileNo: '',
        photo: null
    },
    airf: { items: [], status: 'gray' },
    command: '',
    currency: { items: [], blockingStatus: 'gray', goStatus: 'gray', noGoStatus: 'gray' },
    experience: { items: [] },
    fitness: { isoPrep: 'red', status: 'red' },
    platforms: [],
    qualification: '',
    rank: '',
    teachCourses: []
}

export type TeachCourseItem = {
    id: number;
    title?: string | null;
};

export const useProfileInfoStore = create<ProfileInfoState>((set, get) => ({
    userProfile: defaultUserProfile,
    isLoaded: false,
    getProfileInfo: async (userId: string) => {
        const { data } = await getProfileApiV1ProfileInfoUserIdGet({ path: { user_id: userId } })
        if ((data as any)?.success) {
            set({ userProfile: data?.data, isLoaded: true })
        }
    },
    reset: () => {
        set({ userProfile: { ...defaultUserProfile }, isLoaded: false })
    },
    update: async (o: UserProfileUpdate, userId: string) => {
        const { data, error } = await updateProfileApiV1ProfileInfoPut({ body: o })
        if (data?.success) return;

        throw new Error(extractErrorMessage(error))
    },
    changePassword: async (o, id) => {
        const { data, error } = await changePasswordApiV1UsersUserIdPasswdPut({ body: o, path: { user_id: id } })
        if (data?.success) {
            return;
        }
        // debugger;
        // const validationError = (error as any)
        // if(validationError?.error?.details){
        //     throw new Error(validationError?.error?.details[0].msg)
        // }

        throw new Error(extractErrorMessage(error))
    }
    ,
}))

