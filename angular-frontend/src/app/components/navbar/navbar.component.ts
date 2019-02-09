import {Component, OnInit} from '@angular/core';
import {UserService} from '../../../network/providers/user/user.service';

@Component({
    selector: 'app-navbar',
    templateUrl: './navbar.component.html',
    styleUrls: ['./navbar.component.sass']
})
export class NavbarComponent implements OnInit {

    constructor(protected userService: UserService) {
    }

    ngOnInit() {
    }

}
