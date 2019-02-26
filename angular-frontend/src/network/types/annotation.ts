export interface Annotation {
  id: number;
  concealed: boolean;
  blurred: boolean;
  closed: boolean;
  notInImage: boolean;
  lastEditTime: string;
  vector?: AnnotationVector;
  image: number;    // Reference to Image
  annotationType: number;   // Reference to AnnotationType
  creator?: number;    // Reference to User
  lastEditor?: number;   // Reference to User
}


export type AnnotationVector = object;
