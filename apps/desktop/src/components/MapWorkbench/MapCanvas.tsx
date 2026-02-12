import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group } from 'react-konva';
import { Upload, ZoomIn, ZoomOut, RotateCcw, Trash2, User, Search, MapPin } from 'lucide-react';
import { MapCanvas as MapCanvasType, CharacterMapMarker, Character } from '../../types';
import { getAvatarColors } from '../../utils/avatarUtils';

interface MapCanvasProps {
    mapId: string;
    novelId: string;
    theme: 'dark' | 'light';
    characters: Character[];
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

export default function MapCanvasView({ mapId, novelId: _novelId, theme, characters }: MapCanvasProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const containerRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<MapCanvasType | null>(null);
    const [markers, setMarkers] = useState<CharacterMapMarker[]>([]);
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

    // Canvas state
    const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
    const [showCharPanel, setShowCharPanel] = useState(true);
    const [charSearch, setCharSearch] = useState('');


    // Reset state when mapId changes
    useEffect(() => {
        setSelectedMarkerId(null);
        setMarkers([]);
        setBgImage(null);
        setMap(null);
    }, [mapId]);

    // Load map data
    const loadMap = useCallback(async () => {
        try {
            const data = await window.db.getMap(mapId);
            if (data) {
                setMap(data);
                setMarkers(data.markers || []);
            }
        } catch (e) {
            console.error('Failed to load map:', e);
        }
    }, [mapId]);

    // Focus on a character's marker position
    const focusCharacter = useCallback((characterId: string) => {
        if (!map) return;
        const marker = markers.find(m => m.characterId === characterId);
        if (!marker) return;

        const absX = marker.x * map.width;
        const absY = marker.y * map.height;
        const targetScale = Math.max(scale, 1.5); // zoom to at least 150%

        setScale(targetScale);
        setPosition({
            x: stageSize.width / 2 - absX * targetScale,
            y: stageSize.height / 2 - absY * targetScale
        });
        setSelectedMarkerId(marker.id);
    }, [map, markers, scale, stageSize]);

    // Load background image when map changes
    useEffect(() => {
        if (!map?.background) {
            setBgImage(null);
            return;
        }
        const img = new window.Image();
        img.src = `local-resource://${map.background}`;
        img.onload = () => setBgImage(img);
        img.onerror = () => {
            console.error('Failed to load map background:', map.background);
            setBgImage(null);
        };
    }, [map?.background]);

    useEffect(() => {
        loadMap();
    }, [loadMap]);

    // Resize observer
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setStageSize({ width, height });
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Fit to screen on first load
    useEffect(() => {
        if (map && stageSize.width > 0) {
            const scaleX = stageSize.width / map.width;
            const scaleY = stageSize.height / map.height;
            const fitScale = Math.min(scaleX, scaleY, 1);
            setScale(fitScale);
            setPosition({
                x: (stageSize.width - map.width * fitScale) / 2,
                y: (stageSize.height - map.height * fitScale) / 2
            });
        }
    }, [map?.id, stageSize.width, stageSize.height]); // eslint-disable-line react-hooks/exhaustive-deps

    // Wheel zoom
    const handleWheel = useCallback((e: any) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;

        const oldScale = scale;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const mousePointTo = {
            x: (pointer.x - position.x) / oldScale,
            y: (pointer.y - position.y) / oldScale,
        };

        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
            e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1
        ));

