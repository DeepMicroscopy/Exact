import {Component, OnInit} from '@angular/core';
import {AuthService} from '../auth.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.sass']
})
export class LoginComponent implements OnInit {

    protected username = '';
    protected password = '';
    protected remember = true;

    constructor(private authService: AuthService) {
    }

    ngOnInit() {
    }

    protected submit() {
        if (this.username !== '' && this.password !== '') {
            this.authService.login(this.username, this.password, this.remember).subscribe(result => {
                console.log(result);
            });
        }
    }

}
