export interface ExportFormat {
  id: number;
  name: string;
  lastChangeTime: string;
  public: boolean;
  baseFormat: string;
  imageFormat?: string;
  annotationFormat: string;
  vectorFormat: string;
  notInImageFormat: string;
  nameFormat: string;
  minVerifications: number;
  imageAggregation: boolean;
  includeBlurred: boolean;
  includeConcealed: boolean;

  annotationType: number[];   // Reference to AnnotationType[]
  team: number;   // Reference to Team
}
