import { TestBed } from '@angular/core/testing';

import { AnnotationTypeService } from './annotation-type.service';

describe('AnnotationTypeService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: AnnotationTypeService = TestBed.get(AnnotationTypeService);
    expect(service).toBeTruthy();
  });
});
