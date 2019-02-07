export interface Team {
  id: number;
  name: string;
  members: number[];   // References
  admins: number[];    // References
  website: string;

  permissions: TeamPermissions;
}


export interface TeamPermissions {
  createSet: boolean;
  userManagement: boolean;
  manageExportFormats: boolean;
}
