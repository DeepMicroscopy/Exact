import {TestBed} from '@angular/core/testing';

import {AuthService} from './auth.service';
import {LocalStorageService} from '../storage/local-storage.service';
import {MockLocalStorageService} from '../storage/local-storage.service.spec';
import {HttpClient, HttpHandler} from '@angular/common/http';
import {MockHttpHandler} from '../network/interceptors/caching-http.service.spec';
import {environment} from '../environments/environment';

describe('AuthService', () => {
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                {provide: LocalStorageService, useClass: MockLocalStorageService},
                {provide: HttpHandler, useClass: MockHttpHandler},
                {provide: HttpClient, useClass: HttpClient}
            ]
        });
    });

    afterEach(() => {
        (TestBed.get(LocalStorageService) as LocalStorageService).clear();
    });

    it('should be created', () => {
        const service: AuthService = TestBed.get(AuthService);
        expect(service).toBeTruthy();
    });

    it('should restore a previous login from storage if one is available', () => {
        const storage: MockLocalStorageService = TestBed.get(LocalStorageService);
        storage.setItem('authToken', 'abc123');

        const service: AuthService = TestBed.get(AuthService);
        expect(service.isLoggedIn).toBeTruthy();
    });

    it('should login a user if correct credentials are provided', (done) => {
        const service: AuthService = TestBed.get(AuthService);
        const http: MockHttpHandler = TestBed.get(HttpHandler);

        http.responses['POST'][`${environment.apiUrl}auth/`] = {
            body: {token: 'testToken123-this-is-valid'}
        };

        service.login('', '', true).subscribe(success => {
            expect(success).toBeTruthy();
            expect(service.isLoggedIn()).toBeTruthy();
            done();
        });
    });

    it('should not login a user if credentials are incorrect', (done) => {
        const service: AuthService = TestBed.get(AuthService);
        const http: MockHttpHandler = TestBed.get(HttpHandler);

        http.responses['POST'][`${environment.apiUrl}auth/`] = {
            body: {non_field_errors: ['Unable to log in with provided credentials.']},
            status: 400,
        };

        service.login('', '', true).subscribe(success => {
            console.log(service.isLoggedIn());
            expect(success).toBeFalsy();
            expect(service.isLoggedIn()).toBeFalsy();
            done();
        });
    });
});
