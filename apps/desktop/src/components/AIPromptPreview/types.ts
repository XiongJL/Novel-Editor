export type PromptPreviewData = {
    structured: {
        goal: string;
        contextRefs: string[];
        params: Record<string, unknown>;
        constraints: string[];
    };
    rawPrompt: string;
    editableUserPrompt: string;
    usedContext?: string[];
    warnings?: string[];
    usedWorldLore?: Array<{ id: string; title: string; excerpt: string }>;
};
