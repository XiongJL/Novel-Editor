import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProjectCard } from '../components/ProjectCard';
import { Plus, Settings } from 'lucide-react';
import Editor from './Editor';
import SettingsModal from '../components/SettingsModal';
import { useTranslation } from 'react-i18next';
import { useEditorPreferences } from '../hooks/useEditorPreferences';
import { clsx } from 'clsx';

export default function Home() {
    const { t } = useTranslation();
    const { preferences } = useEditorPreferences();
    const isDark = preferences.theme === 'dark';

    const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null);
    const [novels, setNovels] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingNovel, setEditingNovel] = useState<Novel | null>(null);
    const [editForm, setEditForm] = useState({ title: '', coverUrl: '' });
    const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);

    useEffect(() => {
        if (!selectedNovelId) {
            loadNovels();
        }
    }, [selectedNovelId]);

    async function loadNovels() {
        try {
            const data = await window.db.getNovels();
            setNovels(data);
        } catch (error) {
            console.error('Failed to load novels', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateNovel() {
        const title = `新作品 ${new Date().toLocaleTimeString()}`;
        try {
            await window.db.createNovel(title);
            loadNovels();
        } catch (error: any) {
            console.error('[Home] Create novel failed:', error);
            alert(`创建失败: ${error.message || '未知错误'}`);
        }
    }

    function openEdit(novel: Novel) {
        setEditingNovel(novel);
        setEditForm({ title: novel.title, coverUrl: novel.coverUrl || '' });
    }

    async function saveEdit() {
        if (!editingNovel) return;
        try {
            await window.db.updateNovel({
                id: editingNovel.id,
                data: {
                    title: editForm.title,
                    coverUrl: editForm.coverUrl || undefined
                }
            });
            setEditingNovel(null);
            loadNovels();
        } catch (error: any) {
            alert(`保存失败: ${error.message}`);
        }
    }

    return (
        <div className={clsx(
            "relative min-h-screen w-full overflow-hidden font-sans selection:bg-indigo-500/30 transition-colors duration-500",
            isDark ? "bg-[#0a0a0f] text-neutral-200" : "bg-gray-50 text-gray-900"
        )}>

            {/* Background Gradient Mesh */}
            <div className="absolute inset-0 z-0">
                <div className={clsx(
                    "absolute top-[-20%] left-[-10%] h-[800px] w-[800px] rounded-full blur-[120px] transition-colors duration-500",
                    isDark ? "bg-indigo-900/10" : "bg-indigo-200/20"
                )} />
                <div className={clsx(
                    "absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full blur-[100px] transition-colors duration-500",
                    isDark ? "bg-purple-900/10" : "bg-purple-200/20"
                )} />
            </div>

            {/* Main Content */}
            <AnimatePresence>
                {!selectedNovelId ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
                        transition={{ duration: 0.5 }}
                        className="relative z-10 flex h-screen w-full flex-col items-center justify-center p-8"
                    >
                        <div className="mb-12 text-center">
                            <motion.p
                                initial={{ y: -20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className={clsx("text-lg font-light tracking-wide", isDark ? "text-neutral-400" : "text-gray-500")}
                            >
                                {t('home.greeting')}
                            </motion.p>
                        </div>

                        {loading ? (
                            <div className={isDark ? "text-neutral-500" : "text-gray-400"}>{t('common.loading')}</div>
                        ) : novels.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-8 max-w-[1200px] overflow-y-auto max-h-[80vh] py-4">
                                {novels.map(novel => (
                                    <ProjectCard
                                        key={novel.id}
                                        novel={novel}
                                        onOpen={() => setSelectedNovelId(novel.id)}
                                        onEdit={() => openEdit(novel)}
                                    />
                                ))}
                                {/* Add Button Card */}
                                <motion.div
                                    className={clsx(
                                        "flex h-[480px] w-[320px] items-center justify-center rounded-xl border border-dashed transition-all duration-300 cursor-pointer shadow-sm",
                                        isDark
                                            ? "border-white/10 bg-white/5 hover:bg-white/10"
                                            : "border-gray-300 bg-white/50 hover:bg-white hover:border-indigo-300 hover:shadow-md"
                                    )}
                                    onClick={handleCreateNovel}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className="text-center">
                                        <Plus className={clsx("w-12 h-12 mx-auto mb-4 opacity-50", isDark ? "text-neutral-500" : "text-gray-400")} />
                                        <span className={clsx("font-medium", isDark ? "text-neutral-500" : "text-gray-500")}>{t('home.create')}</span>
                                    </div>
                                </motion.div>
                            </div>
                        ) : (
                            <div className="text-center">
                                <p className={clsx("mb-4", isDark ? "text-neutral-500" : "text-gray-400")}>{t('home.noNovels')}</p>
                                <button
                                    onClick={handleCreateNovel}
                                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-full text-white transition-colors shadow-lg shadow-indigo-500/20"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>{t('home.create')}</span>
                                </button>
                            </div>
                        )}

                        {/* Edit Modal */}
                        {editingNovel && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className={clsx(
                                        "w-full max-w-md rounded-xl p-6 shadow-2xl border",
                                        isDark ? "bg-[#1a1a20] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"
                                    )}
                                >
                                    <h3 className="text-xl font-bold mb-4">{t('home.editNovel')}</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className={clsx("block text-xs uppercase mb-1", isDark ? "text-neutral-500" : "text-gray-400")}>{t('home.title')}</label>
                                            <input
                                                value={editForm.title}
                                                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                                                className={clsx(
                                                    "w-full border rounded p-2 outline-none focus:border-indigo-500 transition-colors",
                                                    isDark ? "bg-black/50 border-white/10" : "bg-gray-50 border-gray-200"
                                                )}
                                            />
                                        </div>
                                        <div>
                                            <label className={clsx("block text-xs uppercase mb-1", isDark ? "text-neutral-500" : "text-gray-400")}>{t('home.coverUrl')}</label>
                                            <input
                                                value={editForm.coverUrl}
                                                onChange={e => setEditForm({ ...editForm, coverUrl: e.target.value })}
                                                placeholder="https://..."
                                                className={clsx(
                                                    "w-full border rounded p-2 outline-none focus:border-indigo-500 transition-colors",
                                                    isDark ? "bg-black/50 border-white/10" : "bg-gray-50 border-gray-200"
                                                )}
                                            />
                                            <p className={clsx("text-[10px] mt-1", isDark ? "text-neutral-600" : "text-gray-400")}>{t('home.autoCover')}</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 mt-6">
                                        <button
                                            onClick={() => setEditingNovel(null)}
                                            className={clsx(
                                                "px-4 py-2 rounded transition-colors",
                                                isDark ? "hover:bg-white/5 text-neutral-400" : "hover:bg-gray-100 text-gray-500"
                                            )}
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            onClick={saveEdit}
                                            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-medium shadow-md shadow-indigo-500/20"
                                        >
                                            {t('common.save')}
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        )}

                    </motion.div>
                ) : (
                    <Editor
                        novelId={selectedNovelId}
                        onBack={() => setSelectedNovelId(null)}
                    />
                )}
            </AnimatePresence>

            <SettingsModal
                isOpen={isGlobalSettingsOpen}
                onClose={() => setIsGlobalSettingsOpen(false)}
            />

            {/* Global Settings Trigger (Top Right) */}
            {!selectedNovelId && (
                <div className="absolute top-6 right-6 z-20">
                    <button
                        onClick={() => setIsGlobalSettingsOpen(true)}
                        className={clsx(
                            "p-3 rounded-full transition-all backdrop-blur-md border",
                            isDark
                                ? "bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border-white/5"
                                : "bg-white/50 hover:bg-white text-gray-500 hover:text-gray-900 border-gray-200 shadow-sm"
                        )}
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            )}

        </div>
    );
}
