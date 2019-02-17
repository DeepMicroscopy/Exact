import {NgModule} from '@angular/core';
import {Routes, RouterModule} from '@angular/router';
import {HomeComponent} from './home/home.component';
import {ImagesetComponent} from './imageset/imageset.component';

const routes: Routes = [
    {path: '', pathMatch: 'full', redirectTo: 'pinned'},
    {path: 'imagesets', pathMatch: 'full', redirectTo: 'pinned'},
    {path: 'imagesets/:id', pathMatch: 'full', component: ImagesetComponent},
    {path: ':visibleSet', pathMatch: 'full', component: HomeComponent},
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class ImagesRoutingModule {
}
