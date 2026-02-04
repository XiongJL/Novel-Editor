import React from 'react';
import Home from './pages/Home';
import './index.css';

import { EditorPreferencesProvider } from './hooks/useEditorPreferences';

function App() {
    return (
        <React.StrictMode>
            <EditorPreferencesProvider>
                <Home />
            </EditorPreferencesProvider>
        </React.StrictMode>
    );
}

export default App;