        setScale(newScale);
        setPosition({
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        });
    }, [scale, position]);

    // Upload background
    const handleUploadBg = async () => {
        try {
            const result = await window.db.uploadMapBackground(mapId);
            if (result) {
                setMap(prev => prev ? { ...prev, background: result.path, width: result.width, height: result.height } : prev);
                // bgImage will auto-refresh via the useEffect watching map?.background
            }
        } catch (e) {
            console.error('Failed to upload background:', e);
        }
    };

    // Drag character to create marker
    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const characterId = e.dataTransfer.getData('text/character-id');
        if (!characterId || !map) return;

        // Check if marker already exists
        if (markers.some(m => m.characterId === characterId)) return;

        const stageEl = containerRef.current;
        if (!stageEl) return;

        const rect = stageEl.getBoundingClientRect();
        const dropX = (e.clientX - rect.left - position.x) / scale;
        const dropY = (e.clientY - rect.top - position.y) / scale;

        // Convert to relative 0-1 coordinates
        const relX = dropX / map.width;
        const relY = dropY / map.height;

        if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return;

        try {
            const marker = await window.db.createMapMarker({
                characterId,
                mapId,
                x: relX,
                y: relY
            });
            setMarkers(prev => [...prev, marker]);
        } catch (e) {
            console.error('Failed to create marker:', e);
        }
    };

    // Move marker
    const handleMarkerDragEnd = async (markerId: string, newAbsX: number, newAbsY: number) => {
        if (!map) return;
        const relX = Math.max(0, Math.min(1, newAbsX / map.width));
        const relY = Math.max(0, Math.min(1, newAbsY / map.height));

        setMarkers(prev => prev.map(m => m.id === markerId ? { ...m, x: relX, y: relY } : m));

        try {
            await window.db.updateMapMarker(markerId, { x: relX, y: relY });
        } catch (e) {
            console.error('Failed to update marker:', e);
        }
    };

    // Delete marker
    const handleDeleteMarker = async (markerId: string) => {
        try {
            await window.db.deleteMapMarker(markerId);
            setMarkers(prev => prev.filter(m => m.id !== markerId));
            setSelectedMarkerId(null);
        } catch (e) {
            console.error('Failed to delete marker:', e);
        }
    };

    const resetView = () => {
        if (!map) return;
        const scaleX = stageSize.width / map.width;
        const scaleY = stageSize.height / map.height;
        const fitScale = Math.min(scaleX, scaleY, 1);
        setScale(fitScale);
        setPosition({
            x: (stageSize.width - map.width * fitScale) / 2,
            y: (stageSize.height - map.height * fitScale) / 2
        });
    };

    return (
        <div className={clsx("flex-1 flex flex-col h-full overflow-hidden", isDark ? "bg-[#0d0d15]" : "bg-gray-100")}>

            {/* Top Toolbar */}
            <div className={clsx(
                "flex items-center justify-between px-4 py-2 border-b shrink-0",
                isDark ? "bg-[#0a0a0f]/80 border-white/5" : "bg-white border-gray-200"
            )}>
                <div className="flex items-center gap-2">
                    <h3 className={clsx("text-sm font-medium", isDark ? "text-neutral-200" : "text-neutral-800")}>
                        {map?.name || '...'}
                    </h3>
                    {map?.type && (
                        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-full",
                            isDark ? "bg-white/5 text-neutral-400" : "bg-gray-100 text-neutral-500"
                        )}>
                            {t(`map.type.${map.type}`, map.type)}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={handleUploadBg}
                        className={clsx(
                            "text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors",
                            isDark ? "text-indigo-400 hover:bg-white/5" : "text-indigo-600 hover:bg-black/5"
                        )}
                    >
                        <Upload className="w-3.5 h-3.5" />
                        {map?.background ? t('map.changeBg', '更换底图') : t('map.uploadBg', '上传底图')}
                    </button>

                    <div className={clsx("w-px h-4 mx-1", isDark ? "bg-white/10" : "bg-gray-200")} />

                    <button onClick={() => setScale(s => Math.min(MAX_SCALE, s * 1.2))}
                        className={clsx("p-1.5 rounded-lg transition-colors", isDark ? "hover:bg-white/5 text-neutral-400" : "hover:bg-gray-100 text-neutral-500")}
                        title={t('map.zoomIn', '放大')}>
                        <ZoomIn className="w-4 h-4" />
                    </button>
                    <span className={clsx("text-[10px] w-10 text-center", isDark ? "text-neutral-500" : "text-neutral-400")}>
                        {Math.round(scale * 100)}%
                    </span>
                    <button onClick={() => setScale(s => Math.max(MIN_SCALE, s / 1.2))}
                        className={clsx("p-1.5 rounded-lg transition-colors", isDark ? "hover:bg-white/5 text-neutral-400" : "hover:bg-gray-100 text-neutral-500")}
                        title={t('map.zoomOut', '缩小')}>
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <button onClick={resetView}
                        className={clsx("p-1.5 rounded-lg transition-colors", isDark ? "hover:bg-white/5 text-neutral-400" : "hover:bg-gray-100 text-neutral-500")}
                        title={t('map.resetView', '重置视图')}>
                        <RotateCcw className="w-4 h-4" />
                    </button>

                    <div className={clsx("w-px h-4 mx-1", isDark ? "bg-white/10" : "bg-gray-200")} />

                    <button
                        onClick={() => setShowCharPanel(!showCharPanel)}
                        className={clsx(
                            "p-1.5 rounded-lg transition-colors",
                            showCharPanel
                                ? isDark ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                                : isDark ? "hover:bg-white/5 text-neutral-400" : "hover:bg-gray-100 text-neutral-500"
                        )}
                        title={t('map.characters', '角色列表')}>
                        <User className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main Area: Canvas + Character Panel */}
            <div className="flex-1 flex overflow-hidden">

                {/* Canvas */}
                <div
                    ref={containerRef}
                    className="flex-1 relative"
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleDrop}
                >
                    {!map?.background && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
                            <Upload className={clsx("w-12 h-12 mb-3", isDark ? "text-neutral-700" : "text-neutral-300")} />
                            <p className={clsx("text-sm", isDark ? "text-neutral-600" : "text-neutral-400")}>
                                {t('map.noBg', '暂无底图')}
                            </p>
                            <p className={clsx("text-xs mt-1", isDark ? "text-neutral-700" : "text-neutral-400")}>
                                {t('map.noBgHint', '点击「上传底图」添加地图图片')}
                            </p>
                        </div>
                    )}

                    {(bgImage || markers.length > 0) && (
                        <Stage
                            width={stageSize.width}
                            height={stageSize.height}
                            scaleX={scale}
                            scaleY={scale}
                            x={position.x}
                            y={position.y}
                            draggable
                            onDragEnd={(e) => {
                                // Only update position if the Stage itself was dragged, not a child (marker)
                                if (e.target === e.target.getStage()) {
                                    setPosition({ x: e.target.x(), y: e.target.y() });
                                }
                            }}
                            onWheel={handleWheel}
                            onClick={(e) => {
                                // Deselect marker if clicking on stage background
                                if (e.target === e.target.getStage()) {
                                    setSelectedMarkerId(null);
                                }
                            }}
                        >
                            {/* Background layer */}
                            <Layer>
                                {bgImage && map && (
                                    <KonvaImage
                                        image={bgImage}
                                        width={map.width}
                                        height={map.height}
                                    />
                                )}
                            </Layer>

                            {/* Markers layer */}
                            <Layer>
                                {markers.map(marker => {
                                    if (!map) return null;
                                    const absX = marker.x * map.width;
                                    const absY = marker.y * map.height;
                                    const isSelected = selectedMarkerId === marker.id;
                                    const charName = marker.character?.name || marker.label || '?';

                                    return (
                                        <Group
                                            key={marker.id}
                                            x={absX}
                                            y={absY}
                                            draggable
                                            onDragEnd={(e) => {
                                                handleMarkerDragEnd(marker.id, e.target.x(), e.target.y());
                                            }}
                                            onClick={() => setSelectedMarkerId(marker.id)}
                                            onTap={() => setSelectedMarkerId(marker.id)}
                                        >
                                            {/* Shadow */}
                                            <Circle
                                                radius={isSelected ? 18 : 14}
                                                fill="rgba(0,0,0,0.3)"
                                                y={2}
                                            />
                                            {/* Main circle */}
                                            <Circle
                                                radius={isSelected ? 18 : 14}
                                                fill={isSelected ? '#6366f1' : '#3b82f6'}
                                                stroke={isSelected ? '#a5b4fc' : '#60a5fa'}
                                                strokeWidth={isSelected ? 3 : 2}
                                            />
                                            {/* Character initial */}
                                            <Text
                                                text={charName.charAt(0)}
                                                fontSize={isSelected ? 16 : 12}
                                                fill="white"
                                                fontStyle="bold"
                                                align="center"
                                                verticalAlign="middle"
                                                width={isSelected ? 36 : 28}
                                                height={isSelected ? 36 : 28}
                                                offsetX={isSelected ? 18 : 14}
                                                offsetY={isSelected ? 18 : 14}
                                            />
                                            {/* Name label */}
                                            <Text
                                                text={charName}
                                                fontSize={12}
                                                fill={'#ffffff'}
                                                fontStyle="bold"
                                                align="center"
                                                y={isSelected ? 24 : 20}
                                                width={80}
                                                offsetX={40}
                                                stroke={'#000000'}
                                                strokeWidth={0.5}
                                                shadowColor="black"
                                                shadowBlur={6}
                                                shadowOpacity={0.8}
                                                shadowOffsetY={1}
                                            />
                                        </Group>
                                    );
                                })}
                            </Layer>
                        </Stage>
                    )}

                    {/* Selected marker actions (floating) */}
                    {selectedMarkerId && markers.some(m => m.id === selectedMarkerId) && (
                        <div className={clsx(
                            "absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg border",
                            isDark ? "bg-neutral-900/90 border-white/10" : "bg-white/90 border-gray-200"
                        )}>
                            <span className={clsx("text-xs", isDark ? "text-neutral-300" : "text-neutral-600")}>
                                {markers.find(m => m.id === selectedMarkerId)?.character?.name || '?'}
                            </span>
                            <button
                                onClick={() => handleDeleteMarker(selectedMarkerId)}
                                className={clsx(
                                    "flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors",
                                    isDark ? "text-red-400 hover:bg-red-500/10" : "text-red-500 hover:bg-red-50"
                                )}
                            >
                                <Trash2 className="w-3 h-3" />
                                {t('map.removeMarker', '移除标记')}
                            </button>
                        </div>
                    )}
                </div>

                {/* Character Panel (draggable source + click to locate) */}
                {showCharPanel && (
                    <div className={clsx(
                        "w-52 flex flex-col border-l overflow-hidden shrink-0",
                        isDark ? "bg-[#0a0a0f] border-white/5" : "bg-white border-gray-200"
                    )}>
                        <div className={clsx("px-3 py-2 text-xs font-medium border-b",
                            isDark ? "text-neutral-400 border-white/5" : "text-neutral-500 border-gray-100"
                        )}>
                            {t('map.characters', '角色列表')}
                        </div>
                        {/* Search box */}
                        <div className={clsx("px-2 py-1.5 border-b", isDark ? "border-white/5" : "border-gray-100")}>
                            <div className={clsx(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
                                isDark ? "bg-white/5 text-neutral-300" : "bg-gray-50 text-neutral-600"
                            )}>
                                <Search className="w-3 h-3 opacity-40 shrink-0" />
                                <input
                                    value={charSearch}
                                    onChange={e => setCharSearch(e.target.value)}
                                    placeholder={t('common.search', '搜索') + '...'}
                                    className={clsx(
                                        "flex-1 bg-transparent outline-none text-xs placeholder:opacity-40",
                                        isDark ? "text-neutral-200" : "text-neutral-700"
                                    )}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                            {characters
                                .filter(c => !charSearch || c.name.toLowerCase().includes(charSearch.toLowerCase()))
                                .map(char => {
                                    const hasMarker = markers.some(m => m.characterId === char.id);
                                    return (
                                        <div
                                            key={char.id}
                                            draggable={!hasMarker}
                                            onDragStart={(e) => {
                                                if (hasMarker) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                                e.dataTransfer.setData('text/character-id', char.id);
                                                e.dataTransfer.effectAllowed = 'copy';
                                            }}
                                            onClick={() => {
                                                if (hasMarker) focusCharacter(char.id);
                                            }}
                                            className={clsx(
                                                "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                                                hasMarker
                                                    ? isDark ? "cursor-pointer hover:bg-indigo-500/10 text-neutral-200" : "cursor-pointer hover:bg-indigo-50 text-neutral-700"
                                                    : isDark ? "cursor-grab hover:bg-white/5 text-neutral-200" : "cursor-grab hover:bg-gray-50 text-neutral-700"
                                            )}
                                        >
                                            {(() => {
                                                const colors = getAvatarColors(char.id, char.name, isDark);
                                                return char.avatar ? (
                                                    <img
                                                        src={`local-resource://${char.avatar}`}
                                                        alt={char.name}
                                                        className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                                                    />
                                                ) : (
                                                    <div className={clsx(
                                                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium bg-gradient-to-br flex-shrink-0",
                                                        colors[0], colors[1], colors[2]
                                                    )}>
                                                        {char.name.charAt(0)}
                                                    </div>
                                                );
                                            })()}
                                            <span className="truncate flex-1">{char.name}</span>
                                            {hasMarker ? (
                                                <MapPin className={clsx("w-3 h-3 shrink-0", isDark ? "text-indigo-400" : "text-indigo-500")} />
                                            ) : null}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
