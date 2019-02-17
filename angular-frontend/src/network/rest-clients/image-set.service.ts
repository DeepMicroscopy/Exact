import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {environment} from '../../environments/environment';
import {Observable} from 'rxjs';
import {ImageSet} from '../types/imageSet';

@Injectable({
    providedIn: 'root'
})
export class ImageSetService {

    public url = environment.apiUrl + 'image_sets/';

    constructor(private http: HttpClient) {
    }

    public list(): Observable<ImageSet[]> {
        return this.http.get<ImageSet[]>(this.url);
    }

    public read(id: number): Observable<ImageSet> {
        const url = `${this.url}${id}/`;
        return this.http.get<ImageSet>(url);
    }

}
