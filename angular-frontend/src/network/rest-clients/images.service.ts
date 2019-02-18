import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {Image} from '../types/image';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';

@Injectable({
    providedIn: 'root'
})
export class ImagesService {

    public readonly url = environment.apiUrl + 'images/';

    constructor(private http: HttpClient) {
    }

    public read(id: number): Observable<Image> {
        const url = `${this.url}${id}/`;
        return this.http.get<Image>(url);
    }

}
