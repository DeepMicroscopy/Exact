import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { AnnotationTypeConfigComponent } from './annotation-type-config.component';

describe('AnnotationTypeConfigComponent', () => {
  let component: AnnotationTypeConfigComponent;
  let fixture: ComponentFixture<AnnotationTypeConfigComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AnnotationTypeConfigComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AnnotationTypeConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
