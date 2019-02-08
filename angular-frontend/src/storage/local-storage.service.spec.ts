import {TestBed} from '@angular/core/testing';
import {LocalStorageService} from './local-storage.service';
import {environment} from '../environments/environment';
import {SessionStorageService} from './session-storage.service';


describe('LocalStorageService', () => {

    beforeEach(() => {
        TestBed.configureTestingModule({});
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('should be created', () => {
        const service: LocalStorageService = TestBed.get(LocalStorageService);
        expect(service).toBeTruthy();
    });

    it('should save an item', () => {
        const service: LocalStorageService = TestBed.get(LocalStorageService);

        const testKey = 'testItem';
        const testItem = {'key1': false, 'key2': 'value2'};
        service.setItem(testKey, testItem);

        expect(localStorage.getItem(environment.localStoragePrefix + testKey)).not.toBeNull();
    });

    it('should get an item', () => {
        const service: LocalStorageService = TestBed.get(LocalStorageService);

        const testKey = 'testItem';
        const testItem = {'key1': false, 'key2': 'value2'};
        localStorage.setItem(environment.localStoragePrefix + testKey, JSON.stringify(testItem));

        expect(service.getItem<typeof testItem>(testKey)).not.toBeNull();
        expect(service.getItem('nullKey')).toBeNull();
    });

    it('should clear the storage', () => {
        const service: SessionStorageService = TestBed.get(LocalStorageService);

        const testKey = 'testItem';
        const testItem = {'key1': false, 'key2': 'value2'};
        localStorage.setItem(environment.localStoragePrefix + testKey, JSON.stringify(testItem));
        service.clear();

        expect(localStorage.length).toBe(0);
    });

    it('should delete an item', () => {
        const service: SessionStorageService = TestBed.get(LocalStorageService);

        const testKey = 'testItem';
        const testItem = {'key1': false, 'key2': 'value2'};
        localStorage.setItem(environment.localStoragePrefix + testKey, JSON.stringify(testItem));
        service.removeItem(testKey);

        expect(localStorage.length).toBe(0);
    });

});


export class MockLocalStorageService extends LocalStorageService {
    constructor() {
        super();
        spyOn(this, 'setItem').and.callThrough();
        spyOn(this, 'getItem').and.callThrough();
    }
}
