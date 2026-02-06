import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

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
            // Small timeout to allow animation to start/DOM to mount
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.value = '';
                    textareaRef.current.focus();
                }
            });
        }
    }, [isOpen]);

    // Handle ESC key locally within the modal logic
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [isOpen, onClose]);

    const handleSubmit = async () => {
        const content = textareaRef.current?.value || '';
        if (!content.trim()) return;
        await onSave(content);
        if (textareaRef.current) {
            textareaRef.current.value = '';
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className={clsx(
                            "w-full max-w-lg rounded-xl p-6 shadow-2xl border",
                            theme === 'dark' ? "bg-[#1a1a20] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold mb-4">{t('editor.newIdea', '记录灵感')}</h3>
                        <textarea
                            ref={textareaRef}
                            spellCheck={false}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault(); // Prevent newline
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
                                    "px-4 py-2 rounded transition-colors",
                                    theme === 'dark' ? "hover:bg-white/5 text-neutral-400" : "hover:bg-gray-100 text-gray-500"
                                )}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="px-6 py-2 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-medium shadow-md shadow-indigo-500/20"
                            >
                                {t('common.save')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
