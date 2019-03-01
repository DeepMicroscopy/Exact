import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {HttpClient} from '@angular/common/http';
import {environment} from '../../environments/environment';
import {catchError, map} from 'rxjs/operators';
import {PrematureAnnotation} from '../../app-images/image/annotatable/annotatable.directive';
import {Annotation} from '../types/annotation';

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

    /**
     * Create a new Annotation from a premature Annotation
     */
    public create(annotation: PrematureAnnotation): Observable<Annotation> {
        return this.http.post<Annotation>(this.url, {
            annotationType: annotation.annotationType.id,
            image: annotation.image.id,
            notInImage: annotation.notInImage,
            blurred: annotation.notInImage ? undefined : annotation.blurred,
            concealed: annotation.notInImage ? undefined : annotation.concealed,
            vector: annotation.notInImage ? undefined : annotation.vector
        });
    }
}
