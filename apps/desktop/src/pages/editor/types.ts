export interface EditorProps {
    novelId: string;
    onBack: () => void;
}

export type TitleGenerationStage = 'requesting' | 'generating' | 'parsing';
