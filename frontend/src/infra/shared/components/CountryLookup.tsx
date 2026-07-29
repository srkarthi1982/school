import { create } from "zustand";
import { CountryResponse, listCountriesApiV1SharedCountryGet } from "../../../api/generated";
import React, { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { SearchableCombobox } from "./SearchableCombobox";

interface CountryState {
    fetchCountries(): Promise<CountryResponse[]>
}

const useCountryStore = create<CountryState>(() => ({
    fetchCountries: async () => {
        const response = await listCountriesApiV1SharedCountryGet()
        if (response.data) {
            return response.data.data
        }
        // response.data?.data
        // const {data:{data}} = await listCountriesApiV1SharedCountryGet()
        // return data
        return []

    }
}))

export interface CountryProp {
    id: number | string
    value: string
    isNew?: boolean | undefined
}

interface CountryLookupProp {
    value?: CountryProp | null
    onChange?: (selected: CountryProp) => void
}
export function CountryLookup({ onChange, value }: CountryLookupProp) {
    const { fetchCountries } = useCountryStore(useShallow((s) => ({ fetchCountries: s.fetchCountries })))
    const [countries, setCountries] = useState<CountryProp[]>([])

    // const onCountryAdd = useCallback((value: string) => {
    //     setCountries(prev => {
    //         const ids: number[] = prev.map(p => p.id)
    //         const newId = Math.max(...ids, 0) + 1
    //         return [...prev, { id: newId, value, isNew: true }]
    //     })
    // }, [])

    const onCountryChange = useCallback((selected: CountryProp | null) => {
        if (selected && onChange) {
            onChange(selected)
        }
    }, [])

    useEffect(() => {
        (async () => {
            const result = await fetchCountries()
            setCountries(result.map(r => ({ id: r.id, value: r.value, isNew: false })))
        })()
    }, [fetchCountries])

    return (
        <SearchableCombobox selected={value} options={countries} onChange={onCountryChange} forceUppercase={true} />
    )
}