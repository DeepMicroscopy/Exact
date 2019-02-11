import {User} from './user';

export interface Team<T extends 'simple' | 'resolved'> {
    id: number;
    name: string;
    members: T extends 'resolved' ? User<'simple'>[] : number[];
    admins: T extends 'resolved' ? User<'simple'>[] : number[];
    website: string;
    permissions: TeamPermissions;
}


export interface TeamPermissions {
    createSet: boolean;
    userManagement: boolean;
    manageExportFormats: boolean;
}
