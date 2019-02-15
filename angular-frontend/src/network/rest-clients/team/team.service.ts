import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {Team} from '../../types/team';
import {environment} from '../../../environments/environment';
import {CachingHttpClient} from '../../http/caching-http.service';

@Injectable({
    providedIn: 'root'
})
export class TeamService {

    public url = `${environment.apiUrl}teams/`;

    constructor(private http: CachingHttpClient) {
    }

    public list(): Observable<Team<'simple'>[]> {
        return this.http.getCached(this.url);
    }

    public get(id: number): Observable<Team<'resolved'>> {
        const url = `${this.url}${id}/`;
        return this.http.getCached(url);
    }

}
