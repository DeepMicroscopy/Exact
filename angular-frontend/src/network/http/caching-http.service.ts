import {Injectable} from '@angular/core';
import {HttpClient, HttpEventType, HttpHandler, HttpHeaders, HttpParams, HttpResponse} from '@angular/common/http';
import {Observable, of} from 'rxjs';
import {LocalStorageService} from '../../storage/local-storage.service';
import {SessionStorageService} from '../../storage/session-storage.service';
import {map, tap} from 'rxjs/operators';


export interface CacheValue<T> {
    maxAge: number;
    etag?: string;
    value: T;
}


export enum CachingBackend {
    sessionStorage,
    localStorage
}


@Injectable({
    providedIn: 'root',
})
export class CachingHttpClient extends HttpClient {

    constructor(handler: HttpHandler, private localStorage: LocalStorageService, private sessionStorage: SessionStorageService) {
        super(handler);
    }

    /**
     * Perform GET to the url only if no appropriate cached value is found.
     *
     * @see HttpClient.get
     */
    public getCached<T>(url: string, headers?: HttpHeaders,
                        cachingBackend: CachingBackend = CachingBackend.sessionStorage): Observable<T> {
        const cacheValue = this.readCacheRaw<T>(url, cachingBackend);

        // TODO respect etag. Meaning 1.) send it 2.) handle NOT-MODIFIED answer
        if (this.shouldUpdate(cacheValue)) {
            return this.get<T>(url, {
                headers: headers,
                observe: 'response',
                responseType: 'json'
            }).pipe(
                tap(response => this.writeResponseToCache(response, url, cachingBackend)),
                map(response => response.body)
            );
        } else {
            return of(cacheValue.value);
        }
    }

    /**
     * Read a cached url response from the specified caching backend
     */
    private readCacheRaw<T>(url: string, cachingBackend: CachingBackend): CacheValue<T> | null {
        if (cachingBackend === CachingBackend.sessionStorage) {
            return this.sessionStorage.getItem<CacheValue<T>>(url);
        } else if (cachingBackend === CachingBackend.localStorage) {
            return this.localStorage.getItem<CacheValue<T>>(url);
        }
    }

    /**
     * Write a value for a url into the specified caching backend
     */
    private writeCacheRaw(url: string, value: CacheValue<any>, cachingBackend: CachingBackend) {
        if (cachingBackend === CachingBackend.sessionStorage) {
            this.sessionStorage.setItem(url, value);
        } else if (cachingBackend === CachingBackend.localStorage) {
            this.localStorage.setItem(url, value);
        }
    }

    /**
     * Should cacheValue be updated from remote source?
     */
    private shouldUpdate(cacheValue: CacheValue<any> | null): boolean {
        if (cacheValue != null) {
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
    private writeResponseToCache(response: HttpResponse<any>, url: string, cachingBackend: CachingBackend): void {
        if (response.type === HttpEventType.Response) {
            if (response.headers.has('Cache-Control')) {
                const cacheControl = response.headers.get('Cache-Control');
                if (cacheControl.startsWith('max-age=')) {

                    const now = Math.floor(Date.now() / 1000);
                    const maxAge = now + (+cacheControl.replace('max-age=', ''));
                    const etag = response.headers.get('ETag');

                    this.writeCacheRaw(url, {
                        maxAge: maxAge,
                        etag: etag,
                        value: response.body
                    }, cachingBackend);
                }
            }
        }
    }

}
