import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {HttpClient} from '@angular/common/http';
import {environment} from '../../environments/environment';
import {catchError, map} from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class AnnotationService {

    public readonly url = environment.apiUrl + 'annotations/';

    constructor(private http: HttpClient) {
    }

    public delete(id: number): Observable<boolean> {
        const url = `${this.url}${id}/`;
        return this.http.delete(url).pipe(
            map(() => true),
            catchError(map(() => false))
        );
    }
}
