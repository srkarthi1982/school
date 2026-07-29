import {createContext, ReactNode, useContext, useState, useCallback, useEffect} from 'react';
import enData from './en.json';
import arData from './ar.json';

type EnData = typeof enData;

type FlattenKeys<T, P extends string = ''> = T extends object
    ? T extends ReadonlyArray<unknown>
        ? never
        : {
            [K in keyof T & string]:
            T[K] extends object
                ? T[K] extends ReadonlyArray<unknown>
                    ? `${P}${K}`
                    : FlattenKeys<T[K], `${P}${K}.`>
                : `${P}${K}`
        }[keyof T & string]
    : never;

export type ValidTranslationKeys = FlattenKeys<EnData>;
export type LanguageCode = 'en' | 'ar';

const translations: Record<LanguageCode, Record<string, unknown>> = {
    en: enData as unknown as Record<string, unknown>,
    ar: arData as unknown as Record<string, unknown>,
};

function resolve(obj: Record<string, unknown>, key: string): string {
    const value = key.split('.').reduce<unknown>(
        (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
        obj,
    );

    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return String(value);

    return key;
}

interface I18nContextType {
    lang: LanguageCode;
    t: (key: ValidTranslationKeys | undefined) => string;
    changeLanguage: (lang: LanguageCode) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function useI18n(): I18nContextType {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
    return ctx;
}

function setDocumentTitle(language: LanguageCode) {
    document.title = language === 'ar' ? 'مدرسة جاي' : 'JAI School';
}

export function I18nProvider({children}: { children: ReactNode }) {
    const [lang, setLang] = useState<LanguageCode>(() => {
        const stored = localStorage.getItem('lang') as LanguageCode | null;
        const initialLang = stored === 'en' || stored === 'ar' ? stored : 'en';
        setDocumentTitle(initialLang);
        return initialLang;
    });

    useEffect(() => {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        setDocumentTitle(lang);
    }, [lang]);

    const changeLanguage = useCallback((newLang: LanguageCode) => {
        setLang(newLang);
        localStorage.setItem('lang', newLang);
    }, []);

    const t = useCallback(
        (key: ValidTranslationKeys | undefined): string => resolve(translations[lang], key ?? ""),
        [lang],
    );

    return (
        <I18nContext.Provider value={{lang, t, changeLanguage}}>
            {children}
        </I18nContext.Provider>
    );
}
