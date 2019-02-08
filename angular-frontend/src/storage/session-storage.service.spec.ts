import {TestBed} from '@angular/core/testing';
import {SessionStorageService} from './session-storage.service';
import {environment} from '../environments/environment';


describe('SessionStorageService', () => {

    beforeEach(() => {
        TestBed.configureTestingModule({});
    });

    afterEach(() => {
        sessionStorage.clear();
    });

    it('should be created', () => {
        const service: SessionStorageService = TestBed.get(SessionStorageService);
        expect(service).toBeTruthy();
    });

    it('should set an item', () => {
        const service: SessionStorageService = TestBed.get(SessionStorageService);

        const testKey = 'testItem';
        const testItem = {'key1': false, 'key2': 'value2'};
        service.setItem(testKey, testItem);

        expect(sessionStorage.getItem(environment.sessionStoragePrefix + testKey)).not.toBeNull();
    });

    it('should get an item', () => {
        const service: SessionStorageService = TestBed.get(SessionStorageService);

        const testKey = 'testItem';
        const testItem = {'key1': false, 'key2': 'value2'};
        sessionStorage.setItem(environment.sessionStoragePrefix + testKey, JSON.stringify(testItem));

        expect(service.getItem<typeof testItem>(testKey)).not.toBeNull();
        expect(service.getItem('nullKey')).toBeNull();
    });

    it('should clear the storage', () => {
        const service: SessionStorageService = TestBed.get(SessionStorageService);

        const testKey = 'testItem';
        const testItem = {'key1': false, 'key2': 'value2'};
        sessionStorage.setItem(environment.sessionStoragePrefix + testKey, JSON.stringify(testItem));
        service.clear();

        expect(sessionStorage.length).toBe(0);
    });

    it('should delete an item', () => {
        const service: SessionStorageService = TestBed.get(SessionStorageService);

        const testKey = 'testItem';
        const testItem = {'key1': false, 'key2': 'value2'};
        sessionStorage.setItem(environment.sessionStoragePrefix + testKey, JSON.stringify(testItem));
        service.removeItem(testKey);

        expect(sessionStorage.length).toBe(0);
    });

});


export class MockSessionStorageService extends SessionStorageService {
    constructor() {
        super();
        spyOn(this, 'getItem').and.callThrough();
        spyOn(this, 'setItem').and.callThrough();
    }
}
