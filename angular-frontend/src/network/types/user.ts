export interface User {
    id: number;
    username: string;
    teams: number[];
    points: number;
    pinnedSets: ImagesetInUser[];
}


export interface ImagesetInUser {
    id: number;
    name: string;
    priority: number;
    tags: string[];
    numberOfImages: number;
    team: { id: number, name: string };
}


export interface TeamInUser {
    id: number;
    name: string;
}
