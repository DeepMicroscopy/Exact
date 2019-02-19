import {Injectable} from '@angular/core';
import {User} from '../../network/types/user';
import {ImageSet} from '../../network/types/imageSet';
import {ActivatedRouteSnapshot, Resolve, RouterStateSnapshot} from '@angular/router';
import {Observable, zip} from 'rxjs';
import {ImageSetService} from '../../network/rest-clients/image-set.service';
import {UserService} from '../../network/rest-clients/user.service';
import {map} from 'rxjs/operators';


export interface HomeData {
    user: User;
    imagesets: ImageSet[];
}


@Injectable({
    providedIn: 'root'
})
export class HomeResolverService implements Resolve<HomeData> {

    constructor(private imageSetService: ImageSetService, private userService: UserService) {
    }

    resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<HomeData> {
        return zip(
            this.imageSetService.list(),
            this.userService.get('me')
        ).pipe(map(value => {
            return {
                imagesets: value[0],
                user: value[1]
            } as HomeData;
        }));
    }
}
