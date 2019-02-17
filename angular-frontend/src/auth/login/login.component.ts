import {Component, OnInit} from '@angular/core';
import {AuthService} from '../auth.service';
import {FormControl, FormGroup} from '@angular/forms';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

    protected loginForm = new FormGroup({
        username: new FormControl(''),
        password: new FormControl(''),
        remember: new FormControl(true)
    });

    constructor(private authService: AuthService) {
    }

    ngOnInit() {
    }

    protected onSubmit() {
        const state = this.loginForm.value;
        this.authService.login(state.username, state.password, state.remember).subscribe();
    }

}
