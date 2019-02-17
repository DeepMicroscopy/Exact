import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ImagesetComponent } from './imageset.component';

describe('ImagesetComponent', () => {
  let component: ImagesetComponent;
  let fixture: ComponentFixture<ImagesetComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ImagesetComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ImagesetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
