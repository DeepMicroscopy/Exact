export interface Export {
  id: number;
  time: string;
  annotationCount: number;
  url: string;
  deprecated: boolean;
  format: number;   // Reference to ExportFormat
  imageSet: number;   // Reference to ImageSet
  creator: number;    // Reference to User
}
