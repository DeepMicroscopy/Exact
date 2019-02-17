import { TestBed } from '@angular/core/testing';

import { ImageSetService } from './image-set.service';

describe('ImageSetService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: ImageSetService = TestBed.get(ImageSetService);
    expect(service).toBeTruthy();
  });
});
