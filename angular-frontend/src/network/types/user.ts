import {ImageSet} from './imageSet';

export interface User<T extends 'simple' | 'resolved'> {
    id: number;
    username: string;
    teams: T extends 'simple' ? number[] : {id: number, name: string}[];
    points: number;
    pinnedSets: T extends 'simple' ? number[] : ImageSet[];
}
