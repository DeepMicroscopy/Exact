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
  images: number[];       // Reference to Image
  mainAnnotationType?: number;    // Reference to AnnotationType
  team?: number;       // Reference to Team
  creator?: {id: number, name: string};    // Reference to User
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
