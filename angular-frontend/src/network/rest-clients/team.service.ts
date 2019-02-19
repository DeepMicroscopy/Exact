import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {Team} from '../types/team';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {catchError, map} from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class TeamService {

    public url = `${environment.apiUrl}teams/`;

    constructor(private http: HttpClient) {
    }

    public list(): Observable<Team[]> {
        return this.http.get<Team[]>(this.url);
    }

    public get(id: number): Observable<Team> {
        const url = `${this.url}${id}/`;
        return this.http.get<Team>(url);
    }

    public create(name: string): Observable<boolean> {
        return this.http.post(this.url, {
            name: name
        }).pipe(
            map(() => true),
            catchError(() => of(false))
        );
    }

}
