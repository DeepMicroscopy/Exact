import {NgModule} from '@angular/core';
import {Routes, RouterModule} from '@angular/router';
import {HomeComponent} from './home/home.component';
import {ImagesetComponent} from './imageset/imageset.component';
import {ImagesetResolverService} from './imageset/imageset-resolver.service';

const routes: Routes = [
    {path: '', pathMatch: 'full', redirectTo: 'pinned'},
    {path: 'imagesets', pathMatch: 'full', redirectTo: 'pinned'},
    {path: ':visibleSet', pathMatch: 'full', component: HomeComponent},
    {
        path: 'imagesets/:imagesetId', pathMatch: 'full', component: ImagesetComponent, resolve: {
            imageSetData: ImagesetResolverService
        }
    },
    {path: ':visibleSet', pathMatch: 'full', component: HomeComponent},
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class ImagesRoutingModule {
}
