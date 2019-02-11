import {Injectable} from '@angular/core';
import {User} from '../../types/user';
import {Observable} from 'rxjs';
import {CachingHttpClient} from '../../http/caching-http.service';
import {environment} from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class UserService {

    public url = environment.apiUrl + 'users/';

    constructor(private http: CachingHttpClient) {
    }

    public get(id: number | 'me'): Observable<User<'resolved'>> {
        return this.http.getCached(`${this.url}${id}/`);
    }

}
