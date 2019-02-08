export interface Annotation {
  id: number;
  concealed: boolean;
  blurred: boolean;
  closed: boolean;
  lastEditTime: string;
  vector?: object;
  image: number;    // Reference to Image
  annotationType: number;   // Reference to AnnotationType
  creator?: number;    // Reference to User
  lastEditor?: number;   // Reference to User
}
