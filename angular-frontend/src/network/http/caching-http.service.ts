import {Injectable} from '@angular/core';
import {
    HttpClient,
    HttpEvent,
    HttpEventType,
    HttpHandler,
    HttpInterceptor,
    HttpRequest, HttpResponse
} from '@angular/common/http';
import {Observable, of} from 'rxjs';
import {SessionStorageService} from '../../storage/session-storage.service';
import {tap} from 'rxjs/operators';


export interface CacheValue {
    maxAge: number;
    etag?: string;
    value: any;
}


@Injectable({
    providedIn: 'root',
})
export class HttpCachingInterceptor implements HttpInterceptor {

    constructor(private sessionStorage: SessionStorageService) {
    }

    /**
     * Intercept an outgoing HTTP Request and check if there is a valid version in cache. Only pass on if there is.
     *
     * @see HttpClient.get
     */
    public intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        const cacheValue = this.sessionStorage.getItem<CacheValue>(req.url);

        // TODO respect etag. Meaning 1.) send it 2.) handle NOT-MODIFIED answer
        if (this.shouldUpdate(cacheValue, req)) {
            return next.handle(req).pipe(
                tap(response => this.writeResponseToCache(response, req.url))
            );
        } else {
            return of(new HttpResponse(cacheValue.value));
        }
    }

    /**
     * Should cacheValue be updated from remote source?
     */
    private shouldUpdate(cacheValue: CacheValue | null, req: HttpRequest<any>): boolean {
        if (cacheValue != null && req.method === 'GET') {
            const now = Math.floor(Date.now() / 1000);
            if (cacheValue.maxAge > now) {
                return false;
            }
        }

        return true;
    }

    /**
     * Handle an HttpResponse in terms of it's cache-control headers and act accordingly
     */
    private writeResponseToCache(response: HttpEvent<any>, url: string): void {
        if (response.type === HttpEventType.Response) {
            if (response.headers.has('Cache-Control')) {
                const cacheControl = response.headers.get('Cache-Control');
                if (cacheControl.startsWith('max-age=')) {

                    const now = Math.floor(Date.now() / 1000);
                    const maxAge = now + (+cacheControl.replace('max-age=', ''));
                    const etag = response.headers.get('ETag');

                    this.sessionStorage.setItem(url, {
                        maxAge: maxAge,
                        etag: etag,
                        value: response.body
                    } as CacheValue);
                }
            }
        }
    }

}
