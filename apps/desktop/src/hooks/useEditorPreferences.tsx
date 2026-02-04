import React, { createContext, useContext, useState, useEffect } from 'react';

export interface EditorPreferences {
    theme: 'dark' | 'light';
    fontFamily: 'serif' | 'sans' | 'kaiti';
    fontSize: number;
    lineHeight: number;
    maxWidth: 'wide' | 'mobile';
    mobileDevice: 'iphone-se' | 'iphone-14' | 'iphone-14-pro-max';
    indentMode: 'enabled' | 'disabled';
}

const DEFAULT_PREFERENCES: EditorPreferences = {
    theme: 'dark',
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.8,
    maxWidth: 'wide',
    mobileDevice: 'iphone-14',
    indentMode: 'enabled'
};

interface EditorPreferencesContextType {
    preferences: EditorPreferences;
    updatePreference: <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => void;
}

const EditorPreferencesContext = createContext<EditorPreferencesContextType | undefined>(undefined);

export function EditorPreferencesProvider({ children }: { children: React.ReactNode }) {
    const [preferences, setPreferences] = useState<EditorPreferences>(() => {
        const saved = localStorage.getItem('editor_preferences');
        if (saved) {
            try {
                return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
            } catch (e) {
                return DEFAULT_PREFERENCES;
            }
        }
        return DEFAULT_PREFERENCES;
    });

    useEffect(() => {
        localStorage.setItem('editor_preferences', JSON.stringify(preferences));
    }, [preferences]);

    const updatePreference = <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => {
        setPreferences(prev => ({ ...prev, [key]: value }));
    };

    return (
        <EditorPreferencesContext.Provider value={{ preferences, updatePreference }}>
            {children}
        </EditorPreferencesContext.Provider>
    );
}

export function useEditorPreferences() {
    const context = useContext(EditorPreferencesContext);
    if (!context) {
        throw new Error('useEditorPreferences must be used within a EditorPreferencesProvider');
    }
    return context;
}
