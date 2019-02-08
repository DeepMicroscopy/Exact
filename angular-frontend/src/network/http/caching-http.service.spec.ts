import {TestBed} from '@angular/core/testing';

import {CacheValue, CachingBackend, CachingHttpClient} from './caching-http.service';
import {HttpEvent, HttpHandler, HttpHeaders, HttpRequest, HttpResponse} from '@angular/common/http';
import {LocalStorageService} from '../../storage/local-storage.service';
import {SessionStorageService} from '../../storage/session-storage.service';
import {MockLocalStorageService} from '../../storage/local-storage.service.spec';
import {MockSessionStorageService} from '../../storage/session-storage.service.spec';
import {Observable, of} from 'rxjs';


describe('CachingHttpClient', () => {
    let httpHandler: MockHttpHandler;
    let localStorage: LocalStorageService;
    let sessionStorage: SessionStorageService;
    let testUrl: string;

    beforeEach(() => {
        TestBed.configureTestingModule({});

        testUrl = `http://testdomain/${(Math.floor(Math.random() * 999) + 1)}/`;
        httpHandler = new MockHttpHandler((Math.floor(Math.random() * 999) + 1).toString());
        localStorage = new MockLocalStorageService();
        sessionStorage = new MockSessionStorageService();
    });

    it('should be created', () => {
        const service: CachingHttpClient = new CachingHttpClient(httpHandler, localStorage, sessionStorage);
        expect(service).toBeTruthy();
    });

    it('should choose the correct storage backend', () => {
        // Even if no caching is used, the service should check in it's storage if there's and old cached version.

        const service: CachingHttpClient = new CachingHttpClient(httpHandler, localStorage, sessionStorage);

        service.getCached('', null, CachingBackend.localStorage);
        expect(localStorage.getItem).toHaveBeenCalled();
        expect(sessionStorage.getItem).not.toHaveBeenCalled();

        service.getCached('', null, CachingBackend.sessionStorage);
        expect(sessionStorage.getItem).toHaveBeenCalled();
        expect(localStorage.getItem).toHaveBeenCalledTimes(1);
    });

    it('should return a cached value if there is a fresh one', (done) => {
        const service: CachingHttpClient = new CachingHttpClient(httpHandler, localStorage, sessionStorage);

        const cacheValue: CacheValue<number> = {
            value: (Math.floor(Math.random() * 999) + 1),
            maxAge: Math.floor(Date.now() / 1000) + 1000,
        };
        sessionStorage.setItem(testUrl, cacheValue);
        service.getCached<number>(testUrl).subscribe(result => {
            expect(result).toBe(cacheValue.value, `MockHttp-value is ${httpHandler.responseBody}`);
            done();
        });
    });

    it('should run a network request if the cached value has expired', (done) => {
        const service: CachingHttpClient = new CachingHttpClient(httpHandler, localStorage, sessionStorage);

        const cacheValue: CacheValue<number> = {
            value: (Math.floor(Math.random() * 999) + 1),
            maxAge: -1,
        };
        sessionStorage.setItem(testUrl, cacheValue);
        service.getCached<number>(testUrl).subscribe(result => {
            expect(result).toBe(httpHandler.responseBody, `MockHttp-value is ${httpHandler.responseBody}`);
            expect(httpHandler.handle).toHaveBeenCalled();
            done();
        });
    });

    it('should handle the Cache-Control: \'no-cache\' directive correctly', (done) => {
        httpHandler = new MockHttpHandler(httpHandler.responseBody, 200, new HttpHeaders({
            'Cache-Control': 'no-cache'
        }));
        const service: CachingHttpClient = new CachingHttpClient(httpHandler, localStorage, sessionStorage);

        service.getCached(testUrl).subscribe(_ => {
            expect(sessionStorage.getItem(testUrl)).toBeNull();
            done();
        });
    });

    it('should handle the Cache-Control: \'max-age=...\' directive correctly', (done) => {
        const maxAge = Math.floor(Math.random() * 999) + 1000;
        httpHandler = new MockHttpHandler(httpHandler.responseBody, 200, new HttpHeaders({
            'Cache-Control': `max-age=${maxAge}`
        }));
        const service: CachingHttpClient = new CachingHttpClient(httpHandler, localStorage, sessionStorage);

        service.getCached(testUrl).subscribe(_ => {
            const now = Math.floor(Date.now() / 1000);
            expect(sessionStorage.getItem(testUrl)).not.toBeNull();
            expect(sessionStorage.getItem<CacheValue<number>>(testUrl).maxAge).toBeCloseTo(now + maxAge, 200);
            done();
        });
    });
});


class MockHttpHandler implements HttpHandler {

    constructor(public responseBody: any, private statusCode = 200, private responseHeaders: HttpHeaders = new HttpHeaders({})) {
        spyOn(this, 'handle').and.callThrough();
    }

    handle(req: HttpRequest<any>): Observable<HttpEvent<any>> {
        return of(new HttpResponse({
            url: req.url,
            status: this.statusCode,
            statusText: '',      // We don't need this for testing
            headers: this.responseHeaders,
            body: this.responseBody
        }));
    }

}
