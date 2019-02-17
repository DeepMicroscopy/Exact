import {TestBed} from '@angular/core/testing';
import {UserService} from './user.service';
import {User} from '../types/user';
import {HttpHandler} from '@angular/common/http';
import {MockHttpHandler} from '../interceptors/caching-http.service.spec';


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
            {provide: HttpHandler, useClass: MockHttpHandler}
        ]
    }));

    it('should be created', () => {
        const service: UserService = TestBed.get(UserService);
        expect(service).toBeTruthy();
    });

    it('should return correct get() result', (done) => {
        const service: UserService = TestBed.get(UserService);
        const httpHandler: MockHttpHandler = TestBed.get(HttpHandler);

        httpHandler.responses['GET'][`${service.url}${testUsers[0].id}/`] = {
            body: testUsers[0]
        };

        service.get(testUsers[0].id).subscribe(result => {
            expect(result).toBe(testUsers[0]);
            done();
        });
    });
});
