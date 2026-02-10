import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { BaseModal } from './ui/BaseModal';

interface GlobalIdeaModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (content: string) => Promise<void>;
    theme: 'light' | 'dark';
}

export const GlobalIdeaModal: React.FC<GlobalIdeaModalProps> = ({ isOpen, onClose, onSave, theme }) => {
    const { t } = useTranslation();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Reset content and focus when opening
    useEffect(() => {
        if (isOpen) {
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.value = '';
                    textareaRef.current.focus();
                }
            });
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        const content = textareaRef.current?.value || '';
        if (!content.trim()) return;
        await onSave(content);
        if (textareaRef.current) {
            textareaRef.current.value = '';
        }
        onClose();
    };

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            theme={theme}
            title={t('editor.newIdea', '记录灵感')}
        >
            <textarea
                ref={textareaRef}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleSubmit();
                    }
                }}
                className={clsx(
                    "w-full h-32 border rounded-lg p-3 outline-none focus:border-indigo-500 transition-colors resize-none mb-4",
                    theme === 'dark' ? "bg-black/50 border-white/10" : "bg-gray-50 border-gray-200"
                )}
                placeholder={t('editor.ideaPlaceholder', '写下你的想法...')}
            />
            <div className="flex justify-end gap-2">
                <button
                    onClick={onClose}
                    className={clsx(
                        "px-4 py-2 rounded-lg transition-colors text-sm font-medium",
                        theme === 'dark' ? "hover:bg-white/5 text-neutral-400" : "hover:bg-gray-100 text-gray-500"
                    )}
                >
                    {t('common.cancel')}
                </button>
                <button
                    onClick={handleSubmit}
                    className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-medium shadow-md shadow-indigo-500/20"
                >
                    {t('common.save')}
                </button>
            </div>
        </BaseModal>
    );
};
