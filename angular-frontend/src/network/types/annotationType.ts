export interface AnnotationType {
  id: number;
  name: string;
  active: boolean;
  vectorType: VectorType;   // TODO Check if this actually works
  nodeCount: number;
  enableConcealed: boolean;
  enableBlurred: boolean;
}


enum VectorType {
  boundingBox,
  point,
  line,
  multiLine,
  polygon
}
