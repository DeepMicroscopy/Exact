import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ListImagesetsComponent } from './list-imagesets.component';

describe('ListImagesetsComponent', () => {
  let component: ListImagesetsComponent;
  let fixture: ComponentFixture<ListImagesetsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ListImagesetsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ListImagesetsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
