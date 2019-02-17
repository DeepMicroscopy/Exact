import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {Team} from '../types/team';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';

@Injectable({
    providedIn: 'root'
})
export class TeamService {

    public url = `${environment.apiUrl}teams/`;

    constructor(private http: HttpClient) {
    }

    public list(): Observable<Team<'simple'>[]> {
        return this.http.get<Team<'simple'>[]>(this.url);
    }

    public get(id: number): Observable<Team<'resolved'>> {
        const url = `${this.url}${id}/`;
        return this.http.get<Team<'resolved'>>(url);
    }

}
