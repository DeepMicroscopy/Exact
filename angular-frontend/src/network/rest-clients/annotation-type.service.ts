import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {environment} from '../../environments/environment';
import {Observable} from 'rxjs';
import {AnnotationType} from '../types/annotationType';

@Injectable({
    providedIn: 'root'
})
export class AnnotationTypeService {

    public readonly url = environment.apiUrl + 'annotation_types/';

    constructor(private http: HttpClient) {
    }

    public list(): Observable<AnnotationType[]> {
        return this.http.get<AnnotationType[]>(this.url);
    }
}
