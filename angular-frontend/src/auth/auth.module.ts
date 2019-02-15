import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {AuthGuard} from './auth.guard';
import {NetworkModule} from '../network/network.module';
import {StorageModule} from '../storage/storage.module';
import { LoginComponent } from './login/login.component';
import {FormsModule} from '@angular/forms';

@NgModule({
    declarations: [
        LoginComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        NetworkModule,
        StorageModule
    ],
    exports: [
        LoginComponent
    ]
})
export class AuthModule {
}
