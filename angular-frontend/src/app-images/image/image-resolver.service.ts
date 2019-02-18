import {Injectable} from '@angular/core';
import {Image} from '../../network/types/image';
import {ActivatedRouteSnapshot, Resolve, Router, RouterStateSnapshot} from '@angular/router';
import {EMPTY, Observable} from 'rxjs';
import {ImagesService} from '../../network/rest-clients/images.service';
import {catchError, flatMap, map, tap} from 'rxjs/operators';


export interface ImagesData {
    image: Image;
}


@Injectable({
    providedIn: 'root'
})
export class ImageResolverService implements Resolve<ImagesData> {

    constructor(private imagesService: ImagesService, private router: Router) {
    }

    resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<ImagesData> {
        const id = route.paramMap.get('imageId');
        if (+id) {
            return this.imagesService.read(+id).pipe(
                map(value => {
                    return {
                        image: value
                    } as ImagesData;
                }),
                catchError(flatMap(value => {
                    this.router.navigate(['/404']);
                    return EMPTY;
                })));
        } else {
            this.router.navigate(['/404']);
            return EMPTY;
        }
    }
}
