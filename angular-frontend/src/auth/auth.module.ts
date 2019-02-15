import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {AuthGuard} from './auth.guard';
import {NetworkModule} from '../network/network.module';
import {StorageModule} from '../storage/storage.module';

@NgModule({
    declarations: [],
    imports: [
        CommonModule,
        NetworkModule,
        StorageModule
    ],
    exports: []
})
export class AuthModule {
}
