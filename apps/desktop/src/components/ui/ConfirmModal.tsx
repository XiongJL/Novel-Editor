import React, { useEffect, useCallback } from 'react';
import { BaseModal } from './BaseModal';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    theme: 'light' | 'dark';
    type?: 'danger' | 'warning' | 'info';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
    theme,
    type = 'danger'
}) => {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    // Enter key to confirm
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onConfirm();
            onClose();
        }
    }, [onConfirm, onClose]);

    useEffect(() => {
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, handleKeyDown]);

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            theme={theme}
            title={title}
            maxWidth="max-w-md"
        >
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-4">
                    <div className={clsx(
                        "p-2 rounded-full",
                        type === 'danger' ? "bg-red-500/10 text-red-500" :
                            type === 'warning' ? "bg-amber-500/10 text-amber-500" :
                                "bg-blue-500/10 text-blue-500"
                    )}>
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <p className={clsx(
                        "text-sm leading-relaxed",
                        isDark ? "text-neutral-400" : "text-neutral-600"
                    )}>
                        {message}
                    </p>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <button
                        onClick={onClose}
                        className={clsx(
                            "px-4 py-2 rounded-lg transition-colors text-sm font-medium",
                            isDark ? "hover:bg-white/5 text-neutral-400" : "hover:bg-gray-100 text-gray-500"
                        )}
                    >
                        {cancelText || t('common.cancel')}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={clsx(
                            "px-6 py-2 rounded-lg transition-all text-sm font-bold shadow-md active:scale-95",
                            type === 'danger' ? "bg-red-600 hover:bg-red-500 text-white shadow-red-500/20" :
                                type === 'warning' ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20" :
                                    "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                        )}
                    >
                        {confirmText || t('common.confirm')}
                    </button>
                </div>
            </div>
        </BaseModal>
    );
};
