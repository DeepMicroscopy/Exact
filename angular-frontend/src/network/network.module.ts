import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {HttpClientModule} from '@angular/common/http';
import {StorageModule} from '../storage/storage.module';

@NgModule({
    declarations: [],
    imports: [
        CommonModule,
        HttpClientModule,
        StorageModule
    ],
    exports: []
})
export class NetworkModule {
}
