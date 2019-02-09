import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

import {ImagesRoutingModule} from './images-routing.module';
import {ImagesComponent} from './images.component';

@NgModule({
    declarations: [ImagesComponent],
    imports: [
        CommonModule,
        ImagesRoutingModule
    ],
    exports: [
        ImagesComponent
    ]
})
export class ImagesModule {
}
