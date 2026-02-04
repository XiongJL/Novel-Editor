import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import {
    COMMAND_PRIORITY_HIGH,
    KEY_DOWN_COMMAND,
    UNDO_COMMAND,
    REDO_COMMAND,
    $getSelection,
    $isRangeSelection,
    $createTextNode
} from 'lexical';
import { ShortcutMap, ShortcutAction } from '../../../hooks/useShortcuts';
import { FORMAT_CONTENT_COMMAND } from './AutoFormatPlugin';

interface ShortcutsPluginProps {
    shortcuts: ShortcutMap;
    onSave: () => void;
    onCreateIdea?: () => void;
}

export default function ShortcutsPlugin({ shortcuts, onSave, onCreateIdea }: ShortcutsPluginProps) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                // Handle Tab key - insert 2 spaces instead of switching focus
                if (event.key === 'Tab') {
                    event.preventDefault();
                    editor.update(() => {
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                            // Insert 2 spaces (Chinese standard indent)
                            selection.insertNodes([$createTextNode('  ')]);
                        }
                    });
                    return true;
                }

                const isMatch = (action: ShortcutAction) => {
                    const binding = shortcuts[action];
                    if (!binding) return false;
                    const isCtrl = event.ctrlKey || event.metaKey;
                    return (
                        event.key.toLowerCase() === binding.key.toLowerCase() &&
                        !!binding.ctrl === isCtrl &&
                        !!binding.shift === event.shiftKey &&
                        !!binding.alt === event.altKey
                    );
                };

                if (isMatch('save')) {
                    event.preventDefault();
                    onSave();
                    return true;
                }

                if (isMatch('undo')) {
                    event.preventDefault();
                    editor.dispatchCommand(UNDO_COMMAND, undefined);
                    return true;
                }

                if (isMatch('redo')) {
                    event.preventDefault();
                    editor.dispatchCommand(REDO_COMMAND, undefined);
                    return true;
                }

                if (isMatch('format')) {
                    event.preventDefault();
                    editor.dispatchCommand(FORMAT_CONTENT_COMMAND, undefined);
                    return true;
                }

                // Ctrl+I: Create global idea
                if (isMatch('create_idea') && onCreateIdea) {
                    event.preventDefault();
                    onCreateIdea();
                    return true;
                }

                return false;
            },
            COMMAND_PRIORITY_HIGH
        );
    }, [editor, shortcuts, onSave, onCreateIdea]);

    return null;
}
