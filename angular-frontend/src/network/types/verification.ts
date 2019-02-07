export interface Verification {
  id: number;
  time: string;
  verificationValue: boolean;
  creator: number;    // Reference to User
  annotation: number;   // Reference to Annotation
}
