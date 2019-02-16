import {TestBed} from '@angular/core/testing';

import {UserService} from './user.service';
import {HttpCachingInterceptor} from '../../http/caching-http.service';
import {MockCachingHttpClient} from '../../http/caching-http.service.spec';
import {User} from '../../types/user';

describe('UserService', () => {
    const testUsers: User<any>[] = [{
        id: 0,
        username: 'testUser-0',
        points: 42,
        teams: [],
        pinnedSets: []
    }];

    beforeEach(() => TestBed.configureTestingModule({
        providers: [
            {provide: HttpCachingInterceptor, useClass: MockCachingHttpClient}
        ]
    }));

    it('should be created', () => {
        const service: UserService = TestBed.get(UserService);
        expect(service).toBeTruthy();
    });

    it('should return correct get() result', (done) => {
        const service: UserService = TestBed.get(UserService);
        const httpClient: MockCachingHttpClient = TestBed.get(HttpCachingInterceptor);

        httpClient.responses[`${service.url}${testUsers[0].id}/`] = testUsers[0];

        service.get(testUsers[0].id).subscribe(result => {
            expect(result).toBe(testUsers[0]);
            done();
        });
    });
});
