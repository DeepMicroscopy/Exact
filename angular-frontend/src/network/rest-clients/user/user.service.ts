import {Injectable} from '@angular/core';
import {User} from '../../types/user';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {HttpClient} from '@angular/common/http';

@Injectable({
    providedIn: 'root'
})
export class UserService {

    public url = environment.apiUrl + 'users/';

    constructor(private http: HttpClient) {
    }

    public get(id: number | 'me'): Observable<User<'resolved'>> {
        return this.http.get<User<'resolved'>>(`${this.url}${id}/`);
    }

}
