import {TestBed} from '@angular/core/testing';

import {TeamService} from './team.service';
import {Team} from '../types/team';
import {HttpClient, HttpHandler} from '@angular/common/http';
import {MockHttpHandler} from '../interceptors/caching-http.service.spec';

describe('TeamService', () => {
    const testTeams: Team<any>[] = [{
        id: 0,
        website: 'https://website',
        name: 'AwesomeTeam1',
        members: [0, 1],
        admins: [0],
        permissions: {
            userManagement: false,
            manageExportFormats: true,
            createSet: true
        }
    }];

    beforeEach(() => TestBed.configureTestingModule({
        providers: [
            {provide: HttpClient, useClass: MockHttpHandler}
        ]
    }));

    it('should be created', () => {
        const service: TeamService = TestBed.get(TeamService);
        expect(service).toBeTruthy();
    });

    it('should return correct get() result', (done) => {
        const service: TeamService = TestBed.get(TeamService);
        const httpHandler: MockHttpHandler = TestBed.get(HttpHandler);

        httpHandler.responses['GET'][`${service.url}${testTeams[0].id}/`] = {
            body: testTeams[0]
        };

        service.get(testTeams[0].id).subscribe(result => {
            expect(result).toBe(testTeams[0]);
            done();
        });
    });
});
