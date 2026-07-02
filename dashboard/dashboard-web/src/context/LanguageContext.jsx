/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { t as translate } from "../il8n/il8n";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
    const [lang, setLang] = useState(() => localStorage.getItem("dashboard:lang") || "ko");

useEffect(() => {
    localStorage.setItem("dashboard:lang", lang);
}, [lang]);

const value = useMemo(() => {
    return {
        lang,
        setLang,
        t: (key) => translate(lang, key),
    };
}, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
    return useContext(LanguageContext);
}

