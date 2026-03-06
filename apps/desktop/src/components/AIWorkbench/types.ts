export type DraftPlotPoint = {
    title: string;
    description?: string;
    type?: string;
    status?: string;
    plotLineName?: string;
};

export type DraftPlotLine = {
    name: string;
    description?: string;
    color?: string;
    points?: DraftPlotPoint[];
};

export type DraftCharacter = {
    name: string;
    role?: string;
    description?: string;
    profile?: Record<string, string>;
};

export type DraftItem = {
    name: string;
    type?: string;
    description?: string;
    profile?: Record<string, string>;
};

export type DraftSkill = {
    name: string;
    description?: string;
    profile?: Record<string, string>;
};

export type DraftMap = {
    name: string;
    type?: 'world' | 'region' | 'scene';
    description?: string;
    imagePrompt?: string;
    imageUrl?: string;
    imageBase64?: string;
    mimeType?: string;
};

export type CreativeAssetsDraft = {
    plotLines?: DraftPlotLine[];
    plotPoints?: DraftPlotPoint[];
    characters?: DraftCharacter[];
    items?: DraftItem[];
    skills?: DraftSkill[];
    maps?: DraftMap[];
};

export type CreativeSection = 'plotLines' | 'plotPoints' | 'characters' | 'items' | 'skills' | 'maps';

export type DraftSelection = {
    plotLines: boolean[];
    plotPoints: boolean[];
    characters: boolean[];
    items: boolean[];
    skills: boolean[];
    maps: boolean[];
};

export type CreativeDraftIssue = {
    scope: string;
    name?: string;
    code: string;
    detail: string;
};

export type ValidationResult = {
    ok: boolean;
    errors: CreativeDraftIssue[];
    warnings: string[];
    normalizedDraft: Record<string, unknown>;
};

export type ConfirmResult = {
    success: boolean;
    created: Record<string, number>;
    warnings: string[];
    errors?: CreativeDraftIssue[];
    transactionMode: 'atomic';
};
