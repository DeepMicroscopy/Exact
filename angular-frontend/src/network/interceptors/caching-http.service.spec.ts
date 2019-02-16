import {TestBed} from '@angular/core/testing';

import {CacheValue, HttpCachingInterceptor} from './caching-http.service';
import {HttpEvent, HttpEventType, HttpHandler, HttpHeaders, HttpRequest, HttpResponse} from '@angular/common/http';
import {LocalStorageService} from '../../storage/local-storage.service';
import {SessionStorageService} from '../../storage/session-storage.service';
import {MockLocalStorageService} from '../../storage/local-storage.service.spec';
import {MockSessionStorageService} from '../../storage/session-storage.service.spec';
import {Observable, of} from 'rxjs';
import createSpy = jasmine.createSpy;


describe('HttpCachingInterceptor', () => {
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
        const intercept = TestBed.get(HttpCachingInterceptor);
        expect(intercept).toBeTruthy();
    });

    it('should return a cached value if there is a fresh one', (done) => {
        const interceptor: HttpCachingInterceptor = TestBed.get(HttpCachingInterceptor);
        const sessionStorage: MockSessionStorageService = TestBed.get(SessionStorageService);

        const cacheValue: CacheValue = {
            value: (Math.floor(Math.random() * 999) + 1),
            maxAge: Math.floor(Date.now() / 1000) + 1000,
        };
        sessionStorage.setItem(testUrl, cacheValue);

        const nextSpy = createSpy();

        interceptor.intercept(new HttpRequest('GET', testUrl), {handle: nextSpy}).subscribe(result => {
            expect(nextSpy).not.toHaveBeenCalled();
            expect(result.type).toBe(HttpEventType.Response);
            if (result.type === HttpEventType.Response) {
                expect(result.body).toBe(cacheValue.value);
            }
            done();
        });
    });

    it('should run a network request if the cached value has expired', (done) => {
        const interceptor: HttpCachingInterceptor = TestBed.get(HttpCachingInterceptor);
        const sessionStorage: MockSessionStorageService = TestBed.get(SessionStorageService);

        const cacheValue: CacheValue = {
            value: (Math.floor(Math.random() * 999) + 1),
            maxAge: -1,
        };
        sessionStorage.setItem(testUrl, cacheValue);

        const nextSpy = createSpy();

        interceptor.intercept(new HttpRequest('GET', testUrl), {handle: nextSpy}).subscribe(result => {
            expect(nextSpy).toHaveBeenCalled();
        });
    });

    it('should handle the Cache-Control: \'no-cache\' directive correctly', (done) => {
        const intercept: HttpCachingInterceptor = TestBed.get(HttpCachingInterceptor);
        const sessionStorage: MockSessionStorageService = TestBed.get(SessionStorageService);

        const nextSpy = createSpy().and.returnValue(new HttpResponse({
            body: 'test',
            headers: new HttpHeaders({
                'Cache-Control': 'no-cache'
            })
        }));

        intercept.intercept(new HttpRequest('GET', testUrl), {handle: nextSpy}).subscribe(_ => {
            expect(sessionStorage.getItem(testUrl)).toBeNull();
            done();
        });
    });

    it('should handle the Cache-Control: \'max-age=...\' directive correctly', (done) => {
        const intercept: HttpCachingInterceptor = TestBed.get(HttpCachingInterceptor);
        const sessionStorage: MockSessionStorageService = TestBed.get(SessionStorageService);

        const nextSpy = createSpy().and.returnValue(new HttpResponse({
            body: 'test',
            headers: new HttpHeaders({
                'Cache-Control': 'max-age=42000'
            })
        }));

        intercept.intercept(new HttpRequest('GET', testUrl), {handle: nextSpy}).subscribe(_ => {
            const now = Math.floor(Date.now() / 1000);
            expect(sessionStorage.getItem(testUrl)).not.toBeNull();
            expect(sessionStorage.getItem<CacheValue>(testUrl).maxAge).toBeCloseTo(now + 42000, 200);
            done();
        });
    });
});


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
