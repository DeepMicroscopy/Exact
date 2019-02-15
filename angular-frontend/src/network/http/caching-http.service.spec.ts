import {TestBed} from '@angular/core/testing';

import {CacheValue, CachingBackend, CachingHttpClient} from './caching-http.service';
import {HttpEvent, HttpHandler, HttpHeaders, HttpRequest, HttpResponse} from '@angular/common/http';
import {LocalStorageService} from '../../storage/local-storage.service';
import {SessionStorageService} from '../../storage/session-storage.service';
import {MockLocalStorageService} from '../../storage/local-storage.service.spec';
import {MockSessionStorageService} from '../../storage/session-storage.service.spec';
import {Observable, of} from 'rxjs';


describe('CachingHttpClient', () => {
    let testUrl: string;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                {provide: HttpHandler, useClass: MockHttpHandler},
                {provide: LocalStorageService, useClass: MockLocalStorageService},
                {provide: SessionStorageService, useClass: MockSessionStorageService}
            ]
        });

        testUrl = `http://testdomain/${(Math.floor(Math.random() * 999) + 1)}/`;
    });

    it('should be created', () => {
        const service = TestBed.get(CachingHttpClient);
        expect(service).toBeTruthy();
    });

    it('should choose the correct storage backend', () => {
        const service = TestBed.get(CachingHttpClient);
        const localStorage: MockLocalStorageService = TestBed.get(LocalStorageService);
        const sessionStorage: MockSessionStorageService = TestBed.get(SessionStorageService);

        service.getCached('', null, CachingBackend.localStorage);
        expect(localStorage.getItem).toHaveBeenCalled();
        expect(sessionStorage.getItem).not.toHaveBeenCalled();

        service.getCached('', null, CachingBackend.sessionStorage);
        expect(sessionStorage.getItem).toHaveBeenCalled();
        expect(localStorage.getItem).toHaveBeenCalledTimes(1);
    });

    it('should return a cached value if there is a fresh one', (done) => {
        const service: CachingHttpClient = TestBed.get(CachingHttpClient);
        const sessionStorage: MockSessionStorageService = TestBed.get(SessionStorageService);
        const httpHandler: MockHttpHandler = TestBed.get(HttpHandler);

        const cacheValue: CacheValue<number> = {
            value: (Math.floor(Math.random() * 999) + 1),
            maxAge: Math.floor(Date.now() / 1000) + 1000,
        };
        sessionStorage.setItem(testUrl, cacheValue);

        service.getCached<number>(testUrl).subscribe(result => {
            expect(result).toBe(cacheValue.value);
            expect(httpHandler.handle).not.toHaveBeenCalled();
            done();
        });
    });

    it('should run a network request if the cached value has expired', (done) => {
        const service: CachingHttpClient = TestBed.get(CachingHttpClient);
        const sessionStorage: MockSessionStorageService = TestBed.get(SessionStorageService);
        const httpHandler: MockHttpHandler = TestBed.get(HttpHandler);

        const cacheValue: CacheValue<number> = {
            value: (Math.floor(Math.random() * 999) + 1),
            maxAge: -1,
        };
        sessionStorage.setItem(testUrl, cacheValue);

        httpHandler.responses['GET'][testUrl] = {
            body: 'abc123-foobar'
        };

        service.getCached<number>(testUrl).subscribe(result => {
            expect(result).toBe(httpHandler.responses['GET'][testUrl].body);
            expect(httpHandler.handle).toHaveBeenCalled();
            done();
        });
    });

    it('should handle the Cache-Control: \'no-cache\' directive correctly', (done) => {
        const service: CachingHttpClient = TestBed.get(CachingHttpClient);
        const sessionStorage: MockSessionStorageService = TestBed.get(SessionStorageService);
        const httpHandler: MockHttpHandler = TestBed.get(HttpHandler);

        httpHandler.responses['GET'][testUrl] = {
            body: 'abc123-foobar',
            headers: new HttpHeaders({'Cache-Control': 'no-cache'})
        };

        service.getCached(testUrl).subscribe(_ => {
            expect(sessionStorage.getItem(testUrl)).toBeNull();
            done();
        });
    });

    it('should handle the Cache-Control: \'max-age=...\' directive correctly', (done) => {
        const service: CachingHttpClient = TestBed.get(CachingHttpClient);
        const sessionStorage: MockSessionStorageService = TestBed.get(SessionStorageService);
        const httpHandler: MockHttpHandler = TestBed.get(HttpHandler);

        httpHandler.responses['GET'][testUrl] = {
            body: 'abc123-foobar',
            headers: new HttpHeaders({'Cache-Control': 'max-age=42000'})
        };

        service.getCached(testUrl).subscribe(_ => {
            const now = Math.floor(Date.now() / 1000);
            expect(sessionStorage.getItem(testUrl)).not.toBeNull();
            expect(sessionStorage.getItem<CacheValue<number>>(testUrl).maxAge).toBeCloseTo(now + 42000, 200);
            done();
        });
    });
});


export class MockCachingHttpClient extends CachingHttpClient {
    public responses: { [url: string]: any; } = {};

    constructor() {
        super(null, null, null);
        spyOn(this, 'getCached').and.callFake((url, headers?, cachingBackend?) => {
            console.log(`Using fake http result for ${url} (${this.responses[url]})`);
            return of(this.responses[url]);
        });
    }
}

export class MockHttpHandler implements HttpHandler {
    public responses: {
        [method: string]: {
            [url: string]: {
                body: any;
                headers?: HttpHeaders;
                status?: number;
                statusText?: string;
                url?: string
            }
        }
    } = {};

    constructor() {
        this.responses = {
            'GET': {},
            'POST': {},
            'PUT': {},
            'DELETE': {}
        };

        spyOn(this, 'handle').and.callThrough();
    }

    handle(req: HttpRequest<any>): Observable<HttpEvent<any>> {
        const mockResponse = this.responses[req.method][req.url];
        mockResponse.url = req.url;
        console.log(`Using fake http result for ${req.method}:${req.url} (${mockResponse.body})`);
        return of(new HttpResponse(mockResponse));
    }

}
