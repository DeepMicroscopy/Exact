export interface User {
  id: number;
  username: string;
  teams: number[];   // References
  points: number;

  pinnedSets: number[];    // Reference to ImageSets
}
