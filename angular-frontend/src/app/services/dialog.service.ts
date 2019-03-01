import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class DialogService {

    constructor() {
    }

    /**
     * Ask user to confirm an action.
     * `message` explains the action and choices.
     *
     * @returns observable resolving to `true`=confirm or `false`=cancel
     */
    public confirm(message: string): Observable<boolean> {
        const confirm = window.confirm(message);
        return of(confirm);
    }
}
