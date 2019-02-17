import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {NetworkModule} from '../network/network.module';
import {StorageModule} from '../storage/storage.module';
import {LoginComponent} from './login/login.component';
import {ReactiveFormsModule} from '@angular/forms';

@NgModule({
    declarations: [
        LoginComponent
    ],
    imports: [
        CommonModule,
        ReactiveFormsModule,
        NetworkModule,
        StorageModule
    ],
    exports: [
        LoginComponent
    ]
})
export class AuthModule {
}
