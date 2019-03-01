import {Injectable} from '@angular/core';
import {ActivatedRouteSnapshot, CanDeactivate, RouterStateSnapshot} from '@angular/router';
import {Observable} from 'rxjs';


export interface CanComponentDeactivate {
    canDeactivate(): boolean | Observable<boolean>;
}


@Injectable({
    providedIn: 'root'
})
export class CanDeactivateComponentGuard implements CanDeactivate<CanComponentDeactivate> {

    constructor() {
    }

    canDeactivate(component: CanComponentDeactivate,
                  currentRoute: ActivatedRouteSnapshot,
                  currentState: RouterStateSnapshot,
                  nextState?: RouterStateSnapshot): Observable<boolean> | boolean {
        return component.canDeactivate ? component.canDeactivate() : true;
    }
}
