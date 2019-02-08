import {TestBed} from '@angular/core/testing';
import {SessionStorageService} from './session-storage.service';
import {environment} from '../environments/environment';


describe('SessionStorageService', () => {

    beforeEach(() => {
        TestBed.configureTestingModule({});
        sessionStorage.clear();
    });

    it('should be created', () => {
        const service: SessionStorageService = TestBed.get(SessionStorageService);
        expect(service).toBeTruthy();
    });

    it('should save an item', () => {
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
    });

});
