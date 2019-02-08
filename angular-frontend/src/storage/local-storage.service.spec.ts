import {TestBed} from '@angular/core/testing';
import {LocalStorageService} from './local-storage.service';
import {environment} from '../environments/environment';


describe('LocalStorageService', () => {

    beforeEach(() => {
        TestBed.configureTestingModule({});
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
    });

});
