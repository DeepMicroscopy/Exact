export interface ImageSet {
    id: number;
    name: string;
    location?: string;
    description?: string;
    time: string;
    public: boolean;
    publicCollaboration: boolean;
    imageLock: boolean;
    priority: number;
    zipState: number;
    permissions: ImageSetPermissions;
    tags: string[];
    isPinned: boolean;
    numberOfImages: number;
    images: ImageInImageset[];       // Reference to Image
    mainAnnotationType?: number;    // Reference to AnnotationType
    team?: TeamInImageset;       // Reference to Team
    creator?: UserInImageset;    // Reference to User
}


export interface ImageSetPermissions {
    verify: boolean;
    annotate: boolean;
    createExport: boolean;
    deleteExport: boolean;
    deleteAnnotation: boolean;
    deleteSet: boolean;
    deleteImages: boolean;
    editAnnotation: boolean;
    editSet: boolean;
    read: boolean;
}


export interface TeamInImageset {
    id: number;
    name: string;
}


export interface UserInImageset {
    id: number;
    name: string;
}


export interface ImageInImageset {
    id: number;
    name: string;
}
