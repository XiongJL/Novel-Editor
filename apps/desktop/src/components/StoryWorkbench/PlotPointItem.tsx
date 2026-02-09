import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { clsx } from 'clsx';
// Import global types if not available via import
// If types are in src/types.ts, import them. Otherwise rely on global.
// Checking previous responses, definitions are in vite-env.d.ts which is global.
// However, explicit import is better if interfaces are exported.
// Let's assume we use the global interfaces or we might need to redefine props.

interface PlotPointItemProps {
    point: PlotPoint;
    isDark: boolean;
    onClick?: () => void;
}

export function PlotPointItem({ point, isDark, onClick }: PlotPointItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: point.id, data: { type: 'PlotPoint', point } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className={clsx(
                "group/point flex items-center text-xs p-1 rounded cursor-pointer select-none transition-colors",
                isDragging ? (isDark ? "bg-purple-500/20 ring-1 ring-purple-500/50" : "bg-purple-100 ring-1 ring-purple-300") : "",
                isDark ? "text-neutral-300 hover:bg-white/5" : "text-neutral-700 hover:bg-black/5"
            )}
            onClick={onClick}
        >
            <div
                {...listeners}
                className="mr-1 opacity-0 group-hover/point:opacity-50 hover:!opacity-100 cursor-grab active:cursor-grabbing"
            >
                <GripVertical className="w-3 h-3" />
            </div>

            <span className="truncate flex-1">{point.title}</span>

            {/* Type/Status indicators could go here */}
            {point.status === 'resolved' && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-2" title="Resolved" />
            )}
        </div>
    );
}
