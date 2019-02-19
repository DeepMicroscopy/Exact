import {Component, OnInit} from '@angular/core';
import {UserService} from '../../../network/rest-clients/user.service';
import {AuthService} from '../../../auth/auth.service';
import {User} from '../../../network/types/user';
import {Observable} from 'rxjs';

@Component({
    selector: 'app-navbar',
    templateUrl: './navbar.component.html',
    styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {

    protected user$: Observable<User>;

    constructor(protected userService: UserService, protected authService: AuthService) {
    }

    ngOnInit() {
        this.user$ = this.userService.get('me');
    }

}
