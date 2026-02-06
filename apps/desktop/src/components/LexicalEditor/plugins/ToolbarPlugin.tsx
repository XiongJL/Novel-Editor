import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useState } from 'react';
import {
    FORMAT_TEXT_COMMAND,
    FORMAT_ELEMENT_COMMAND,
    UNDO_COMMAND,
    REDO_COMMAND,
    TextFormatType,
    ElementFormatType,
    $getRoot
} from 'lexical';
import {
    Undo, Redo,
    Bold, Italic, Underline, Strikethrough,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Indent,
    Monitor, Smartphone,
    GalleryHorizontalEnd,
    Copy,
    Check
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EditorPreferences } from '../../../hooks/useEditorPreferences';
import { FORMAT_CONTENT_COMMAND } from './AutoFormatPlugin';
import { RecentFilesDropdown, RecentFile } from '../../RecentFilesDropdown';

const Divider = ({ isDark }: { isDark: boolean }) => <div className={`w-[1px] h-6 mx-1 ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`} />;

interface ToolbarPluginProps {
    preferences: EditorPreferences;
    onUpdatePreference: <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => void;
    recentFiles?: RecentFile[];
    onDeleteRecent?: (id: string) => void;
    onRecentFileSelect?: (id: string) => void;
}

export default function ToolbarPlugin({ preferences, onUpdatePreference, recentFiles = [], onDeleteRecent, onRecentFileSelect }: ToolbarPluginProps) {
    const [editor] = useLexicalComposerContext();
    const { t } = useTranslation();
    const isDark = preferences.theme === 'dark';
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        editor.getEditorState().read(() => {
            const textContent = $getRoot().getTextContent();
            navigator.clipboard.writeText(textContent).then(() => {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            });
        });
    };

    const formatText = (format: TextFormatType) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

    const formatElement = (format: ElementFormatType) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format);
    };

    const Button = ({ onClick, icon: Icon, label, title, active }: { onClick: () => void, icon: any, label?: string, title: string, active?: boolean }) => (
        <button
            onClick={onClick}
            className={`flex items-center gap-1 p-1.5 rounded transition-colors ${active ? 'bg-indigo-600 text-white' : (isDark ? 'hover:bg-white/10 text-neutral-300 hover:text-white' : 'hover:bg-black/5 text-neutral-700 hover:text-black')}`}
            title={title}
        >
            <Icon className="w-4 h-4" />
            {label && <span className="text-xs">{label}</span>}
        </button>
    );

    return (
        <div className={`flex flex-wrap items-center gap-1 py-2 px-6 border-b z-10 transition-colors ${isDark ? 'bg-[#1a1a1f] border-white/5' : 'bg-white border-gray-200'}`}>
            {/* Settings Group */}
            <div className="flex items-center gap-2 mr-2">
                {/* Font Family */}
                <select
                    value={preferences.fontFamily}
                    onChange={(e) => onUpdatePreference('fontFamily', e.target.value as any)}
                    className={`text-xs rounded px-2 py-1.5 border outline-none focus:border-indigo-500 ${isDark ? 'bg-neutral-800 text-neutral-300 border-neutral-700' : 'bg-gray-50 text-neutral-700 border-gray-300'}`}
                >
                    <option value="serif">{t('toolbar.fontSerif')}</option>
                    <option value="sans">{t('toolbar.fontSans')}</option>
                    <option value="kaiti">{t('toolbar.fontKaiti')}</option>
                </select>

                {/* Font Size */}
                <div className={`flex items-center gap-1 rounded px-2 py-1 border ${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-300'}`}>
                    <span className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>T</span>
                    <input
                        type="range"
                        min="12"
                        max="32"
                        value={preferences.fontSize}
                        onChange={(e) => onUpdatePreference('fontSize', parseInt(e.target.value))}
                        className={`w-16 h-1 rounded-lg appearance-none cursor-pointer ${isDark ? 'bg-neutral-600' : 'bg-neutral-300'}`}
                    />
                    <span className={`text-xs w-4 text-center ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>{preferences.fontSize}</span>
                </div>

                {/* Views: Wide / Mobile */}
                <div className={`flex rounded border p-0.5 ${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-300'}`}>
                    <button
                        onClick={() => onUpdatePreference('maxWidth', 'wide')}
                        className={`p-1.5 rounded ${preferences.maxWidth === 'wide' ? 'bg-indigo-600 text-white' : (isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-black')}`}
                        title={t('toolbar.wideMode')}
                    >
                        <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => onUpdatePreference('maxWidth', 'mobile')}
                        className={`p-1.5 rounded ${preferences.maxWidth === 'mobile' ? 'bg-indigo-600 text-white' : (isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-black')}`}
                        title={t('toolbar.mobileMode')}
                    >
                        <Smartphone className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Recent Files Dropdown */}
                {onDeleteRecent && onRecentFileSelect && (
                    <RecentFilesDropdown
                        files={recentFiles}
                        onSelect={onRecentFileSelect}
                        onDelete={onDeleteRecent}
                        theme={preferences.theme}
                    />
                )}
            </div>

            <Divider isDark={isDark} />

            {/* History */}
            <div className="flex items-center gap-1">
                <Button onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} icon={Undo} title={t('toolbar.undo')} label={t('toolbar.undo')} />
                <Button onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} icon={Redo} title={t('toolbar.redo')} label={t('toolbar.redo')} />
            </div>

            <Divider isDark={isDark} />

            {/* Formatting */}
            <div className="flex items-center gap-1">
                <Button onClick={() => formatText('bold')} icon={Bold} title={t('toolbar.bold')} label={t('toolbar.bold')} />
                <Button onClick={() => formatText('italic')} icon={Italic} title={t('toolbar.italic')} label={t('toolbar.italic')} />
                <Button onClick={() => formatText('underline')} icon={Underline} title={t('toolbar.underline')} label={t('toolbar.underline')} />
                <Button onClick={() => formatText('strikethrough')} icon={Strikethrough} title={t('toolbar.strikethrough')} label={t('toolbar.strikethrough')} />
            </div>

            <Divider isDark={isDark} />

            {/* Alignment */}
            <div className="flex items-center gap-1">
                <Button onClick={() => formatElement('left')} icon={AlignLeft} title={t('toolbar.alignLeft')} />
                <Button onClick={() => formatElement('center')} icon={AlignCenter} title={t('toolbar.alignCenter')} />
                <Button onClick={() => formatElement('right')} icon={AlignRight} title={t('toolbar.alignRight')} />
                <Button onClick={() => formatElement('justify')} icon={AlignJustify} title={t('toolbar.justify')} />
            </div>

            <Divider isDark={isDark} />

            {/* Indentation & Layout */}
            <div className="flex items-center gap-1">
                <Button
                    onClick={() => onUpdatePreference('indentMode', preferences.indentMode === 'enabled' ? 'disabled' : 'enabled')}
                    icon={Indent}
                    active={preferences.indentMode === 'enabled'}
                    title={t('toolbar.indent')}
                    label={t('toolbar.indent')}
                />
                <Button
                    onClick={() => editor.dispatchCommand(FORMAT_CONTENT_COMMAND, undefined)}
                    icon={GalleryHorizontalEnd}
                    title={t('toolbar.format')}
                    label={t('toolbar.format')}
                />
            </div>

            <Divider isDark={isDark} />

            {/* Copy */}
            <Button
                onClick={handleCopy}
                icon={isCopied ? Check : Copy}
                title={t('toolbar.copy')}
                label={isCopied ? t('toolbar.copied') : t('toolbar.copy')}
                active={isCopied}
            />
        </div>
    );
}
