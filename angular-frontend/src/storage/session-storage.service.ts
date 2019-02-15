import {Injectable} from '@angular/core';
import {environment} from '../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class SessionStorageService {

    constructor() {
    }

    private convertKey(key: string): string {
        return `${environment.sessionStoragePrefix}${key}`;
    }

    public getItem<T>(key: string): T | null {
        if (sessionStorage.getItem(this.convertKey(key)) != null) {
            return JSON.parse(sessionStorage.getItem(this.convertKey(key))) as T;
        }
        return null;
    }

    public setItem(key: string, item: any) {
        sessionStorage.setItem(this.convertKey(key), JSON.stringify(item));
    }

    public removeItem(key: string) {
        sessionStorage.removeItem(this.convertKey(key));
    }

    public clear() {
        sessionStorage.clear();
    }
}
