import {NgModule} from '@angular/core';
import {Routes, RouterModule} from '@angular/router';
import {HomeComponent} from './home/home.component';

const routes: Routes = [
    {path: '', pathMatch: 'full', redirectTo: 'pinned'},
    {path: ':visibleSet', pathMatch: 'full', component: HomeComponent},
    {path: 'imagesets', pathMatch: 'full', redirectTo: 'pinned'},
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class ImagesRoutingModule {
}
