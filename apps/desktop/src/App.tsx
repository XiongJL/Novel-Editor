import React from 'react';
import Home from './pages/Home';
import './index.css';

import { EditorPreferencesProvider } from './hooks/useEditorPreferences';

import { Toaster } from 'sonner';

function App() {
    return (
        <React.StrictMode>
            <EditorPreferencesProvider>
                <Home />
                <Toaster richColors position="top-right" />
            </EditorPreferencesProvider>
        </React.StrictMode>
    );
}

export default App;
